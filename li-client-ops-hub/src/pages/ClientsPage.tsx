import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search, X, Check, XIcon, RefreshCw, Loader2, ChevronDown, ChevronUp, ChevronsUpDown, Settings2, ExternalLink, MessageSquare } from 'lucide-react';
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
  totalMessages: number;
  contactIndex: number;
  contactTotal: number;
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

  const handleUnlink = async () => {
    if (!assoc) return;
    // Get the actual association ID from the server
    const assocs = await api.getAssociationsForClient(client.id);
    const match = assocs.find((a: any) => a.association_type === type && a.target_id === assoc.targetId);
    if (match) {
      await api.removeAssociation((match as any).id);
      onRefresh();
    }
  };

  const handleCancel = () => {
    setPicking(false);
    setSearch('');
  };

  // Smart suggest: sort by fuzzy match, exclude "Restoration Inbound"
  const rawCompany = (client.ghl_company_name || client.company_name || '') as string;
  const clientCompanyName = rawCompany.toLowerCase() === 'restoration inbound' ? '' : rawCompany;
  const sorted = useMemo(() => {
    let list = options
      .filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
      .filter(o => o.name.toLowerCase() !== 'restoration inbound');
    if (clientCompanyName && !search && (type === 'sub_account' || type === 'discord_channel')) {
      list = [...list].sort((a, b) => fuzzyMatch(b.name, clientCompanyName) - fuzzyMatch(a.name, clientCompanyName));
    }
    return list;
  }, [options, search, clientCompanyName, type]);

  // Top 3 suggestions (excluding RI)
  const topSuggestions = !assoc && !search && clientCompanyName
    ? sorted.filter(o => fuzzyMatch(o.name, clientCompanyName) > 0.3).slice(0, 3)
    : [];

  return (
    <td className="px-3 py-2 relative group">
      {assoc ? (
        <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
          <button onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
            className="flex items-center gap-1" title={assoc.targetName}>
            <Check size={12} className="text-green-500 dark:text-green-400" />
            <span className="truncate max-w-[120px]">{assoc.targetName}</span>
          </button>
          <button onClick={handleUnlink}
            className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
            title="Unlink">
            <XIcon size={11} />
          </button>
        </div>
      ) : topSuggestions.length > 0 && !picking ? (
        <div className="space-y-0.5">
          {topSuggestions.map((s, i) => (
            <button key={s.id} onClick={() => handlePick(s.id, s.name)}
              className={`flex items-center gap-1 text-xs italic truncate max-w-[140px] ${i === 0 ? 'text-amber-600 hover:text-amber-800' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-[10px]'}`}
              title={`Link to ${s.name}`}>
              {s.name}{i === 0 ? '?' : ''}
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
          className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
          <XIcon size={12} /> none
        </button>
      )}
      {picking && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg" onClick={e => e.stopPropagation()}>
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
            <button onClick={handleCancel} className="w-full px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">Cancel</button>
          </div>
        </div>
      )}
    </td>
  );
}

// ── Read.ai meeting hover cell ───────────────────────────────────────

interface MeetingSummary {
  id: string;
  title: string | null;
  meeting_date: string;
  start_time_ms: number | null;
  report_url: string | null;
  readai_meeting_id: string | null;
  participants_count: number;
}

function ReadaiMeetingHoverCell({ client, readaiEmails, meetingCount, onEditClick }: {
  client: ClientWithAssociations;
  readaiEmails: Array<{ email: string }>;
  meetingCount: number;
  onEditClick: () => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMeetings = async () => {
    if (loaded) return;
    const emails = readaiEmails.map(e => e.email);
    if (emails.length === 0) { setLoaded(true); return; }
    try {
      const data = await api.getMeetingsForEmails(emails, 5);
      setMeetings(data ?? []);
    } catch {
      setMeetings([]);
    }
    setLoaded(true);
  };

  const handleMouseEnter = () => {
    if (meetingCount === 0) return;
    hoverTimer.current = setTimeout(() => {
      setShowPopover(true);
      loadMeetings();
    }, 300);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // Don't close if moving into the popover
    const related = e.relatedTarget as Node | null;
    if (ref.current && related && ref.current.contains(related)) return;
    setShowPopover(false);
  };

  const handlePopoverLeave = (e: React.MouseEvent) => {
    const related = e.relatedTarget as Node | null;
    if (ref.current && related && ref.current.contains(related)) return;
    setShowPopover(false);
  };

  const fmtDate = (ms: number | null, date: string) => {
    if (ms) return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <td className="px-3 py-2 relative" ref={ref}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button onClick={onEditClick} className="text-left group">
          <div className="flex items-center gap-1">
            <Check size={12} className="text-green-500 dark:text-green-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400">
              {meetingCount > 0 ? `${meetingCount} mtg${meetingCount !== 1 ? 's' : ''}` : `${readaiEmails.length} email${readaiEmails.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </button>
      </div>

      {showPopover && meetingCount > 0 && (
        <div
          onMouseLeave={handlePopoverLeave}
          className="absolute left-0 top-full z-50 mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent Meetings</span>
            <button onClick={onEditClick} className="text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300">Edit emails</button>
          </div>
          {meetings.length === 0 && loaded ? (
            <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">No meetings found</div>
          ) : meetings.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">Loading...</div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {meetings.map((m) => (
                <div key={m.id} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-50 dark:border-slate-700/30 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">{m.title || 'Untitled'}</span>
                    {m.report_url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); api.openInChrome(m.report_url!); }}
                        className="shrink-0 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-0.5 hover:underline"
                      >
                        Read.ai <ExternalLink size={9} />
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {fmtDate(m.start_time_ms, m.meeting_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
      <ReadaiMeetingHoverCell
        client={client}
        readaiEmails={readaiEmails}
        meetingCount={meetingCount}
        onEditClick={openPicker}
      />
    );
  }

  if (!editing) {
    // Auto-add: if client has email, one-click to save it
    if (client.email) {
      const handleAutoAdd = async () => {
        setSaving(true);
        try {
          await api.setReadaiEmails({ clientContactId: client.id, ghlContactId: client.ghl_contact_id ?? '', emails: [client.email!] });
          onRefresh();
        } finally { setSaving(false); }
      };
      return (
        <td className="px-3 py-2">
          <button onClick={handleAutoAdd} disabled={saving}
            className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 italic"
            title={`Auto-link ${client.email} to Read.ai meetings`}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            <span className="truncate max-w-[100px]">{client.email}</span>
          </button>
        </td>
      );
    }

    // No email — show red warning with GHL link
    const ghlUrl = client.ghl_contact_id && client.ghl_location_id
      ? `https://app.gohighlevel.com/v2/location/${client.ghl_location_id}/contacts/detail/${client.ghl_contact_id}` : null;
    return (
      <td className="px-3 py-2">
        {ghlUrl ? (
          <button onClick={() => api.openInChrome(ghlUrl)}
            className="text-[11px] text-red-500 dark:text-red-400 hover:text-red-700 hover:underline"
            title="Go to call notes to find email address">
            no contact email
          </button>
        ) : (
          <span className="text-[11px] text-red-500 dark:text-red-400">no email</span>
        )}
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
  { key: 'domain', label: 'Domain', defaultVisible: false },
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

// ── Sortable column header ────────────────────────────────────────────

function SortTh({ label, k, current, dir, onSort, px }: {
  label: string; k: string; current: string; dir: 'asc' | 'desc'; onSort: (k: string) => void; px?: string;
}) {
  const active = k === current;
  return (
    <th className={`${px ?? 'px-3'} py-2`}>
      <button onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
        {label}
        <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}>
          {active ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
        </span>
      </button>
    </th>
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
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

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

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = formatContactName(a.first_name, a.last_name, '').localeCompare(formatContactName(b.first_name, b.last_name, ''));
          break;
        case 'days':
          cmp = ((a.days_since_outbound as number) ?? 9999) - ((b.days_since_outbound as number) ?? 9999);
          break;
        case 'sla': {
          const order: Record<string, number> = { violation: 0, warning: 1, ok: 2 };
          cmp = (order[a.sla_status] ?? 2) - (order[b.sla_status] ?? 2);
          break;
        }
        case 'msgs_7d':
          cmp = ((a as any).msgs_7d ?? 0) - ((b as any).msgs_7d ?? 0);
          break;
        case 'msgs_30d':
          cmp = ((a as any).msgs_30d ?? 0) - ((b as any).msgs_30d ?? 0);
          break;
        case 'messages':
          cmp = ((a as any).message_count ?? 0) - ((b as any).message_count ?? 0);
          break;
        case 'email':
          cmp = (a.email ?? '').localeCompare(b.email ?? '');
          break;
        case 'domain':
          cmp = ((a as any).website ?? '').localeCompare((b as any).website ?? '');
          break;
        case 'phone':
          cmp = (a.phone ?? '').localeCompare(b.phone ?? '');
          break;
        case 'company':
          cmp = ((a as any).ghl_company_name ?? '').localeCompare((b as any).ghl_company_name ?? '');
          break;
        case 'sub_account': {
          const aName = a.associations?.sub_account?.targetName ?? '';
          const bName = b.associations?.sub_account?.targetName ?? '';
          cmp = aName.localeCompare(bName);
          break;
        }
        case 'discord': {
          const aName = a.associations?.discord_channel?.targetName ?? '';
          const bName = b.associations?.discord_channel?.targetName ?? '';
          cmp = aName.localeCompare(bName);
          break;
        }
        case 'readai':
          cmp = ((a as any).readai_meeting_count ?? 0) - ((b as any).readai_meeting_count ?? 0);
          break;
        case 'health': {
          const aH = a.associations?.sub_account ? (healthMap[a.associations.sub_account.targetId]?.health_score ?? -1) : -1;
          const bH = b.associations?.sub_account ? (healthMap[b.associations.sub_account.targetId]?.health_score ?? -1) : -1;
          cmp = aH - bH;
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDir, healthMap]);

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
            {/* Phase label */}
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  syncProgress.phase === 'contacts' ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400'
                }`}>
                  {syncProgress.phase === 'contacts' ? 'Contacts' : 'Messages'}
                </span>
                <span className="text-slate-600 dark:text-slate-400 font-medium">{syncProgress.companyName}</span>
              </div>
              <span className="font-medium text-teal-700 dark:text-teal-400">{syncProgress.percent}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${syncProgress.phase === 'contacts' ? 'bg-teal-500' : 'bg-indigo-500'}`}
                style={{ width: `${syncProgress.percent}%` }} />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 mt-1.5 text-[11px]">
              {syncProgress.phase === 'contacts' ? (
                <>
                  <span className="text-teal-600 dark:text-teal-400">
                    {syncProgress.companyIndex + 1}/{syncProgress.companyTotal} companies
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">&middot;</span>
                  <span className="text-teal-600 dark:text-teal-400">
                    {syncProgress.totalFound.toLocaleString()} contacts found
                  </span>
                  {syncProgress.totalCreated > 0 && (
                    <>
                      <span className="text-slate-400 dark:text-slate-500">&middot;</span>
                      <span className="text-green-600 dark:text-green-400">{syncProgress.totalCreated} new</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {syncProgress.contactIndex}/{syncProgress.contactTotal} contacts
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">&middot;</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {(syncProgress.totalMessages || 0).toLocaleString()} messages synced
                  </span>
                </>
              )}
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
                {show('name') && <SortTh label="Name" k="name" current={sortKey} dir={sortDir} onSort={handleSort} px="px-4" />}
                {show('days') && <SortTh label="Days" k="days" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('sla') && <SortTh label="SLA" k="sla" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('sub_account') && <SortTh label="Sub-Account" k="sub_account" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('discord') && <SortTh label="Discord" k="discord" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('readai') && <SortTh label="Read.ai" k="readai" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('teamwork') && <SortTh label="Teamwork" k="teamwork" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('health') && <SortTh label="Health" k="health" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('msgs_7d') && <SortTh label="7d" k="msgs_7d" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('msgs_30d') && <SortTh label="30d" k="msgs_30d" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('messages') && <SortTh label="Total" k="messages" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('email') && <SortTh label="Email" k="email" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('domain') && <SortTh label="Domain" k="domain" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('phone') && <SortTh label="Phone" k="phone" current={sortKey} dir={sortDir} onSort={handleSort} />}
                {show('company') && <SortTh label="Company" k="company" current={sortKey} dir={sortDir} onSort={handleSort} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {sorted.map(c => {
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
                          {(() => {
                            const co = String(c.ghl_company_name || c.company_name || '');
                            return co && co.toLowerCase() !== 'restoration inbound' ? (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">{co}</span>
                            ) : null;
                          })()}
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
                    {show('email') && (() => {
                      const website = (c as unknown as Record<string, unknown>).website as string | null;
                      const domainHidden = !show('domain');
                      let domainStr = '';
                      if (website) {
                        try { domainStr = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, ''); }
                        catch { domainStr = website; }
                      }
                      return (
                        <td className="px-3 py-2 text-xs">
                          {c.email ? (
                            <div>
                              <button onClick={() => api.openInChrome(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email!)}`)}
                                className="text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate max-w-[160px] block" title="Open Gmail compose">
                                {c.email}
                              </button>
                              {domainHidden && domainStr && (
                                <button onClick={() => api.openInChrome(website!.startsWith('http') ? website! : `https://${website}`)}
                                  className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate block"
                                  title={`Go to ${domainStr}`}>
                                  {domainStr}
                                </button>
                              )}
                            </div>
                          ) : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                        </td>
                      );
                    })()}

                    {/* Domain */}
                    {show('domain') && (() => {
                      const website = (c as unknown as Record<string, unknown>).website as string | null;
                      let domainStr = '';
                      if (website) {
                        try { domainStr = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, ''); }
                        catch { domainStr = website; }
                      }
                      return (
                        <td className="px-3 py-2 text-xs">
                          {domainStr ? (
                            <button onClick={() => api.openInChrome(website!.startsWith('http') ? website! : `https://${website}`)}
                              className="text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline truncate max-w-[140px] block"
                              title={`Go to ${domainStr}`}>
                              {domainStr}
                            </button>
                          ) : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                        </td>
                      );
                    })()}

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
                        {(() => {
                          const co = String(c.ghl_company_name || c.company_name || '');
                          return co && co.toLowerCase() !== 'restoration inbound' ? co : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>;
                        })()}
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
