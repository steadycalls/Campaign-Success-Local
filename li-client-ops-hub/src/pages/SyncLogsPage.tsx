import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Search, X, ChevronDown, ChevronRight, BellOff, Download, Table2, Check, ExternalLink } from 'lucide-react';
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

// ── Custom Fields Tab ────────────────────────────────────────────────

function CustomFieldsTab() {
  const [fields, setFields] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    (api as any).getRICustomFields().then((d: unknown) => { setFields(d as Array<Record<string, unknown>>); setLoading(false); });
  }, []);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of fields) {
      const t = (f.data_type as string) || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [fields]);

  const filtered = useMemo(() => {
    let list = fields;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f => (f.name as string || '').toLowerCase().includes(q) || (f.field_key as string || '').toLowerCase().includes(q));
    }
    if (typeFilter) list = list.filter(f => f.data_type === typeFilter);
    return list;
  }, [fields, search, typeFilter]);

  const handleExportCsv = () => {
    const rows = [['Name', 'Field Key', 'Type', 'ID']];
    for (const f of filtered) rows.push([String(f.name ?? ''), String(f.field_key ?? ''), String(f.data_type ?? ''), String(f.id ?? '')]);
    const csv = rows.map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ri-custom-fields.csv'; a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  const typeColors: Record<string, string> = {
    text: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    'large text': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
    'single options': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
    date: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    'multiple options': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    radio: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    'file upload': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
    checkbox: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    numerical: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    phone: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    signature: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">GHL Custom Fields</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} fields</span>
          <button onClick={handleExportCsv} className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {typeCounts.map(([type, count]) => (
          <button key={type} onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-opacity ${typeColors[type] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'} ${typeFilter && typeFilter !== type ? 'opacity-40' : ''}`}>
            {type} <span className="text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input type="text" placeholder="Filter by name, key, or type..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 w-[30%]">Name</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 w-[35%]">Field Key</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 w-[15%]">Type</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 w-[20%] text-right">ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((f, i) => (
              <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{String(f.name)}</td>
                <td className="px-3 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">{String(f.field_key ?? '')}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border ${typeColors[f.data_type as string] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                    {String(f.data_type ?? '')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs font-mono text-slate-400 dark:text-slate-500 text-right">{String(f.id ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Client Messages Tab ──────────────────────────────────────────────

function ClientMessagesTab() {
  const [stats, setStats] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (api as any).getRIClientMessageStats().then((d: unknown) => { setStats(d as Array<Record<string, unknown>>); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return stats;
    const q = search.toLowerCase();
    return stats.filter(s => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || (s.email as string || '').toLowerCase().includes(q);
    });
  }, [stats, search]);

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  const totalMsgs = stats.reduce((sum, s) => sum + ((s.total_messages as number) || 0), 0);
  const withMessages = stats.filter(s => (s.total_messages as number) > 0).length;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Client Messages</span>
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
            {withMessages}/{stats.length} clients with messages &middot; {totalMsgs.toLocaleString()} total
          </span>
        </div>
      </div>

      <div className="relative max-w-md mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Contact</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Email</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">Total</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">In</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">Out</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Last Message</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((s, i) => {
              const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unknown';
              const total = (s.total_messages as number) || 0;
              const lastAt = s.last_message_at as string | null;
              const lastFormatted = lastAt ? new Date(lastAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
              const lastTime = lastAt ? new Date(lastAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PST' : null;
              const ghlUrl = s.ghl_contact_id && s.ghl_location_id
                ? `https://app.gohighlevel.com/v2/location/${s.ghl_location_id}/contacts/detail/${s.ghl_contact_id}` : null;

              return (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span>
                      {ghlUrl && (
                        <button onClick={() => (api as any).openInChrome(ghlUrl)} className="text-teal-500 hover:text-teal-700" title="Open in GHL">
                          <ExternalLink size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">{(s.email as string) || '\u2014'}</td>
                  <td className={`px-3 py-2.5 text-xs text-center font-medium ${total === 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-center text-slate-500 dark:text-slate-400">{((s.inbound_count as number) || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-center text-slate-500 dark:text-slate-400">{((s.outbound_count as number) || 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    {lastFormatted ? (
                      <div>
                        <div>{lastFormatted}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{lastTime}</div>
                      </div>
                    ) : <span className="text-red-500 dark:text-red-400">never</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.last_message_type ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                        s.last_message_direction === 'outbound'
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                      }`}>
                        {s.last_message_direction === 'outbound' ? '\u2191' : '\u2193'} {String(s.last_message_type)}
                      </span>
                    ) : <span className="text-slate-300 dark:text-slate-600">\u2014</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SyncLogsPage() {
  const [tab, setTab] = useState<'summary' | 'alerts' | 'custom_fields' | 'client_messages'>('summary');
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
        <button onClick={() => setTab('custom_fields')} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'custom_fields' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Custom Fields
        </button>
        <button onClick={() => setTab('client_messages')} className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === 'client_messages' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Client Messages
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

        {tab === 'custom_fields' && <CustomFieldsTab />}
        {tab === 'client_messages' && <ClientMessagesTab />}
      </div>
    </div>
  );
}
