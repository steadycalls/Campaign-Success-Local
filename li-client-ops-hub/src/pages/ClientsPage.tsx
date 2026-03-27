import { useState, useEffect, useMemo, Fragment } from 'react';
import { Search, X, Check, XIcon, RefreshCw, Loader2, ChevronDown, Settings2, ExternalLink, MessageSquare } from 'lucide-react';
import { api } from '../lib/ipc';
import SLABadge from '../components/shared/SLABadge';
import HealthBadge from '../components/shared/HealthBadge';
import MultiEmailInput from '../components/shared/MultiEmailInput';
import { formatContactName } from '../lib/formatName';
import type { ClientWithAssociations, HealthRanking } from '../types';

// ── Types ────────────────────────────────────────────────────────────

interface ContactsSyncProgress {
  phase: string;
  companyIndex: number;
  companyTotal: number;
  companyName: string;
  totalFound: number;
  totalCreated: number;
  percent: number;
}

// ── Smart Suggest: fuzzy name match ──────────────────────────────────

function fuzzyMatch(a: string, b: string): number {
  const al = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bl = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!al || !bl) return 0;
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.8;
  // word overlap
  const aw = a.toLowerCase().split(/\s+/);
  const bw = b.toLowerCase().split(/\s+/);
  const overlap = aw.filter(w => bw.some(bw2 => bw2.includes(w) || w.includes(bw2))).length;
  return overlap / Math.max(aw.length, bw.length);
}

// ── Association picker cell ──────────────────────────────────────────

