import { useState, useEffect, useRef } from 'react';
import { FileText, RefreshCw, ExternalLink, ChevronDown, Trash2, Info } from 'lucide-react';
import { api } from '../lib/ipc';
import type { WeeklyReportListItem, WeeklyReportFull } from '../types';
import ReportDashboard from '../components/reports/ReportDashboard';

// ── Helpers ──────────────────────────────────────────────────────────

function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
 if (!json) return fallback;
 try { return JSON.parse(json); } catch { return fallback; }
}

function formatDate(iso: string): string {
 return new Date(iso).toLocaleDateString('en-US', {
 month: 'short', day: 'numeric', year: 'numeric',
 });
}

// ── Generate Dropdown ───────────────────────────────────────────────

function GenerateDropdown({ onGenerate, generating }: {
 onGenerate: (periodEnd?: string) => void;
 generating: boolean;
}) {
 const [open, setOpen] = useState(false);
 const ref = useRef<HTMLDivElement>(null);

 useEffect(() => {
 const handler = (e: MouseEvent) => {
 if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
 };
 document.addEventListener('mousedown', handler);
 return () => document.removeEventListener('mousedown', handler);
 }, []);

 const handleLastWeek = () => {
 const d = new Date();
 d.setDate(d.getDate() - 7);
 onGenerate(d.toISOString());
 setOpen(false);
 };

 return (
 <div ref={ref} className="relative">
 <button
 onClick={() => setOpen(!open)}
 disabled={generating}
 className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
 >
 {generating ? (
 <RefreshCw size={13} className="animate-spin" />
 ) : (
 <FileText size={13} />
 )}
 Generate Now
 <ChevronDown size={12} />
 </button>
 {open && (
 <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20">
 <button
 onClick={() => { onGenerate(); setOpen(false); }}
 className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
 >
 This Week
 </button>
 <button
 onClick={handleLastWeek}
 className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
 >
 Last Week
 </button>
 </div>
 )}
 </div>
 );
}

// ── Past Reports Table ──────────────────────────────────────────────

