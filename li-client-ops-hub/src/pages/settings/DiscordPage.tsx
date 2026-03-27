import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Loader2, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { DiscordChannel, EntityLink } from '../../types';

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
      <button onClick={() => onSort(k)} className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
        {label}
        <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500'}>
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
          className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-dashed border-slate-300 dark:border-slate-600 rounded-full px-2.5 py-0.5 hover:border-slate-400 dark:hover:border-slate-500"
        >
          + tag
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
          {CHANNEL_TAGS.map((tag) => {
            const c = TAG_COLORS[tag];
            const isActive = tag === current;
            return (
              <button
                key={tag}
                onClick={() => handleSelect(isActive ? null : tag)}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 ${isActive ? 'font-medium' : ''}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${c.bg} border ${c.border}`} />
                {tag}
                {isActive && <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">remove</span>}
              </button>
            );
          })}
          <div className="border-t border-slate-100 dark:border-slate-700/50 mt-1 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="w-full px-3 py-1 text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-left"
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
  const [clientMap, setClientMap] = useState<Map<string, string>>(new Map()); // channel discord_channel_id → company name

  const load = () => {
    api.getDiscordChannels().then((d) => { setChannels(d); setLoading(false); });
    // Build channel → company name map from entity_links
    api.getCompanies({}).then((companies: unknown) => {
      const comps = companies as Array<Record<string, unknown>>;
      const map = new Map<string, string>();
      const promises = comps.map(async (c) => {
        try {
          const links = await api.getEntityLinks(c.id as string);
          for (const link of links) {
            if (link.platform === 'discord') {
              map.set(link.platform_id, c.name as string);
            }
          }
        } catch { /* ignore */ }
      });
      Promise.all(promises).then(() => setClientMap(map));
    });
  };
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

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Discord Channels</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filtered.length} of {channels.length} channels</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync Channels
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input type="text" placeholder="Search channels..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
        >
          <option value="">All Tags</option>
          {CHANNEL_TAGS.map((tag) => (
            <option key={tag} value={tag}>{tag} ({tagCounts[tag] || 0})</option>
          ))}
          <option value="_untagged">Untagged ({tagCounts._untagged})</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400 dark:text-slate-500">{channels.length === 0 ? 'No Discord channels synced.' : 'No channels match your search.'}</p>
      ) : (
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <SortTh label="Channel" k="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Client</th>
                <SortTh label="Server" k="server_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Type" k="type" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Tag" k="tag" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Topic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((ch) => (
                <tr key={ch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">#{ch.name}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {clientMap.get(ch.discord_channel_id) ? (
                      <span className="text-teal-600 dark:text-teal-400 font-medium">{clientMap.get(ch.discord_channel_id)}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{ch.server_name ?? '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{ch.type ?? '-'}</td>
                  <TagCell channel={ch} onUpdate={load} />
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{ch.topic ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
