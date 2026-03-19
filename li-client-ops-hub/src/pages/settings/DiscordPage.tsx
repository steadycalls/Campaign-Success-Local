import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Loader2, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { DiscordChannel } from '../../types';

const CHANNEL_TAGS = ['client', 'internal', 'sales', 'client success', 'category'] as const;
type ChannelTag = (typeof CHANNEL_TAGS)[number];

const TAG_COLORS: Record<ChannelTag, { bg: string; text: string; border: string }> = {
  client:           { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  internal:         { bg: 'bg-slate-100', text: 'text-slate-700',  border: 'border-slate-300' },
  sales:            { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
  'client success': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  category:         { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
};

type SortKey = 'name' | 'server_name' | 'type' | 'tag';
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

function TagCell({ channel, onUpdate }: { channel: DiscordChannel; onUpdate: () => void }) {
  const [open, setOpen] = useState(false);

  const handleSelect = async (tag: string | null) => {
    await api.setDiscordChannelTag(channel.id, tag);
    setOpen(false);
    onUpdate();
  };

  const current = channel.tag as ChannelTag | null;
  const colors = current ? TAG_COLORS[current] : null;

  return (
    <td className="px-3 py-2.5 relative">
      {current ? (
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${colors!.bg} ${colors!.text} ${colors!.border} hover:opacity-80`}
        >
          {current}
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="text-[11px] text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 rounded-full px-2.5 py-0.5 hover:border-slate-400"
        >
          + tag
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {CHANNEL_TAGS.map((tag) => {
            const c = TAG_COLORS[tag];
            const isActive = tag === current;
            return (
              <button
                key={tag}
                onClick={() => handleSelect(isActive ? null : tag)}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-slate-50 ${isActive ? 'font-medium' : ''}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${c.bg} border ${c.border}`} />
                {tag}
                {isActive && <span className="ml-auto text-[10px] text-slate-400">remove</span>}
              </button>
            );
          })}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="w-full px-3 py-1 text-[10px] text-slate-400 hover:text-slate-600 text-left"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </td>
  );
}

export default function DiscordPage() {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = () => { api.getDiscordChannels().then((d) => { setChannels(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const handleSync = async () => { setSyncing(true); await api.syncDiscordChannels(); setSyncing(false); load(); };
  const handleSort = (k: SortKey) => { if (k === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc'); } };

  const filtered = useMemo(() => {
    let list = channels;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((ch) => ch.name.toLowerCase().includes(q) || (ch.server_name ?? '').toLowerCase().includes(q) || (ch.topic ?? '').toLowerCase().includes(q) || (ch.tag ?? '').toLowerCase().includes(q));
    }
    if (tagFilter === '_untagged') {
      list = list.filter((ch) => !ch.tag);
    } else if (tagFilter) {
      list = list.filter((ch) => ch.tag === tagFilter);
    }
    return [...list].sort((a, b) => {
      const av = (a[sortKey] ?? '').toLowerCase();
      const bv = (b[sortKey] ?? '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [channels, search, tagFilter, sortKey, sortDir]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { _untagged: 0 };
    for (const tag of CHANNEL_TAGS) counts[tag] = 0;
    for (const ch of channels) {
      if (ch.tag) counts[ch.tag] = (counts[ch.tag] || 0) + 1;
      else counts._untagged++;
    }
    return counts;
  }, [channels]);

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Discord Channels</h1>
          <p className="mt-1 text-xs text-slate-500">{filtered.length} of {channels.length} channels</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync Channels
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search channels..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded border border-slate-200 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
        >
          <option value="">All Tags</option>
          {CHANNEL_TAGS.map((tag) => (
            <option key={tag} value={tag}>{tag} ({tagCounts[tag] || 0})</option>
          ))}
          <option value="_untagged">Untagged ({tagCounts._untagged})</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{channels.length === 0 ? 'No Discord channels synced.' : 'No channels match your search.'}</p>
      ) : (
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200 max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh label="Channel" k="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Server" k="server_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Type" k="type" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Tag" k="tag" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Topic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((ch) => (
                <tr key={ch.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">#{ch.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{ch.server_name ?? '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{ch.type ?? '-'}</td>
                  <TagCell channel={ch} onUpdate={load} />
                  <td className="px-3 py-2.5 text-xs text-slate-500 truncate max-w-[200px]">{ch.topic ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
