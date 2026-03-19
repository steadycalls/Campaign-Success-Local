import { useState } from 'react';
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
} from 'lucide-react';
import { api } from '../lib/ipc';
import { useCompany, useContacts, useMessages, useDriveFiles, useMeetings } from '../hooks/useDB';
import SLABadge from '../components/shared/SLABadge';
import ContactsTabComponent from '../components/company/ContactsTab';
import MeetingsTabComponent from '../components/company/MeetingsTab';
import BudgetBar from '../components/shared/BudgetBar';
import SyncProgressBar from '../components/shared/SyncProgressBar';
import { useLiveProgress } from '../hooks/useLiveProgress';
import type { LiveProgress } from '../hooks/useLiveProgress';
import type { Contact, Message, DriveFile, Meeting } from '../types';

// ── Tabs ──────────────────────────────────────────────────────────────

const tabs = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'teamwork', label: 'Teamwork', icon: Briefcase },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
] as const;

type TabId = (typeof tabs)[number]['id'];

// ── Messages Tab ──────────────────────────────────────────────────────

function MessagesTab({ companyId }: { companyId: string }) {
  const { contacts } = useContacts(companyId);
  const [dirFilter, setDirFilter] = useState<'' | 'inbound' | 'outbound'>('');

  // Load messages inline per contact — we use a sub-component
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100">
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value as '' | 'inbound' | 'outbound')}
          className="rounded border border-slate-200 px-2 py-1 text-xs"
        >
          <option value="">All</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
      </div>
      {contacts.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">No contacts found.</p>
      ) : (
        <div className="divide-y divide-slate-100">
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
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-medium text-slate-800">{name}</span>
        <span className="text-xs text-slate-400">({messages.length} messages)</span>
      </button>
      {expanded && (
        <div className="space-y-1 px-8 pb-3 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400">No messages</p>
          ) : (
            filtered.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-xs py-0.5">
                <span className="shrink-0 w-24 text-slate-400">
                  {new Date(m.message_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={m.direction === 'outbound' ? 'text-teal-600' : 'text-blue-600'}>
                  {m.direction === 'outbound' ? '\u2192' : '\u2190'}
                </span>
                {m.type && (
                  <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] uppercase">{m.type}</span>
                )}
                <span className="text-slate-700 truncate">{m.body_preview || '(no content)'}</span>
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
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Briefcase size={32} className="mb-2" />
        <p className="text-sm">No Teamwork project linked</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Budget</h3>
        <div className="max-w-md">
          <BudgetBar
            percent={company.budget_percent}
            used={company.budget_used}
            total={company.monthly_budget}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          ${company.budget_used?.toLocaleString() ?? 0} / ${company.monthly_budget?.toLocaleString() ?? 0}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Tasks</h3>
        <p className="text-sm text-slate-600">{company.open_task_count} open tasks</p>
      </div>
    </div>
  );
}

// MeetingsTab is imported from components/company/MeetingsTab

// ── Documents Tab ─────────────────────────────────────────────────────

function DocumentsTab({ companyId, hasDrive }: { companyId: string; hasDrive: boolean }) {
  const { files, loading } = useDriveFiles(companyId);

  if (!hasDrive) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FolderOpen size={32} className="mb-2" />
        <p className="text-sm">No Drive folder linked</p>
      </div>
    );
  }

  if (loading) return <p className="p-4 text-sm text-slate-400">Loading...</p>;

  if (files.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No files found in Drive folder.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {files.map((f: DriveFile) => (
        <div
          key={f.id}
          onClick={() => f.web_view_url && window.open(f.web_view_url, '_blank')}
          className={`flex items-center gap-3 px-4 py-2.5 ${f.web_view_url ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        >
          {f.mime_type?.includes('spreadsheet') || f.mime_type?.includes('excel') ? (
            <FileText size={16} className="text-green-600" />
          ) : f.mime_type?.includes('document') || f.mime_type?.includes('word') ? (
            <FileText size={16} className="text-blue-600" />
          ) : (
            <File size={16} className="text-slate-400" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800 truncate">{f.name}</p>
            <p className="text-xs text-slate-400">
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

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, loading } = useCompany(id);
  const [activeTab, setActiveTab] = useState<TabId>('contacts');
  const [syncing, setSyncing] = useState(false);
  const liveProgress = useLiveProgress(id ?? '');

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>;
  if (!company) return <div className="p-6 text-sm text-red-500">Company not found.</div>;

  const handleSync = async () => {
    setSyncing(true);
    await api.syncCompany(company.id);
    setSyncing(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <button
          onClick={() => navigate('/')}
          className="mb-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={14} />
          Back to portfolio
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{company.name}</h1>
            <div className="mt-1 flex items-center gap-3">
              <SLABadge status={company.sla_status} days={company.sla_days_since_contact} size="md" />
              <span className="text-xs text-slate-400">
                {company.contact_count.toLocaleString()} synced
                {company.contacts_api_total != null && (
                  <> / {company.contacts_api_total.toLocaleString()} total</>
                )}
              </span>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Sync Now
          </button>
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

        {/* Sync progress */}
        <div className="mt-2">
          <SyncProgressBar companyId={company.id} />
        </div>
      </div>

      {/* Live Sync Progress */}
      {(liveProgress.isActive || liveProgress.overallStatus === 'completed' || liveProgress.overallStatus === 'syncing_contacts' || liveProgress.overallStatus === 'syncing_messages') && (
        <SyncProgressPanel progress={liveProgress} />
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-teal-500 text-teal-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
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
        {activeTab === 'documents' && (
          <DocumentsTab companyId={company.id} hasDrive={!!company.drive_folder_id} />
        )}
      </div>
    </div>
  );
}

// ── Live Sync Progress Panel ──────────────────────────────────────────

function SyncProgressPanel({ progress }: { progress: LiveProgress }) {
  const formatElapsedSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
  };

  return (
    <div className={`mx-6 mb-2 p-4 rounded-lg border ${
      progress.isActive
        ? 'bg-teal-50 border-teal-200'
        : progress.overallStatus === 'completed'
          ? 'bg-green-50 border-green-200'
          : 'bg-slate-50 border-slate-200'
    }`}>
      <div className="grid grid-cols-2 gap-6">
        {/* Contacts */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">Contacts</span>
            <span className="text-sm text-slate-500">
              {progress.contactsSynced.toLocaleString()} / {progress.contactsApiTotal.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(progress.contactsPercent, 100)}%` }} />
          </div>
          <span className="text-xs text-slate-400">{Math.round(progress.contactsPercent)}%</span>
        </div>

        {/* Messages */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">Messages</span>
            <span className="text-sm text-slate-500">
              {progress.messagesTotal.toLocaleString()} msgs
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(progress.messagesPercent, 100)}%` }} />
          </div>
          <span className="text-xs text-slate-400">
            {progress.contactsWithMessages} / {progress.contactsSynced} contacts have messages
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50">
        <div className="flex items-center gap-2">
          {progress.isActive && <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />}
          <span className="text-sm text-slate-600">
            {progress.overallStatus === 'completed' ? '\u2713 Sync complete' :
             progress.overallStatus === 'syncing_messages' ? `Syncing messages (${progress.contactsWithMessages} of ${progress.contactsSynced} contacts done)` :
             progress.overallStatus === 'syncing_contacts' ? 'Syncing contacts...' :
             progress.overallStatus === 'idle' ? 'Idle' : progress.overallStatus}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{progress.etaDisplay}</span>
          {progress.elapsedSeconds > 0 && <span>Elapsed: {formatElapsedSec(progress.elapsedSeconds)}</span>}
          <span>Queue: {progress.runningTasks} running, {progress.pendingTasks} pending</span>
        </div>
      </div>
    </div>
  );
}

function LinkPill({ label, url }: { label: string; url?: string }) {
  const classes =
    'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600';

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${classes} hover:bg-slate-100`}>
        {label}
        <ExternalLink size={10} />
      </a>
    );
  }
  return <span className={classes}>{label}</span>;
}
