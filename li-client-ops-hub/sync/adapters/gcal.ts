import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';
import { getGoogleToken } from './google-token';

// ── Helpers ──────────────────────────────────────────────────────────

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'live.com', 'msn.com', 'me.com', 'logicinbound.com',
]);

async function calFetch(path: string, params?: Record<string, string>, userEmail?: string): Promise<unknown> {
  const token = await getGoogleToken('calendar', userEmail);
  const url = new URL(`${CALENDAR_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (res.status === 401) throw new Error('Google Calendar auth expired — re-authorize');
  if (res.status === 429) throw new Error('Google Calendar rate limited');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Sync calendar list ───────────────────────────────────────────────

export async function syncCalendarList(userEmail?: string): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const data = await calFetch('/users/me/calendarList', undefined, userEmail) as { items?: Array<Record<string, unknown>> };
  const calendars = data.items ?? [];
  const now = new Date().toISOString();

  for (const cal of calendars) {
    counts.found++;
    const calId = cal.id as string;
    const existing = queryOne('SELECT id FROM google_calendars WHERE google_calendar_id = ?', [calId]);

    if (existing) {
      execute(`
        UPDATE google_calendars SET name = ?, description = ?, primary_calendar = ?,
          color = ?, access_role = ?, raw_json = ?, synced_at = ?
        WHERE google_calendar_id = ?
      `, [
        cal.summary as string, (cal.description as string) ?? null, cal.primary ? 1 : 0,
        (cal.backgroundColor as string) ?? null, (cal.accessRole as string) ?? null,
        JSON.stringify(cal), now, calId,
      ]);
      counts.updated++;
    } else {
      execute(`
        INSERT INTO google_calendars (id, google_calendar_id, name, description, primary_calendar, color, access_role, raw_json, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        randomUUID(), calId, cal.summary as string, (cal.description as string) ?? null,
        cal.primary ? 1 : 0, (cal.backgroundColor as string) ?? null,
        (cal.accessRole as string) ?? null, JSON.stringify(cal), now,
      ]);
      counts.created++;
    }
  }

  return counts;
}

// ── Sync events ──────────────────────────────────────────────────────

export type CalSyncProgressCallback = (data: {
  calendarName: string;
  calendarIndex: number;
  calendarTotal: number;
  eventsFound: number;
  eventsCreated: number;
  percent: number;
}) => void;

export async function syncCalendarEvents(options: {
  daysBack?: number;
  daysForward?: number;
  onProgress?: CalSyncProgressCallback;
  userEmail?: string;
} = {}): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const daysBack = options.daysBack ?? 30;
  const daysForward = options.daysForward ?? 14;
  const onProgress = options.onProgress;
  const userEmail = options.userEmail;

  const timeMin = new Date(Date.now() - daysBack * 86400000).toISOString();
  const timeMax = new Date(Date.now() + daysForward * 86400000).toISOString();

  const calendars = queryAll('SELECT google_calendar_id, name FROM google_calendars WHERE selected = 1');

  for (let ci = 0; ci < calendars.length; ci++) {
    const cal = calendars[ci];
    const calId = cal.google_calendar_id as string;
    const calName = cal.name as string;

    onProgress?.({
      calendarName: calName,
      calendarIndex: ci,
      calendarTotal: calendars.length,
      eventsFound: counts.found,
      eventsCreated: counts.created,
      percent: Math.round((ci / calendars.length) * 100),
    });
    let pageToken: string | null = null;

    do {
      const params: Record<string, string> = {
        timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      };
      if (pageToken) params.pageToken = pageToken;

      const data = await calFetch(`/calendars/${encodeURIComponent(calId)}/events`, params, userEmail) as {
        items?: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };
      const events = data.items ?? [];
      pageToken = data.nextPageToken ?? null;

      for (const event of events) {
        if (event.status === 'cancelled') continue;
        counts.found++;

        const startObj = event.start as { dateTime?: string; date?: string; timeZone?: string } | undefined;
        const endObj = event.end as { dateTime?: string; date?: string } | undefined;
        const startTime = startObj?.dateTime || startObj?.date || '';
        const endTime = endObj?.dateTime || endObj?.date || null;
        const allDay = !startObj?.dateTime ? 1 : 0;

        const rawAttendees = (event.attendees as Array<Record<string, unknown>>) ?? [];
        const attendees = rawAttendees.map(a => ({
          email: a.email as string,
          name: (a.displayName as string) || (a.email as string),
          responseStatus: a.responseStatus as string,
          self: !!a.self,
          organizer: !!a.organizer,
        }));
        const acceptedCount = attendees.filter(a => a.responseStatus === 'accepted').length;

        const confData = event.conferenceData as { entryPoints?: Array<{ uri?: string }> } | undefined;
        const hangoutLink = (event.hangoutLink as string) ?? null;
        const conferenceUrl = confData?.entryPoints?.[0]?.uri || hangoutLink;

        const organizer = event.organizer as { displayName?: string; email?: string; self?: boolean } | undefined;

        const { companyId, matchedClientIds, matchMethod, domains } = matchEventToCompany(attendees);
        const now = new Date().toISOString();
        const googleEventId = event.id as string;

        const existing = queryOne(
          'SELECT id FROM calendar_events WHERE google_event_id = ? AND calendar_id = ?',
          [googleEventId, calId]
        );

        const fields = [
          calId, calName, (event.summary as string) || '(No title)',
          (event.description as string) ?? null, (event.location as string) ?? null,
          startTime, endTime, allDay, startObj?.timeZone ?? null,
          (event.status as string) ?? null,
          event.recurringEventId ? 1 : 0, (event.recurringEventId as string) ?? null,
          organizer?.displayName ?? null, organizer?.email ?? null, organizer?.self ? 1 : 0,
          JSON.stringify(attendees), attendees.length, acceptedCount,
          hangoutLink, conferenceUrl,
          companyId, matchedClientIds ? JSON.stringify(matchedClientIds) : null,
          matchMethod, domains.length > 0 ? JSON.stringify(domains) : null,
        ];

        if (existing) {
          execute(`
            UPDATE calendar_events SET
              calendar_id=?, calendar_name=?, title=?, description=?, location=?,
              start_time=?, end_time=?, all_day=?, timezone=?, status=?,
              recurring=?, recurring_event_id=?,
              organizer_name=?, organizer_email=?, is_organizer=?,
              attendees_json=?, attendees_count=?, accepted_count=?,
              hangout_link=?, conference_url=?,
              company_id=?, matched_client_ids=?, match_method=?, matched_domains=?,
              raw_json=?, synced_at=?, updated_at=?
            WHERE id = ?
          `, [...fields, JSON.stringify(event), now, now, existing.id as string]);
          counts.updated++;
        } else {
          const id = randomUUID();
          execute(`
            INSERT INTO calendar_events (
              id, calendar_id, calendar_name, title, description, location,
              start_time, end_time, all_day, timezone, status,
              recurring, recurring_event_id,
              organizer_name, organizer_email, is_organizer,
              attendees_json, attendees_count, accepted_count,
              hangout_link, conference_url,
              company_id, matched_client_ids, match_method, matched_domains,
              google_event_id, raw_json, synced_at, created_at, updated_at
            ) VALUES (${Array(30).fill('?').join(',')})
          `, [id, ...fields, googleEventId, JSON.stringify(event), now, now, now]);
          counts.created++;
        }
      }

      await delay(200);
    } while (pageToken);

    await delay(500);
  }

  updateCompanyMeetingFlags();
  return counts;
}

