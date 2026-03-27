import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  FileText,
  File,
  Users,
  MessageSquare,
  Briefcase,
  FolderOpen,
  Video,
  Calendar,
  Settings2,
  Download,
  Table2,
  Check,
  Loader2,
  Search,
  X,
  UserCircle,
} from 'lucide-react';
import { api } from '../lib/ipc';
import { extractDomain } from '../lib/domain';
import { useCompany, useContacts, useMessages, useDriveFiles, useMeetings } from '../hooks/useDB';
import SLABadge from '../components/shared/SLABadge';
import SLAExplainer from '../components/shared/SLAExplainer';
import ContactsTabComponent from '../components/company/ContactsTab';
import MeetingsTabComponent from '../components/company/MeetingsTab';
import BudgetBar from '../components/shared/BudgetBar';
import SyncProgressBar from '../components/shared/SyncProgressBar';
import { useLiveProgress } from '../hooks/useLiveProgress';
import type { LiveProgress } from '../hooks/useLiveProgress';
import HealthBadge from '../components/shared/HealthBadge';
import HealthBreakdown from '../components/shared/HealthBreakdown';
import HealthTrendChart from '../components/shared/HealthTrendChart';
import { formatContactName } from '../lib/formatName';
import type { Contact, Message, DriveFile, Meeting, HealthScoreData, HealthHistoryEntry, EntityLink } from '../types';

// ── Tabs ──────────────────────────────────────────────────────────────

const tabs = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'teamwork', label: 'Teamwork', icon: Briefcase },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'customfields', label: 'Custom Fields', icon: Settings2 },
] as const;

type TabId = (typeof tabs)[number]['id'];

// ── Messages Tab ──────────────────────────────────────────────────────

