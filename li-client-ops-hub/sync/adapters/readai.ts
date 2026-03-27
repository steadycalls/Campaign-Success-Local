import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';
import { getValidReadAiToken } from '../../electron/ipc/readai-auth';
import { logger } from '../../lib/logger';

// ── API helper ────────────────────────────────────────────────────────

const READAI_BASE = 'https://api.read.ai';

async function readaiFetch(path: string): Promise<unknown> {
  const token = await getValidReadAiToken();
  const res = await fetch(`${READAI_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
    logger.warn('ReadAI', 'Rate limited', { retry_after_s: retryAfter });
    await delay(retryAfter * 1000);
    // Re-fetch token in case it rotated during the wait
    const freshToken = await getValidReadAiToken();
    const retry = await fetch(`${READAI_BASE}${path}`, {
      headers: { Authorization: `Bearer ${freshToken}`, Accept: 'application/json' },
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
  syncWindowDays: number = 30
): Promise<SyncCounts> {
  // Pre-check auth
  await getValidReadAiToken();

  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const windowStart = Date.now() - syncWindowDays * 86400000;
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let url = `/v1/meetings?limit=10&start_time_ms.gte=${windowStart}`;
    if (cursor) url += `&cursor=${cursor}`;

    const data = (await readaiFetch(url)) as {
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
            raw_json = ?, synced_at = ?
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

  logger.sync('Read.ai Pass 1', { found: counts.found, created: counts.created, updated: counts.updated });
  return counts;
}

// ── Pass 2: Expand meeting details ────────────────────────────────────

/** Unwrap API responses that nest arrays in { data: [...] } or { items: [...] } */
function unwrapArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.action_items)) return obj.action_items;
    if (Array.isArray(obj.topics)) return obj.topics;
    if (Array.isArray(obj.key_questions)) return obj.key_questions;
    if (Array.isArray(obj.questions)) return obj.questions;
  }
  return [];
}

/** Safely extract a string from a value that might be an object */
function safeString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && 'text' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).text);
  }
  return String(val);
}

/** Safely extract a number from a value */
function safeNumber(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export async function expandMeetingDetails(
  batchSize: number = 20
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  // Pre-check auth before starting the loop — fail fast instead of per-meeting
  try {
    await getValidReadAiToken();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('ReadAI', 'Skipping expand — not authorized', { error: msg });
    throw new Error(`Read.ai not authorized: ${msg}`);
  }

  const unexpanded = queryAll(
    `SELECT id, readai_meeting_id, company_id FROM meetings WHERE expanded = 0 ORDER BY start_time_ms DESC LIMIT ?`,
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

      const data = (await readaiFetch(url)) as Record<string, unknown>;
      const metrics = (typeof data.metrics === 'object' && data.metrics !== null)
        ? data.metrics as Record<string, unknown>
        : null;
      const transcript = (typeof data.transcript === 'object' && data.transcript !== null)
        ? data.transcript as Record<string, unknown>
        : null;

      execute(
        `UPDATE meetings SET
          summary = ?, topics_json = ?, key_questions_json = ?, chapter_summaries_json = ?,
          action_items_json = ?,
          read_score = ?, sentiment = ?, engagement = ?,
          transcript_text = ?, transcript_json = ?, recording_url = ?,
          live_enabled = ?,
          raw_json = ?, expanded = 1
        WHERE id = ?`,
        [
          safeString(data.summary),
          data.topics ? JSON.stringify(unwrapArray(data.topics)) : null,
          data.key_questions ? JSON.stringify(unwrapArray(data.key_questions)) : null,
          data.chapter_summaries ? JSON.stringify(unwrapArray(data.chapter_summaries)) : null,
          data.action_items ? JSON.stringify(unwrapArray(data.action_items)) : null,
          safeNumber(metrics?.read_score),
          safeNumber(metrics?.sentiment),
          safeNumber(metrics?.engagement),
          safeString(transcript?.text),
          transcript ? JSON.stringify(transcript) : null,
          safeString(data.recording_download),
          data.live_enabled ? 1 : 0,
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
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('ReadAI', 'Failed to expand meeting', { readai_id: readaiId, error: msg });
      // Bail out on auth errors — no point trying remaining meetings
      if (msg.includes('not authorized') || msg.includes('Token refresh failed')) {
        throw err;
      }
    }

    await delay(1000);
  }

  logger.sync('Read.ai Pass 2', { processed: counts.found, expanded: counts.updated });
  return counts;
}

// ── Sync State Tracking ──────────────────────────────────────────────

export interface ReadAiSyncState {
  oldestMeetingSynced: string | null;
  newestMeetingSynced: string | null;
  totalMeetingsSynced: number;
  lastSyncAt: string | null;
  historicalSyncComplete: boolean;
  historicalSyncCursor: string | null;
  historicalSyncTarget: string | null;
}

const DEFAULT_SYNC_STATE: ReadAiSyncState = {
  oldestMeetingSynced: null,
  newestMeetingSynced: null,
  totalMeetingsSynced: 0,
  lastSyncAt: null,
  historicalSyncComplete: false,
  historicalSyncCursor: null,
  historicalSyncTarget: null,
};

export function getReadAiSyncState(): ReadAiSyncState {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'readai_sync_state'");
  if (!row?.value) return { ...DEFAULT_SYNC_STATE };
  try { return { ...DEFAULT_SYNC_STATE, ...JSON.parse(row.value as string) }; }
  catch { return { ...DEFAULT_SYNC_STATE }; }
}

export function saveReadAiSyncState(state: ReadAiSyncState): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('readai_sync_state', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [JSON.stringify(state)]
  );
}

function updateSyncStateAfterSync(result: SyncRangeResult): void {
  const state = getReadAiSyncState();
  state.lastSyncAt = new Date().toISOString();
  const totalRow = queryOne('SELECT COUNT(*) as cnt FROM meetings');
  state.totalMeetingsSynced = (totalRow?.cnt as number) || 0;
  if (result.oldestFetched && (!state.oldestMeetingSynced || result.oldestFetched < state.oldestMeetingSynced)) {
    state.oldestMeetingSynced = result.oldestFetched;
  }
  if (result.newestFetched && (!state.newestMeetingSynced || result.newestFetched > state.newestMeetingSynced)) {
    state.newestMeetingSynced = result.newestFetched;
  }
  saveReadAiSyncState(state);
}

// ── Date-Ranged Sync (used by manual sync dropdown) ──────────────────

export type SyncRange = 'today' | 'week' | 'month' | 'quarter' | 'year';

export function getSinceDate(range: SyncRange): string {
  const now = new Date();
  switch (range) {
    case 'today':   return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case 'week':    { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    case 'month':   { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    case 'quarter': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString(); }
    case 'year':    { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString(); }
  }
}

export interface SyncRangeResult {
  fetched: number;
  created: number;
  updated: number;
  cursor: string | null;
  hasMore: boolean;
  oldestFetched: string | null;
  newestFetched: string | null;
}

const MAX_PAGES_PER_RUN = 50;

export async function syncReadAiMeetingsRange(options: {
  sinceDate?: string;
  cursor?: string | null;
  maxPages?: number;
} = {}): Promise<SyncRangeResult> {
  // Pre-check auth
  await getValidReadAiToken();

  const { sinceDate, cursor: startCursor = null, maxPages = MAX_PAGES_PER_RUN } = options;
  const result: SyncRangeResult = {
    fetched: 0, created: 0, updated: 0,
    cursor: null, hasMore: false,
    oldestFetched: null, newestFetched: null,
  };

  let currentCursor = startCursor;
  let pagesProcessed = 0;
  const sinceMs = sinceDate ? new Date(sinceDate).getTime() : 0;

  while (pagesProcessed < maxPages) {
    let url = '/v1/meetings?limit=10';
    if (sinceMs > 0) url += `&start_time_ms.gte=${sinceMs}`;
    if (currentCursor) url += `&cursor=${currentCursor}`;

    const data = (await readaiFetch(url)) as {
      data?: Array<Record<string, unknown>>;
      has_more?: boolean;
    };

    const meetings = data.data ?? [];
    if (meetings.length === 0) break;

    for (const m of meetings) {
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
      const meetingDate = new Date(startMs).toISOString();

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
            raw_json = ?, synced_at = ?
          WHERE id = ?`,
          [
            (m.title as string) ?? null, meetingDate, startMs, endMs,
            duration, (m.platform as string) ?? null, (m.platform_id as string) ?? null,
            owner?.name ?? null, owner?.email ?? null,
            JSON.stringify(participants), participants.length, attendedCount,
            (m.report_url as string) ?? null, JSON.stringify(m.folders ?? []),
            JSON.stringify(domains), matchMethod, companyId,
            JSON.stringify(m), now,
            existing.id as string,
          ]
        );
        result.updated++;
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
            (m.title as string) ?? null, meetingDate, startMs, endMs,
            duration, (m.platform as string) ?? null, (m.platform_id as string) ?? null,
            owner?.name ?? null, owner?.email ?? null,
            JSON.stringify(participants), participants.length, attendedCount,
            (m.report_url as string) ?? null, JSON.stringify(m.folders ?? []),
            JSON.stringify(domains), matchMethod,
            JSON.stringify(m), now,
          ]
        );
        result.created++;
      }

      result.fetched++;
      if (!result.oldestFetched || meetingDate < result.oldestFetched) result.oldestFetched = meetingDate;
      if (!result.newestFetched || meetingDate > result.newestFetched) result.newestFetched = meetingDate;

      currentCursor = readaiId;
    }

    result.cursor = currentCursor;
    result.hasMore = data.has_more === true;
    if (!result.hasMore) break;

    pagesProcessed++;
    await delay(500);
  }

  logger.sync('Read.ai range sync', { fetched: result.fetched, created: result.created, updated: result.updated });
  return result;
}