// ── Event-to-company matching ────────────────────────────────────────

function matchEventToCompany(attendees: Array<{ email: string; self: boolean }>): {
  companyId: string | null;
  matchedClientIds: string[] | null;
  matchMethod: string;
  domains: string[];
} {
  const domains: string[] = [];
  const attendeeEmails: string[] = [];

  for (const a of attendees) {
    if (!a.email || a.self) continue;
    attendeeEmails.push(a.email.toLowerCase());
    const domain = a.email.split('@')[1]?.toLowerCase();
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      domains.push(domain);
    }
  }

  // Method 1: client_associations readai_email
  for (const email of attendeeEmails) {
    const assoc = queryOne(`
      SELECT ca.client_contact_id, ca2.target_id as company_id
      FROM client_associations ca
      JOIN client_associations ca2 ON ca2.client_contact_id = ca.client_contact_id
        AND ca2.association_type = 'sub_account'
      WHERE ca.association_type = 'readai_email' AND ca.target_id = ?
    `, [email]);
    if (assoc) {
      return { companyId: assoc.company_id as string, matchedClientIds: [assoc.client_contact_id as string], matchMethod: 'auto_email', domains };
    }
  }

  // Method 2: company_domains
  for (const domain of [...new Set(domains)]) {
    const match = queryOne('SELECT company_id FROM company_domains WHERE domain = ?', [domain]);
    if (match) {
      return { companyId: match.company_id as string, matchedClientIds: null, matchMethod: 'auto_domain', domains };
    }
  }

  // Method 3: contact email
  for (const email of attendeeEmails) {
    const contact = queryOne(`
      SELECT c.id as contact_id, ca.target_id as company_id
      FROM contacts c
      JOIN client_associations ca ON ca.client_contact_id = c.id AND ca.association_type = 'sub_account'
      WHERE c.email = ? AND c.tags LIKE '%client%'
    `, [email]);
    if (contact) {
      return { companyId: contact.company_id as string, matchedClientIds: [contact.contact_id as string], matchMethod: 'auto_contact_email', domains };
    }
  }

  return { companyId: null, matchedClientIds: null, matchMethod: 'unmatched', domains };
}

// ── Update company meeting flags ─────────────────────────────────────

function updateCompanyMeetingFlags(): void {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  execute(`UPDATE companies SET has_meeting_this_week = 0, meetings_this_week = 0, next_meeting_at = NULL, next_meeting_title = NULL`);

  const weeklyCounts = queryAll(`
    SELECT company_id, COUNT(*) as cnt FROM calendar_events
    WHERE company_id IS NOT NULL AND start_time >= ? AND start_time < ? AND status != 'cancelled'
    GROUP BY company_id
  `, [weekStart.toISOString(), weekEnd.toISOString()]);

  for (const row of weeklyCounts) {
    execute('UPDATE companies SET has_meeting_this_week = 1, meetings_this_week = ? WHERE id = ?',
      [row.cnt as number, row.company_id as string]);
  }

  const nextMeetings = queryAll(`
    SELECT company_id, start_time, title FROM calendar_events
    WHERE company_id IS NOT NULL AND start_time >= ? AND status != 'cancelled'
    ORDER BY start_time ASC
  `, [now.toISOString()]);

  const seen = new Set<string>();
  for (const row of nextMeetings) {
    const cid = row.company_id as string;
    if (!seen.has(cid)) {
      seen.add(cid);
      execute('UPDATE companies SET next_meeting_at = ?, next_meeting_title = ? WHERE id = ?',
        [row.start_time as string, row.title as string, cid]);
    }
  }
}

// ── Test connection ──────────────────────────────────────────────────

export async function testGoogleCalendar(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await calFetch('/users/me/calendarList', { maxResults: '1' }) as { items?: unknown[] };
    return { success: true, message: `Connected. ${(data.items?.length || 0) > 0 ? 'Calendars accessible.' : 'No calendars found.'}` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export { updateCompanyMeetingFlags };
