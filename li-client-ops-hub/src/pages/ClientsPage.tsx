import { useState, useEffect, useMemo } from 'react';
import { Search, X, Check, XIcon } from 'lucide-react';
import { api } from '../lib/ipc';
import SLABadge from '../components/shared/SLABadge';
import ColumnTooltip from '../components/shared/ColumnTooltip';
import MultiEmailInput from '../components/shared/MultiEmailInput';
import { CLIENT_COLUMN_TOOLTIPS } from '../lib/clientTooltips';
import type { ClientWithAssociations } from '../types';

// ── Association picker cell (Sub-Account, Teamwork, Discord) ─────────

function AssocCell({
  client,
  type,
  onRefresh,
}: {
  client: ClientWithAssociations;
  type: string;
  onRefresh: () => void;
}) {
  const assoc = client.associations[type];
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');

  const loadOptions = async () => {
    if (type === 'sub_account') {
      const companies = await api.getCompanies();
      setOptions(companies.map((c) => ({ id: c.id, name: c.name })));
    } else if (type === 'teamwork_project') {
      const projects = await api.getTeamworkWithAssociations();
      setOptions((projects as Array<{ id: string; name: string }>).map((p) => ({ id: p.id, name: p.name })));
    } else if (type === 'discord_channel') {
      const channels = await api.getDiscordChannels();
      setOptions(channels.map((c) => ({ id: c.id, name: `${c.server_name ? c.server_name + ' > ' : ''}#${c.name}` })));
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

  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <td className="px-3 py-2.5 relative">
      {assoc ? (
        <button
          onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
          className="flex items-center gap-1 text-xs text-green-700"
          title={assoc.targetName}
        >
          <Check size={12} className="text-green-500" />
          <span className="truncate max-w-[100px]">{assoc.targetName}</span>
        </button>
      ) : (
        <button
          onClick={() => { setPicking(!picking); if (!picking) loadOptions(); }}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <XIcon size={12} /> none
        </button>
      )}

      {picking && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-teal-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No results</p>
            ) : (
              filtered.slice(0, 20).map((o) => (
                <button
                  key={o.id}
                  onClick={() => handlePick(o.id, o.name)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 truncate"
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-1">
            <button onClick={() => setPicking(false)} className="w-full px-2 py-1 text-[10px] text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </td>
  );
}

// ── Read.ai multi-email cell with picker modal ──────────────────────

function ReadaiEmailCell({
  client,
  onRefresh,
}: {
  client: ClientWithAssociations;
  onRefresh: () => void;
}) {
  const readaiEmails = client.readai_emails ?? [];
  const meetingCount = client.readai_meeting_count ?? 0;
  const [editing, setEditing] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  const openPicker = () => {
    // Auto-populate: start with existing emails, or default to GHL email
    if (readaiEmails.length > 0) {
      setEmails(readaiEmails.map(e => e.email));
    } else if (client.email) {
      setEmails([client.email]);
    } else {
      setEmails(['']);
    }
    setMatchCount(undefined);
    setEditing(true);
  };

  // Debounced preview match count
  useEffect(() => {
    if (!editing) return;
    const validEmails = emails.filter(e => e.trim().length > 0);
    if (validEmails.length === 0) {
      setMatchCount(undefined);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.previewReadaiMatch(validEmails);
        setMatchCount(result.matchCount);
      } catch {
        setMatchCount(undefined);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [emails, editing]);

  const handleSave = async () => {
    const validEmails = emails.filter(e => e.trim().length > 0);
    if (validEmails.length === 0) return;
    setSaving(true);
    try {
      await api.setReadaiEmails({
        clientContactId: client.id,
        ghlContactId: client.ghl_contact_id ?? '',
        emails: validEmails,
      });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Display mode: show email count + meeting count
  if (readaiEmails.length > 0 && !editing) {
    return (
      <td className="px-3 py-2.5">
        <button onClick={openPicker} className="text-left group">
          <div className="flex items-center gap-1">
            <Check size={12} className="text-green-500" />
            <span className="text-xs text-slate-600 group-hover:text-teal-600">
              {readaiEmails.length} email{readaiEmails.length !== 1 ? 's' : ''}
            </span>
          </div>
          {meetingCount > 0 && (
            <div className="text-[10px] text-slate-400">
              {meetingCount} meeting{meetingCount !== 1 ? 's' : ''}
            </div>
          )}
        </button>
      </td>
    );
  }

  // No emails set — show ❌
  if (!editing) {
    return (
      <td className="px-3 py-2.5">
        <button onClick={openPicker} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <XIcon size={12} /> none
        </button>
      </td>
    );
  }

  // Editing mode — inline picker
  return (
    <td className="px-3 py-2.5 relative">
      <div className="absolute left-0 top-0 z-20 w-72 rounded-lg border border-slate-200 bg-white shadow-lg p-3">
        <div className="text-xs font-medium text-slate-800 mb-2">
          Read.ai Emails for {[client.first_name, client.last_name].filter(Boolean).join(' ')}
        </div>

        <MultiEmailInput
          emails={emails}
          defaultEmail={client.email ?? undefined}
          onChange={setEmails}
          matchCount={matchCount}
        />

        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving || emails.every(e => !e.trim())}
            className="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Match Meetings'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
      {/* Keep the cell visible while picker is open */}
      <span className="text-xs text-teal-600">editing...</span>
    </td>
  );
}

// ── Column tooltip keys ──────────────────────────────────────────────

const COLUMN_KEYS = [
  'client', 'last_contact', 'days', 'sla',
  'sub_account', 'teamwork', 'discord', 'readai', 'email',
] as const;

const COLUMN_LABELS: Record<string, string> = {
  client: 'Client',
  last_contact: 'Last Contact',
  days: 'Days',
  sla: 'SLA',
  sub_account: 'Sub-Account',
  teamwork: 'Teamwork',
  discord: 'Discord',
  readai: 'Read.ai',
  email: 'Email',
};

// ── Main page ────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientWithAssociations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    const data = await api.getAssociationMap();
    setClients(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q) || (c.email ?? '').toLowerCase().includes(q);
    });
  }, [clients, search]);

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading clients...</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-bold text-slate-900">Clients</h1>
        <p className="text-xs text-slate-500">Contacts tagged "client" — manage associations across all systems.</p>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-6 py-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs text-slate-400">{filtered.length} clients</span>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No clients found. Sync Restoration Inbound contacts first.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                {COLUMN_KEYS.map(key => (
                  <th key={key} className={`${key === 'client' ? 'px-4' : 'px-3'} py-2 text-xs font-medium uppercase text-slate-500`}>
                    <ColumnTooltip
                      label={COLUMN_LABELS[key]}
                      tooltip={CLIENT_COLUMN_TOOLTIPS[key] || ''}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {c.last_outbound_at ? new Date(c.last_outbound_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{c.days_since_outbound ?? '-'}</td>
                    <td className="px-3 py-2.5">
                      <SLABadge status={c.sla_status} days={c.days_since_outbound} />
                    </td>
                    <AssocCell client={c} type="sub_account" onRefresh={load} />
                    <AssocCell client={c} type="teamwork_project" onRefresh={load} />
                    <AssocCell client={c} type="discord_channel" onRefresh={load} />
                    <ReadaiEmailCell client={c} onRefresh={load} />
                    <td className="px-3 py-2.5 text-xs text-slate-500 truncate max-w-[120px]">{c.email ?? '-'}</td>
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
