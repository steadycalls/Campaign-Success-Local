import { useState, useEffect, useMemo, useCallback } from 'react';
import { Mail, RefreshCw, Loader2, Search, X, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ArrowUp, ArrowDown, Paperclip } from 'lucide-react';
import { api } from '../lib/ipc';

interface GmailMessage {
  id: string;
  thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string | null;
  date: string | null;
  snippet: string | null;
  direction: 'inbound' | 'outbound' | 'internal';
  has_attachments: number;
  company_id: string | null;
  match_method: string | null;
  company_name?: string | null;
}

interface SyncProgress {
  phase: string;
  accountEmail?: string;
  percent?: number;
  fetched?: number;
  created?: number;
  page?: number;
  error?: string;
}

type SyncRange = 'today' | 'week' | 'month' | 'quarter' | 'year';

const PAGE_SIZE = 100;

function formatDatePST(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Los_Angeles' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PST',
  };
}

// ── Sync Dropdown ────────────────────────────────────────────────────

function SyncDropdown({ onSync, syncing }: { onSync: (days: number) => void; syncing: boolean }) {
  const [open, setOpen] = useState(false);
  const options = [
    { label: 'Today', days: 1 },
    { label: 'Past Week', days: 7 },
    { label: 'Past Month', days: 30 },
    { label: 'Past Quarter', days: 90 },
    { label: 'Past Year', days: 365 },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={syncing}
        className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium">
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Sync Gmail <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 w-48 py-1">
            {options.map(opt => (
              <button key={opt.days} onClick={() => { onSync(opt.days); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-300">
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function GmailPage() {
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<{ total: number; matched: number; unmatched: number; inbound: number; outbound: number } | null>(null);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    const [data, s] = await Promise.all([
      (api as any).gmailGetAll(2000, 0) as Promise<GmailMessage[]>,
      api.gmailGetStats(),
    ]);
    setEmails(data);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { loadEmails(); }, []);

  // Listen for sync progress
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = args[1] as SyncProgress;
      if (data) {
        setSyncProgress(data);
        if (data.phase === 'complete') {
          setSyncing(false);
          setSyncResult(`Synced ${data.fetched} emails (${data.created} new)`);
          loadEmails();
          setTimeout(() => setSyncResult(null), 8000);
        } else if (data.phase === 'error') {
          setSyncing(false);
          setSyncResult(`Error: ${data.error}`);
          setTimeout(() => setSyncResult(null), 8000);
        }
      }
    };
    (api as any).onGmailSyncProgress(handler);
    return () => (api as any).offGmailSyncProgress(handler);
  }, [loadEmails]);

  const handleSync = async (days: number) => {
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress(null);
    api.gmailSync(days);
  };

  const filtered = useMemo(() => {
    let list = emails;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.subject ?? '').toLowerCase().includes(q) ||
        (e.from_email ?? '').toLowerCase().includes(q) ||
        (e.from_name ?? '').toLowerCase().includes(q) ||
        (e.snippet ?? '').toLowerCase().includes(q) ||
        (e.company_name ?? '').toLowerCase().includes(q)
      );
    }
    if (dirFilter) list = list.filter(e => e.direction === dirFilter);
    list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return list;
  }, [emails, search, dirFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, dirFilter]);

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading Gmail...</div>;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail size={20} className="text-red-500" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gmail</h1>
              {stats && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {stats.total.toLocaleString()} emails synced &middot;
                  {stats.matched.toLocaleString()} matched &middot;
                  {stats.inbound.toLocaleString()} in &middot;
                  {stats.outbound.toLocaleString()} out
                </p>
              )}
            </div>
          </div>
          <SyncDropdown onSync={handleSync} syncing={syncing} />
        </div>

        {/* Sync progress */}
        {syncing && syncProgress && syncProgress.phase === 'syncing' && (
          <div className="mx-6 mb-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
                  Syncing
                </span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {syncProgress.accountEmail}
                </span>
              </div>
              <span className="text-red-600 dark:text-red-400">
                Page {syncProgress.page}
              </span>
            </div>
            <div className="h-1.5 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all duration-500 animate-pulse" style={{ width: '100%' }} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px]">
              <span className="text-red-600 dark:text-red-400">
                {(syncProgress.fetched ?? 0).toLocaleString()} emails found
              </span>
              <span className="text-slate-400 dark:text-slate-500">&middot;</span>
              <span className="text-green-600 dark:text-green-400">
                {(syncProgress.created ?? 0).toLocaleString()} new
              </span>
            </div>
          </div>
        )}

        {syncing && syncProgress && syncProgress.phase === 'starting' && (
          <div className="mx-6 mb-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            Starting Gmail sync for {syncProgress.accountEmail}...
          </div>
        )}

        {syncResult && !syncing && (
          <div className="mx-6 mb-2 rounded bg-green-50 dark:bg-green-950/30 px-3 py-1.5 text-xs text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
            {syncResult}
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-2 flex items-center gap-3 border-t border-slate-100 dark:border-slate-700/50">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input type="text" placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
          </div>
          <select value={dirFilter} onChange={e => setDirFilter(e.target.value)}
            className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            <option value="">All Directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="internal">Internal</option>
          </select>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{filtered.length} emails</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <Mail size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {emails.length === 0 ? 'No emails synced. Click Sync Gmail to import.' : 'No emails match your filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">From</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Subject</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Date</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {pageItems.map(e => {
                const { date, time } = formatDatePST(e.date);
                return (
                  <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-2 py-2.5 text-center">
                      {e.direction === 'outbound'
                        ? <ArrowUp size={13} className="text-blue-500 dark:text-blue-400" title="Outbound" />
                        : e.direction === 'inbound'
                        ? <ArrowDown size={13} className="text-green-500 dark:text-green-400" title="Inbound" />
                        : <span className="text-slate-300 dark:text-slate-600 text-xs">&mdash;</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate max-w-[180px]">
                        {e.from_name || e.from_email || 'Unknown'}
                      </div>
                      {e.from_name && e.from_email && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{e.from_email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[300px]">
                          {e.subject || '(no subject)'}
                        </span>
                        {e.has_attachments === 1 && <Paperclip size={11} className="text-slate-400 dark:text-slate-500 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[300px]">{e.snippet}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <div>{date}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{time}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {e.company_name ? (
                        <span className="text-teal-600 dark:text-teal-400 font-medium">{e.company_name}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer pagination */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-2 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length > 0
            ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}\u2013${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`
            : 'No emails'}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
              <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400 px-2">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
              <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
