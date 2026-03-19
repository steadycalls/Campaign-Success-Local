import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncCalendarList, syncCalendarEvents, testGoogleCalendar, updateCompanyMeetingFlags } from '../../sync/adapters/gcal';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';

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
      await syncCalendarList();
      const counts = await syncCalendarEvents();
      logSyncEnd(runId, 'success', counts);
      return { success: true, ...counts };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      return { success: false, message };
    }
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