function AssocCell({ client, type, onRefresh }: {
  client: ClientWithAssociations; type: string; onRefresh: () => void;
}) {
  const assoc = client.associations[type];
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<Array<{ id: string; name: string; detail?: string }>>([]);
  const [search, setSearch] = useState('');

  const loadOptions = async () => {
    if (type === 'sub_account') {
      const companies = await api.getCompanies();
      setOptions(companies.map(c => {
        let domain = '';
        if (c.website) {
          try { domain = new URL(c.website.startsWith('http') ? c.website : `https://${c.website}`).hostname.replace(/^www\./, ''); }
          catch { domain = c.website; }
        }
        return { id: c.id, name: c.name, detail: domain };
      }));
    } else if (type === 'teamwork_project') {
      const projects = await api.getTeamworkWithAssociations();
      setOptions((projects as Array<{ id: string; name: string }>).map(p => ({ id: p.id, name: p.name })));
    } else if (type === 'discord_channel') {
      const channels = await api.getDiscordChannels();
      setOptions(channels.map(c => ({ id: c.id, name: `${c.server_name ? c.server_name + ' > ' : ''}#${c.name}` })));
    }
  };

  const handlePick = async (targetId: string, targetName: string) => {
    await api.setAssociation({
      clientContactId: client.id,
      ghlContactId: client.ghl_contact_id ?? '',
      associationType: type,
      targetId,
      targetName,
    });
    setPicking(false);
    onRefresh();
  };

  // Smart suggest: sort by fuzzy match to client's company name
  const clientCompanyName = client.ghl_company_name || client.company_name || '';
  const sorted = useMemo(() => {
    let list = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
    if (clientCompanyName && !search && (type === 'sub_account' || type === 'discord_channel')) {
      list = [...list].sort((a, b) => fuzzyMatch(b.name, clientCompanyName) - fuzzyMatch(a.name, clientCompanyName));
    }
    return list;
  }, [options, search, clientCompanyName, type]);

  const topSuggestion = !assoc && !search && clientCompanyName && sorted.length > 0 && fuzzyMatch(sorted[0].name, clientCompanyName) > 0.3
    ? sorted[0] : null;

  return (
    <td className="px-3 py-2 relative">
      {assoc ? (
        <button onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
          className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400" title={assoc.targetName}>
          <Check size={12} className="text-green-500 dark:text-green-400" />
          <span className="truncate max-w-[120px]">{assoc.targetName}</span>
        </button>
      ) : topSuggestion && !picking ? (
        <button onClick={() => handlePick(topSuggestion.id, topSuggestion.name)}
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 italic" title={`Suggest: ${topSuggestion.name}`}>
          <span className="truncate max-w-[120px]">{topSuggestion.name}?</span>
        </button>
      ) : (
        <button onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
          className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
          <XIcon size={12} /> none
        </button>
      )}
      {picking && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
          <div className="p-2">
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-600 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none dark:bg-slate-700 dark:text-slate-200" autoFocus />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {sorted.length === 0 ? <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No results</p> : (
              sorted.slice(0, 20).map(o => (
                <button key={o.id} onClick={() => handlePick(o.id, o.name)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200">
                  <div className="truncate">{o.name}</div>
                  {o.detail && <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{o.detail}</div>}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 dark:border-slate-700/50 p-1">
            <button onClick={() => setPicking(false)} className="w-full px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">Cancel</button>
          </div>
        </div>
      )}
    </td>
  );
}

// ── Read.ai cell ─────────────────────────────────────────────────────

function ReadaiEmailCell({ client, onRefresh }: { client: ClientWithAssociations; onRefresh: () => void }) {
  const readaiEmails = client.readai_emails ?? [];
  const meetingCount = client.readai_meeting_count ?? 0;
  const [editing, setEditing] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  const openPicker = () => {
    if (readaiEmails.length > 0) setEmails(readaiEmails.map(e => e.email));
    else if (client.email) setEmails([client.email]);
    else setEmails(['']);
    setMatchCount(undefined);
    setEditing(true);
  };

  useEffect(() => {
    if (!editing) return;
    const valid = emails.filter(e => e.trim().length > 0);
    if (valid.length === 0) { setMatchCount(undefined); return; }
    const timer = setTimeout(async () => {
      try { const r = await api.previewReadaiMatch(valid); setMatchCount(r.matchCount); }
      catch { setMatchCount(undefined); }
    }, 500);
    return () => clearTimeout(timer);
  }, [emails, editing]);

  const handleSave = async () => {
    const valid = emails.filter(e => e.trim().length > 0);
    if (valid.length === 0) return;
    setSaving(true);
    try {
      await api.setReadaiEmails({ clientContactId: client.id, ghlContactId: client.ghl_contact_id ?? '', emails: valid });
      setEditing(false);
      onRefresh();
    } finally { setSaving(false); }
  };

  if (readaiEmails.length > 0 && !editing) {
    return (
      <td className="px-3 py-2">
        <button onClick={openPicker} className="text-left group">
          <div className="flex items-center gap-1">
            <Check size={12} className="text-green-500 dark:text-green-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400">
              {meetingCount > 0 ? `${meetingCount} mtg${meetingCount !== 1 ? 's' : ''}` : `${readaiEmails.length} email${readaiEmails.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </button>
      </td>
    );
  }

  if (!editing) {
    return (
      <td className="px-3 py-2">
        <button onClick={openPicker} className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
          <XIcon size={12} /> none
        </button>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 relative">
      <div className="absolute left-0 top-0 z-20 w-72 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-3">
        <div className="text-xs font-medium text-slate-800 dark:text-slate-200 mb-2">
          Read.ai Emails for {formatContactName(client.first_name, client.last_name, '')}
        </div>
        <MultiEmailInput emails={emails} defaultEmail={client.email ?? undefined} onChange={setEmails} matchCount={matchCount} />
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
          <button onClick={handleSave} disabled={saving || emails.every(e => !e.trim())}
            className="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save & Match'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">Cancel</button>
        </div>
      </div>
      <span className="text-xs text-teal-600 dark:text-teal-400">editing...</span>
    </td>
  );
}

// ── Column definitions ───────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'name', label: 'Name', defaultVisible: true },
  { key: 'days', label: 'Days / Last Contact', defaultVisible: true },
  { key: 'sla', label: 'SLA', defaultVisible: false },
  { key: 'sub_account', label: 'Sub-Account', defaultVisible: true },
  { key: 'discord', label: 'Discord', defaultVisible: true },
  { key: 'readai', label: 'Read.ai', defaultVisible: true },
  { key: 'teamwork', label: 'Teamwork', defaultVisible: false },
  { key: 'health', label: 'Health', defaultVisible: false },
  { key: 'msgs_7d', label: 'Msgs 7d', defaultVisible: true },
  { key: 'msgs_30d', label: 'Msgs 30d', defaultVisible: true },
  { key: 'messages', label: 'Total Msgs', defaultVisible: false },
  { key: 'email', label: 'Email', defaultVisible: false },
  { key: 'phone', label: 'Phone', defaultVisible: false },
  { key: 'company', label: 'Company/Business', defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));

// ── Column Selector ──────────────────────────────────────────────────

function ColumnSelector({ visible, onChange }: { visible: Set<string>; onChange: (v: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
        <Settings2 size={13} /> Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl py-1">
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer dark:text-slate-200">
                <input type="checkbox" checked={visible.has(col.key)}
                  onChange={() => {
                    const next = new Set(visible);
                    if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                    onChange(next);
                  }}
                  className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sync Dropdown ────────────────────────────────────────────────────

function SyncDropdown({ onSyncAll, onSyncMessages, syncing }: {
  onSyncAll: () => void; onSyncMessages: () => void; syncing: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={syncing}
        className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Sync GHL <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl py-1">
            <button onClick={() => { onSyncAll(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
              <div className="text-slate-700 dark:text-slate-300 font-medium">Contacts + Messages</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Full sync: contacts, custom fields, messages</div>
            </button>
            <div className="border-t border-slate-100 dark:border-slate-700/50 my-0.5" />
            <button onClick={() => { onSyncMessages(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
              <div className="text-slate-700 dark:text-slate-300 font-medium">Messages Only</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Sync messages for existing contacts</div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientWithAssociations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [healthMap, setHealthMap] = useState<Record<string, HealthRanking>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ContactsSyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE);

  const load = async () => {
    const [data, ranking] = await Promise.all([
      api.getAssociationMap(),
      api.getHealthRanking(),
    ]);
    setClients(data);
    const map: Record<string, HealthRanking> = {};
    for (const r of ranking) { map[r.id] = r; }
    setHealthMap(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = (_event: unknown, data: ContactsSyncProgress) => {
      setSyncProgress(data);
      if (data.phase === 'complete') { setSyncing(false); load(); }
    };
    api.onContactsSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offContactsSyncProgress(handler as (...args: unknown[]) => void); };
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true); setSyncResult(null); setSyncProgress(null);
    try {
      const result = await api.syncContactsAll();
      setSyncResult(result.success
        ? `Synced ${result.found} contacts (${result.created} new) across ${result.companies} companies`
        : result.message || 'Failed');
    } catch (err: unknown) { setSyncResult(err instanceof Error ? err.message : 'Failed'); setSyncing(false); }
    setTimeout(() => setSyncResult(null), 8000);
  };

  const handleSyncMessages = async () => {
    setSyncing(true); setSyncResult(null); setSyncProgress(null);
    try {
      const result = await api.syncMessagesOnly();
      setSyncResult(result.success
        ? `Synced ${result.messages} messages across ${result.contacts} contacts`
        : result.message || 'Failed');
      setSyncing(false);
      load();
    } catch (err: unknown) { setSyncResult(err instanceof Error ? err.message : 'Failed'); setSyncing(false); }
    setTimeout(() => setSyncResult(null), 8000);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => {
      const name = formatContactName(c.first_name, c.last_name, '').toLowerCase();
      return name.includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.ghl_company_name ?? '').toLowerCase().includes(q);
    });
  }, [clients, search]);

  const show = (key: string) => visibleCols.has(key);

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading clients...</div>;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Clients</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Contacts tagged "client" — manage associations across all systems.</p>
          </div>
          <SyncDropdown onSyncAll={handleSyncAll} onSyncMessages={handleSyncMessages} syncing={syncing} />
        </div>

        {syncing && syncProgress && syncProgress.phase !== 'complete' && (
          <div className="mt-2 rounded bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-teal-700 dark:text-teal-400 mb-1">
              <span>
                {syncProgress.phase === 'messages' ? 'Syncing messages' : 'Syncing contacts'}: {syncProgress.companyName}
                <span className="text-teal-500 dark:text-teal-400 ml-1">({syncProgress.companyIndex + 1}/{syncProgress.companyTotal})</span>
              </span>
              <span className="font-medium">{syncProgress.percent}%</span>
            </div>
            <div className="h-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${syncProgress.percent}%` }} />
            </div>
            <div className="text-[11px] text-teal-600 dark:text-teal-400 mt-1">
              {syncProgress.totalFound} processed
              {syncProgress.totalCreated > 0 && <> ({syncProgress.totalCreated} new)</>}
            </div>
          </div>
        )}

        {syncResult && (
          <div className="mt-2 rounded bg-teal-50 dark:bg-teal-950/30 px-3 py-1.5 text-xs text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">{syncResult}</div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input type="text" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none dark:bg-slate-800 dark:text-slate-200" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} clients</span>
        <div className="ml-auto">
          <ColumnSelector visible={visibleCols} onChange={setVisibleCols} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 dark:text-slate-500">No clients found. Sync GHL contacts first.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
              <tr>
                {show('name') && <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Name</th>}
                {show('days') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Days</th>}
                {show('sla') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">SLA</th>}
                {show('sub_account') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Sub-Account</th>}
                {show('discord') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Discord</th>}
                {show('readai') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Read.ai</th>}
                {show('teamwork') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Teamwork</th>}
                {show('health') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Health</th>}
                {show('msgs_7d') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">7d</th>}
                {show('msgs_30d') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">30d</th>}
                {show('messages') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Total</th>}
                {show('email') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Email</th>}
                {show('phone') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Phone</th>}
                {show('company') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Company</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map(c => {
                const name = formatContactName(c.first_name, c.last_name);
                const ghlContactUrl = c.ghl_contact_id && c.ghl_location_id
                  ? `https://app.gohighlevel.com/v2/location/${c.ghl_location_id}/contacts/detail/${c.ghl_contact_id}` : null;

                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    {/* Name (with email/phone subscripts) */}
                    {show('name') && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span>
                          {(c.ghl_company_name || c.company_name) && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">{String(c.ghl_company_name || c.company_name)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.email && (
                            <button onClick={() => api.openInChrome(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email!)}`)}
                              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate max-w-[140px]" title="Open Gmail compose">
                              {c.email}
                            </button>
                          )}
                          {c.phone && ghlContactUrl && (
                            <button onClick={() => api.openInChrome(ghlContactUrl)}
                              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:underline" title="Open contact in GHL">
                              {c.phone}
                            </button>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Days (with last contact subscript) */}
                    {show('days') && (
                      <td className="px-3 py-2">
                        <div className="text-sm text-slate-700 dark:text-slate-300 font-medium">{c.days_since_outbound ?? '-'}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">
                          {c.last_outbound_at ? new Date(c.last_outbound_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never'}
                        </div>
                      </td>
                    )}

                    {/* SLA */}
                    {show('sla') && (
                      <td className="px-3 py-2">
                        <SLABadge status={c.sla_status} days={c.days_since_outbound} />
                      </td>
                    )}

                    {/* Sub-Account */}
                    {show('sub_account') && <AssocCell client={c} type="sub_account" onRefresh={load} />}

                    {/* Discord */}
                    {show('discord') && <AssocCell client={c} type="discord_channel" onRefresh={load} />}

                    {/* Read.ai */}
                    {show('readai') && <ReadaiEmailCell client={c} onRefresh={load} />}

                    {/* Teamwork */}
                    {show('teamwork') && <AssocCell client={c} type="teamwork_project" onRefresh={load} />}

                    {/* Health */}
                    {show('health') && (
                      <td className="px-3 py-2">
                        {(() => {
                          const sub = c.associations?.sub_account;
                          const h = sub ? healthMap[sub.targetId] : null;
                          return h ? <HealthBadge score={h.health_score} trend={h.health_trend} /> : <span className="text-slate-300 dark:text-slate-600 text-xs">&mdash;</span>;
                        })()}
                      </td>
                    )}

                    {/* Total Messages */}
                    {show('messages') && (
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {(c.message_count as number) > 0 ? (
                          <div className="flex items-center gap-1">
                            <MessageSquare size={11} className="text-slate-400 dark:text-slate-500" />
                            {(c.message_count as number).toLocaleString()}
                          </div>
                        ) : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                      </td>
                    )}

                    {/* Email */}
                    {show('email') && (
                      <td className="px-3 py-2 text-xs">
                        {c.email ? (
                          <button onClick={() => api.openInChrome(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email!)}`)}
                            className="text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate max-w-[160px] block" title="Open Gmail compose">
                            {c.email}
                          </button>
                        ) : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                      </td>
                    )}

                    {/* Phone */}
                    {show('phone') && (
                      <td className="px-3 py-2 text-xs">
                        {c.phone && ghlContactUrl ? (
                          <button onClick={() => api.openInChrome(ghlContactUrl)}
                            className="text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline" title="Open in GHL">
                            {c.phone}
                          </button>
                        ) : <span className="text-slate-300 dark:text-slate-600">{c.phone || '\u2014'}</span>}
                      </td>
                    )}

                    {/* Company/Business */}
                    {show('company') && (
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                        {c.ghl_company_name || c.company_name || <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                      </td>
                    )}
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
