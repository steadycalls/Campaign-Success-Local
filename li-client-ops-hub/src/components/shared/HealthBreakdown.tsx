import { useState, useEffect, useRef } from 'react';
import { Info, Search, X, Check, ExternalLink } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { HealthComponent } from '../../types';

interface HealthBreakdownProps {
  components: HealthComponent[];
  companyId?: string;
  onLinked?: () => void;
}

// ── Grade explanation tooltip ────────────────────────────────────────

function GradeInfoTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        title="How is the health grade calculated?"
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 p-4">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">How Health Grade Works</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
            <p>The health score (0-100) is a weighted average of 8 components that reflect how well a client account is being managed.</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Communication SLA</span><span className="font-medium text-slate-700 dark:text-slate-300">25%</span>
              <span className="text-slate-500 dark:text-slate-400">Contact Velocity</span><span className="font-medium text-slate-700 dark:text-slate-300">15%</span>
              <span className="text-slate-500 dark:text-slate-400">Teamwork Budget</span><span className="font-medium text-slate-700 dark:text-slate-300">15%</span>
              <span className="text-slate-500 dark:text-slate-400">Meeting Frequency</span><span className="font-medium text-slate-700 dark:text-slate-300">10%</span>
              <span className="text-slate-500 dark:text-slate-400">Message Trend</span><span className="font-medium text-slate-700 dark:text-slate-300">10%</span>
              <span className="text-slate-500 dark:text-slate-400">Drive Activity</span><span className="font-medium text-slate-700 dark:text-slate-300">5%</span>
              <span className="text-slate-500 dark:text-slate-400">Discord Activity</span><span className="font-medium text-slate-700 dark:text-slate-300">5%</span>
              <span className="text-slate-500 dark:text-slate-400">Data Completeness</span><span className="font-medium text-slate-700 dark:text-slate-300">15%</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span className="text-green-600 dark:text-green-400">A (90-100)</span><span>Excellent</span>
              <span className="text-green-600 dark:text-green-400">B (75-89)</span><span>Good</span>
              <span className="text-amber-600 dark:text-amber-400">C (60-74)</span><span>Needs attention</span>
              <span className="text-red-600 dark:text-red-400">D (40-59)</span><span>At risk</span>
              <span className="text-red-600 dark:text-red-400">F (0-39)</span><span>Critical</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable picker modal ──────────────────────────────────────────

