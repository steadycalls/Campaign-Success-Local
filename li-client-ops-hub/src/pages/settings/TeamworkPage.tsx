import { useState, useEffect, useMemo } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api } from '../../lib/ipc';

type SortKey = 'name' | 'status' | 'budget_percent' | 'linked_client_name';
type SortDir = 'asc' | 'desc';

interface TWProject {
  id: string;
  name: string;
  status: string | null;
  budget_percent: number | null;
  linked_client_name: string | null;
  [key: string]: unknown;
}

function SortTh({ label, k, current, dir, onSort }: { label: string; k: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void }) {
  const active = k === current;
  return (
    <th className="px-3 py-2">
      <button onClick={() => onSort(k)} className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-800">
        {label}
        <span className={active ? 'text-teal-600' : 'text-slate-300 group-hover:text-slate-400'}>
          {active ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
        </span>
      </button>
    </th>
  );
}

export default function TeamworkPage() {
  const [projects, setProjects] = useState<TWProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    api.getTeamworkWithAssociations().then((d) => { setProjects(d as TWProject[]); setLoading(false); });
  }, []);

  const handleSort = (k: SortKey) => { if (k === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc'); } };

  const filtered = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.linked_client_name ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [projects, search, sortKey, sortDir]);

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-lg font-bold text-slate-900">Teamwork Projects</h1>
      <p className="mt-1 text-xs text-slate-500">{filtered.length} of {projects.length} projects</p>

      <div className="mt-3 relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{projects.length === 0 ? 'No Teamwork projects synced.' : 'No projects match your search.'}</p>
      ) : (
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200 max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh label="Project" k="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Status" k="status" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Budget %" k="budget_percent" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Client" k="linked_client_name" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{p.status ?? '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{p.budget_percent != null ? `${Math.round(p.budget_percent)}%` : '-'}</td>
                  <td className="px-3 py-2.5 text-xs">{p.linked_client_name ? <span className="text-green-700">{p.linked_client_name}</span> : <span className="text-slate-400">not linked</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