function MessagesTab({ companyId }: { companyId: string }) {
  const { contacts } = useContacts(companyId);
  const [dirFilter, setDirFilter] = useState<'' | 'inbound' | 'outbound'>('');

  // Load messages inline per contact — we use a sub-component
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value as '' | 'inbound' | 'outbound')}
          className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs"
        >
          <option value="">All</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
      </div>
      {contacts.length === 0 ? (
        <p className="p-4 text-sm text-slate-400 dark:text-slate-500">No contacts found.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {contacts.map((c) => (
            <ContactMessagesSection key={c.id} contact={c} dirFilter={dirFilter} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactMessagesSection({
  contact,
  dirFilter,
}: {
  contact: Contact;
  dirFilter: '' | 'inbound' | 'outbound';
}) {
  const [expanded, setExpanded] = useState(false);
  const { messages } = useMessages(expanded ? contact.id : undefined);

  const filtered = dirFilter ? messages.filter((m) => m.direction === dirFilter) : messages;
  const name = formatContactName(contact.first_name, contact.last_name);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium text-slate-800 dark:text-slate-200">{name}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">({messages.length} messages)</span>
      </button>
      {expanded && (
        <div className="space-y-1 px-8 pb-3 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No messages</p>
          ) : (
            filtered.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-xs py-0.5">
                <span className="shrink-0 w-24 text-slate-400 dark:text-slate-500">
                  {new Date(m.message_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={m.direction === 'outbound' ? 'text-teal-600 dark:text-teal-400' : 'text-blue-600 dark:text-blue-400'}>
                  {m.direction === 'outbound' ? '\u2192' : '\u2190'}
                </span>
                {m.type && (
                  <span className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5 text-[10px] uppercase">{m.type}</span>
                )}
                <span className="text-slate-700 dark:text-slate-300 truncate">{m.body_preview || '(no content)'}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Teamwork Tab ──────────────────────────────────────────────────────

function TeamworkTab({ company }: { company: { teamwork_project_id: string | null; budget_used: number; monthly_budget: number | null; budget_percent: number; open_task_count: number } }) {
  if (!company.teamwork_project_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <Briefcase size={32} className="mb-2" />
        <p className="text-sm">No Teamwork project linked</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Budget</h3>
        <div className="max-w-md">
          <BudgetBar
            percent={company.budget_percent}
            used={company.budget_used}
            total={company.monthly_budget}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          ${company.budget_used?.toLocaleString() ?? 0} / ${company.monthly_budget?.toLocaleString() ?? 0}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Tasks</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{company.open_task_count} open tasks</p>
      </div>
    </div>
  );
}

// MeetingsTab is imported from components/company/MeetingsTab

// ── Calendar Tab ─────────────────────────────────────────────────────

function CalendarTab({ companyId }: { companyId: string }) {
  const [data, setData] = useState<{ upcoming: unknown[]; recent: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCalendarForCompany(companyId).then((d) => { setData(d); setLoading(false); });
  }, [companyId]);

  if (loading) return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading calendar...</p>;

  const upcoming = (data?.upcoming || []) as Array<Record<string, unknown>>;
  const recent = (data?.recent || []) as Array<Record<string, unknown>>;

  if (upcoming.length === 0 && recent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <Calendar size={32} className="mb-2" />
        <p className="text-sm">No calendar events found for this company</p>
        <p className="mt-1 text-xs">Sync Google Calendar and match events to see them here.</p>
      </div>
    );
  }

  function EventRow({ ev }: { ev: Record<string, unknown> }) {
    const startTime = ev.start_time as string;
    const date = new Date(startTime);
    const timeStr = ev.all_day
      ? 'All day'
      : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">{dateStr}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 w-16 shrink-0">{timeStr}</span>
        <span className="text-sm text-slate-800 dark:text-slate-200 flex-1 truncate">{String(ev.title)}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{ev.attendees_count ? `${ev.attendees_count} attendees` : ''}</span>
        {ev.conference_url ? (
          <a href={ev.conference_url as string} target="_blank" rel="noopener noreferrer"
            className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300" onClick={e => e.stopPropagation()}>
            Join
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div>
          <h3 className="px-4 py-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
            Upcoming ({upcoming.length})
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {upcoming.map((ev) => <EventRow key={ev.id as string} ev={ev} />)}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <h3 className="px-4 py-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-700">
            Recent ({recent.length})
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {recent.map((ev) => <EventRow key={ev.id as string} ev={ev} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────

// ── Custom Fields Tab with Export ──────────────────────────────────────

function escapeCsvField(value: string): string {
  if (!value) return '';
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function CustomFieldsTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [fields, setFields] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sheetsCopied, setSheetsCopied] = useState(false);

  useEffect(() => {
    api.getCompanyCustomFields(companyId).then(data => {
      setFields(data as unknown as Array<Record<string, unknown>>);
      setLoading(false);
    });
  }, [companyId]);

  const buildRows = (): string[][] => {
    const headers = ['Field Name', 'Field Key', 'Data Type', 'Placeholder', 'Position', 'Model'];
    const rows = [headers];
    for (const f of fields) {
      rows.push([
        String(f.name ?? ''),
        String(f.field_key ?? ''),
        String(f.data_type ?? ''),
        String(f.placeholder ?? ''),
        String(f.position ?? ''),
        String(f.model ?? ''),
      ]);
    }
    return rows;
  };

  const handleExportCsv = () => {
    const rows = buildRows();
    const csv = rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${companyName.replace(/[^a-z0-9]/gi, '-')}-custom-fields.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyForSheets = () => {
    const rows = buildRows();
    const tsv = rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    setSheetsCopied(true);
    setTimeout(() => setSheetsCopied(false), 2000);
  };

  if (loading) return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading...</p>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">{fields.length} custom fields</span>
        <div className="flex items-center gap-2">
          <button onClick={handleCopyForSheets} disabled={fields.length === 0}
            title={sheetsCopied ? 'Copied!' : 'Copy for Google Sheets'}
            className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
            {sheetsCopied ? <Check size={13} className="text-green-600 dark:text-green-400" /> : <Table2 size={13} />}
            {sheetsCopied ? 'Copied!' : 'Sheets'}
          </button>
          <button onClick={handleExportCsv} disabled={fields.length === 0}
            title="Download CSV export"
            className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">No custom fields synced for this subaccount.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Field Name</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Field Key</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Type</th>
                <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Model</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-medium">{String(f.name)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 font-mono">{String(f.field_key ?? '')}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{String(f.data_type ?? '')}</td>
                  <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">{String(f.model ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ companyId, hasDrive }: { companyId: string; hasDrive: boolean }) {
  const { files, loading } = useDriveFiles(companyId);

  if (!hasDrive) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <FolderOpen size={32} className="mb-2" />
        <p className="text-sm">No Drive folder linked</p>
      </div>
    );
  }

  if (loading) return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading...</p>;

  if (files.length === 0) {
    return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">No files found in Drive folder.</p>;
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
      {files.map((f: DriveFile) => (
        <div
          key={f.id}
          onClick={() => f.web_view_url && window.open(f.web_view_url, '_blank')}
          className={`flex items-center gap-3 px-4 py-2.5 ${f.web_view_url ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''}`}
        >
          {f.mime_type?.includes('spreadsheet') || f.mime_type?.includes('excel') ? (
            <FileText size={16} className="text-green-600" />
          ) : f.mime_type?.includes('document') || f.mime_type?.includes('word') ? (
            <FileText size={16} className="text-blue-600" />
          ) : (
            <File size={16} className="text-slate-400 dark:text-slate-500" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{f.name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {f.modified_at ? new Date(f.modified_at).toLocaleDateString() : ''}
              {f.size_bytes != null && ` \u00b7 ${(f.size_bytes / 1024).toFixed(0)} KB`}
            </p>
          </div>
          {f.web_view_url && <ExternalLink size={13} className="text-slate-400" />}
        </div>
      ))}
    </div>
  );
}

// ── Main Company Page ─────────────────────────────────────────────────

// ── Linked Client Badge ──────────────────────────────────────────────

function LinkedClientBadge({ companyId }: { companyId: string }) {
  const [client, setClient] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<Record<string, unknown>>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getLinkedClient(companyId).then(c => { setClient(c); setLoading(false); });
  }, [companyId]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await api.searchClients(q);
      setSearchResults(results as unknown as Array<Record<string, unknown>>);
      setSearchLoading(false);
    }, 300);
  };

  const handleSelect = async (clientId: string) => {
    await api.linkClientToCompany(clientId, companyId);
    const updated = await api.getLinkedClient(companyId);
    setClient(updated);
    setSearching(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  if (loading) return null;

  const clientName = client
    ? formatContactName(client.first_name as string | null, client.last_name as string | null, '')
    : null;

  const ghlUrl = client?.ghl_location_id && client?.ghl_contact_id
    ? `https://app.gohighlevel.com/v2/location/${client.ghl_location_id}/contacts/detail/${client.ghl_contact_id}`
    : null;

  return (
    <div className="relative inline-flex items-center">
      {clientName ? (
        <div className="flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/50 border border-teal-200 dark:border-teal-800">
          <UserCircle size={14} className="text-teal-600 dark:text-teal-400" />
          <span className="text-xs font-medium text-teal-700 dark:text-teal-400">{clientName}</span>
          {ghlUrl && (
            <button onClick={(e) => { e.stopPropagation(); api.openInChrome(ghlUrl); }}
              className="text-teal-500 hover:text-teal-700" title="Open in GHL">
              <ExternalLink size={11} />
            </button>
          )}
          <button onClick={() => setSearching(true)} className="text-teal-400 hover:text-teal-600 ml-0.5" title="Change client">
            <ArrowRightLeft size={11} />
          </button>
        </div>
      ) : (
        <button onClick={() => { setSearching(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="ml-3 flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500">
          <UserCircle size={14} />
          Link Client Contact
        </button>
      )}

      {/* Search dropdown */}
      {searching && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setSearching(false); setSearchQuery(''); setSearchResults([]); }} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl w-80 overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700/50">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input ref={inputRef} type="text" placeholder="Search client contacts..."
                  value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus
                  className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>
                )}
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {searchLoading && <div className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">Searching...</div>}
              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">No clients found</div>
              )}
              {searchResults.map(c => {
                const name = formatContactName(c.first_name as string, c.last_name as string);
                const domain = extractDomain(c.contact_website as string);
                return (
                  <button key={c.id as string} onClick={() => handleSelect(c.id as string)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 truncate ml-2 max-w-[140px]">{(c.email as string) || ''}</span>
                    </div>
                    {domain && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{domain}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, loading } = useCompany(id);
  const [activeTab, setActiveTab] = useState<TabId>('contacts');
  const [syncing, setSyncing] = useState(false);
  const liveProgress = useLiveProgress(id ?? '');
  const [healthData, setHealthData] = useState<HealthScoreData | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthHistoryEntry[]>([]);
  const [showTrend, setShowTrend] = useState(false);
  const [gradeCollapsed, setGradeCollapsed] = useState(false);
  const [syncPanelCollapsed, setSyncPanelCollapsed] = useState(false);
  const [entityLinks, setEntityLinks] = useState<EntityLink[]>([]);
  const [recentChanges, setRecentChanges] = useState<Array<{ entity_type: string; change_type: string; cnt: number }>>([]);

  useEffect(() => {
    if (!id) return;
    api.getHealthScore(id).then(setHealthData);
    api.getHealthHistory(id).then(setHealthHistory);
    api.getEntityLinks(id).then(setEntityLinks);
    api.getRecentChanges(id).then(setRecentChanges);
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;
  if (!company) return <div className="p-6 text-sm text-red-500 dark:text-red-400">Company not found.</div>;

  const handleSync = async () => {
    setSyncing(true);
    await api.queueSyncCompany(company.id);
    setSyncing(false);
  };

  const handleForceFullSync = async () => {
    setSyncing(true);
    await api.forceFullSync(company.id);
    setSyncing(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4">
        <button
          onClick={() => navigate('/')}
          className="mb-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Back to portfolio
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{company.name}</h1>
              <LinkedClientBadge companyId={company.id} />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <SLABadge status={company.sla_status} days={company.sla_days_since_contact} size="md" />
              <SLAExplainer context="company" />
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {company.contact_count.toLocaleString()} synced
                {company.contacts_api_total != null && (
                  <> / {company.contacts_api_total.toLocaleString()} total</>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              Sync Now
            </button>
            <button
              onClick={handleForceFullSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              title="Reset sync cursors and re-pull all data from GHL"
            >
              Force Full Sync
            </button>
          </div>
        </div>

        {/* External links */}
        <div className="mt-3 flex flex-wrap gap-2">
          {company.ghl_location_id && (
            <LinkPill label="GHL" url={`https://app.gohighlevel.com/v2/location/${company.ghl_location_id}`} />
          )}
          {company.teamwork_project_id && (
            <LinkPill label="Teamwork" />
          )}
          {company.drive_folder_id && (
            <LinkPill label="Drive" url={`https://drive.google.com/drive/folders/${company.drive_folder_id}`} />
          )}
        </div>

        {/* Linked Systems */}
        {entityLinks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {entityLinks.map((link) => {
              const icons: Record<string, string> = {
                teamwork: '\uD83D\uDCBC',
                gdrive: '\uD83D\uDCC2',
                discord: '\uD83D\uDCAC',
                kinsta: '\uD83C\uDF10',
              };
              return (
                <span
                  key={link.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400"
                  title={`${link.platform} \u2014 ${link.match_type} (${Math.round(link.confidence * 100)}% confidence)`}
                >
                  <span>{icons[link.platform] ?? '\uD83D\uDD17'}</span>
                  <span className="font-medium">{link.platform_name || link.platform}</span>
                  {link.match_type === 'manual' && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">(manual)</span>
                  )}
                  {link.match_type !== 'manual' && link.confidence < 1.0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">({Math.round(link.confidence * 100)}%)</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Recent Changes (last 24h) */}
        {recentChanges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="text-slate-400 dark:text-slate-500">Last 24h:</span>
            {recentChanges.map((c, i) => (
              <span key={i} className={c.change_type === 'created' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}>
                {c.cnt} {c.entity_type}{c.cnt > 1 ? 's' : ''} {c.change_type === 'created' ? 'new' : 'updated'}
              </span>
            ))}
          </div>
        )}

        {/* Health Score Card */}
        {healthData && healthData.score !== null && (
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            <button
              onClick={() => setGradeCollapsed(!gradeCollapsed)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-colors rounded-lg"
            >
              <div className="flex items-center gap-4">
                <HealthBadge score={healthData.score} grade={healthData.grade} trend={healthData.trend} size="lg" />
                <div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Health Grade</span>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {healthData.computedAt && (
                      <>Updated {new Date(healthData.computedAt).toLocaleString()}</>
                    )}
                  </div>
                </div>
              </div>
              {gradeCollapsed ? <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />}
            </button>
            {!gradeCollapsed && (
              <div className="px-4 pb-4">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setShowTrend(!showTrend)}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
                  >
                    {showTrend ? 'Hide trend' : 'View 30-day trend'}
                  </button>
                </div>
                <HealthBreakdown components={healthData.components} />
                {showTrend && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <HealthTrendChart history={healthHistory} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sync progress */}
        <div className="mt-2">
          <SyncProgressBar companyId={company.id} />
        </div>
      </div>

      {/* Live Sync Progress */}
      {(liveProgress.isActive || liveProgress.overallStatus === 'completed' || liveProgress.overallStatus === 'syncing_contacts' || liveProgress.overallStatus === 'syncing_messages') && (
        <SyncProgressPanel progress={liveProgress} collapsed={syncPanelCollapsed} onToggle={() => setSyncPanelCollapsed(!syncPanelCollapsed)} />
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setGradeCollapsed(true); setSyncPanelCollapsed(true); }}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-teal-500 text-teal-700 dark:text-teal-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'contacts' && <ContactsTabComponent companyId={company.id} />}
        {activeTab === 'messages' && <MessagesTab companyId={company.id} />}
        {activeTab === 'teamwork' && <TeamworkTab company={company} />}
        {activeTab === 'meetings' && <MeetingsTabComponent companyId={company.id} />}
        {activeTab === 'calendar' && <CalendarTab companyId={company.id} />}
        {activeTab === 'documents' && (
          <DocumentsTab companyId={company.id} hasDrive={!!company.drive_folder_id} />
        )}
        {activeTab === 'customfields' && (
          <CustomFieldsTab companyId={company.id} companyName={company.name} />
        )}
      </div>
    </div>
  );
}

// ── Live Sync Progress Panel ──────────────────────────────────────────

function SyncProgressPanel({ progress, collapsed, onToggle }: { progress: LiveProgress; collapsed: boolean; onToggle: () => void }) {
  const formatElapsedSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
  };

  const statusLabel = progress.overallStatus === 'completed' ? '\u2713 Sync complete' :
    progress.overallStatus === 'syncing_messages' ? `Syncing messages (${progress.contactsWithMessages} of ${progress.contactsSynced} contacts done)` :
    progress.overallStatus === 'syncing_contacts' ? 'Syncing contacts...' :
    progress.overallStatus === 'idle' ? 'Idle' : progress.overallStatus;

  return (
    <div className={`mx-6 mb-2 rounded-lg border ${
      progress.isActive
        ? 'bg-teal-50 dark:bg-teal-900/50 border-teal-200 dark:border-teal-800'
        : progress.overallStatus === 'completed'
          ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800'
          : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
    }`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-2">
          {progress.isActive && <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contacts & Messages</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {progress.contactsSynced.toLocaleString()} contacts &middot; {progress.messagesTotal.toLocaleString()} msgs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{statusLabel}</span>
          {collapsed ? <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />}
        </div>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Contacts */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contacts</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {progress.contactsSynced.toLocaleString()} / {progress.contactsApiTotal.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(progress.contactsPercent, 100)}%` }} />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">{Math.round(progress.contactsPercent)}%</span>
            </div>

            {/* Messages */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Messages</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {progress.messagesTotal.toLocaleString()} msgs
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(progress.messagesPercent, 100)}%` }} />
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {progress.contactsWithMessages} / {progress.contactsSynced} contacts have messages
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-2">
              {progress.isActive && <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
              <span className="text-sm text-slate-600 dark:text-slate-400">{statusLabel}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
              <span>{progress.etaDisplay}</span>
              {progress.elapsedSeconds > 0 && <span>Elapsed: {formatElapsedSec(progress.elapsedSeconds)}</span>}
              <span>Queue: {progress.runningTasks} running, {progress.pendingTasks} pending</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkPill({ label, url }: { label: string; url?: string }) {
  const classes =
    'inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-400';

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${classes} hover:bg-slate-100 dark:hover:bg-slate-700`}>
        {label}
        <ExternalLink size={10} />
      </a>
    );
  }
  return <span className={classes}>{label}</span>;
}
