import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Loader2, ChevronDown, ChevronUp, ChevronRight, Calendar, Users, Search, X } from 'lucide-react';
import { api } from '../../lib/ipc';

// ── Types ────────────────────────────────────────────────────────────

interface CalSyncProgress {
  phase: string;
  percent: number;
  calendarName: string;
  calendarIndex?: number;
  calendarTotal?: number;
  eventsFound: number;
  eventsCreated: number;
  error?: string;
}

interface CalEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  calendar_name: string;
  organizer_name: string | null;
  organizer_email: string | null;
  attendees_count: number;
  accepted_count: number;
  attendees_json: string | null;
  company_id: string | null;
  company_name: string | null;
  match_method: string | null;
  conference_url: string | null;
  all_day: number;
  status: string;
}

type SortKey = 'start_time' | 'title' | 'attendees_count' | 'calendar_name';
type SortDir = 'asc' | 'desc';

// ── Main Page ────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tab, setTab] = useState<'events' | 'calendars'>('events');
  const [calendars, setCalendars] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [stats, setStats] = useState<{ totalEvents: number; matchedEvents: number; unmatchedEvents: number; selectedCalendars: number } | null>(null);
  const [scopes, setScopes] = useState<{ authorized: boolean; hasCalendar: boolean; needsReauth: boolean; email?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<CalSyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('start_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [calendarsExpanded, setCalendarsExpanded] = useState(false);

  const load = useCallback(async () => {
    const [cals, evts, st, sc] = await Promise.all([
      api.getCalendars(),
      api.getAllCalendarEvents(1000),
      api.getCalendarStats(),
      api.checkGoogleScopes(),
    ]);
    setCalendars(cals as Array<Record<string, unknown>>);
    setEvents(evts as unknown as CalEvent[]);
    setStats(st);
    setScopes(sc);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Listen for sync progress
  useEffect(() => {
    const handler = (_event: unknown, data: CalSyncProgress) => {
      setSyncProgress(data);
      if (data.phase === 'complete') {
        setSyncing(false);
        load();
      }
    };
    api.onCalendarSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offCalendarSyncProgress(handler as (...args: unknown[]) => void); };
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress(null);
    const result = await api.syncCalendar();
    setSyncResult(result.success
      ? `Synced ${result.found || 0} events (${result.created || 0} new, ${result.updated || 0} updated)`
      : result.message || 'Sync failed');
    load();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.toggleCalendarSync(id, enabled);
    load();
  };

  // Sort + filter events
  const filtered = useMemo(() => {
    let list = [...events];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.company_name ?? '').toLowerCase().includes(q) ||
        (e.calendar_name ?? '').toLowerCase().includes(q) ||
        (e.attendees_json ?? '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'start_time': cmp = (a.start_time || '').localeCompare(b.start_time || ''); break;
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'attendees_count': cmp = a.attendees_count - b.attendees_count; break;
        case 'calendar_name': cmp = (a.calendar_name || '').localeCompare(b.calendar_name || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [events, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'start_time' ? 'desc' : 'asc'); }
  };

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
      onClick={() => handleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Google Calendar</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {scopes?.authorized
                ? `Authorized as ${scopes.email || 'unknown'}`
                : 'Not authorized \u2014 set up auth in Settings > Google'}
            </p>
          </div>
          <button onClick={handleSync} disabled={syncing || !scopes?.authorized}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync Calendar
          </button>
        </div>

        {/* Sync progress */}
        {syncing && syncProgress && syncProgress.phase !== 'complete' && syncProgress.phase !== 'error' && (
          <div className="mt-2 rounded bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-teal-700 dark:text-teal-400 mb-1">
              <span>
                {syncProgress.phase === 'calendars' ? 'Fetching calendar list...' : (
                  <>Syncing <span className="font-medium">{syncProgress.calendarName}</span>
                    {syncProgress.calendarTotal && (
                      <span className="text-teal-500 ml-1">({(syncProgress.calendarIndex ?? 0) + 1}/{syncProgress.calendarTotal})</span>
                    )}
                  </>
                )}
              </span>
              <span className="font-medium">{syncProgress.percent}%</span>
            </div>
            <div className="h-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${syncProgress.percent}%` }} />
            </div>
            <div className="text-[11px] text-teal-600 dark:text-teal-400 mt-1">
              {syncProgress.eventsFound} events found, {syncProgress.eventsCreated} new
            </div>
          </div>
        )}

        {syncResult && (
          <p className="mt-2 text-xs text-teal-600 dark:text-teal-400">{syncResult}</p>
        )}

        {/* Stats */}
        {stats && (
          <div className="mt-2 flex gap-6 text-xs text-slate-600 dark:text-slate-400">
            <span>Events: <span className="font-medium">{stats.totalEvents}</span></span>
            <span>Matched: <span className="font-medium text-green-600 dark:text-green-400">{stats.matchedEvents}</span></span>
            <span>Unmatched: <span className="font-medium text-amber-600">{stats.unmatchedEvents}</span></span>
            <span>Calendars: <span className="font-medium">{stats.selectedCalendars}</span></span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6">
        <button onClick={() => setTab('events')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'events' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Events ({filtered.length})
        </button>
        <button onClick={() => setTab('calendars')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'calendars' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Calendars ({calendars.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Events Tab */}
        {tab === 'events' && (
          <>
            {/* Search */}
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input type="text" placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
                {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} events</span>
            </div>

            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-slate-400 dark:text-slate-500">
                {events.length === 0 ? 'No events synced yet. Click "Sync Calendar" to get started.' : 'No events match your search.'}
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    <SortTh label="Date" k="start_time" />
                    <SortTh label="Event" k="title" />
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Company</th>
                    <SortTh label="Calendar" k="calendar_name" />
                    <SortTh label="Attendees" k="attendees_count" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filtered.map(ev => {
                    const attendees: Array<{ email: string; name: string }> = (() => {
                      try { return JSON.parse(ev.attendees_json || '[]'); } catch { return []; }
                    })();
                    const extAttendees = attendees.filter(a => !a.email?.includes('logicinbound'));

                    return (
                      <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                          {ev.start_time && !ev.all_day && (
                            <span className="text-slate-400 dark:text-slate-500 ml-1">
                              {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm text-slate-800 dark:text-slate-200 truncate max-w-[300px]">{ev.title}</div>
                          {ev.organizer_name && (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">by {ev.organizer_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {ev.company_name ? (
                            <span className="text-green-600 dark:text-green-400">{ev.company_name}</span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                          {ev.calendar_name}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400" title={extAttendees.map(a => a.email).join(', ')}>
                          <div className="flex items-center gap-1">
                            <Users size={11} className="text-slate-400 dark:text-slate-500" />
                            {ev.attendees_count}
                            {ev.accepted_count > 0 && <span className="text-green-500">({ev.accepted_count})</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Calendars Tab */}
        {tab === 'calendars' && (
          <div className="p-6">
            {calendars.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No calendars synced yet. Click "Sync Calendar" to discover calendars.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Calendar</th>
                      <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Access</th>
                      <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {calendars.map((cal) => (
                      <tr key={cal.id as string} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {cal.color ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color as string }} /> : null}
                            <span className="font-medium text-slate-800 dark:text-slate-200">{String(cal.name)}</span>
                            {cal.primary_calendar ? <span className="text-[10px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-1 rounded">Primary</span> : null}
                          </div>
                          {cal.description ? <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[300px]">{String(cal.description)}</div> : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{String(cal.access_role || '-')}</td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={!!cal.selected}
                            onChange={(e) => handleToggle(cal.id as string, e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
