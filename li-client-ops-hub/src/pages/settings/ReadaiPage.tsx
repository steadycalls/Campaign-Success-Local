import { useState, useEffect, useMemo } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { Meeting } from '../../types';

type SortKey = 'meeting_date' | 'title' | 'duration_minutes' | 'platform' | 'attended_count';
type SortDir = 'asc' | 'desc';

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

export default function ReadaiPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('meeting_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    api.getReadaiWithAssociations({ days: 90 }).then((d) => { setMeetings(d); setLoading(false); });
  }, []);

  const handleSort = (k: SortKey) => { if (k === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir(k === 'meeting_date' ? 'desc' : 'asc'); } };

  const filtered = useMemo(() => {
    let list = meetings;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        (m.title ?? '').toLowerCase().includes(q) ||
        (m.platform ?? '').toLowerCase().includes(q) ||
        (m.owner_name ?? '').toLowerCase().includes(q) ||
        (m.participants_json ?? '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof Meeting];
      const bv = b[sortKey as keyof Meeting];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [meetings, search, sortKey, sortDir]);

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-lg font-bold text-slate-900">Read.ai Meetings</h1>
      <p className="mt-1 text-xs text-slate-500">{filtered.length} of {meetings.length} meetings (last 90 days)</p>

      <div className="mt-3 relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search meetings..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{meetings.length === 0 ? 'No meetings synced. Configure Read.ai API key and run a sync.' : 'No meetings match your search.'}</p>
      ) : (
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200 max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh label="Date" k="meeting_date" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Title" k="title" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Duration" k="duration_minutes" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Platform" k="platform" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Attendees" k="attended_count" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {new Date(m.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 truncate max-w-[220px]">{m.title ?? 'Untitled'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{m.duration_minutes != null ? `${m.duration_minutes}m` : '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{m.platform ?? '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{m.attended_count}/{m.participants_count}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {m.company_id ? <span className="text-green-700">{m.match_method}</span> : <span className="text-slate-400">unmatched</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
