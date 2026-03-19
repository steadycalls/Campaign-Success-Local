import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';

// ── API helper ────────────────────────────────────────────────────────

const READAI_BASE = 'https://api.read.ai';

async function readaiFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${READAI_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
    console.log(`[readai] Rate limited, waiting ${retryAfter}s`);
    await delay(retryAfter * 1000);
    const retry = await fetch(`${READAI_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!retry.ok) {
      const text = await retry.text().catch(() => '');
      throw new Error(`Read.ai ${retry.status}: ${text.slice(0, 200)}`);
    }
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Read.ai ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ── Test connection ───────────────────────────────────────────────────

export async function testReadAiConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const data = (await readaiFetch('/v1/meetings?limit=1', apiKey)) as {
      data?: unknown[];
      has_more?: boolean;
    };
    const count = data.data?.length ?? 0;
    return {
      success: true,
      message: `Connected. ${data.has_more ? 'Multiple' : count} meeting(s) accessible.`,
    };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Domain matching ───────────────────────────────────────────────────

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'live.com', 'msn.com', 'me.com', 'logicinbound.com',
]);

function extractDomains(participants: Array<{ email?: string }>): string[] {
  const domains = new Set<string>();
  for (const p of participants) {
    if (p.email) {
      const domain = p.email.split('@')[1]?.toLowerCase();
      if (domain && !GENERIC_DOMAINS.has(domain)) {
        domains.add(domain);
      }
    }
  }
  return Array.from(domains);
}

function matchToCompany(domains: string[]): { companyId: string | null; matchMethod: string } {
  for (const domain of domains) {
    const match = queryOne('SELECT company_id FROM company_domains WHERE domain = ?', [domain]);
    if (match) {
      return { companyId: match.company_id as string, matchMethod: 'auto_domain' };
    }
  }
  return { companyId: null, matchMethod: 'unmatched' };
}

// ── Pass 1: List meetings ─────────────────────────────────────────────

export async function syncMeetingsList(
  apiKey: string,
  syncWindowDays: number = 30
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const windowStart = Date.now() - syncWindowDays * 86400000;
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let url = `/v1/meetings?limit=10&start_time_ms.gte=${windowStart}`;
    if (cursor) url += `&cursor=${cursor}`;

    const data = (await readaiFetch(url, apiKey)) as {
      data?: Array<Record<string, unknown>>;
      has_more?: boolean;
    };

    const meetings = data.data ?? [];
    hasMore = data.has_more === true;

    for (const m of meetings) {
      counts.found++;
      const readaiId = m.id as string;
      const startMs = m.start_time_ms as number;
      const endMs = (m.end_time_ms as number) ?? null;
      const duration = endMs ? Math.round((endMs - startMs) / 60000) : null;
      const participants = (m.participants as Array<{ name?: string; email?: string; invited?: boolean; attended?: boolean }>) ?? [];
      const attendedCount = participants.filter((p) => p.attended).length;
      const domains = extractDomains(participants);
      const { companyId, matchMethod } = matchToCompany(domains);
      const owner = m.owner as { name?: string; email?: string } | undefined;
      const now = new Date().toISOString();

      const existing = queryOne('SELECT id FROM meetings WHERE readai_meeting_id = ?', [readaiId]);

      if (existing) {
        execute(
          `UPDATE meetings SET
            title = ?, meeting_date = ?, start_time_ms = ?, end_time_ms = ?,
            duration_minutes = ?, platform = ?, platform_id = ?,
            owner_name = ?, owner_email = ?,
            participants_json = ?, participants_count = ?, attended_count = ?,
            report_url = ?, folders_json = ?,
            matched_domains = ?, match_method = ?, company_id = COALESCE(company_id, ?),
            raw_json = ?, synced_at = ?, updated_at = datetime('now')
          WHERE id = ?`,
          [
            (m.title as string) ?? null, new Date(startMs).toISOString(), startMs, endMs,
            duration, (m.platform as string) ?? null, (m.platform_id as string) ?? null,
            owner?.name ?? null, owner?.email ?? null,
            JSON.stringify(participants), participants.length, attendedCount,
            (m.report_url as string) ?? null, JSON.stringify(m.folders ?? []),
            JSON.stringify(domains), matchMethod, companyId,
            JSON.stringify(m), now,
            existing.id as string,
          ]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO meetings (
            id, readai_meeting_id, company_id, title, meeting_date, start_time_ms, end_time_ms,
            duration_minutes, platform, platform_id, owner_name, owner_email,
            participants_json, participants_count, attended_count,
            report_url, folders_json, matched_domains, match_method,
            raw_json, expanded, synced_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))`,
          [
            randomUUID(), readaiId, companyId,
            (m.title as string) ?? null, new Date(startMs).toISOString(), startMs, endMs,
            duration, (m.platform as string) ?? null, (m.platform_id as string) ?? null,
            owner?.name ?? null, owner?.email ?? null,
            JSON.stringify(participants), participants.length, attendedCount,
            (m.report_url as string) ?? null, JSON.stringify(m.folders ?? []),
            JSON.stringify(domains), matchMethod,
            JSON.stringify(m), now,
          ]
        );
        counts.created++;
      }

      cursor = readaiId;
    }

    if (meetings.length === 0) break;
    await delay(500);
  }

  console.log(`[readai] Pass 1: ${counts.found} meetings found, ${counts.created} created, ${counts.updated} updated`);
  return counts;
}

