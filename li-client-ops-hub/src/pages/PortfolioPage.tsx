import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Bell, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../lib/ipc';
import { useAlerts } from '../hooks/useDB';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useMemoryGuard } from '../hooks/useMemoryGuard';
import SLABadge from '../components/shared/SLABadge';
import BudgetBar from '../components/shared/BudgetBar';
import SyncProgressBar from '../components/shared/SyncProgressBar';
import ColumnTooltip from '../components/shared/ColumnTooltip';
import { PORTFOLIO_COLUMN_TOOLTIPS } from '../lib/clientTooltips';
import { usePortfolioLiveProgress } from '../hooks/usePortfolioLiveProgress';
import HealthBadge from '../components/shared/HealthBadge';
import SLAExplainer from '../components/shared/SLAExplainer';
import type { Company, SLAStatus, CompanyFilters } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────

function relativeTime(iso: string | null): { text: string; color: string } {
  if (!iso) return { text: 'never', color: 'text-slate-400 dark:text-slate-500' };
  const diff = Date.now() - new Date(iso).getTime();
  const hours = diff / 3600000;
  const color = hours < 2 ? 'text-green-600 dark:text-green-400' : hours < 4 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  if (hours < 1) return { text: `${Math.round(hours * 60)}m ago`, color };
  if (hours < 24) return { text: `${Math.round(hours)}h ago`, color };
  return { text: `${Math.round(hours / 24)}d ago`, color };
}

const slaOrder: Record<SLAStatus, number> = { violation: 0, warning: 1, ok: 2 };

type SortKey = 'name' | 'health' | 'churn' | 'revenue' | 'sla' | 'contacts' | 'budget' | 'new_contacts' | 'messages' | 'last_sync';
type SortDir = 'asc' | 'desc';

const periodFieldMap: Record<string, string> = {
  '7d': 'contacts_added_7d',
  '30d': 'contacts_added_30d',
  '90d': 'contacts_added_90d',
  '365d': 'contacts_added_365d',
};

function sortCompanies(companies: Company[], key: SortKey, dir: SortDir, period: string): Company[] {
  return [...companies].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'health': cmp = (a.health_score ?? -1) - (b.health_score ?? -1); break;
      case 'sla':
        cmp = slaOrder[a.sla_status] - slaOrder[b.sla_status];
        if (cmp === 0) cmp = (b.sla_days_since_contact ?? 0) - (a.sla_days_since_contact ?? 0);
        break;
      case 'contacts': cmp = (a.contact_count ?? 0) - (b.contact_count ?? 0); break;
      case 'budget': cmp = (a.budget_percent ?? 0) - (b.budget_percent ?? 0); break;
      case 'new_contacts': {
        const f = periodFieldMap[period] as keyof Company;
        cmp = ((a[f] as number) ?? 0) - ((b[f] as number) ?? 0);
        break;
      }
      case 'churn': cmp = (a.churn_risk_score ?? -1) - (b.churn_risk_score ?? -1); break;
      case 'revenue': cmp = (a.monthly_revenue ?? 0) - (b.monthly_revenue ?? 0); break;
      case 'messages': cmp = (a.messages_synced_total ?? 0) - (b.messages_synced_total ?? 0); break;
      case 'last_sync': cmp = (a.last_sync_at ?? '').localeCompare(b.last_sync_at ?? ''); break;
    }
    return dir === 'desc' ? -cmp : cmp;
  });
}

function formatSyncDatePST(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/Los_Angeles',
    }).replace(',', '') + ' PST';
  } catch { return ''; }
}