function PastReportsTable({ reports, activeId, onSelect, onExport, onDelete }: {
 reports: WeeklyReportListItem[];
 activeId: string | null;
 onSelect: (id: string) => void;
 onExport: (id: string) => void;
 onDelete: (id: string) => void;
}) {
 if (reports.length === 0) return null;

 return (
 <div>
 <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Past Reports</h2>
 <table className="w-full text-left text-sm">
 <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
 <tr>
 <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Date</th>
 <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Title</th>
 <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Actions</th>
 <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Highlights</th>
 <th className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400"></th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
 {reports.map(r => {
 const actionCount = parseJsonSafe<unknown[]>(r.action_items_json, []).length;
 const highlightCount = parseJsonSafe<unknown[]>(r.highlights_json, []).length;
 const isActive = r.id === activeId;

 return (
 <tr key={r.id} className={isActive ? 'bg-teal-50 dark:bg-teal-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}>
 <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{formatDate(r.report_date)}</td>
 <td className="px-4 py-2 text-slate-800 dark:text-slate-200 font-medium">{r.title}</td>
 <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
 {actionCount > 0 ? `${actionCount} items` : '—'}
 </td>
 <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
 {highlightCount > 0 ? `${highlightCount} wins` : '—'}
 </td>
 <td className="px-4 py-2">
 <div className="flex items-center gap-2">
 <button
 onClick={() => onSelect(r.id)}
 className={`text-xs ${isActive ? 'text-teal-700 dark:text-teal-400 font-medium' : 'text-teal-600 dark:text-teal-400 hover:text-teal-700'}`}
 >
 {isActive ? 'Viewing' : 'View'}
 </button>
 {r.export_path && (
 <button
 onClick={() => onExport(r.id)}
 className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
 title="Open in browser"
 >
 <ExternalLink size={12} />
 </button>
 )}
 <button
 onClick={() => onDelete(r.id)}
 className="text-xs text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400"
 title="Delete report"
 >
 <Trash2 size={12} />
 </button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function ReportsPage() {
 const [reports, setReports] = useState<WeeklyReportListItem[]>([]);
 const [activeReport, setActiveReport] = useState<WeeklyReportFull | null>(null);
 const [generating, setGenerating] = useState(false);
 const [loading, setLoading] = useState(true);

 const loadReports = async () => {
 const [list, latest] = await Promise.all([
 api.listReports(),
 api.getLatestReport(),
 ]);
 setReports(list);
 if (latest) setActiveReport(latest as WeeklyReportFull);
 setLoading(false);
 };

 useEffect(() => { loadReports(); }, []);

 const handleGenerate = async (periodEnd?: string) => {
 setGenerating(true);
 try {
 const result = await api.generateReport(periodEnd ? { periodEnd } : undefined);
 if (result.success && result.reportId) {
 await loadReports();
 const full = await api.getReport(result.reportId);
 if (full) setActiveReport(full as WeeklyReportFull);
 }
 } finally {
 setGenerating(false);
 }
 };

 const handleSelect = async (id: string) => {
 const full = await api.getReport(id);
 if (full) setActiveReport(full as WeeklyReportFull);
 };

 const handleExport = (id: string) => {
 api.openReportInBrowser(id);
 };

 const handleDelete = async (id: string) => {
 await api.deleteReport(id);
 if (activeReport?.id === id) {
 setActiveReport(null);
 }
 await loadReports();
 };

 if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading reports...</div>;

 return (
 <div className="flex h-full flex-col">
 {/* Header */}
 <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
 <div>
 <div className="flex items-center gap-2">
 <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Reports</h1>
 <div className="relative group">
 <Info size={15} className="text-slate-400 dark:text-slate-500 cursor-help" />
 <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl p-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
 <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1.5">Where does meeting data come from?</p>
 <ul className="space-y-1 list-disc pl-3.5">
 <li><strong>Read.ai</strong> — Meeting titles, summaries, transcripts, action items, topics, key questions, and engagement metrics (Read Score, Sentiment, Engagement) are synced via the Read.ai API.</li>
 <li><strong>Participants</strong> — Attendee names and emails come from Read.ai's participant data. Contacts are matched to GHL records by email domain.</li>
 <li><strong>Company matching</strong> — Meetings are linked to portfolio companies by matching participant email domains against the company_domains table.</li>
 <li><strong>GHL</strong> — Contact details, SLA status, and message history are pulled from GoHighLevel sub-accounts via Private Integration Tokens.</li>
 <li><strong>Sync schedule</strong> — Read.ai syncs on every scheduled run and can be triggered manually from the Meetings page. Reports aggregate this data weekly.</li>
 </ul>
 </div>
 </div>
 </div>
 <p className="text-xs text-slate-500 dark:text-slate-400">
 Weekly operations summaries — auto-generated Fridays at 4 PM CST
 </p>
 </div>
 <div className="flex items-center gap-3">
 {activeReport?.export_path && (
 <button
 onClick={() => handleExport(activeReport.id)}
 className="flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
 >
 <ExternalLink size={13} /> Export HTML
 </button>
 )}
 <GenerateDropdown onGenerate={handleGenerate} generating={generating} />
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-auto p-6 space-y-6">
 {/* Active report viewer */}
 <div>
 {activeReport && (
 <div className="flex items-center gap-2 mb-3">
 <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
 {activeReport.title}
 </h2>
 <span className="text-xs text-slate-400 dark:text-slate-500">
 Generated {new Date(activeReport.generated_at).toLocaleString()}
 </span>
 {activeReport.auto_generated === 1 && (
 <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">auto</span>
 )}
 </div>
 )}
 <ReportDashboard report={activeReport} />
 </div>

 {/* Past reports */}
 {reports.length > 1 && (
 <PastReportsTable
 reports={reports}
 activeId={activeReport?.id ?? null}
 onSelect={handleSelect}
 onExport={handleExport}
 onDelete={handleDelete}
 />
 )}
 </div>
 </div>
 );
}
