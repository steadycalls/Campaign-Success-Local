import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import type { DriveFolder, DriveFile, Company } from '../../types';

// ── Sort helpers ─────────────────────────────────────────────────────

type SortKey = 'name' | 'file_count' | 'modified_at' | 'linked_company_name' | 'suggestion_score';
type SortDir = 'asc' | 'desc';

function SortTh({
  label,
  k,
  current,
  dir,
  onSort,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = k === current;
  return (
    <th className="px-3 py-2">
      <button
        onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-800"
      >
        {label}
        <span className={active ? 'text-teal-600' : 'text-slate-300 group-hover:text-slate-400'}>
          {active ? (
            dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          ) : (
            <ChevronsUpDown size={12} />
          )}
        </span>
      </button>
    </th>
  );
}

// ── Filter options ───────────────────────────────────────────────────

type FilterMode = 'all' | 'linked' | 'unlinked' | 'suggested';

// ── File type display ────────────────────────────────────────────────

function mimeIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('document') || mime.includes('word') || mime.includes('text')) return '📝';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽';
  if (mime.includes('image')) return '🖼';
  if (mime.includes('video')) return '🎬';
  if (mime.includes('audio')) return '🎵';
  if (mime.includes('zip') || mime.includes('archive') || mime.includes('compressed')) return '📦';
  if (mime.includes('folder')) return '📁';
  return '📄';
}

function friendlyMime(mime: string | null): string {
  if (!mime) return 'File';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('spreadsheet') || mime.includes('google-apps.spreadsheet')) return 'Sheet';
  if (mime.includes('document') || mime.includes('google-apps.document')) return 'Doc';
  if (mime.includes('presentation') || mime.includes('google-apps.presentation')) return 'Slides';
  if (mime.includes('image')) return 'Image';
  if (mime.includes('video')) return 'Video';
  if (mime.includes('zip') || mime.includes('archive')) return 'Archive';
  if (mime.includes('folder')) return 'Folder';
  return mime.split('/').pop()?.split('.').pop() || 'File';
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) return 'Today';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '-';
  }
}

// ── Company picker modal ─────────────────────────────────────────────

function CompanyPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (companyId: string) => void;
  onCancel: () => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCompanies({ status: 'active' }).then((data) => {
      setCompanies(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-96 max-h-[500px] flex flex-col rounded-lg bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Select Sub-Account</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <p className="py-4 text-center text-xs text-slate-400">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No matches</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Expanded row — files list ────────────────────────────────────────

function FolderFilesRow({ folder }: { folder: DriveFolder }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.getGdriveFolderFiles(folder.drive_folder_id).then((data) => {
      setFiles(data);
      setLoading(false);
    });
  }, [folder.drive_folder_id]);

  const handleSyncFiles = async () => {
    setSyncing(true);
    await api.syncGdriveFolderFiles(folder.drive_folder_id);
    const data = await api.getGdriveFolderFiles(folder.drive_folder_id);
    setFiles(data);
    setSyncing(false);
  };

  return (
    <tr>
      <td colSpan={6} className="bg-slate-50 px-6 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700">
            {folder.name} — {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            {folder.web_view_url && (
              <button
                onClick={() => api.openInChrome(folder.web_view_url!)}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Open in Drive <ExternalLink size={11} />
              </button>
            )}
            <button
              onClick={handleSyncFiles}
              disabled={syncing}
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Sync Files
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading files...</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-slate-400">No files synced yet. Click "Sync Files" to pull file metadata.</p>
        ) : (
          <div className="overflow-auto rounded border border-slate-200 max-h-64">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-2 py-1.5 font-medium text-slate-500">File Name</th>
                  <th className="px-2 py-1.5 font-medium text-slate-500">Type</th>
                  <th className="px-2 py-1.5 font-medium text-slate-500">Modified</th>
                  <th className="px-2 py-1.5 font-medium text-slate-500">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-white">
                    <td className="px-2 py-1.5">
                      {f.web_view_url ? (
                        <button
                          onClick={() => api.openInChrome(f.web_view_url!)}
                          className="text-teal-700 hover:underline inline-flex items-center gap-1"
                        >
                          {mimeIcon(f.mime_type)} {f.name}
                        </button>
                      ) : (
                        <span>{mimeIcon(f.mime_type)} {f.name}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{friendlyMime(f.mime_type)}</td>
                    <td className="px-2 py-1.5 text-slate-500">{shortDate(f.modified_at)}</td>
                    <td className="px-2 py-1.5 text-slate-500">{formatBytes(f.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function GDrivePage() {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [syncingFolders, setSyncingFolders] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<{ email: string | null } | null>(null);

  const load = useCallback(async () => {
    const [data, auth] = await Promise.all([
      api.getGdriveFolders(),
      api.getGdriveAuthStatus(),
    ]);
    setFolders(data);
    setAuthStatus(auth);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  };

  const handleSyncFolders = async () => {
    setSyncingFolders(true);
    await api.syncGdriveFolders();
    await load();
    setSyncingFolders(false);
  };

  const handleAcceptSuggestion = async (folderId: string) => {
    await api.acceptGdriveSuggestion(folderId);
    await load();
  };

  const handleLinkFolder = async (folderId: string, companyId: string) => {
    await api.linkGdriveFolder(folderId, companyId);
    setPickerForId(null);
    await load();
  };

  const filtered = useMemo(() => {
    let list = folders;

    // Filter
    if (filter === 'linked') list = list.filter((f) => f.company_id);
    else if (filter === 'unlinked') list = list.filter((f) => !f.company_id);
    else if (filter === 'suggested')
      list = list.filter((f) => !f.company_id && f.suggested_company_id);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.linked_company_name ?? '').toLowerCase().includes(q) ||
          (f.suggested_company_name ?? '').toLowerCase().includes(q)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof DriveFolder];
      const bv = b[sortKey as keyof DriveFolder];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      const cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [folders, search, filter, sortKey, sortDir]);

  const linkedCount = folders.filter((f) => f.company_id).length;

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Google Drive — Client Folders</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {authStatus?.email ? (
              <>
                Authorized as <span className="font-medium">{authStatus.email}</span> &middot;{' '}
              </>
            ) : null}
            {folders.length} folders synced &middot; {linkedCount} linked
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncFolders}
            disabled={syncingFolders}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {syncingFolders ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Sync Folders
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="mt-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search folders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none"
        >
          <option value="all">All ({folders.length})</option>
          <option value="linked">Linked ({linkedCount})</option>
          <option value="unlinked">Unlinked ({folders.length - linkedCount})</option>
          <option value="suggested">
            Has Suggestion ({folders.filter((f) => !f.company_id && f.suggested_company_id).length})
          </option>
        </select>
        <span className="text-xs text-slate-400">{filtered.length} folders</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          {folders.length === 0
            ? 'No folders synced yet. Click "Sync Folders" to pull folder data from Google Drive.'
            : 'No folders match your search/filter.'}
        </p>
      ) : (
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200 max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8 px-2 py-2" />
                <SortTh label="Folder Name" k="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Files" k="file_count" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Modified" k="modified_at" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Sub-Account" k="linked_company_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Suggested" k="suggestion_score" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((f) => {
                const isExpanded = expandedId === f.id;
                return (
                  <>
                    <tr key={f.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : f.id)}>
                      <td className="px-2 py-2.5 text-slate-400">
                        <ChevronRight
                          size={14}
                          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900">{f.name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{f.file_count}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {shortDate(f.modified_at)}
                      </td>
                      <td className="px-3 py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        {f.company_id ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <CheckCircle2 size={13} /> {f.linked_company_name}
                          </span>
                        ) : (
                          <button
                            onClick={() => setPickerForId(f.id)}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-teal-600"
                          >
                            <XCircle size={13} /> Link
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        {!f.company_id && f.suggested_company_id ? (
                          <button
                            onClick={() => handleAcceptSuggestion(f.id)}
                            className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 hover:bg-amber-100"
                          >
                            {Math.round((f.suggestion_score ?? 0) * 100)}%{' '}
                            {f.suggested_company_name}
                          </button>
                        ) : f.company_id ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && <FolderFilesRow key={`${f.id}-files`} folder={f} />}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Company picker modal */}
      {pickerForId && (
        <CompanyPicker
          onSelect={(companyId) => handleLinkFolder(pickerForId, companyId)}
          onCancel={() => setPickerForId(null)}
        />
      )}
    </div>
  );
}