function ContactsCell({ synced, apiTotal, lastSyncAt }: { synced: number; apiTotal: number | null; lastSyncAt?: string | null }) {
  if (!apiTotal && synced === 0) return <span className="text-slate-400 dark:text-slate-500">&mdash;</span>;
  if (!apiTotal) return <span className="text-slate-600 dark:text-slate-400">{synced.toLocaleString()}</span>;
  const pct = apiTotal > 0 ? Math.round((synced / apiTotal) * 100) : 0;
  const full = synced >= apiTotal;
  return (
    <div>
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-300">{synced.toLocaleString()}</span>
        <span className="text-slate-400 dark:text-slate-500">/</span>
        <span className="text-slate-500 dark:text-slate-400">{apiTotal.toLocaleString()}</span>
      </div>
      {!full && (
        <div className="mt-0.5 flex items-center gap-1">
          <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-1 rounded-full bg-teal-500" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{pct}%</span>
        </div>
      )}
      {full && (
        <div className="text-[10px] text-green-600 dark:text-green-400">
          <span>&#10003; {lastSyncAt ? formatSyncDatePST(lastSyncAt) : 'synced'}</span>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, tooltipKey }: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir; onSort: (key: SortKey) => void; tooltipKey?: string;
}) {
  const active = sortKey === currentKey;
  const header = (
    <button onClick={() => onSort(sortKey)} className="group inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
      {label}
      <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500'}>
        {active && currentDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </span>
    </button>
  );

  const tip = tooltipKey ? PORTFOLIO_COLUMN_TOOLTIPS[tooltipKey] : undefined;
  if (!tip) return header;

  return (
    <ColumnTooltip label={label} tooltip={tip}>
      {header}
    </ColumnTooltip>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

const ROW_HEIGHT = 52; // px — estimated height of each table row

export default function PortfolioPage() {
  const navigate = useNavigate();
  useMemoryGuard(512);

  const [search, setSearch] = useState('');
  const [slaFilter, setSlaFilter] = useState<SLAStatus | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [contactPeriod, setContactPeriod] = useState('30d');
  const [sortKey, setSortKey] = useState<SortKey>('sla');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [syncing, setSyncing] = useState(false);
  const liveProgress = usePortfolioLiveProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());

  // Fetch companies that had changes in the last 24h
  useEffect(() => {
    api.getChangedCompanies().then((data) => {
      setChangedIds(new Set(data.map(d => d.company_id)));
    });
  }, []);

  const filters: CompanyFilters = useMemo(() => ({
    search: search || undefined,
    sla_status: slaFilter || undefined,
    status: statusFilter || undefined,
  }), [search, slaFilter, statusFilter]);

  const fetcher = useCallback(() => api.getCompanies(filters), [filters]);
  const { data: companies, loading, refresh, lastRefreshed } = useAutoRefresh(fetcher, [filters]);
  const { alerts } = useAlerts(true);

  const sorted = useMemo(
    () => sortCompanies(companies ?? [], sortKey, sortDir, contactPeriod),
    [companies, sortKey, sortDir, contactPeriod]
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'sla' ? 'asc' : 'desc'); }
  };

  const handleSyncAll = async () => { setSyncing(true); await api.queueSyncAll(); setSyncing(false); };

  const periodLabel: Record<string, string> = { '7d': '7d', '30d': '30d', '90d': 'Qtr', '365d': 'Yr' };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Portfolio</h1>
          {lastRefreshed && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {alerts.length > 0 && (
            <button onClick={() => navigate('/logs')} className="flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50">
              <Bell size={13} /> {alerts.length}
            </button>
          )}
          <button onClick={refresh} className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300">Refresh</button>
          <button onClick={handleSyncAll} disabled={syncing} className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync All
          </button>
        </div>
      </div>

      <div className="px-6"><SyncProgressBar /></div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input type="text" placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
        </div>
        <select value={slaFilter} onChange={(e) => setSlaFilter(e.target.value as SLAStatus | '')} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm">
          <option value="">All SLA</option><option value="ok">OK</option><option value="warning">Warning</option><option value="violation">Violation</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm">
          <option value="active">Active</option><option value="">All</option><option value="paused">Paused</option><option value="churned">Churned</option>
        </select>
        <select value={contactPeriod} onChange={(e) => setContactPeriod(e.target.value)} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm">
          <option value="7d">New: 7 days</option><option value="30d">New: 30 days</option><option value="90d">New: Quarter</option><option value="365d">New: Year</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {loading ? (
          <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 dark:text-slate-500">No companies found.</div>
        ) : (
          <VirtualTable
            companies={sorted}
            liveProgress={liveProgress}
            changedIds={changedIds}
            contactPeriod={contactPeriod}
            periodLabel={periodLabel}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onNavigate={(id) => navigate(`/company/${id}`)}
            scrollRef={scrollRef}
          />
        )}
      </div>
    </div>
  );
}

// ── Virtualized Table ──────────────────────────────────────────────────

function VirtualTable({
  companies,
  liveProgress,
  changedIds,
  contactPeriod,
  periodLabel,
  sortKey,
  sortDir,
  onSort,
  onNavigate,
  scrollRef,
}: {
  companies: Company[];
  liveProgress: Record<string, import('../hooks/usePortfolioLiveProgress').SyncProgressSummary>;
  changedIds: Set<string>;
  contactPeriod: string;
  periodLabel: Record<string, string>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onNavigate: (id: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const virtualizer = useVirtualizer({
    count: companies.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const handleSort = onSort;

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
        <tr>
          <th className="px-6 py-2.5"><SortHeader label="Company" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="name" /></th>
          <th className="px-3 py-2.5"><SortHeader label="Health" sortKey="health" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="health" /></th>
          <th className="px-3 py-2.5"><SortHeader label="Churn Risk" sortKey="churn" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="health" /></th>
          <th className="px-3 py-2.5"><SortHeader label="Revenue" sortKey="revenue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="health" /></th>
          <th className="px-4 py-2.5">
            <div className="flex items-center gap-1">
              <SortHeader label="SLA" sortKey="sla" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="sla" />
              <SLAExplainer context="portfolio" />
            </div>
          </th>
          <th className="px-4 py-2.5"><SortHeader label="Contacts" sortKey="contacts" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="contacts" /></th>
          <th className="px-4 py-2.5"><SortHeader label={`New (${periodLabel[contactPeriod]})`} sortKey="new_contacts" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="new_contacts" /></th>
          <th className="px-4 py-2.5"><SortHeader label="Messages" sortKey="messages" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="messages" /></th>
          <th className="px-4 py-2.5 min-w-[120px]"><SortHeader label="Budget" sortKey="budget" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="budget" /></th>
          <th className="px-4 py-2.5"><SortHeader label="Last Sync" sortKey="last_sync" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="last_sync" /></th>
        </tr>
      </thead>
      <tbody>
        {/* Spacer to position virtual rows correctly */}
        <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }}>
          <td colSpan={10} />
        </tr>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const c = companies[virtualRow.index];
          const sync = relativeTime(c.last_sync_at);
          const newCount = (c as unknown as Record<string, unknown>)[periodFieldMap[contactPeriod]] as number ?? 0;
          const live = liveProgress[c.id];
          const liveSynced = live?.contacts_synced ?? c.contact_count;
          const liveTotal = live?.contacts_api_total ?? c.contacts_api_total;
          const liveActive = live && live.overall_status !== 'idle' && live.overall_status !== 'completed';
          const liveMsgs = live?.messages_synced_total ?? (c.messages_synced_total ?? 0);

          return (
            <tr
              key={c.id}
              data-index={virtualRow.index}
              onClick={() => onNavigate(c.id)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-700/50"
              style={{ height: ROW_HEIGHT }}
            >
              <td className="px-6 py-3">
                <div className="flex items-center gap-1.5">
                  {liveActive && <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" />}
                  <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
                  {!liveActive && changedIds.has(c.id) && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Changed in last 24h" />
                  )}
                </div>
                {c.website && <div className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">{c.website}</div>}
              </td>
              <td className="px-3 py-3"><HealthBadge score={c.health_score ?? null} trend={c.health_trend} /></td>
              <td className="px-3 py-3">
                {c.churn_risk_score != null ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    (c.churn_risk_score ?? 0) >= 76 ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
                    (c.churn_risk_score ?? 0) >= 51 ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400' :
                    (c.churn_risk_score ?? 0) >= 26 ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' :
                    'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                  }`} title={c.churn_risk_reason ?? ''}>
                    {c.churn_risk_score}
                  </span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600 text-xs">&mdash;</span>
                )}
              </td>
              <td className="px-3 py-3 text-xs">
                {c.monthly_revenue ? (
                  <span className="text-green-700 dark:text-green-400 font-medium">${c.monthly_revenue.toLocaleString()}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                )}
                {c.contract_end && (() => {
                  const daysLeft = Math.round((new Date(c.contract_end).getTime() - Date.now()) / 86400000);
                  if (daysLeft < 0) return <div className="text-red-500 text-[10px]">Expired</div>;
                  if (daysLeft <= 7) return <div className="text-red-500 text-[10px]">{daysLeft}d left</div>;
                  if (daysLeft <= 30) return <div className="text-amber-500 text-[10px]">{daysLeft}d left</div>;
                  return null;
                })()}
              </td>
              <td className="px-4 py-3"><SLABadge status={c.sla_status} days={c.sla_days_since_contact} /></td>
              <td className="px-4 py-3"><ContactsCell synced={liveSynced} apiTotal={liveTotal} lastSyncAt={c.last_sync_at} /></td>
              <td className="px-4 py-3">
                {newCount > 0 ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">+{newCount.toLocaleString()}</span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">0</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {liveMsgs > 0 ? liveMsgs.toLocaleString() : <span className="text-slate-400 dark:text-slate-500">&mdash;</span>}
              </td>
              <td className="px-4 py-3"><BudgetBar percent={c.budget_percent} used={c.budget_used} total={c.monthly_budget} /></td>
              <td className="px-4 py-3 text-xs">
                {liveActive && live ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
                      </span>
                      <span className="text-teal-600 dark:text-teal-400 font-medium truncate">
                        {live.overall_status === 'running' ? 'syncing' : live.overall_status}
                        {live.overall_percent > 0 ? ` ${Math.round(live.overall_percent)}%` : ''}
                      </span>
                    </div>
                    <div className="h-1 w-16 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, live.overall_percent || 5)}%` }} />
                    </div>
                  </div>
                ) : (
                  <span className={sync.color}>{sync.text}</span>
                )}
              </td>
            </tr>
          );
        })}
        {/* Bottom spacer */}
        <tr style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0) }}>
          <td colSpan={10} />
        </tr>
      </tbody>
    </table>
  );
}
