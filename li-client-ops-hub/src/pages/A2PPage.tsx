import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ShieldCheck, RefreshCw, Search, X, Loader2, ExternalLink, ChevronDown, ChevronRight, Globe, AlertTriangle, CheckCircle2, Clock, XCircle, HelpCircle, FileText, Copy, Sparkles, Upload, Eye, Code } from 'lucide-react';
import { marked } from 'marked';
import { api } from '../lib/ipc';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { A2PComplianceRecord, A2PPageStatus, A2PPageAnalysis, A2PAnalysisRecord } from '../types';

// ── Content Preview Modal ───────────────────────────────────────────

function ContentPreviewModal({ title, markdown, contentId, onClose, onSaved }: {
 title: string; markdown: string; contentId: string;
 onClose: () => void; onSaved: () => void;
}) {
 const [tab, setTab] = useState<'preview' | 'source'>('preview');
 const [draft, setDraft] = useState(markdown);
 const [saving, setSaving] = useState(false);
 const [copied, setCopied] = useState(false);
 const dirty = draft !== markdown;

 const renderedHtml = useMemo(() => {
 try { return marked.parse(tab === 'preview' ? (dirty ? draft : markdown) : markdown) as string; }
 catch { return '<p>Failed to render markdown</p>'; }
 }, [tab, draft, markdown, dirty]);

 const handleSave = async () => {
 setSaving(true);
 await api.a2pUpdateContent(contentId, draft);
 setSaving(false);
 onSaved();
 };

 const handleCopy = () => {
 navigator.clipboard.writeText(draft);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 return (
 <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-8" onClick={onClose}>
 <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
 {/* Header */}
 <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-3">
 <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
 <div className="flex items-center gap-2">
 <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
 <button onClick={() => setTab('preview')}
 className={`flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors ${
 tab === 'preview' ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50'
 }`}>
 <Eye size={12} /> Preview
 </button>
 <button onClick={() => setTab('source')}
 className={`flex items-center gap-1 px-3 py-1 text-xs font-medium border-l border-slate-200 dark:border-slate-700 transition-colors ${
 tab === 'source' ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50'
 }`}>
 <Code size={12} /> Source
 </button>
 </div>
 <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X size={16} /></button>
 </div>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto">
 {tab === 'preview' ? (
 <div className="prose prose-sm prose-slate max-w-none px-6 py-4"
 dangerouslySetInnerHTML={{ __html: renderedHtml }} />
 ) : (
 <textarea value={draft} onChange={e => setDraft(e.target.value)}
 className="w-full h-full min-h-[400px] px-5 py-4 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none resize-none" />
 )}
 </div>

 {/* Footer */}
 <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-5 py-3">
 <div className="flex items-center gap-2">
 <button onClick={handleCopy}
 className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
 <Copy size={12} /> {copied ? 'Copied!' : 'Copy Markdown'}
 </button>
 </div>
 <div className="flex items-center gap-2">
 {dirty && <span className="text-[10px] text-amber-600 dark:text-amber-400">Unsaved changes</span>}
 <button onClick={onClose}
 className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
 Close
 </button>
 {dirty && (
 <button onClick={handleSave} disabled={saving}
 className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
 {saving ? 'Saving...' : 'Save Changes'}
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
}

// ── Status badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
 const styles: Record<string, { bg: string; text: string; label: string }> = {
 compliant: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-400', label: 'Compliant' },
 partial: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400', label: 'Partial' },
 non_compliant: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-700 dark:text-red-400', label: 'Non-Compliant' },
 pending: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', label: 'Pending' },
 no_website: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-400', label: 'No Website' },
 };
 const s = styles[status] || styles.pending;
 return (
 <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
 {s.label}
 </span>
 );
}

// ── Page status icon ────────────────────────────────────────────────

function PageStatusIcon({ status }: { status: A2PPageStatus }) {
 switch (status) {
 case 'pass': return <CheckCircle2 size={14} className="text-green-500" />;
 case 'fail': return <XCircle size={14} className="text-red-500 dark:text-red-400" />;
 case 'missing': return <AlertTriangle size={14} className="text-amber-500" />;
 case 'error': return <XCircle size={14} className="text-red-400 dark:text-red-500" />;
 case 'pending': default: return <Clock size={14} className="text-slate-400 dark:text-slate-500" />;
 }
}

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({ value, label, color, bg, active, onClick }: {
 value: number; label: string; color: string; bg: string; active?: boolean; onClick?: () => void;
}) {
 return (
 <div onClick={onClick}
 className={`${bg} rounded-lg p-3 text-center cursor-pointer transition-all hover:ring-2 hover:ring-teal-300 ${active ? 'ring-2 ring-teal-500' : ''}`}>
 <div className={`text-2xl font-bold ${color}`}>{value}</div>
 <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
 </div>
 );
}

// ── Inline editable cell ────────────────────────────────────────────

function InlineEditCell({ value, placeholder, onSave, className }: {
 value: string | null; placeholder: string; onSave: (v: string) => void; className?: string;
}) {
 const [editing, setEditing] = useState(false);
 const [draft, setDraft] = useState(value || '');

 const commit = () => {
 const trimmed = draft.trim();
 if (trimmed !== (value || '')) onSave(trimmed);
 setEditing(false);
 };

 if (editing) {
 return (
 <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
 className={`px-1 py-0.5 border border-teal-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 w-full ${className || ''}`}
 autoFocus onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
 );
 }

 return (
 <span onClick={e => { e.stopPropagation(); setDraft(value || ''); setEditing(true); }}
 className={`cursor-text hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-1 py-0.5 -mx-1 ${value ? 'text-slate-600 dark:text-slate-400' : 'text-red-400 dark:text-red-500 italic'} ${className || ''}`}
 title="Click to edit">
 {value || placeholder}
 </span>
 );
}

// ── Expanded row detail ─────────────────────────────────────────────

const PAGE_TYPES = [
 { key: 'contact', label: 'Contact Page', urlField: 'contact_page_url', statusField: 'contact_page_status' },
 { key: 'privacy_policy', label: 'Privacy Policy', urlField: 'privacy_policy_url', statusField: 'privacy_policy_status' },
 { key: 'terms_of_service', label: 'Terms of Service', urlField: 'terms_of_service_url', statusField: 'terms_of_service_status' },
 { key: 'sms_policy', label: 'SMS/Messaging Policy', urlField: 'sms_policy_url', statusField: 'sms_policy_status' },
] as const;

function RequirementBadge({ status }: { status: string }) {
 if (status === 'pass') return <span className="text-green-600 dark:text-green-400" title="Pass">&#x2713;</span>;
 if (status === 'fail') return <span className="text-red-600 dark:text-red-400" title="Fail">&#x2717;</span>;
 return <span className="text-slate-400 dark:text-slate-500" title="Unclear">&#x25AC;</span>;
}

function AnalysisSection({ analysis, label }: { analysis: A2PPageAnalysis | null; label: string }) {
 if (!analysis) return null;
 return (
 <div className="mt-2">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
 <StatusBadge status={analysis.overallStatus} />
 <span className="text-[10px] text-slate-400 dark:text-slate-500">Score: {analysis.score}/100</span>
 </div>
 <div className="flex flex-wrap gap-1.5 mb-1">
 {analysis.requirements.map(r => (
 <span key={r.id} className="inline-flex items-center gap-0.5 text-[10px]" title={`${r.label}: ${r.evidence}${r.suggestion ? ` — ${r.suggestion}` : ''}`}>
 <RequirementBadge status={r.status} /> {r.label}
 </span>
 ))}
 </div>
 {analysis.suggestions.length > 0 && (
 <div className="text-[10px] text-red-600 dark:text-red-400 mt-1">
 {analysis.suggestions.map((s, i) => <div key={i}>• {s}</div>)}
 </div>
 )}
 <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">{analysis.summary}</p>
 </div>
 );
}

function RowDetail({ record, onRefresh, scanningRowId, onScan, analyzingRowId, onAnalyze, generatingRowId, onGenerate }: {
 record: A2PComplianceRecord; onRefresh: () => void;
 scanningRowId: string | null; onScan: (companyId: string, a2pId: string) => void;
 analyzingRowId: string | null; onAnalyze: (companyId: string, a2pId: string) => void;
 generatingRowId: string | null; onGenerate: (companyId: string, a2pId: string) => void;
}) {
 const [editingUrl, setEditingUrl] = useState<string | null>(null);
 const [urlValue, setUrlValue] = useState('');
 const [analysis, setAnalysis] = useState<A2PAnalysisRecord | null>(null);
 const [generatedContent, setGeneratedContent] = useState<Array<Record<string, unknown>>>([]);
 const [previewContent, setPreviewContent] = useState<{ title: string; md: string; id: string } | null>(null);
 const [copied, setCopied] = useState<string | null>(null);
 const [exportingId, setExportingId] = useState<string | null>(null);
 const [exportingAll, setExportingAll] = useState(false);
 const [exportResult, setExportResult] = useState<string | null>(null);
 const [driveLinked, setDriveLinked] = useState<boolean | null>(null);
 const isScanning = scanningRowId === record.id;
 const isAnalyzing = analyzingRowId === record.id;
 const isGenerating = generatingRowId === record.id;

 // Load analysis data when row expands
 useEffect(() => {
 api.a2pGetAnalysis(record.company_id).then(d => setAnalysis(d));
 }, [record.company_id, record.updated_at]);

 // Load generated content
 useEffect(() => {
 api.a2pGetGeneratedContent(record.id).then(d => setGeneratedContent(d as Array<Record<string, unknown>>));
 }, [record.id, record.updated_at]);

 // Check if Drive folder is linked
 useEffect(() => {
 api.a2pCheckDriveFolder(record.company_id).then(d => setDriveLinked(d.linked));
 }, [record.company_id]);

 const handleSaveUrl = async (pageType: string) => {
 await api.a2pUpdatePageUrl(record.id, pageType, urlValue);
 setEditingUrl(null);
 onRefresh();
 };

 const handleStatusToggle = async (pageType: string, currentStatus: string) => {
 const next = currentStatus === 'pass' ? 'fail' : currentStatus === 'fail' ? 'missing' : 'pass';
 await api.a2pUpdatePageStatus(record.id, pageType, next);
 onRefresh();
 };

 const hasAnalysis = analysis && (
 analysis.contact_page_analysis || analysis.privacy_policy_analysis ||
 analysis.terms_of_service_analysis || analysis.sms_policy_analysis
 );

 return (
 <td colSpan={9} className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4">
 <div className="grid grid-cols-2 gap-4 max-w-4xl">
 <div>
 <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Business Info</h4>
 <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
 <div><span className="text-slate-400 dark:text-slate-500 w-16 inline-block">Name:</span> {record.business_name || '—'}</div>
 <div><span className="text-slate-400 dark:text-slate-500 w-16 inline-block">Domain:</span> {record.domain ? (
 <a href={`https://${record.domain}`} target="_blank" rel="noopener noreferrer"
 className="text-teal-600 dark:text-teal-400 hover:underline">{record.domain} <ExternalLink size={10} className="inline" /></a>
 ) : <span className="text-red-500 dark:text-red-400">Missing</span>}</div>
 <div><span className="text-slate-400 dark:text-slate-500 w-16 inline-block">Phone:</span> {record.phone || '—'}</div>
 <div><span className="text-slate-400 dark:text-slate-500 w-16 inline-block">GHL ID:</span> <span className="font-mono text-[10px]">{record.ghl_location_id || '—'}</span></div>
 {record.last_scanned_at && (
 <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Last scanned: {new Date(record.last_scanned_at).toLocaleString()}</div>
 )}
 </div>
 <div className="mt-2 flex gap-2">
 <button onClick={() => onScan(record.company_id, record.id)} disabled={isScanning || !record.domain}
 className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
 {isScanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
 {isScanning ? 'Scanning...' : 'Scan'}
 </button>
 <button onClick={() => onAnalyze(record.company_id, record.id)} disabled={isAnalyzing || !record.last_scanned_at}
 className="flex items-center gap-1.5 rounded border border-indigo-300 dark:border-indigo-800 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50">
 {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
 {isAnalyzing ? 'Analyzing...' : 'Analyze'}
 </button>
 <button onClick={() => onGenerate(record.company_id, record.id)} disabled={isGenerating}
 className="flex items-center gap-1.5 rounded border border-amber-300 dark:border-amber-800 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50">
 {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
 {isGenerating ? 'Generating...' : 'Generate'}
 </button>
 </div>
 </div>

 <div>
 <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Required Pages</h4>
 <div className="space-y-2">
 {PAGE_TYPES.map(({ key, label, urlField, statusField }) => {
 const url = record[urlField as keyof A2PComplianceRecord] as string | null;
 const status = record[statusField as keyof A2PComplianceRecord] as A2PPageStatus;
 const isEditing = editingUrl === key;

 return (
 <div key={key} className="flex items-center gap-2 text-xs">
 <button onClick={() => handleStatusToggle(key, status)}
 className="flex-shrink-0 hover:opacity-70" title={`Status: ${status} (click to cycle)`}>
 <PageStatusIcon status={status} />
 </button>
 <span className="w-28 text-slate-600 dark:text-slate-400 font-medium">{label}</span>
 {isEditing ? (
 <div className="flex items-center gap-1 flex-1">
 <input type="text" value={urlValue} onChange={e => setUrlValue(e.target.value)}
 className="flex-1 px-1.5 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
 placeholder="https://..." autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveUrl(key)} />
 <button onClick={() => handleSaveUrl(key)} className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-400 text-xs font-medium">Save</button>
 <button onClick={() => setEditingUrl(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X size={12} /></button>
 </div>
 ) : (
 <div className="flex items-center gap-1 flex-1 min-w-0">
 {url ? (
 <a href={url} target="_blank" rel="noopener noreferrer"
 className="text-teal-600 dark:text-teal-400 hover:underline truncate">{url}</a>
 ) : (
 <span className="text-slate-400 dark:text-slate-500 italic">Not set</span>
 )}
 <button onClick={() => { setEditingUrl(key); setUrlValue(url || ''); }}
 className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 flex-shrink-0 ml-1" title="Edit URL">
 <HelpCircle size={11} />
 </button>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </div>

 {/* Analysis Results */}
 {hasAnalysis && (
 <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
 <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Analysis Results</h4>
 <div className="grid grid-cols-2 gap-4 max-w-4xl">
 <div>
 <AnalysisSection analysis={analysis!.contact_page_analysis} label="Contact Page" />
 <AnalysisSection analysis={analysis!.privacy_policy_analysis} label="Privacy Policy" />
 </div>
 <div>
 <AnalysisSection analysis={analysis!.terms_of_service_analysis} label="Terms of Service" />
 <AnalysisSection analysis={analysis!.sms_policy_analysis} label="SMS Policy" />
 </div>
 </div>
 </div>
 )}

 {/* Generated Content */}
 {generatedContent.length > 0 && (
 <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Generated Content</h4>
 <div className="flex items-center gap-2">
 {exportResult && <span className="text-[10px] text-teal-600 dark:text-teal-400">{exportResult}</span>}
 {driveLinked === false && (
 <span className="text-[10px] text-amber-600 dark:text-amber-400">No Drive folder linked</span>
 )}
 <button onClick={async () => {
 if (!driveLinked) return;
 setExportingAll(true);
 setExportResult(null);
 const result = await api.a2pExportAllToDrive(record.company_id);
 setExportingAll(false);
 if (result.success) {
 setExportResult(`Exported ${result.exported} docs to Drive`);
 } else {
 setExportResult(result.error || 'Export failed');
 }
 api.a2pGetGeneratedContent(record.id).then(d => setGeneratedContent(d as Array<Record<string, unknown>>));
 }} disabled={exportingAll || driveLinked === false}
 className="flex items-center gap-1 rounded border border-blue-300 dark:border-blue-800 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50">
 {exportingAll ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
 Export All to Drive
 </button>
 </div>
 </div>
 <div className="space-y-2">
 {generatedContent.map(c => {
 const id = c.id as string;
 const pageType = c.page_type as string;
 const status = c.content_status as string;
 const genAt = c.generated_at as string;
 const driveUrl = c.drive_file_url as string | null;
 const pageLabel = PAGE_TYPES.find(p => p.key === pageType)?.label || pageType;
 const isPreview = previewContent?.id === id;
 const isExporting = exportingId === id;

 return (
 <div key={id}>
 <div className="flex items-center gap-2 text-xs">
 <FileText size={12} className="text-amber-600 dark:text-amber-400" />
 <span className="font-medium text-slate-700 dark:text-slate-300">{pageLabel}</span>
 <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
 status === 'exported' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700'
 }`}>{status === 'exported' ? 'Exported' : 'Draft'}</span>
 <span className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(genAt).toLocaleString()}</span>

 <div className="ml-auto flex items-center gap-1.5">
 <button onClick={() => {
 if (isPreview) { setPreviewContent(null); }
 else { setPreviewContent({ title: pageLabel, md: c.content_md as string, id }); }
 }} className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-400 text-[10px] font-medium">
 {isPreview ? 'Hide' : 'Preview'}
 </button>
 <button onClick={() => {
 navigator.clipboard.writeText(c.content_md as string);
 setCopied(id);
 setTimeout(() => setCopied(null), 2000);
 }} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300" title="Copy Markdown">
 <Copy size={11} />
 </button>
 {copied === id && <span className="text-[10px] text-green-600 dark:text-green-400">Copied!</span>}

 {/* Export / In Drive button */}
 {status === 'exported' && driveUrl ? (
 <a href={driveUrl} target="_blank" rel="noopener noreferrer"
 className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-400 font-medium">
 <CheckCircle2 size={10} /> In Drive <ExternalLink size={8} />
 </a>
 ) : (
 <button onClick={async () => {
 if (!driveLinked) return;
 setExportingId(id);
 const result = await api.a2pExportToDrive(id);
 setExportingId(null);
 if (!result.success) {
 setExportResult(result.error || 'Export failed');
 }
 api.a2pGetGeneratedContent(record.id).then(d => setGeneratedContent(d as Array<Record<string, unknown>>));
 }} disabled={isExporting || driveLinked === false}
 className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-400 font-medium disabled:opacity-50">
 {isExporting ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
 Drive
 </button>
 )}
 </div>
 </div>

 {isPreview && previewContent && (
 <ContentPreviewModal
 title={previewContent.title}
 markdown={previewContent.md}
 contentId={previewContent.id}
 onClose={() => setPreviewContent(null)}
 onSaved={() => {
 api.a2pGetGeneratedContent(record.id).then(d => setGeneratedContent(d as Array<Record<string, unknown>>));
 setPreviewContent(null);
 }}
 />
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}
 </td>
 );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function A2PPage() {
 const [search, setSearch] = useState('');
 const [filter, setFilter] = useState('');
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [bootstrapping, setBootstrapping] = useState(false);
 const [bootstrapResult, setBootstrapResult] = useState<string | null>(null);
 const [scanning, setScanning] = useState(false);
 const [scanProgress, setScanProgress] = useState<{ name: string; index: number; total: number } | null>(null);
 const [scanResult, setScanResult] = useState<string | null>(null);
 const [scanningRowId, setScanningRowId] = useState<string | null>(null);
 const [analyzing, setAnalyzing] = useState(false);
 const [analyzeProgress, setAnalyzeProgress] = useState<{ name: string; index: number; total: number } | null>(null);
 const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
 const [analyzingRowId, setAnalyzingRowId] = useState<string | null>(null);

 const recordsFetcher = useCallback(
 () => api.a2pGetAll({ status: filter || undefined, search: search || undefined }),
 [filter, search]
 );
 const { data: recordsRaw, loading, refresh } = useAutoRefresh(recordsFetcher, [filter, search]);
 const records = (recordsRaw || []) as A2PComplianceRecord[];

 const statsFetcher = useCallback(() => api.a2pGetStats(), []);
 const { data: stats, refresh: refreshStats } = useAutoRefresh(statsFetcher, []);

 const handleBootstrap = async () => {
 setBootstrapping(true);
 setBootstrapResult(null);
 const result = await api.a2pBootstrap();
 setBootstrapResult(result.success ? `Created ${result.created} A2P records` : 'Bootstrap failed');
 setBootstrapping(false);
 refresh();
 refreshStats();
 };

 const handleRefresh = () => {
 refresh();
 refreshStats();
 };

 // Listen for scan progress events
 useEffect(() => {
 const handler = (...args: unknown[]) => {
 const data = args[1] as { name: string; index: number; total: number };
 if (data) setScanProgress(data);
 };
 api.onA2PScanProgress(handler);
 return () => api.offA2PScanProgress(handler);
 }, []);

 const handleScanAll = async () => {
 setScanning(true);
 setScanResult(null);
 setScanProgress(null);
 const result = await api.a2pScanAll();
 setScanProgress(null);
 setScanResult(`Scanned ${result.scanned} sites. ${result.errors > 0 ? `${result.errors} errors.` : 'No errors.'}`);
 setScanning(false);
 handleRefresh();
 };

 const handleScanOne = async (companyId: string, a2pId: string) => {
 setScanningRowId(a2pId);
 await api.a2pScanOne(companyId);
 setScanningRowId(null);
 handleRefresh();
 };

 // Listen for analyze progress events
 useEffect(() => {
 const handler = (...args: unknown[]) => {
 const data = args[1] as { name: string; index: number; total: number };
 if (data) setAnalyzeProgress(data);
 };
 api.onA2PAnalyzeProgress(handler);
 return () => api.offA2PAnalyzeProgress(handler);
 }, []);

 const handleAnalyzeAll = async () => {
 setAnalyzing(true);
 setAnalyzeResult(null);
 setAnalyzeProgress(null);
 const result = await api.a2pAnalyzeAll();
 setAnalyzeProgress(null);
 setAnalyzeResult(`Analyzed ${result.analyzed} companies. ${result.errors > 0 ? `${result.errors} errors.` : 'No errors.'}`);
 setAnalyzing(false);
 handleRefresh();
 };

 const handleAnalyzeOne = async (companyId: string, a2pId: string) => {
 setAnalyzingRowId(a2pId);
 await api.a2pAnalyzeOne(companyId);
 setAnalyzingRowId(null);
 handleRefresh();
 };

 // Listen for generate progress events
 useEffect(() => {
 const handler = (...args: unknown[]) => {
 const data = args[1] as { name: string; index: number; total: number };
 if (data) setGenerateProgress(data);
 };
 api.onA2PGenerateProgress(handler);
 return () => api.offA2PGenerateProgress(handler);
 }, []);

 const [schedule, setSchedule] = useState<{ enabled: boolean; frequencyDays: number; lastRunAt: string | null; nextRunAt: string | null } | null>(null);

 // Load schedule config
 useEffect(() => {
 api.a2pGetSchedule().then(setSchedule);
 }, []);

 const handleScheduleChange = async (enabled: boolean, freq: number) => {
 await api.a2pSetSchedule(enabled, freq);
 const updated = await api.a2pGetSchedule();
 setSchedule(updated);
 };

 const [generating, setGenerating] = useState(false);
 const [generateProgress, setGenerateProgress] = useState<{ name: string; index: number; total: number } | null>(null);
 const [generateResult, setGenerateResult] = useState<string | null>(null);
 const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);

 const handleGenerateAll = async () => {
 setGenerating(true);
 setGenerateResult(null);
 setGenerateProgress(null);
 const result = await api.a2pGenerateAll();
 setGenerateProgress(null);
 setGenerateResult(`Generated ${result.generated} pages. ${result.errors > 0 ? `${result.errors} errors.` : 'No errors.'}`);
 setGenerating(false);
 handleRefresh();
 };

 const handleGenerateOne = async (companyId: string, a2pId: string) => {
 setGeneratingRowId(a2pId);
 await api.a2pGenerateContent(companyId);
 setGeneratingRowId(null);
 handleRefresh();
 };

 const busy = scanning || analyzing || bootstrapping || generating;

 if (loading && !records.length) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

 return (
 <div className="flex h-full flex-col">
 {/* Header */}
 <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3">
 <div className="flex-1 min-w-0">
 <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
 <ShieldCheck size={20} /> A2P &mdash; 10DLC Compliance
 </h1>
 {!busy && bootstrapResult && <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{bootstrapResult}</p>}
 {!busy && scanResult && <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{scanResult}</p>}
 {!busy && analyzeResult && <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{analyzeResult}</p>}
 {!busy && generateResult && <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">{generateResult}</p>}
 {scanning && scanProgress && (
 <div className="mt-1.5 max-w-md">
 <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
 <span className="truncate mr-2">Scanning: {scanProgress.name}</span>
 <span className="flex-shrink-0">{scanProgress.index}/{scanProgress.total}</span>
 </div>
 <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
 <div className="h-full bg-teal-50 dark:bg-teal-950/30 rounded-full transition-all duration-300"
 style={{ width: `${Math.round((scanProgress.index / scanProgress.total) * 100)}%` }} />
 </div>
 </div>
 )}
 {scanning && !scanProgress && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Starting scan...</p>}
 {analyzing && analyzeProgress && (
 <div className="mt-1.5 max-w-md">
 <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
 <span className="truncate mr-2">Analyzing: {analyzeProgress.name}</span>
 <span className="flex-shrink-0">{analyzeProgress.index}/{analyzeProgress.total}</span>
 </div>
 <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
 <div className="h-full bg-indigo-50 dark:bg-indigo-950/30 rounded-full transition-all duration-300"
 style={{ width: `${Math.round((analyzeProgress.index / analyzeProgress.total) * 100)}%` }} />
 </div>
 </div>
 )}
 {analyzing && !analyzeProgress && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Starting analysis...</p>}
 {generating && generateProgress && (
 <div className="mt-1.5 max-w-md">
 <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
 <span className="truncate mr-2">Generating: {generateProgress.name}</span>
 <span className="flex-shrink-0">{generateProgress.index}/{generateProgress.total}</span>
 </div>
 <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
 <div className="h-full bg-amber-50 dark:bg-amber-950/30 rounded-full transition-all duration-300"
 style={{ width: `${Math.round((generateProgress.index / generateProgress.total) * 100)}%` }} />
 </div>
 </div>
 )}
 {generating && !generateProgress && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Starting generation...</p>}
 </div>
 <div className="flex items-center gap-2">
 <button onClick={handleRefresh} title="Refresh"
 className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
 <RefreshCw size={13} /> Refresh
 </button>
 <button onClick={handleBootstrap} disabled={busy}
 className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
 {bootstrapping ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
 Bootstrap
 </button>
 <button onClick={handleScanAll} disabled={busy}
 className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
 {scanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
 Scan All
 </button>
 <button onClick={handleAnalyzeAll} disabled={busy}
 className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
 {analyzing ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
 Analyze All
 </button>
 <button onClick={handleGenerateAll} disabled={busy}
 className="flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
 {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
 Generate All
 </button>
 </div>
 </div>

 {/* Stats */}
 {stats && (
 <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900">
 <div className="grid grid-cols-6 gap-3">
 <StatCard value={stats.total} label="Total" color="text-slate-700 dark:text-slate-300" bg="bg-slate-50 dark:bg-slate-800/80"
 active={filter === ''} onClick={() => setFilter('')} />
 <StatCard value={stats.compliant} label="Compliant" color="text-green-700 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30"
 active={filter === 'compliant'} onClick={() => setFilter(f => f === 'compliant' ? '' : 'compliant')} />
 <StatCard value={stats.partial} label="Partial" color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30"
 active={filter === 'partial'} onClick={() => setFilter(f => f === 'partial' ? '' : 'partial')} />
 <StatCard value={stats.non_compliant} label="Non-Compliant" color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30"
 active={filter === 'non_compliant'} onClick={() => setFilter(f => f === 'non_compliant' ? '' : 'non_compliant')} />
 <StatCard value={stats.pending} label="Pending" color="text-slate-500 dark:text-slate-400" bg="bg-slate-50 dark:bg-slate-800/80"
 active={filter === 'pending'} onClick={() => setFilter(f => f === 'pending' ? '' : 'pending')} />
 <StatCard value={stats.no_website} label="No Website" color="text-purple-700 dark:text-purple-400" bg="bg-purple-50 dark:bg-purple-950/30"
 active={filter === 'no_website'} onClick={() => setFilter(f => f === 'no_website' ? '' : 'no_website')} />
 </div>
 </div>
 )}

 {/* Schedule */}
 {schedule && (
 <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
 <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
 <input type="checkbox" checked={schedule.enabled}
 onChange={e => handleScheduleChange(e.target.checked, schedule.frequencyDays)}
 className="rounded border-slate-300 dark:border-slate-600 text-teal-600 dark:text-teal-400 focus:ring-teal-500" />
 Auto-scan every
 </label>
 <select value={schedule.frequencyDays} disabled={!schedule.enabled}
 onChange={e => handleScheduleChange(schedule.enabled, parseInt(e.target.value, 10))}
 className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs disabled:opacity-50">
 <option value="30">30 days</option>
 <option value="90">90 days</option>
 <option value="180">180 days</option>
 <option value="365">365 days</option>
 </select>
 {schedule.enabled && schedule.lastRunAt && (
 <span className="text-[10px] text-slate-400 dark:text-slate-500">Last: {new Date(schedule.lastRunAt).toLocaleDateString()}</span>
 )}
 {schedule.enabled && schedule.nextRunAt && (
 <span className="text-[10px] text-slate-400 dark:text-slate-500">Next: {new Date(schedule.nextRunAt).toLocaleDateString()}</span>
 )}
 {schedule.enabled && (
 <span className="text-[10px] text-teal-600 dark:text-teal-400">Runs scan + analyze + generate at 3 AM</span>
 )}
 </div>
 )}

 {/* Search */}
 <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-900 px-6 py-2">
 <div className="relative flex-1 max-w-xs">
 <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
 <input type="text" placeholder="Search businesses..." value={search}
 onChange={e => setSearch(e.target.value)}
 className="w-full rounded border border-slate-200 dark:border-slate-700 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
 {search && <button onClick={() => setSearch('')}
 className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"><X size={14} /></button>}
 </div>
 <span className="text-xs text-slate-400 dark:text-slate-500">{records.length} records</span>
 </div>

 {/* Table */}
 <div className="flex-1 overflow-auto">
 {records.length === 0 ? (
 <div className="p-6 text-center">
 <ShieldCheck size={48} className="mx-auto text-slate-300 dark:text-slate-500 mb-3" />
 <p className="text-sm text-slate-500 dark:text-slate-400">
 {(stats?.total ?? 0) === 0
 ? 'No A2P records yet. Click "Bootstrap from GHL" to populate from your sub-accounts.'
 : 'No records match your filter.'}
 </p>
 </div>
 ) : (
 <table className="w-full text-left text-sm">
 <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
 <tr>
 <th className="w-8 px-4 py-2" />
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Business</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Domain</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Phone</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center" title="Contact Page">Contact</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center" title="Privacy Policy">Privacy</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center" title="Terms of Service">ToS</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 text-center" title="SMS/Messaging Policy">SMS</th>
 <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Status</th>
 </tr>
 </thead>
 <tbody>
 {records.map(r => {
 const isExpanded = expandedId === r.id;
 return (
 <React.Fragment key={r.id}>
 <tr onClick={() => setExpandedId(isExpanded ? null : r.id)}
 className="cursor-pointer border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
 <td className="px-4 py-2.5">
 {isExpanded ? <ChevronDown size={14} className="text-slate-400 dark:text-slate-500" /> : <ChevronRight size={14} className="text-slate-400 dark:text-slate-500" />}
 </td>
 <td className="px-3 py-2.5">
 <div className="font-medium text-slate-900 dark:text-slate-100">{r.business_name || r.company_name || '—'}</div>
 {r.company_name && r.business_name && r.business_name !== r.company_name && (
 <div className="text-[10px] text-slate-400 dark:text-slate-500">{r.company_name}</div>
 )}
 </td>
 <td className="px-3 py-2.5 text-xs">
 <InlineEditCell value={r.domain} placeholder="Missing"
 onSave={v => { api.a2pUpdateDomain(r.id, v).then(handleRefresh); }} />
 </td>
 <td className="px-3 py-2.5 text-xs">
 <InlineEditCell value={r.phone} placeholder="—"
 onSave={v => { api.a2pUpdatePhone(r.id, v).then(handleRefresh); }} />
 </td>
 <td className="px-3 py-2.5 text-center"><PageStatusIcon status={r.contact_page_status} /></td>
 <td className="px-3 py-2.5 text-center"><PageStatusIcon status={r.privacy_policy_status} /></td>
 <td className="px-3 py-2.5 text-center"><PageStatusIcon status={r.terms_of_service_status} /></td>
 <td className="px-3 py-2.5 text-center"><PageStatusIcon status={r.sms_policy_status} /></td>
 <td className="px-3 py-2.5"><StatusBadge status={r.overall_status} /></td>
 </tr>
 {isExpanded && (
 <tr><RowDetail record={r} onRefresh={handleRefresh} scanningRowId={scanningRowId} onScan={handleScanOne} analyzingRowId={analyzingRowId} onAnalyze={handleAnalyzeOne} generatingRowId={generatingRowId} onGenerate={handleGenerateOne} /></tr>
 )}
 </React.Fragment>
 );
 })}
 </tbody>
 </table>
 )}
 </div>
 </div>
 );
}
