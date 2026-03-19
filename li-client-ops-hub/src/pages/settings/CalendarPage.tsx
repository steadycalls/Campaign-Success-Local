import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Calendar, ExternalLink } from 'lucide-react';
import { api } from '../../lib/ipc';

export default function CalendarPage() {
  const [calendars, setCalendars] = useState<Array<Record<string, unknown>>>([]);
  const [unmatched, setUnmatched] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState<{ totalEvents: number; matchedEvents: number; unmatchedEvents: number; selectedCalendars: number } | null>(null);
  const [scopes, setScopes] = useState<{ authorized: boolean; hasCalendar: boolean; needsReauth: boolean; email?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cals, un, st, sc] = await Promise.all([
      api.getCalendars(),
      api.getUnmatchedCalendarEvents(),
      api.getCalendarStats(),
      api.checkGoogleScopes(),
    ]);
    setCalendars(cals as Array<Record<string, unknown>>);
    setUnmatched(un as Array<Record<string, unknown>>);
    setStats(st);
    setScopes(sc);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const result = await api.syncCalendar();
    setSyncResult(result.success
      ? `Synced ${result.found || 0} events (${result.created || 0} new, ${result.updated || 0} updated)`
      : result.message || 'Sync failed');
    setSyncing(false);
    load();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.toggleCalendarSync(id, enabled);
    load();
  };

  const handleReauth = async () => {
    await api.authorizeGoogleDrive();
    load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Google Calendar</h1>
          <p className="mt-1 text-xs text-slate-500">
            {scopes?.authorized
              ? `Authorized as ${scopes.email || 'unknown'}`
              : 'Not authorized — authorize via Google Drive integration'}
          </p>
        </div>
        <div className="flex gap-2">
          {scopes?.needsReauth && (
            <button onClick={handleReauth} className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
              Re-authorize for Calendar
            </button>
          )}
          <button onClick={handleSync} disabled={syncing || !scopes?.authorized}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync Calendar
          </button>
        </div>
      </div>

      {syncResult && (
        <p className="mt-2 text-xs text-teal-600">{syncResult}</p>
      )}

      {/* Stats */}
      {stats && (
        <div className="mt-4 flex gap-6 text-sm text-slate-600">
          <span>Events: <span className="font-medium">{stats.totalEvents}</span></span>
          <span>Matched: <span className="font-medium text-green-600">{stats.matchedEvents}</span></span>
          <span>Unmatched: <span className="font-medium text-amber-600">{stats.unmatchedEvents}</span></span>
          <span>Calendars: <span className="font-medium">{stats.selectedCalendars}</span></span>
        </div>
      )}

      {/* Calendars list */}
      {calendars.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Calendars</h2>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500">Calendar</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Access</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 text-center">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calendars.map((cal) => (
                  <tr key={cal.id as string} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {cal.color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color as string }} />
                        )}
                        <span className="font-medium text-slate-800">{String(cal.name)}</span>
                        {cal.primary_calendar ? <span className="text-[10px] text-teal-600 bg-teal-50 px-1 rounded">Primary</span> : null}
                      </div>
                      {cal.description ? <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{String(cal.description)}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{String(cal.access_role || '-')}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={!!cal.selected}
                        onChange={(e) => handleToggle(cal.id as string, e.target.checked)}
                        className="rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unmatched events */}
      {unmatched.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Unmatched Events ({unmatched.length})
          </h2>
          <p className="text-xs text-slate-500 mb-2">Events with attendees but no client match</p>
          <div className="rounded-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500">Date</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Event</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Attendees</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmatched.map((ev) => {
                  const attendees: Array<{ email: string; name: string }> = (() => {
                    try { return JSON.parse(String(ev.attendees_json || '[]')); } catch { return []; }
                  })();
                  const extAttendees = attendees.filter(a => !a.email?.includes('logicinbound'));

                  return (
                    <tr key={ev.id as string} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {ev.start_time ? new Date(ev.start_time as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-800">{String(ev.title)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {extAttendees.slice(0, 2).map(a => a.email).join(', ')}
                        {extAttendees.length > 2 ? ` +${extAttendees.length - 2}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {calendars.length === 0 && scopes?.authorized && (
        <p className="mt-6 text-sm text-slate-400">No calendars synced yet. Click "Sync Calendar" to get started.</p>
      )}
    </div>
  );
}
