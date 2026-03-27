import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Plus } from 'lucide-react';
import { api } from '../../lib/ipc';
import { useContacts, useMessages } from '../../hooks/useDB';
import SLABadge from '../shared/SLABadge';
import SLAExplainer from '../shared/SLAExplainer';
import MessageSyncBadge from './MessageSyncBadge';
import { formatContactName } from '../../lib/formatName';
import type { Contact, Message } from '../../types';

// ── Add Contact Modal ────────────────────────────────────────────────

function AddContactModal({ companyId, onClose, onCreated }: {
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ghlContactId, setGhlContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim() && !email.trim()) {
      setError('Enter at least a name or email');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createContact({
        company_id: companyId,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        ghl_contact_id: ghlContactId.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Contact</h2>
          <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">First Name</label>
              <input
                type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Last Name</label>
              <input
                type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none"
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none"
              placeholder="+1 555-123-4567"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GHL Contact ID</label>
            <input
              type="text" value={ghlContactId} onChange={(e) => setGhlContactId(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 font-mono focus:border-teal-500 focus:outline-none"
              placeholder="abc123XYZ..."
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Optional. Links this contact to their GHL record.</p>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">Cancel</button>
          <button
            type="submit" disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Contact'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

type SyncStatusMap = Record<string, { messages_synced_at: string | null; messages_stored: number }>;

// ── Column definitions ────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', sortable: true, defaultVisible: true },
  { key: 'phone', label: 'Phone', sortable: true, defaultVisible: true },
  { key: 'email', label: 'Email', sortable: true, defaultVisible: true },
  { key: 'tags', label: 'Tags', sortable: false, defaultVisible: true },
  { key: 'last_outbound_at', label: 'Last Outbound', sortable: true, defaultVisible: true },
  { key: 'days_since_outbound', label: 'Days', sortable: true, defaultVisible: true },
  { key: 'sla_status', label: 'SLA', sortable: true, defaultVisible: true },
  { key: 'message_sync', label: 'Message Sync', sortable: true, defaultVisible: true },
];

// ── Sort helper ───────────────────────────────────────────────────────

const slaOrder: Record<string, number> = { violation: 0, warning: 1, ok: 2 };

function sortContacts(
  contacts: Contact[],
  config: SortConfig,
  syncMap: SyncStatusMap
): Contact[] {
  return [...contacts].sort((a, b) => {
    const { key, direction } = config;
    let aVal: unknown;
    let bVal: unknown;

    if (key === 'name') {
      aVal = formatContactName(a.first_name, a.last_name, '').toLowerCase();
      bVal = formatContactName(b.first_name, b.last_name, '').toLowerCase();
    } else if (key === 'sla_status') {
      const cmp = (slaOrder[a.sla_status] ?? 2) - (slaOrder[b.sla_status] ?? 2);
      return direction === 'asc' ? cmp : -cmp;
    } else if (key === 'message_sync') {
      aVal = syncMap[a.id]?.messages_synced_at ?? '';
      bVal = syncMap[b.id]?.messages_synced_at ?? '';
      // Not synced always last
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
    } else {
      aVal = (a as unknown as Record<string, unknown>)[key];
      bVal = (b as unknown as Record<string, unknown>)[key];
    }

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal);
    const bStr = String(bVal);

    // Date columns
    if (key.includes('_at')) {
      const aTime = new Date(aStr).getTime() || 0;
      const bTime = new Date(bStr).getTime() || 0;
      return direction === 'asc' ? aTime - bTime : bTime - aTime;
    }

    return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
}

// ── Sortable Header ───────────────────────────────────────────────────

function SortHeader({
  label,
  columnKey,
  sortable,
  current,
  onSort,
}: {
  label: string;
  columnKey: string;
  sortable: boolean;
  current: SortConfig;
  onSort: (key: string) => void;
}) {
  if (!sortable) {
    return <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>;
  }
  const active = current.key === columnKey;
  return (
    <button
      onClick={() => onSort(columnKey)}
      className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
    >
      {label}
      <span className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}>
        {active ? (
          current.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronsUpDown size={12} />
        )}
      </span>
    </button>
  );
}

// ── Inline message list for expanded contact ──────────────────────────

function ContactMessages({ contactId }: { contactId: string }) {
  const { messages, loading } = useMessages(contactId);

  if (loading) return <p className="text-xs text-slate-400 py-2">Loading messages...</p>;
  if (messages.length === 0) return <p className="text-xs text-slate-400 py-2">No messages found</p>;

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {messages.slice(0, 20).map((m: Message) => (
        <div key={m.id} className="flex items-start gap-2 text-xs">
          <span className="w-20 shrink-0 text-slate-400 dark:text-slate-500">
            {new Date(m.message_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className={m.direction === 'outbound' ? 'text-teal-600 dark:text-teal-400' : 'text-blue-600 dark:text-blue-400'}>
            {m.direction === 'outbound' ? '\u2192' : '\u2190'}
          </span>
          {m.type && (
            <span className="shrink-0 rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5 text-[10px] uppercase text-slate-600 dark:text-slate-400">{m.type}</span>
          )}
          <span className="truncate text-slate-700 dark:text-slate-300">{m.body_preview || '(no content)'}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main ContactsTab ──────────────────────────────────────────────────

export default function ContactsTab({ companyId }: { companyId: string }) {
  const { contacts, loading, refresh: refreshContacts } = useContacts(companyId);
  const [syncMap, setSyncMap] = useState<SyncStatusMap>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);

  // UI state
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<'all' | 'client'>('client');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'sla_status', direction: 'asc' });

  // Load message sync status
  useEffect(() => {
    if (!companyId) return;
    api.getContactMessageSyncStatus(companyId).then((data) => {
      const map: SyncStatusMap = {};
      for (const row of data) {
        map[row.id] = { messages_synced_at: row.messages_synced_at, messages_stored: row.messages_stored };
      }
      setSyncMap(map);
    });
  }, [companyId, contacts]);

  // Filter
  const filtered = useMemo(() => {
    let result = contacts;

    if (tagFilter === 'client') {
      result = result.filter((c) => {
        try {
          const tags = c.tags ? (JSON.parse(c.tags) as string[]) : [];
          return tags.some((t) => t.toLowerCase().includes('client'));
        } catch { return false; }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) => {
        const fields = [
          c.first_name, c.last_name, c.email, c.phone, c.tags,
          formatContactName(c.first_name, c.last_name, ''),
        ];
        return fields.some((f) => f && String(f).toLowerCase().includes(q));
      });
    }

    return result;
  }, [contacts, search, tagFilter]);

  // Sort
  const sorted = useMemo(
    () => sortContacts(filtered, sortConfig, syncMap),
    [filtered, sortConfig, syncMap]
  );

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  if (loading) return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading contacts...</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 px-4 py-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-8 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value as 'all' | 'client')}
          className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="all">All Contacts</option>
          <option value="client">Client Tagged</option>
        </select>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 mr-2">
          {sorted.length} of {contacts.length} contacts
        </span>
        <button
          onClick={() => setShowAddContact(true)}
          className="flex items-center gap-1 rounded border border-teal-600 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
        >
          <Plus size={12} />
          Add Contact
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <p className="p-4 text-sm text-slate-400 dark:text-slate-500">
          {search ? 'No contacts match your search.' : 'No contacts found.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <SortHeader
                        label={col.label}
                        columnKey={col.key}
                        sortable={col.sortable}
                        current={sortConfig}
                        onSort={handleSort}
                      />
                      {col.key === 'sla_status' && <SLAExplainer context="company" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {sorted.map((c) => {
                const name = formatContactName(c.first_name, c.last_name);
                const isExpanded = expandedId === c.id;
                const tags: string[] = (() => { try { return c.tags ? JSON.parse(c.tags) : []; } catch { return []; } })();
                const sync = syncMap[c.id];

                return (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">{c.phone ?? '-'}</td>
                      {/* Email */}
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{c.email ?? '-'}</td>
                      {/* Tags */}
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded bg-slate-100 dark:bg-slate-900/50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">{t}</span>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-slate-400 dark:text-slate-500">+{tags.length - 3}</span>}
                        </div>
                      </td>
                      {/* Last Outbound */}
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {c.last_outbound_at ? new Date(c.last_outbound_at).toLocaleDateString() : 'Never'}
                      </td>
                      {/* Days */}
                      <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">{c.days_since_outbound ?? '-'}</td>
                      {/* SLA */}
                      <td className="px-4 py-2.5">
                        <SLABadge status={c.sla_status} days={c.days_since_outbound} />
                      </td>
                      {/* Message Sync */}
                      <td className="px-4 py-2.5">
                        <MessageSyncBadge
                          syncedAt={sync?.messages_synced_at ?? null}
                          messageCount={sync?.messages_stored ?? 0}
                        />
                      </td>
                    </tr>
                    {/* Expanded messages */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="bg-slate-50 dark:bg-slate-800 px-8 py-3">
                          <ContactMessages contactId={c.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddContact && (
        <AddContactModal
          companyId={companyId}
          onClose={() => setShowAddContact(false)}
          onCreated={refreshContacts}
        />
      )}
    </div>
  );
}

// Need React for Fragment
import React from 'react';
