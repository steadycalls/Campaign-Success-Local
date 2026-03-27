import { useState, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatContactName } from '../../lib/formatName';
import type { ClientWithAssociations } from '../../types';

export default function AssociationsPage() {
  const [clients, setClients] = useState<ClientWithAssociations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getAssociationMap().then((data) => { setClients(data); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => {
      const name = formatContactName(c.first_name, c.last_name, '').toLowerCase();
      return name.includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.company_name ?? '').toLowerCase().includes(q);
    });
  }, [clients, search]);

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  const linked = clients.filter((c) => Object.keys(c.associations).length > 0);
  const unlinked = clients.filter((c) => Object.keys(c.associations).length === 0);

  return (
    <div className="p-6">
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Association Map</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {linked.length} linked, {unlinked.length} unlinked of {clients.length} clients
      </p>

      <div className="mt-3 relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input type="text" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
      </div>

      <div className="mt-3 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[600px]">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Client</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">RI Company</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Sub-Account</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Teamwork</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Discord</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Read.ai Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((c) => {
              const name = formatContactName(c.first_name, c.last_name);
              return (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{name}</div>
                    {c.email && <div className="text-[10px] text-slate-400 dark:text-slate-500">{c.email}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {c.company_name ? (
                      <span className="text-slate-700 dark:text-slate-300">{c.company_name}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{c.associations.sub_account?.targetName ?? <span className="text-slate-400 dark:text-slate-500">&mdash;</span>}</td>
                  <td className="px-3 py-2.5 text-xs">{c.associations.teamwork_project?.targetName ?? <span className="text-slate-400 dark:text-slate-500">&mdash;</span>}</td>
                  <td className="px-3 py-2.5 text-xs">{c.associations.discord_channel?.targetName ?? <span className="text-slate-400 dark:text-slate-500">&mdash;</span>}</td>
                  <td className="px-3 py-2.5 text-xs">{c.associations.readai_email?.targetId ?? <span className="text-slate-400 dark:text-slate-500">&mdash;</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
