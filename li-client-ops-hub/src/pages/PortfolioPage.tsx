import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Bell, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAlerts } from '../hooks/useDB';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import SLABadge from '../components/shared/SLABadge';
import BudgetBar from '../components/shared/BudgetBar';
import SyncProgressBar from '../components/shared/SyncProgressBar';
import ColumnTooltip from '../components/shared/ColumnTooltip';
import { PORTFOLIO_COLUMN_TOOLTIPS } from '../lib/clientTooltips';
import { usePortfolioLiveProgress } from '../hooks/usePortfolioLiveProgress';
import type { Company, SLAStatus, CompanyFilters } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────

function relativeTime(iso: string | null): { text: string; color: string } {
  if (!iso) return { text: 'never', color: 'text-slate-400' };
  const diff = Date.now() - new Date(iso).getTime();
  const hours = diff / 3600000;
  const color = hours < 2 ? 'text-green-600' : hours < 4 ? 'text-amber-600' : 'text-red-600';
  if (hours < 1) return { text: `${Math.round(hours * 60)}m ago`, color };
  if (hours < 24) return { text: `${Math.round(hours)}h ago`, color };
  return { text: `${Math.round(hours / 24)}d ago`, color };
}

const slaOrder: Record<SLAStatus, number> = { violation: 0, warning: 1, ok: 2 };

type SortKey = 'name' | 'sla' | 'contacts' | 'budget' | 'new_contacts' | 'messages' | 'last_sync';
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
      case 'messages': cmp = (a.messages_synced_total ?? 0) - (b.messages_synced_total ?? 0); break;
      case 'last_sync': cmp = (a.last_sync_at ?? '').localeCompare(b.last_sync_at ?? ''); break;
    }
    return dir === 'desc' ? -cmp : cmp;
  });
}

function ContactsCell({ synced, apiTotal }: { synced: number; apiTotal: number | null }) {
  if (!apiTotal && synced === 0) return <span className="text-slate-400">&mdash;</span>;
  if (!apiTotal) return <span className="text-slate-600">{synced.toLocaleString()}</span>;
  const pct = apiTotal > 0 ? Math.round((synced / apiTotal) * 100) : 0;
  const full = synced >= apiTotal;
  return (
    <div>
      <div className="flex items-center gap-1 text-xs">
        <span className="font-medium text-slate-700">{synced.toLocaleString()}</span>
        <span className="text-slate-400">/</span>
        <span className="text-slate-500">{apiTotal.toLocaleString()}</span>
      </div>
      {!full && (
        <div className="mt-0.5 flex items-center gap-1">
          <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-200">
            <div className="h-1 rounded-full bg-teal-500" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-[10px] text-slate-400">{pct}%</span>
        </div>
      )}
      {full && <span className="text-[10px] text-green-600">&check; synced</span>}
    </div>
  );
}

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, tooltipKey }: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir; onSort: (key: SortKey) => void; tooltipKey?: string;
}) {
  const active = sortKey === currentKey;
  const header = (
    <button onClick={() => onSort(sortKey)} className="group inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-800">
      {label}
      <span className={active ? 'text-teal-600' : 'text-slate-300 group-hover:text-slate-400'}>
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

export default function PortfolioPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [slaFilter, setSlaFilter] = useState<SLAStatus | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [contactPeriod, setContactPeriod] = useState('30d');
  const [sortKey, setSortKey] = useState<SortKey>('sla');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [syncing, setSyncing] = useState(false);

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

  const handleSyncAll = async () => { setSyncing(true); await api.syncAll(); setSyncing(false); };

  const periodLabel: Record<string, string> = { '7d': '7d', '30d': '30d', '90d': 'Qtr', '365d': 'Yr' };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-900">Portfolio</h1>
          {lastRefreshed && (
            <span className="text-[10px] text-slate-400">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {alerts.length > 0 && (
            <button onClick={() => navigate('/logs')} className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
              <Bell size={13} /> {alerts.length}
            </button>
          )}
          <button onClick={refresh} className="text-xs text-teal-600 hover:text-teal-800">Refresh</button>
          <button onClick={handleSyncAll} disabled={syncing} className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync All
          </button>
        </div>
      </div>

      <div className="px-6"><SyncProgressBar /></div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-6 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
        </div>
        <select value={slaFilter} onChange={(e) => setSlaFilter(e.target.value as SLAStatus | '')} className="rounded border border-slate-200 px-2.5 py-1.5 text-sm">
          <option value="">All SLA</option><option value="ok">OK</option><option value="warning">Warning</option><option value="violation">Violation</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-slate-200 px-2.5 py-1.5 text-sm">
          <option value="active">Active</option><option value="">All</option><option value="paused">Paused</option><option value="churned">Churned</option>
        </select>
        <select value={contactPeriod} onChange={(e) => setContactPeriod(e.target.value)} className="rounded border border-slate-200 px-2.5 py-1.5 text-sm">
          <option value="7d">New: 7 days</option><option value="30d">New: 30 days</option><option value="90d">New: Quarter</option><option value="365d">New: Year</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">No companies found.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-2.5"><SortHeader label="Company" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="name" /></th>
                <th className="px-4 py-2.5"><SortHeader label="SLA" sortKey="sla" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="sla" /></th>
                <th className="px-4 py-2.5"><SortHeader label="Contacts" sortKey="contacts" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="contacts" /></th>
                <th className="px-4 py-2.5"><SortHeader label={`New (${periodLabel[contactPeriod]})`} sortKey="new_contacts" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="new_contacts" /></th>
                <th className="px-4 py-2.5"><SortHeader label="Messages" sortKey="messages" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="messages" /></th>
                <th className="px-4 py-2.5 min-w-[120px]"><SortHeader label="Budget" sortKey="budget" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="budget" /></th>
                <th className="px-4 py-2.5"><SortHeader label="Last Sync" sortKey="last_sync" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} tooltipKey="last_sync" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((c) => {
                const sync = relativeTime(c.last_sync_at);
                const newCount = (c as unknown as Record<string, unknown>)[periodFieldMap[contactPeriod]] as number ?? 0;
                return (
                  <tr key={c.id} onClick={() => navigate(`/company/${c.id}`)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.website && <div className="text-xs text-slate-400 truncate max-w-[200px]">{c.website}</div>}
                    </td>
                    <td className="px-4 py-3"><SLABadge status={c.sla_status} days={c.sla_days_since_contact} /></td>
                    <td className="px-4 py-3"><ContactsCell synced={c.contact_count} apiTotal={c.contacts_api_total} /></td>
                    <td className="px-4 py-3">
                      {newCount > 0 ? (
                        <span className="text-green-600 font-medium">+{newCount.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {(c.messages_synced_total ?? 0) > 0 ? (c.messages_synced_total ?? 0).toLocaleString() : <span className="text-slate-400">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3"><BudgetBar percent={c.budget_percent} used={c.budget_used} total={c.monthly_budget} /></td>
                    <td className={`px-4 py-3 text-xs ${sync.color}`}>{sync.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