// ── Pass 2: Expand meeting details ────────────────────────────────────

export async function expandMeetingDetails(
  apiKey: string,
  batchSize: number = 20
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  const unexpanded = queryAll(
    `SELECT id, readai_meeting_id, company_id FROM meetings WHERE expanded = 0 AND end_time_ms IS NOT NULL ORDER BY start_time_ms DESC LIMIT ?`,
    [batchSize]
  );

  for (const meeting of unexpanded) {
    counts.found++;
    const meetingId = meeting.id as string;
    const readaiId = meeting.readai_meeting_id as string;
    const companyId = (meeting.company_id as string) ?? null;

    try {
      const url =
        `/v1/meetings/${readaiId}?expand[]=summary&expand[]=action_items&expand[]=metrics` +
        `&expand[]=key_questions&expand[]=topics&expand[]=transcript&expand[]=chapter_summaries` +
        `&expand[]=recording_download`;

      const data = (await readaiFetch(url, apiKey)) as Record<string, unknown>;
      const metrics = data.metrics as { read_score?: number; sentiment?: number; engagement?: number } | undefined;
      const transcript = data.transcript as { text?: string } | undefined;

      execute(
        `UPDATE meetings SET
          summary = ?, topics_json = ?, key_questions_json = ?, chapter_summaries_json = ?,
          action_items_json = ?,
          read_score = ?, sentiment = ?, engagement = ?,
          transcript_text = ?, transcript_json = ?, recording_url = ?,
          live_enabled = ?,
          raw_json = ?, expanded = 1, updated_at = datetime('now')
        WHERE id = ?`,
        [
          (data.summary as string) ?? null,
          data.topics ? JSON.stringify(data.topics) : null,
          data.key_questions ? JSON.stringify(data.key_questions) : null,
          data.chapter_summaries ? JSON.stringify(data.chapter_summaries) : null,
          data.action_items ? JSON.stringify(data.action_items) : null,
          metrics?.read_score ?? null,
          metrics?.sentiment ?? null,
          metrics?.engagement ?? null,
          transcript?.text ?? null,
          data.transcript ? JSON.stringify(data.transcript) : null,
          (data.recording_download as string) ?? null,
          (data as Record<string, unknown>).live_enabled ? 1 : 0,
          JSON.stringify(data),
          meetingId,
        ]
      );

      // Sync action items
      const actionItems = data.action_items as Array<Record<string, unknown>> | undefined;
      if (actionItems && Array.isArray(actionItems)) {
        for (const item of actionItems) {
          upsertActionItem(meetingId, companyId, item);
        }
      }

      counts.updated++;
    } catch (err: unknown) {
      console.error(`[readai] Failed to expand ${readaiId}: ${err instanceof Error ? err.message : err}`);
    }

    await delay(1000);
  }

  console.log(`[readai] Pass 2: ${counts.found} meetings processed, ${counts.updated} expanded`);
  return counts;
}

function upsertActionItem(meetingId: string, companyId: string | null, item: Record<string, unknown>): void {
  const text = (item.text as string) ?? (item.description as string) ?? (item.title as string) ?? JSON.stringify(item);
  const assignee = (item.assignee as { name?: string })?.name ?? (item.assignee as string) ?? null;
  const status = item.completed ? 'done' : 'open';
  const dueDate = (item.due_date as string) ?? (item.dueDate as string) ?? null;
  const now = new Date().toISOString();
  const rawJson = JSON.stringify(item);

  const existing = queryOne(
    'SELECT id FROM action_items WHERE meeting_id = ? AND text = ?',
    [meetingId, text]
  );

  if (existing) {
    execute(
      `UPDATE action_items SET assignee = ?, status = ?, due_date = ?, raw_json = ?, synced_at = ? WHERE id = ?`,
      [assignee, status, dueDate, rawJson, now, existing.id as string]
    );
  } else {
    execute(
      `INSERT INTO action_items (id, meeting_id, company_id, text, assignee, status, due_date, raw_json, synced_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [randomUUID(), meetingId, companyId, text, assignee, status, dueDate, rawJson, now]
    );
  }
}