// ── Overnight Sync State ─────────────────────────────────────────────

export interface OvernightSyncPending {
  range: SyncRange;
  sinceDate: string;
  scheduledAt: string;
}

export function getOvernightSyncPending(): OvernightSyncPending | null {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'readai_overnight_sync'");
  if (!row?.value) return null;
  try { return JSON.parse(row.value as string); }
  catch { return null; }
}

export function scheduleOvernightSync(range: SyncRange, sinceDate: string): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('readai_overnight_sync', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [JSON.stringify({ range, sinceDate, scheduledAt: new Date().toISOString() })]
  );
  logger.sync('Read.ai sync scheduled for overnight window', { range });
}

export function clearOvernightSync(): void {
  execute("DELETE FROM app_state WHERE key = 'readai_overnight_sync'");
}

// ── Action Items ─────────────────────────────────────────────────────

function upsertActionItem(meetingId: string, companyId: string | null, item: Record<string, unknown>): void {
  const text = safeString(item.text) ?? safeString(item.description) ?? safeString(item.title) ?? JSON.stringify(item);
  const assigneeRaw = item.assignee;
  const assignee = (typeof assigneeRaw === 'object' && assigneeRaw !== null)
    ? safeString((assigneeRaw as Record<string, unknown>).name)
    : safeString(assigneeRaw);
  const status = item.completed ? 'done' : 'open';
  const dueDate = safeString(item.due_date) ?? safeString(item.dueDate);
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
