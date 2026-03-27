import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Loader2, ChevronUp, ChevronDown, Plus, X } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { SubAccount } from '../../types';
import SubAccountRow from '../../components/settings/SubAccountRow';
import PitCsvUpload from '../../components/settings/PitCsvUpload';

// ── Add Company Modal ────────────────────────────────────────────────

function AddCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Company name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createCompany({
        name: name.trim(),
        website: website.trim() || undefined,
        ghl_location_id: ghlLocationId.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Company</h2>
          <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Company Name *</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
              placeholder="Acme Corp"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Website</label>
            <input
              type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
              placeholder="https://acmecorp.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">GHL Location ID</label>
            <input
              type="text" value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-3 py-1.5 text-sm font-mono focus:border-teal-500 focus:outline-none"
              placeholder="abc123XYZ..."
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Optional. Found in GHL sub-account settings.</p>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">Cancel</button>
          <button
            type="submit" disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Company'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
        className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
      >
        {label}
        <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500'}>
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
  const [showAddCompany, setShowAddCompany] = useState(false);

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
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sub-Accounts</h1>
      <p className="mt-1 mb-4 text-xs text-slate-500 dark:text-slate-400">Manage GHL sub-account Private Integration Tokens.</p>

      <PitCsvUpload onUploadComplete={load} />

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {accounts.length} sub-accounts ({configured} configured)
          </p>
          {refreshResult && (
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{refreshResult}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddCompany(true)}
            className="flex items-center gap-1.5 rounded border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 dark:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/30"
          >
            <Plus size={13} />
            Add Company
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh Sub-Account List
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
        >
          <option value="">All</option>
          <option value="configured">Configured</option>
          <option value="enabled">Auto-sync Enabled</option>
          <option value="not_configured">Not Configured</option>
        </select>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="p-4 text-sm text-slate-400 dark:text-slate-500">
          No sub-accounts found. Enter your Agency PIT in Integrations and click "Refresh Sub-Account List".
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-auto max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <SortableHeader label="Sub-Account" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-2" />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Location ID</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">PIT</th>
                <SortableHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2" />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Test</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Sync</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">Auto</th>
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

      {showAddCompany && (
        <AddCompanyModal onClose={() => setShowAddCompany(false)} onCreated={load} />
      )}
    </div>
  );
}
