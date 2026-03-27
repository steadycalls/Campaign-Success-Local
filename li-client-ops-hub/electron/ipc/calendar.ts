import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncCalendarList, syncCalendarEvents, testGoogleCalendar, updateCompanyMeetingFlags } from '../../sync/adapters/gcal';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';
import { isServiceAccountMode, getServiceAccountAdminEmail } from '../../sync/adapters/google-service-account';
import { ipcBatcher } from './batcher';

export function registerCalendarHandlers(): void {

  // ── Calendar list ──────────────────────────────────────────────────
  ipcMain.handle('calendar:getCalendars', () => {
    return queryAll('SELECT * FROM google_calendars ORDER BY primary_calendar DESC, name ASC');
  });

  // ── Toggle calendar sync ───────────────────────────────────────────
  ipcMain.handle('calendar:toggleSync', (_e, calendarId: string, enabled: boolean) => {
    execute('UPDATE google_calendars SET selected = ? WHERE id = ?', [enabled ? 1 : 0, calendarId]);
    return { success: true };
  });

  // ── Get unmatched events ───────────────────────────────────────────
  ipcMain.handle('calendar:getUnmatched', () => {
    return queryAll(`
      SELECT * FROM calendar_events
      WHERE company_id IS NULL AND attendees_count > 1 AND status != 'cancelled'
      ORDER BY start_time DESC LIMIT 50
    `);
  });

  // ── Manual sync ────────────────────────────────────────────────────
  ipcMain.handle('calendar:sync', async () => {
    const runId = logSyncStart('gcal', 'manual');
    try {
      const totalCounts = { found: 0, created: 0, updated: 0 };

      if (isServiceAccountMode()) {
        // Service account: sync calendars for each active team mailbox
        const mailboxes = queryAll('SELECT email, name FROM team_mailboxes WHERE is_active = 1');
        for (let mi = 0; mi < mailboxes.length; mi++) {
          const email = mailboxes[mi].email as string;
          const name = (mailboxes[mi].name as string) || email;
          ipcBatcher.send('calendar:syncProgress', {
            phase: 'calendars', percent: Math.round((mi / mailboxes.length) * 10),
            calendarName: name, eventsFound: 0, eventsCreated: 0,
            userEmail: email, userIndex: mi, userTotal: mailboxes.length,
          });
          await syncCalendarList(email);
          const counts = await syncCalendarEvents({
            userEmail: email,
            onProgress: (data) => {
              ipcBatcher.send('calendar:syncProgress', {
                phase: 'events', percent: 10 + Math.round(((mi + data.percent / 100) / mailboxes.length) * 90),
                calendarName: data.calendarName, calendarIndex: data.calendarIndex, calendarTotal: data.calendarTotal,
                eventsFound: totalCounts.found + data.eventsFound, eventsCreated: totalCounts.created + data.eventsCreated,
                userEmail: email, userIndex: mi, userTotal: mailboxes.length,
              });
            },
          });
          totalCounts.found += counts.found;
          totalCounts.created += counts.created;
          totalCounts.updated += counts.updated;
        }
      } else {
        // OAuth: sync the default account
        ipcBatcher.send('calendar:syncProgress', { phase: 'calendars', percent: 0, calendarName: '', eventsFound: 0, eventsCreated: 0 });
        await syncCalendarList();
        const counts = await syncCalendarEvents({
          onProgress: (data) => {
            ipcBatcher.send('calendar:syncProgress', {
              phase: 'events', percent: data.percent,
              calendarName: data.calendarName, calendarIndex: data.calendarIndex, calendarTotal: data.calendarTotal,
              eventsFound: data.eventsFound, eventsCreated: data.eventsCreated,
            });
          },
        });
        totalCounts.found = counts.found;
        totalCounts.created = counts.created;
        totalCounts.updated = counts.updated;
      }

      ipcBatcher.send('calendar:syncProgress', { phase: 'complete', percent: 100, calendarName: '', eventsFound: totalCounts.found, eventsCreated: totalCounts.created });
      logSyncEnd(runId, 'success', totalCounts);
      return { success: true, ...totalCounts };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ipcBatcher.send('calendar:syncProgress', { phase: 'error', percent: 0, calendarName: '', eventsFound: 0, eventsCreated: 0, error: message });
      logSyncEnd(runId, 'error', {}, message);
      return { success: false, message };
    }
  });

  // ── All events (for events tab) ─────────────────────────────────────
  ipcMain.handle('calendar:getAllEvents', (_e, limit: number = 500) => {
    return queryAll(`
      SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.all_day, ce.status,
        ce.calendar_name, ce.organizer_name, ce.organizer_email,
        ce.attendees_count, ce.accepted_count, ce.attendees_json,
        ce.company_id, ce.match_method, ce.hangout_link, ce.conference_url,
        c.name AS company_name
      FROM calendar_events ce
      LEFT JOIN companies c ON ce.company_id = c.id
      WHERE ce.status != 'cancelled'
      ORDER BY ce.start_time DESC
      LIMIT ?
    `, [limit]);
  });

  // ── Link event to company ──────────────────────────────────────────
  ipcMain.handle('calendar:linkEvent', (_e, eventId: string, companyId: string) => {
    execute("UPDATE calendar_events SET company_id = ?, match_method = 'manual', updated_at = datetime('now') WHERE id = ?",
      [companyId, eventId]);
    updateCompanyMeetingFlags();
    return { success: true };
  });

  // ── Get events for a company ───────────────────────────────────────
  ipcMain.handle('calendar:getForCompany', (_e, companyId: string) => {
    const now = new Date().toISOString();

    const upcoming = queryAll(`
      SELECT * FROM calendar_events
      WHERE company_id = ? AND start_time >= ? AND status != 'cancelled'
      ORDER BY start_time ASC LIMIT 20
    `, [companyId, now]);

    const recent = queryAll(`
      SELECT * FROM calendar_events
      WHERE company_id = ? AND start_time < ? AND status != 'cancelled'
      ORDER BY start_time DESC LIMIT 20
    `, [companyId, now]);

    return { upcoming, recent };
  });

  // ── Check Google scopes ────────────────────────────────────────────
  ipcMain.handle('google:checkScopes', () => {
    // Service account mode — always authorized for calendar
    if (isServiceAccountMode()) {
      const adminEmail = getServiceAccountAdminEmail();
      return { authorized: true, email: adminEmail || 'service account', hasCalendar: true, needsReauth: false };
    }

    // OAuth mode — check google_auth table
    const auth = queryOne('SELECT access_token, email, scopes FROM google_auth WHERE id = ?', ['default']);
    if (!auth) return { authorized: false, hasCalendar: false, needsReauth: false };

    const scopes = (auth.scopes as string) || '';
    const hasCalendar = scopes.includes('calendar');

    return {
      authorized: !!auth.access_token,
      email: auth.email as string,
      hasCalendar,
      needsReauth: !hasCalendar && !!auth.access_token,
    };
  });

  // ── Test connection ────────────────────────────────────────────────
  ipcMain.handle('calendar:testConnection', async () => {
    return testGoogleCalendar();
  });

  // ── Calendar stats ─────────────────────────────────────────────────
  ipcMain.handle('calendar:getStats', () => {
    const total = queryOne('SELECT COUNT(*) as cnt FROM calendar_events');
    const matched = queryOne('SELECT COUNT(*) as cnt FROM calendar_events WHERE company_id IS NOT NULL');
    const unmatched = queryOne('SELECT COUNT(*) as cnt FROM calendar_events WHERE company_id IS NULL AND attendees_count > 1');
    const calendars = queryOne('SELECT COUNT(*) as cnt FROM google_calendars WHERE selected = 1');

    return {
      totalEvents: (total?.cnt as number) || 0,
      matchedEvents: (matched?.cnt as number) || 0,
      unmatchedEvents: (unmatched?.cnt as number) || 0,
      selectedCalendars: (calendars?.cnt as number) || 0,
    };
  });
}
