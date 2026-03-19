import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { SubAccount } from '../../types';
import SubAccountRow from '../../components/settings/SubAccountRow';
import PitCsvUpload from '../../components/settings/PitCsvUpload';

type SubSortKey = 'name' | 'status';
type SubSortDir = 'asc' | 'desc';

const pitStatusOrder: Record<string, number> = { valid: 0, invalid: 1, untested: 2, not_configured: 3 };

function SortableHeader({
  label, sortKey, currentKey, currentDir, onSort, className,
}: {
  label: string; sortKey: SubSortKey; currentKey: SubSortKey; currentDir: SubSortDir;
  onSort: (key: SubSortKey) => void; className?: string;
}) {
  const active = sortKey === currentKey;
  return (
    <th className={className}>
      <button
        onClick={() => onSort(sortKey)}
        className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-800"
      >
        {label}
        <span className={active ? 'text-teal-600' : 'text-slate-300 group-hover:text-slate-400'}>
          {active && currentDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
    </th>
  );
}

export default function SubAccountsPage() {
  const [accounts, setAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SubSortKey>('name');
  const [sortDir, setSortDir] = useState<SubSortDir>('asc');

  const load = useCallback(async () => {
    const data = await api.getSubAccounts({
      search: search || undefined,
      status: filter || undefined,
    });
    setAccounts(data);
    setLoading(false);
  }, [search, filter]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    const result = await api.refreshSubAccountList();
    setRefreshResult(result.success ? `Found ${result.count} sub-accounts` : result.message ?? 'Failed');
    setRefreshing(false);
    load();
  };

  const handleSort = (key: SubSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const list = [...accounts].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.name ?? '').localeCompare(b.name ?? '');
      } else if (sortKey === 'status') {
        cmp = (pitStatusOrder[a.pit_status] ?? 9) - (pitStatusOrder[b.pit_status] ?? 9);
        if (cmp === 0) cmp = (a.name ?? '').localeCompare(b.name ?? '');
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [accounts, sortKey, sortDir]);

  const configured = accounts.filter((a) => a.pit_status !== 'not_configured').length;

  return (
    <div className="p-6">
      <h1 className="text-lg font-bold text-slate-900">Sub-Accounts</h1>
      <p className="mt-1 mb-4 text-xs text-slate-500">Manage GHL sub-account Private Integration Tokens.</p>

      <PitCsvUpload onUploadComplete={load} />

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-slate-500">
            Showing {accounts.length} sub-accounts ({configured} configured)
          </p>
          {refreshResult && (
            <p className="text-xs text-teal-600 mt-0.5">{refreshResult}</p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh Sub-Account List
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-slate-200 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
        >
          <option value="">All</option>
          <option value="configured">Configured</option>
          <option value="enabled">Auto-sync Enabled</option>
          <option value="not_configured">Not Configured</option>
        </select>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-slate-400">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">
          No sub-accounts found. Enter your Agency PIT in Integrations and click "Refresh Sub-Account List".
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-auto max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <SortableHeader label="Sub-Account" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-2" />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Location ID</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">PIT</th>
                <SortableHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2" />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Test</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Sync</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 text-center">Auto</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <SubAccountRow key={a.id} account={a} onUpdate={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
