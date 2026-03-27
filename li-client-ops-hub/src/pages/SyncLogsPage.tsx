import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Search, X, ChevronDown, ChevronRight, BellOff } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAlerts } from '../hooks/useDB';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { SyncRun, SyncAlert, SyncPhase } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDuration(start: string, end: string | null): string {
  if (!end) return 'running...';
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'success') return <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle size={13} /> ok</span>;
  if (status === 'error') return <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><XCircle size={13} /> failed</span>;
  if (status === 'running') return <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400"><Loader2 size={13} className="animate-spin" /> running</span>;
  return <span className="text-xs text-slate-400 dark:text-slate-500">{status}</span>;
}

// ── Expanded detail for a sub-account ─────────────────────────────────

function PhaseTimeline({ runId }: { runId: string }) {
  const [phases, setPhases] = useState<SyncPhase[]>([]);
  useEffect(() => { api.getSyncPhases(runId).then(setPhases); }, [runId]);

  if (phases.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Phase Timeline</h4>
      <div className="space-y-1">
        {phases.map((p) => {
          const statusColor = p.status === 'completed' ? 'text-green-600 dark:text-green-400' : p.status === 'failed' ? 'text-red-600 dark:text-red-400' : p.status === 'skipped' ? 'text-slate-400 dark:text-slate-500' : 'text-teal-600 dark:text-teal-400';
          const statusIcon = p.status === 'completed' ? '\u2713' : p.status === 'failed' ? '\u2717' : p.status === 'skipped' ? '\u2014' : '\u25CB';
          const durationStr = p.duration_ms != null ? p.duration_ms < 1000 ? `${p.duration_ms}ms` : `${(p.duration_ms / 1000).toFixed(1)}s` : '';
          return (
            <div key={p.id} className="flex items-start gap-2 text-xs">
              <span className={`w-3 shrink-0 ${statusColor}`}>{statusIcon}</span>
              <span className="w-20 shrink-0 font-medium text-slate-700 dark:text-slate-300">{p.phase_name}</span>
              <span className="w-12 shrink-0 text-slate-400 dark:text-slate-500 text-right">{durationStr}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {p.items_found > 0 && `${p.items_found} found`}
                {p.items_created > 0 && `, +${p.items_created}`}
                {p.items_updated > 0 && `, ~${p.items_updated}`}
                {p.items_skipped > 0 && `, ${p.items_skipped} skipped`}
              </span>
              {p.error_message && (
                <span className="text-red-500 truncate max-w-[300px]" title={p.error_stack ?? p.error_message}>
                  {p.error_message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SyncDetail({ companyId, latestRun }: { companyId: string; latestRun: Record<string, unknown> }) {
  const historyFetcher = useCallback(() => api.getCompanySyncHistory(companyId, 10), [companyId]);
  const { data: historyRaw } = useAutoRefresh(historyFetcher, [companyId], 60000);
  const history: SyncRun[] = (historyRaw as SyncRun[]) ?? [];

  const [msgStats, setMsgStats] = useState<{ total: number; byType: Array<{ type: string; cnt: number }> } | null>(null);
  useEffect(() => {
    api.getCompanyMessageStats(companyId).then(setMsgStats);
  }, [companyId]);

  // Parse detail_json from latest run
  let detail: Record<string, { found?: number; created?: number; updated?: number }> = {};
  try { detail = latestRun.detail_json ? JSON.parse(latestRun.detail_json as string) : {}; } catch { /* */ }

  const entityNames: Record<string, string> = {
    contacts: 'Contacts', messages: 'Messages', users: 'Users', workflows: 'Workflows',
    funnels: 'Funnels', sites: 'Sites', templates: 'Email Templates', fields: 'Custom Fields',
  };

  const msgTypeLabels: Record<string, string> = {
    sms: 'SMS', email: 'Email', call: 'Call', facebook: 'Facebook', instagram: 'Instagram',
    gmb: 'Google Business', whatsapp: 'WhatsApp', live_chat: 'Live Chat', activity: 'Activity',
  };

  return (
    <td colSpan={7} className="bg-slate-50 dark:bg-slate-900 px-6 py-4">
      <div className="space-y-4">
        {/* Phase timeline for latest run */}
        {!!latestRun.id && <PhaseTimeline runId={String(latestRun.id)} />}

        {/* Entity breakdown */}
        {Object.keys(detail).length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Entity Breakdown (Latest Run)</h4>
            <table className="text-xs w-full max-w-md">
              <thead>
                <tr className="text-slate-400 dark:text-slate-500"><th className="py-0.5 text-left">Entity</th><th className="py-0.5 text-right">Found</th><th className="py-0.5 text-right">Created</th><th className="py-0.5 text-right">Updated</th></tr>
              </thead>
              <tbody>
                {Object.entries(detail).map(([key, counts]) => (
                  <tr key={key} className="text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50">
                    <td className="py-0.5">{entityNames[key] ?? key}</td>
                    <td className="py-0.5 text-right">{counts.found ?? 0}</td>
                    <td className="py-0.5 text-right text-green-600 dark:text-green-400">{counts.created ?? 0}</td>
                    <td className="py-0.5 text-right text-blue-600 dark:text-blue-400">{counts.updated ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Messages breakdown by type */}
        {msgStats && msgStats.total > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Messages Breakdown</h4>
            <table className="text-xs max-w-xs">
              <thead>
                <tr className="text-slate-400 dark:text-slate-500"><th className="py-0.5 text-left">Type</th><th className="py-0.5 text-right">Count</th></tr>
              </thead>
              <tbody>
                {msgStats.byType.map((row) => (
                  <tr key={row.type} className="text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50">
                    <td className="py-0.5">{msgTypeLabels[row.type] ?? row.type ?? 'Unknown'}</td>
                    <td className="py-0.5 text-right">{(row.cnt as number).toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="text-slate-700 dark:text-slate-300 font-medium border-t border-slate-200 dark:border-slate-700">
                  <td className="py-0.5">Total</td>
                  <td className="py-0.5 text-right">{msgStats.total.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Run history */}
        {history.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Recent Runs</h4>
            <div className="space-y-1">
              {history.map((run) => (
                <div key={run.id} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-28">{new Date(run.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="w-12">{run.trigger}</span>
                  <StatusBadge status={run.status} />
                  <span className="text-slate-400 dark:text-slate-500">+{run.items_created} created, +{run.items_updated} updated</span>
                  {run.error_message && <span className="text-red-500 truncate max-w-[200px]">{run.error_message}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {latestRun.error_message ? (
          <div className="rounded bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {String(latestRun.error_message)}
          </div>
        ) : null}
      </div>
    </td>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function SyncLogsPage() {
  const [tab, setTab] = useState<'summary' | 'alerts'>('summary');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summaryFetcher = useCallback(() => api.getSyncSummary({ period: period || undefined }), [period]);
  const { data: summary, loading } = useAutoRefresh(summaryFetcher, [period]);
  const { alerts } = useAlerts(false);

  const filtered = useMemo(() => {
    if (!summary) return [];
    let list = summary as Array<Record<string, unknown>>;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => ((r.company_name as string) ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [summary, search]);

  const handleAck = async (id: string) => { await api.acknowledgeAlert(id); };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sync Logs</h1>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6">
        <button onClick={() => setTab('summary')} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'summary' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Sub-Account Syncs ({filtered.length})
        </button>
        <button onClick={() => setTab('alerts')} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'alerts' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Alerts ({alerts.filter((a) => !a.acknowledged).length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'summary' && (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
                {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
              </div>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="">All time</option><option value="24h">Last 24h</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
              </select>
            </div>

            {loading ? (
              <p className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-slate-400 dark:text-slate-500">No sync runs found.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    <th className="w-8 px-4 py-2" />
                    <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Sub-Account</th>
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Last Run</th>
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Status</th>
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Contacts</th>
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Messages</th>
                    <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const id = r.company_id as string;
                    const isExpanded = expandedId === id;
                    return (
                      <React.Fragment key={id}>
                        <tr onClick={() => setExpandedId(isExpanded ? null : id)} className="cursor-pointer border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className="px-4 py-2.5">{isExpanded ? <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" /> : <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" />}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{r.company_name as string}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{relTime(r.started_at as string)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={r.status as string} /></td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="text-green-600 dark:text-green-400">+{(r.items_created as number) ?? 0}</span>
                            <span className="text-slate-400 dark:text-slate-500"> / {((r.contact_count as number) ?? 0).toLocaleString()} total</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="text-slate-600 dark:text-slate-400">{((r.messages_synced_total as number) ?? 0).toLocaleString()}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{fmtDuration(r.started_at as string, r.finished_at as string | null)}</td>
                        </tr>
                        {isExpanded && (
                          <tr><SyncDetail companyId={id} latestRun={r} /></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'alerts' && (
          alerts.length === 0 ? (
            <p className="p-6 text-sm text-slate-400 dark:text-slate-500">No alerts.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {alerts.map((alert: SyncAlert) => (
                <div key={alert.id} className={`flex items-start gap-3 px-6 py-3 ${alert.acknowledged ? 'opacity-50' : ''}`}>
                  <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${alert.severity === 'error' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{alert.type}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(alert.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{alert.message}</p>
                  </div>
                  {!alert.acknowledged && (
                    <button onClick={() => handleAck(alert.id)} className="shrink-0 rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><BellOff size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