function LinkPickerModal({ title, onClose, onPick, loadOptions, settingsPath, settingsLabel }: {
  title: string;
  onClose: () => void;
  onPick: (id: string, name: string) => void;
  loadOptions: () => Promise<Array<{ id: string; name: string }>>;
  settingsPath?: string;
  settingsLabel?: string;
}) {
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOptions().then((o) => { setOptions(o); setLoading(false); });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div ref={ref} className="w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</span>
            {settingsPath && (
              <a href={`#${settingsPath}`} onClick={onClose}
                className="text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline flex items-center gap-0.5">
                {settingsLabel || 'Settings'} <ExternalLink size={9} />
              </a>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-xs text-slate-400 dark:text-slate-500 text-center">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="text-xs text-slate-400 dark:text-slate-500">No results found</div>
              {settingsPath && (
                <a href={`#${settingsPath}`} onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                  Check integration settings <ExternalLink size={10} />
                </a>
              )}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => onPick(o.id, o.name)}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 truncate flex items-center gap-2"
              >
                <span className="truncate">{o.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drive folder input modal ─────────────────────────────────────────

function DriveFolderModal({ companyId, onClose, onLinked }: {
  companyId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [folderId, setFolderId] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSave = async () => {
    if (!folderId.trim()) return;
    setSaving(true);
    // Extract folder ID from full URL if pasted
    let id = folderId.trim();
    const match = id.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    await api.linkGdriveFolder(id, companyId);
    setSaving(false);
    onLinked();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div ref={ref} className="w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Link Google Drive Folder</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Folder ID or URL</label>
            <input
              type="text"
              placeholder="Paste Google Drive folder URL or ID..."
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!folderId.trim() || saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Linking...' : 'Link Folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Action link per component ────────────────────────────────────────

type ActionType = 'teamwork' | 'drive' | 'discord' | 'sync_messages' | null;

function getAction(comp: HealthComponent): { type: ActionType; label: string } | null {
  const d = comp.detail.toLowerCase();
  if (comp.name === 'Teamwork Budget' && d.includes('no teamwork project linked'))
    return { type: 'teamwork', label: 'link project' };
  if (comp.name === 'Message Trend' && d.includes('no messages synced'))
    return { type: 'sync_messages', label: 'sync messages' };
  if (comp.name === 'Drive Activity' && d.includes('no drive folder linked'))
    return { type: 'drive', label: 'add folder' };
  if (comp.name === 'Discord Activity' && d.includes('no discord channel linked'))
    return { type: 'discord', label: 'link channel' };
  return null;
}

// ── Main component ───────────────────────────────────────────────────

export default function HealthBreakdown({ components, companyId, onLinked }: HealthBreakdownProps) {
  const [modal, setModal] = useState<ActionType>(null);

  if (!components || components.length === 0) return null;

  const handleTeamworkPick = async (id: string, name: string) => {
    if (!companyId) return;
    await api.setEntityLink({ companyId, platform: 'teamwork', platformId: id, platformName: name });
    setModal(null);
    onLinked?.();
  };

  const handleDiscordPick = async (id: string, name: string) => {
    if (!companyId) return;
    await api.setEntityLink({ companyId, platform: 'discord', platformId: id, platformName: name });
    setModal(null);
    onLinked?.();
  };

  const handleSyncMessages = async () => {
    if (!companyId) return;
    await api.queueSyncCompany(companyId);
    setModal(null);
    onLinked?.();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Score Breakdown</span>
        <GradeInfoTooltip />
      </div>
      <div className="space-y-2">
        {components.map((comp, i) => {
          const action = companyId ? getAction(comp) : null;
          return (
            <div key={i} className="flex items-center gap-3">
              {/* Mini progress bar */}
              <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full rounded-full ${
                    comp.status === 'green' ? 'bg-green-500' :
                    comp.status === 'yellow' ? 'bg-amber-500' :
                    comp.status === 'red' ? 'bg-red-500' : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                  style={{ width: `${comp.score}%` }}
                />
              </div>

              {/* Label + score */}
              <span className="text-xs text-slate-600 dark:text-slate-400 w-32 shrink-0">{comp.name}</span>
              <span className="text-xs font-medium w-8 shrink-0">{comp.score}</span>

              {/* Detail */}
              <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{comp.detail}</span>

              {/* Action link */}
              {action && (
                <button
                  onClick={() => action.type === 'sync_messages' ? handleSyncMessages() : setModal(action.type)}
                  className="shrink-0 text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline whitespace-nowrap"
                >
                  {action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {modal === 'teamwork' && companyId && (
        <LinkPickerModal
          title="Link Teamwork Project"
          settingsPath="/settings/teamwork"
          settingsLabel="TW Integration"
          onClose={() => setModal(null)}
          onPick={handleTeamworkPick}
          loadOptions={async () => {
            const projects = await api.getTeamworkWithAssociations() as Array<{ id: string; name: string }>;
            return projects.map(p => ({ id: p.id, name: p.name }));
          }}
        />
      )}
      {modal === 'discord' && companyId && (
        <LinkPickerModal
          title="Link Discord Channel"
          settingsPath="/discord"
          settingsLabel="Discord Integration"
          onClose={() => setModal(null)}
          onPick={handleDiscordPick}
          loadOptions={async () => {
            const channels = await api.getDiscordChannels();
            return channels.map(c => ({ id: c.id, name: `${c.server_name ? c.server_name + ' > ' : ''}#${c.name}` }));
          }}
        />
      )}
      {modal === 'drive' && companyId && (
        <DriveFolderModal companyId={companyId} onClose={() => setModal(null)} onLinked={() => onLinked?.()} />
      )}
    </div>
  );
}
