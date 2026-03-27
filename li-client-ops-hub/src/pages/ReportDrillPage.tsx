import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { api } from '../lib/ipc';
import type { ReportDrilldownResult, DrilldownColumn } from '../types';

// ── Badge renderers ──────────────────────────────────────────────────

function GradeBadge({ value }: { value: unknown }) {
 const s = String(value ?? '');
 const color =
 s === 'A' || s === 'B' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' :
 s === 'C' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' :
 s === 'D' || s === 'F' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
 // SLA badges
 s === 'ok' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' :
 s === 'warning' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' :
 s === 'violation' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
 'bg-slate-100 dark:bg-slate-800 text-slate-700';
 const label = s === 'ok' ? 'On Track' : s === 'violation' ? 'Overdue' : s === 'warning' ? 'Warning' : s;
 return (
 <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${color}`}>
 {label}
 </span>
 );
}

function PercentBar({ value }: { value: number }) {
 const pct = Math.round(value);
 const color =
 pct >= 90 ? 'bg-red-50 dark:bg-red-950/30' :
 pct >= 75 ? 'bg-amber-50 dark:bg-amber-950/30' :
 'bg-green-50';
 return (
 <div className="flex items-center gap-2">
 <div className="w-20 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
 </div>
 <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{pct}%</span>
 </div>
 );
}

// ── Cell Renderer ────────────────────────────────────────────────────

function CellValue({ column, value }: { column: DrilldownColumn; value: unknown }) {
 if (value === null || value === undefined) {
 return <span className="text-slate-300 dark:text-slate-500">—</span>;
 }

 switch (column.type) {
 case 'badge':
 return <GradeBadge value={value} />;
 case 'percent':
 return <PercentBar value={Number(value)} />;
 case 'number':
 return <span className="tabular-nums">{Number(value).toLocaleString()}</span>;
 case 'date': {
 const d = new Date(String(value));
 if (isNaN(d.getTime())) return <span className="text-slate-300 dark:text-slate-500">—</span>;
 return <span>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>;
 }
 default:
 return <>{String(value)}</>;
 }
}

// ── Main Page ────────────────────────────────────────────────────────

export default function ReportDrillPage() {
 const { reportId, metric } = useParams<{ reportId: string; metric: string }>();
 const navigate = useNavigate();
 const [data, setData] = useState<ReportDrilldownResult | null>(null);
 const [loading, setLoading] = useState(true);
 const [sortKey, setSortKey] = useState<string | null>(null);
 const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
 const [search, setSearch] = useState('');

 useEffect(() => {
 if (!reportId || !metric) return;
 setLoading(true);
 api.getReportDrilldown(reportId, metric).then(result => {
 setData(result);
 setLoading(false);
 });
 }, [reportId, metric]);

 const handleSort = (key: string) => {
 if (sortKey === key) {
 setSortDir(d => d === 'asc' ? 'desc' : 'asc');
 } else {
 setSortKey(key);
 setSortDir('asc');
 }
 };

 const filteredRows = useMemo(() => {
 if (!data) return [];
 let rows = data.rows;
 if (search.trim()) {
 const q = search.toLowerCase();
 rows = rows.filter(row =>
 data.columns.some(col => {
 const v = row[col.key];
 return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
 })
 );
 }
 if (sortKey) {
 rows = [...rows].sort((a, b) => {
 const av = a[sortKey];
 const bv = b[sortKey];
 if (av === null || av === undefined) return 1;
 if (bv === null || bv === undefined) return -1;
 const cmp = typeof av === 'number' && typeof bv === 'number'
 ? av - bv
 : String(av).localeCompare(String(bv));
 return sortDir === 'asc' ? cmp : -cmp;
 });
 }
 return rows;
 }, [data, search, sortKey, sortDir]);

 if (loading) {
 return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading detail...</div>;
 }

 if (!data || data.columns.length === 0) {
 return (
 <div className="p-6">
 <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-400 mb-4">
 <ArrowLeft size={16} /> Back to Reports
 </button>
 <div className="text-center py-16 text-slate-400 dark:text-slate-500">
 <p className="text-sm">No data available for this metric.</p>
 </div>
 </div>
 );
 }

 // Filter out the navigable column from visible columns
 const visibleColumns = data.columns.filter(c => c.key !== data.navigableColumn || c.type !== undefined);

 return (
 <div className="flex h-full flex-col">
 {/* Header */}
 <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
 <button
 onClick={() => navigate('/reports')}
 className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-400 mb-1"
 >
 <ArrowLeft size={14} /> Back to Reports
 </button>
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.title}</h1>
 <p className="text-xs text-slate-500 dark:text-slate-400">{filteredRows.length} items</p>
 </div>
 <div className="relative">
 <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
 <input
 type="text"
 value={search}
 onChange={e => setSearch(e.target.value)}
 placeholder="Filter..."
 className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-teal-400 w-56"
 />
 </div>
 </div>
 </div>

 {/* Table */}
 <div className="flex-1 overflow-auto p-6">
 <table className="w-full text-left text-sm">
 <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 sticky top-0">
 <tr>
 {visibleColumns.map(col => (
 <th
 key={col.key}
 onClick={() => handleSort(col.key)}
 className="px-4 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300"
 >
 <span className="inline-flex items-center gap-1">
 {col.label}
 {sortKey === col.key && (
 sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
 )}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
 {filteredRows.map((row, i) => {
 const navId = data.navigableColumn ? row[data.navigableColumn] : null;
 const clickable = !!navId;

 return (
 <tr
 key={i}
 onClick={clickable ? () => navigate(`/company/${navId}`) : undefined}
 className={clickable
 ? 'hover:bg-teal-50 dark:hover:bg-teal-950/30 cursor-pointer'
 : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
 >
 {visibleColumns.map(col => (
 <td key={col.key} className="px-4 py-2 text-slate-700 dark:text-slate-300">
 <CellValue column={col} value={row[col.key]} />
 </td>
 ))}
 </tr>
 );
 })}
 </tbody>
 </table>

 {filteredRows.length === 0 && (
 <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
 {search ? 'No matches found.' : 'No data for this metric.'}
 </div>
 )}
 </div>
 </div>
 );
}
