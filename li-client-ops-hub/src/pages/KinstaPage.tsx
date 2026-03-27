import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, RotateCw, Loader2, Search, X, ChevronDown, ChevronRight, ExternalLink, Globe, Check, Mail, Copy, Columns, Unlink } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { extractDomain } from '../lib/domain';
import { formatContactName } from '../lib/formatName';

// ── Column Definitions ──────────────────────────────────────────────

type ColumnKey = 'site' | 'domain' | 'subaccount' | 'client' | 'php' | 'wp' | 'plugins' | 'actions' | 'synced';

interface ColumnDef {
 key: ColumnKey;
 label: string;
 defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
 { key: 'site', label: 'Site', defaultVisible: true },
 { key: 'domain', label: 'Domain', defaultVisible: true },
 { key: 'subaccount', label: 'Subaccount', defaultVisible: true },
 { key: 'client', label: 'Client', defaultVisible: true },
 { key: 'php', label: 'PHP', defaultVisible: true },
 { key: 'wp', label: 'WP', defaultVisible: true },
 { key: 'plugins', label: 'Plugins', defaultVisible: true },
 { key: 'actions', label: 'Actions', defaultVisible: true },
 { key: 'synced', label: 'Last Synced', defaultVisible: true },
];

function getRowStatusColor(pluginsNeeding: number, themesNeeding: number): { bg: string; text: string } {
 const total = pluginsNeeding + themesNeeding;
 if (total === 0) return { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-900 dark:text-green-100' };
 if (pluginsNeeding >= 5) return { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-900 dark:text-red-100' };
 return { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-900 dark:text-amber-100' };
}

/** Format ISO date to MM/DD/YYYY h:mmAM PST */
function formatSyncDate(iso: string | null | undefined): string {
 if (!iso) return '-';
 try {
 return new Date(iso).toLocaleString('en-US', {
 month: '2-digit', day: '2-digit', year: 'numeric',
 hour: 'numeric', minute: '2-digit', hour12: true,
 timeZone: 'America/Los_Angeles',
 }).replace(',', '') + ' PST';
 } catch { return '-'; }
}

/** Build plugin update email body for WorkHero */
function buildPluginEmail(domain: string, count: number, plugins: Array<Record<string, unknown>>, themes: Array<Record<string, unknown>>): string {
 const needyPlugins = plugins.filter(p => p.update_available);
 const needyThemes = themes.filter(t => t.update_available);
 const totalItems = needyPlugins.length + needyThemes.length;

 let list = '';
 let num = 1;

 if (needyPlugins.length > 0) {
 list += 'Plugins:\n';
 for (const p of needyPlugins) {
 list += `${num}. ${p.plugin_name}: ${p.current_version} → ${p.new_version}\n`;
 num++;
 }
 }

 if (needyThemes.length > 0) {
 if (needyPlugins.length > 0) list += '\n';
 list += 'Themes:\n';
 for (const t of needyThemes) {
 list += `${num}. ${t.theme_name}: ${t.current_version} → ${t.new_version}\n`;
 num++;
 }
 }

 return `Hi WorkHero team,\n\nPlease update the ${totalItems} item${totalItems === 1 ? '' : 's'} on ${domain} that ${totalItems === 1 ? 'has' : 'have'} available updates:\n\n${list}\nThank you!`;
}

// ── Subaccount Picker Modal (single-select from portfolio) ──────────

function SubaccountPicker({ currentCompanyId, suggestedCompanyId, suggestedCompanyName, onSelect, onClose }: {
 currentCompanyId?: string;
 suggestedCompanyId?: string;
 suggestedCompanyName?: string;
 onSelect: (companyId: string) => void;
 onClose: () => void;
}) {
 const [search, setSearch] = useState('');
 const [companies, setCompanies] = useState<Array<Record<string, unknown>>>([]);
 const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 api.getCompanies({ status: 'active' }).then((c: unknown) => setCompanies(c as Array<Record<string, unknown>>));
 setTimeout(() => inputRef.current?.focus(), 50);
 }, []);

 const filtered = companies.filter(c =>
 (c.name as string)?.toLowerCase().includes(search.toLowerCase())
 );

 return (
 <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={onClose}>
 <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-96 max-h-96 overflow-hidden" onClick={e => e.stopPropagation()}>
 <div className="p-3 border-b border-slate-200 dark:border-slate-700">
 <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Link to Subaccount</h3>
 <input ref={inputRef} type="text" placeholder="Search subaccounts..." value={search}
 onChange={e => setSearch(e.target.value)}
 className="mt-2 w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" />
 </div>
 <div className="overflow-y-auto max-h-64">
 {suggestedCompanyId && !search && (
 <button onClick={() => onSelect(suggestedCompanyId)}
 className="w-full text-left px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/30 border-b border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between">
 <span className="text-sm text-teal-700 dark:text-teal-400 font-medium">{suggestedCompanyName}</span>
 <span className="text-xs text-slate-400 dark:text-slate-500">Suggested</span>
 </button>
 )}
 {filtered.map(company => (
 <button key={company.id as string} onClick={() => onSelect(company.id as string)}
 className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm ${company.id === currentCompanyId ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
 {company.name as string}
 {company.id === currentCompanyId && <span className="ml-2 text-xs text-teal-500 dark:text-teal-400">Current</span>}
 </button>
 ))}
 {filtered.length === 0 && <div className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500 text-center">No subaccounts found</div>}
 </div>
 {currentCompanyId && (
 <div className="border-t border-slate-200 dark:border-slate-700 p-2">
 <button onClick={() => onSelect('')} className="w-full text-center text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-400 py-1">
 Unlink from subaccount
 </button>
 </div>
 )}
 </div>
 </div>
 );
}

// ── Client Multi-Select Picker Modal ────────────────────────────────

function ClientMultiPicker({ selectedIds, onSave, onClose }: {
 selectedIds: string[];
 onSave: (clientIds: string[]) => void;
 onClose: () => void;
}) {
 const [search, setSearch] = useState('');
 const [clients, setClients] = useState<Array<Record<string, unknown>>>([]);
 const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
 const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 api.getClients().then((c: unknown) => setClients(c as Array<Record<string, unknown>>));
 setTimeout(() => inputRef.current?.focus(), 50);
 }, []);

 const filtered = clients.filter(c => {
 const name = formatContactName(c.first_name as string, c.last_name as string, '').toLowerCase();
 const email = ((c.email as string) || '').toLowerCase();
 const q = search.toLowerCase();
 return name.includes(q) || email.includes(q);
 });

 const toggleClient = (id: string) => {
 setSelected(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id); else next.add(id);
 return next;
 });
 };

 return (
 <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={onClose}>
 <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-96 max-h-[28rem] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
 <div className="p-3 border-b border-slate-200 dark:border-slate-700">
 <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
 Link Clients
 {selected.size > 0 && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">({selected.size} selected)</span>}
 </h3>
 <input ref={inputRef} type="text" placeholder="Search clients..." value={search}
 onChange={e => setSearch(e.target.value)}
 className="mt-2 w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" />
 </div>
 <div className="overflow-y-auto flex-1">
 {filtered.map(c => {
 const id = c.id as string;
 const name = formatContactName(c.first_name as string, c.last_name as string);
 const isSelected = selected.has(id);
 return (
 <button key={id} onClick={() => toggleClient(id)}
 className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm flex items-center gap-2 ${isSelected ? 'bg-teal-50 dark:bg-teal-950/30' : ''}`}>
 <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
 ${isSelected ? 'bg-teal-600 border-teal-600' : 'border-slate-300 dark:border-slate-600'}`}>
 {isSelected && <Check size={10} className="text-white" />}
 </span>
 <div className="flex-1 min-w-0">
 <span className={isSelected ? 'text-teal-700 dark:text-teal-400 font-medium' : 'text-slate-700 dark:text-slate-300'}>{String(c.name)}</span>
 {(() => {
 const domain = extractDomain(c.website as string);
 return domain ? <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{domain}</div> : null;
 })()}
 </div>
 {c.email ? <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[120px]">{String(c.email)}</span> : null}
 </button>
 );
 })}
 {filtered.length === 0 && <div className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500 text-center">No clients found</div>}
 </div>
 <div className="border-t border-slate-200 dark:border-slate-700 p-2 flex gap-2">
 <button onClick={onClose} className="flex-1 text-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 py-1.5">Cancel</button>
 <button onClick={() => onSave(Array.from(selected))}
 className="flex-1 rounded bg-teal-600 text-white text-xs font-medium py-1.5 hover:bg-teal-700">
 Save
 </button>
 </div>
 </div>
 </div>
 );
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({ value, label, color, bg, active, onClick }: { value: number; label: string; color: string; bg: string; active?: boolean; onClick?: () => void }) {
 return (
 <div
 onClick={onClick}
 className={`${bg} rounded-lg p-3 text-center cursor-pointer transition-all hover:ring-2 hover:ring-teal-300 ${active ? 'ring-2 ring-teal-500' : ''}`}
 >
 <div className={`text-2xl font-bold ${color}`}>{value}</div>
 <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
 </div>
 );
}

// ── Plugin badge ─────────────────────────────────────────────────────

function PluginBadge({ total, needing, siteName }: { total: number; needing: number; siteName: string }) {
 const color = needing === 0 ? 'text-green-600 dark:text-green-400' : needing < 5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
 const tooltip = needing === 0
 ? `${siteName} has ${total} plugins, all up to date`
 : `${siteName} has ${total} plugins, ${needing} need${needing === 1 ? 's' : ''} updates`;
 return <span className={`${color} text-xs font-medium`} title={tooltip}>{total}/{needing}</span>;
}

// ── Expanded site detail ─────────────────────────────────────────────

function SiteDetail({ site }: { site: Record<string, unknown> }) {
 const [plugins, setPlugins] = useState<Array<Record<string, unknown>>>([]);
 const [themes, setThemes] = useState<Array<Record<string, unknown>>>([]);

 useEffect(() => {
 api.getKinstaPlugins(site.kinsta_site_id as string).then(p => setPlugins(p as Array<Record<string, unknown>>));
 api.getKinstaThemes(site.kinsta_site_id as string).then(t => setThemes(t as Array<Record<string, unknown>>));
 }, [site.kinsta_site_id]);

 const needingUpdate = plugins.filter(p => p.update_available);
 const upToDate = plugins.filter(p => !p.update_available);

 return (
 <td colSpan={99} className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4">
 <div className="space-y-4">
 <div className="text-xs text-slate-500 dark:text-slate-400">
 PHP {String(site.php_version || '?')} &middot; WordPress {String(site.wp_version || '?')} &middot; {String(site.datacenter || 'Unknown DC')}
 {site.linked_company_name ? ` \u00B7 Subaccount: ${String(site.linked_company_name)}` : null}
 </div>

 {needingUpdate.length > 0 && (
 <div>
 <h4 className="text-xs font-semibold uppercase text-red-600 dark:text-red-400 mb-1">Plugins Needing Update ({needingUpdate.length})</h4>
 <table className="text-xs w-full max-w-lg">
 <thead><tr className="text-slate-400 dark:text-slate-500"><th className="py-0.5 text-left">Plugin</th><th className="py-0.5 text-right">Current</th><th className="py-0.5 text-right">Available</th><th className="py-0.5 text-right">Status</th></tr></thead>
 <tbody>
 {needingUpdate.map(p => (
 <tr key={p.id as string} className="border-t border-slate-100 dark:border-slate-700/50 text-slate-600 dark:text-slate-400">
 <td className="py-0.5">{String(p.plugin_name)}</td>
 <td className="py-0.5 text-right">{String(p.current_version || '-')}</td>
 <td className="py-0.5 text-right text-red-600 dark:text-red-400">{String(p.new_version || '-')}</td>
 <td className="py-0.5 text-right">{String(p.status || '-')}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {upToDate.length > 0 && (
 <details className="text-xs">
 <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">All Plugins ({plugins.length})</summary>
 <table className="text-xs w-full max-w-lg mt-1">
 <tbody>
 {upToDate.map(p => (
 <tr key={p.id as string} className="border-t border-slate-100 dark:border-slate-700/50 text-slate-500 dark:text-slate-400">
 <td className="py-0.5">{String(p.plugin_name)}</td>
 <td className="py-0.5 text-right">{String(p.current_version || '-')}</td>
 <td className="py-0.5 text-right text-green-600 dark:text-green-400">up to date</td>
 <td className="py-0.5 text-right">{String(p.status || '-')}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </details>
 )}

 {themes.length > 0 && (
 <div>
 <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Themes ({themes.length})</h4>
 <div className="space-y-0.5">
 {themes.map(t => (
 <div key={t.id as string} className="text-xs flex items-center gap-2">
 <span className={t.update_available ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>{'\u25CF'}</span>
 <span className="text-slate-700 dark:text-slate-300">{String(t.theme_name)}</span>
 <span className="text-slate-400 dark:text-slate-500">{String(t.current_version || '')}</span>
 {t.new_version ? <span className="text-red-500 dark:text-red-400">&rarr; {String(t.new_version)}</span> : null}
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="flex gap-2 pt-1">
 {site.kinsta_site_id ? (
 <button onClick={() => api.openInChrome(`https://my.kinsta.com/sites/${String(site.name)}/info`)}
 className="flex items-center gap-1.5 rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700">
 <ExternalLink size={12} /> Open in Kinsta
 </button>
 ) : null}
 </div>
 </div>
 </td>
 );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function KinstaPage() {
 const [search, setSearch] = useState('');
 const [filter, setFilter] = useState<string>('');
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [syncing, setSyncing] = useState(false);
 const [syncResult, setSyncResult] = useState<string | null>(null);
 const [pickerSiteId, setPickerSiteId] = useState<string | null>(null);
 const [clientPickerSiteId, setClientPickerSiteId] = useState<string | null>(null);
 const [syncProgress, setSyncProgress] = useState<{ phase: string; current: number; total: number; siteName: string } | null>(null);
 const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
 const [colPickerOpen, setColPickerOpen] = useState(false);
 const isCol = (key: ColumnKey) => visibleCols.has(key);
 const toggleCol = (key: ColumnKey) => {
 setVisibleCols(prev => {
 const next = new Set(prev);
 if (next.has(key)) next.delete(key); else next.add(key);
 return next;
 });
 };
 const colCount = 1 + visibleCols.size; // +1 for expand chevron

 const sitesFetcher = useCallback(() => api.getKinstaSites(), []);
 const { data: sitesRaw, loading, refresh } = useAutoRefresh(sitesFetcher, []);
 const sites = (sitesRaw || []) as Array<Record<string, unknown>>;

 const statsFetcher = useCallback(() => api.getKinstaStats(), []);
 const { data: stats } = useAutoRefresh(statsFetcher, []);

 // Listen for sync progress events
 useEffect(() => {
 const handler = (...args: unknown[]) => {
 const data = args[1] as { phase: string; current: number; total: number; siteName: string };
 if (data) setSyncProgress(data);
 };
 api.onKinstaSyncProgress(handler);
 return () => api.offKinstaSyncProgress(handler);
 }, []);

 const handleSync = async () => {
 setSyncing(true);
 setSyncResult(null);
 setSyncProgress(null);
 const result = await api.syncKinsta();
 setSyncProgress(null);
 setSyncResult(result.success
 ? `Synced ${result.found || 0} sites (${result.created || 0} new, ${result.updated || 0} updated)`
 : result.message || 'Sync failed');
 setSyncing(false);
 refresh();
 };

 const handleAcceptSuggestion = async (siteId: string) => {
 await api.acceptKinstaSuggestion(siteId);
 refresh();
 };

 const filtered = sites.filter(s => {
 if (search) {
 const q = search.toLowerCase();
 if (!(s.name as string)?.toLowerCase().includes(q)
 && !(s.domain as string)?.toLowerCase().includes(q)
 && !(s.linked_company_name as string)?.toLowerCase().includes(q)) return false;
 }
 if (filter === 'healthy') return ((s.plugins_needing_update as number) || 0) === 0 && ((s.themes_needing_update as number) || 0) === 0;
 if (filter === 'updates') return ((s.plugins_needing_update as number) || 0) > 0 || ((s.themes_needing_update as number) || 0) > 0;
 if (filter === 'critical') return ((s.plugins_needing_update as number) || 0) >= 5;
 if (filter === 'unlinked') return !s.company_id;
 return true;
 });

 if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

 return (
 <div className="flex h-full flex-col">
 <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
 <div className="flex-1 min-w-0">
 <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Globe size={20} /> Kinsta &mdash; WordPress Sites</h1>
 {syncResult && !syncing && <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{syncResult}</p>}
 {syncing && syncProgress && (
 <div className="mt-1.5 max-w-md">
 <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
 <span className="truncate mr-2">
 {syncProgress.phase === 'sites' ? 'Syncing' : 'Plugins'}: {syncProgress.siteName}
 </span>
 <span className="flex-shrink-0">{syncProgress.current}/{syncProgress.total}</span>
 </div>
 <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
 <div className="h-full bg-teal-50 dark:bg-teal-950/30 rounded-full transition-all duration-300"
 style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }} />
 </div>
 </div>
 )}
 {syncing && !syncProgress && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Starting sync...</p>}
 </div>
 <div className="flex items-center gap-2">
 <button onClick={refresh} title="Refresh UI from Kinsta database"
 className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
 <RotateCw size={13} /> Refresh
 </button>
 <button onClick={handleSync} disabled={syncing}
 className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
 {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync All
 </button>
 </div>
 </div>

 {/* Stats */}
 {stats && (
 <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900">
 <div className="grid grid-cols-5 gap-3">
 <StatCard value={stats.total} label="Sites" color="text-slate-700 dark:text-slate-300" bg="bg-slate-50 dark:bg-slate-800/80" active={filter === ''} onClick={() => setFilter(f => f === '' ? '' : '')} />
 <StatCard value={stats.healthy} label="Healthy" color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" active={filter === 'healthy'} onClick={() => setFilter(f => f === 'healthy' ? '' : 'healthy')} />
 <StatCard value={stats.withUpdates} label="Updates" color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" active={filter === 'updates'} onClick={() => setFilter(f => f === 'updates' ? '' : 'updates')} />
 <StatCard value={stats.critical} label="Critical" color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" active={filter === 'critical'} onClick={() => setFilter(f => f === 'critical' ? '' : 'critical')} />
 <StatCard value={stats.unlinked} label="Unlinked" color="text-slate-500 dark:text-slate-400" bg="bg-slate-50 dark:bg-slate-800/80" active={filter === 'unlinked'} onClick={() => setFilter(f => f === 'unlinked' ? '' : 'unlinked')} />
 </div>
 </div>
 )}

 {/* Filters */}
 <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
 <div className="relative flex-1 max-w-xs">
 <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
 <input type="text" placeholder="Search sites..." value={search} onChange={e => setSearch(e.target.value)}
 className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
 {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
 </div>
 <select value={filter} onChange={e => setFilter(e.target.value)}
 className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-sm">
 <option value="">All</option>
 <option value="healthy">Healthy</option>
 <option value="updates">Updates Only</option>
 <option value="critical">Critical (5+)</option>
 <option value="unlinked">Unlinked</option>
 </select>
 <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} sites</span>
 <div className="relative ml-auto">
 <button onClick={() => setColPickerOpen(!colPickerOpen)}
 className="flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
 <Columns size={13} /> Columns
 </button>
 {colPickerOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setColPickerOpen(false)} />
 <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 w-44 py-1">
 {ALL_COLUMNS.map(col => (
 <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm">
 <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} className="rounded" />
 {col.label}
 </label>
 ))}
 </div>
 </>
 )}
 </div>
 </div>

 {/* Table */}
 <div className="flex-1 overflow-auto">
 {filtered.length === 0 ? (
 <p className="p-6 text-sm text-slate-400 dark:text-slate-500">
 {sites.length === 0 ? 'No Kinsta sites synced. Configure your API key and click Sync All.' : 'No sites match your filter.'}
 </p>
 ) : (
 <table className="w-full text-left text-sm">
 <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
 <tr>
 <th className="w-8 px-4 py-2" />
 {isCol('site') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Site</th>}
 {isCol('domain') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Domain</th>}
 {isCol('subaccount') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Subaccount</th>}
 {isCol('client') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Client</th>}
 {isCol('php') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">PHP</th>}
 {isCol('wp') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">WP</th>}
 {isCol('plugins') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400" title="Total plugins / plugins needing updates">Plugins</th>}
 {isCol('actions') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Actions</th>}
 {isCol('synced') && <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center">Last Synced</th>}
 </tr>
 </thead>
 <tbody>
 {filtered.map(s => {
 const id = s.id as string;
 const isExpanded = expandedId === id;
 const phpOld = s.php_version && parseFloat(s.php_version as string) < 8.0;
 const pluginUpdates = (s.plugins_needing_update as number) || 0;
 const linkedClients = (s.linked_clients as Array<{ id: string; name: string }>) || [];

 return (
 <React.Fragment key={id}>
 <tr onClick={() => setExpandedId(isExpanded ? null : id)}
 className={`cursor-pointer border-b border-slate-100 dark:border-slate-700/50 hover:brightness-95 transition-colors ${getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).bg}`}>
 <td className="px-4 py-2.5">
 {isExpanded ? <ChevronDown size={14} className="text-slate-500 dark:text-slate-400" /> : <ChevronRight size={14} className="text-slate-500 dark:text-slate-400" />}
 </td>
 {isCol('site') && (
 <td className="px-3 py-2.5">
 <div className={`font-medium ${getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).text}`}>{String(s.display_name || s.name)}</div>
 </td>
 )}
 {isCol('domain') && <td className={`px-3 py-2.5 text-xs ${getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).text} opacity-80`}>{String(s.domain || '-')}</td>}
 {isCol('subaccount') && (
 <td className="px-3 py-2.5 text-xs" onClick={e => { e.stopPropagation(); setPickerSiteId(id); }}>
 {s.linked_company_name ? (
 <span className="text-green-700 dark:text-green-400 font-medium hover:underline cursor-pointer">{String(s.linked_company_name)}</span>
 ) : s.suggested_company_name ? (
 <span className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-400 cursor-pointer">
 {String(s.suggested_company_name)} ({Math.round((s.suggestion_score as number || 0) * 100)}%)
 </span>
 ) : (
 <span className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">&mdash;</span>
 )}
 </td>
 )}
 {isCol('client') && (
 <td className="px-3 py-2.5 text-xs" onClick={e => { e.stopPropagation(); setClientPickerSiteId(id); }}>
 {linkedClients.length > 0 ? (
 <span className="text-teal-700 dark:text-teal-400 font-medium hover:underline cursor-pointer">
 {linkedClients.map(c => c.name).join(', ')}
 </span>
 ) : (
 <span className="text-slate-400 dark:text-slate-500 hover:text-teal-600 cursor-pointer" title={`Click to pair ${s.domain || 'this site'} with Client GHL Contact`}>
 <Unlink size={14} />
 </span>
 )}
 </td>
 )}
 {isCol('php') && (
 <td className={`px-3 py-2.5 text-xs ${phpOld ? 'text-red-700 dark:text-red-400 font-bold' : getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).text}`}>
 {String(s.php_version || '-')}
 </td>
 )}
 {isCol('wp') && <td className={`px-3 py-2.5 text-xs ${getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).text}`}>{String(s.wp_version || '-')}</td>}
 {isCol('plugins') && (
 <td className="px-3 py-2.5">
 <PluginBadge total={(s.plugins_total as number) || 0} needing={pluginUpdates} siteName={String(s.display_name || s.name)} />
 </td>
 )}
 {isCol('actions') && (
 <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
 <div className="flex items-center gap-1.5">
 {pluginUpdates > 0 && !(s.domain as string)?.includes('kinsta.cloud') ? (
 <button
 title={`Copy plugin update email for WorkHero request to update ${pluginUpdates} plugin${pluginUpdates === 1 ? '' : 's'} on ${s.domain}`}
 onClick={async () => {
 const [plugins, themes] = await Promise.all([
 api.getKinstaPlugins(s.kinsta_site_id as string) as Promise<Array<Record<string, unknown>>>,
 api.getKinstaThemes(s.kinsta_site_id as string) as Promise<Array<Record<string, unknown>>>,
 ]);
 const email = buildPluginEmail(s.domain as string, pluginUpdates, plugins, themes);
 navigator.clipboard.writeText(email);
 }}
 className="rounded p-1 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors">
 <Mail size={14} />
 </button>
 ) : pluginUpdates > 0 ? (
 <span className="rounded p-1 text-slate-400 dark:text-slate-500 cursor-not-allowed" title="Disabled for kinsta.cloud domains">
 <Mail size={14} />
 </span>
 ) : null}
 <button
 title="Open WorkHero Dashboard"
 onClick={() => api.openInChrome('https://app.useworkhero.com/portal/dashboard')}
 className="rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
 <path d="M17 4L19 8" /><path d="M13 5L15 9" /><path d="M9 6L11 10" /><path d="M5 7L7 11" /><path d="M19 8C12 8 8 12 5 20" />
 </svg>
 </button>
 <button
 title="Open in Kinsta"
 onClick={() => api.openInChrome(`https://my.kinsta.com/sites/${String(s.name)}/info`)}
 className="rounded bg-purple-600 p-1 text-white hover:bg-purple-700 transition-colors">
 <ExternalLink size={14} />
 </button>
 </div>
 </td>
 )}
 {isCol('synced') && (
 <td className={`px-3 py-2.5 text-xs text-center whitespace-nowrap ${getRowStatusColor(pluginUpdates, (s.themes_needing_update as number) || 0).text} opacity-70`}>
 {formatSyncDate(s.synced_at as string)}
 </td>
 )}
 </tr>
 {isExpanded && (
 <tr><SiteDetail site={s} /></tr>
 )}
 </React.Fragment>
 );
 })}
 </tbody>
 </table>
 )}
 </div>

 {/* Subaccount Picker Modal */}
 {pickerSiteId && (() => {
 const site = sites.find(s => s.id === pickerSiteId);
 if (!site) return null;
 return (
 <SubaccountPicker
 currentCompanyId={site.company_id as string | undefined}
 suggestedCompanyId={site.suggested_company_id as string | undefined}
 suggestedCompanyName={site.suggested_company_name as string | undefined}
 onSelect={async (companyId) => {
 await api.linkKinstaSite(pickerSiteId, companyId);
 setPickerSiteId(null);
 refresh();
 }}
 onClose={() => setPickerSiteId(null)}
 />
 );
 })()}

 {/* Client Multi-Select Picker Modal */}
 {clientPickerSiteId && (() => {
 const site = sites.find(s => s.id === clientPickerSiteId);
 if (!site) return null;
 const currentClientIds = ((site.linked_clients as Array<{ id: string; name: string }>) || []).map(c => c.id);
 return (
 <ClientMultiPicker
 selectedIds={currentClientIds}
 onSave={async (clientIds) => {
 await api.setKinstaClients(clientPickerSiteId, clientIds);
 setClientPickerSiteId(null);
 refresh();
 }}
 onClose={() => setClientPickerSiteId(null)}
 />
 );
 })()}
 </div>
 );
}
