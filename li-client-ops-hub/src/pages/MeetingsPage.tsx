import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, X, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Loader2, Users, FileText, Download, Table2, Check, Link2, LinkIcon, ClipboardCopy, Share2, Unlink } from 'lucide-react';
import { api } from '../lib/ipc';
import type { Meeting, ReadAiSyncState, ReadAiOvernightStatus } from '../types';

type SyncRange = 'today' | 'week' | 'month' | 'quarter' | 'year';

interface Participant {
  name?: string;
  email?: string;
  invited?: boolean;
  attended?: boolean;
}

interface ContactMatch {
  email: string;
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  ghl_location_id: string | null;
}

interface MeetingRow extends Meeting {
  company_name?: string | null;
  ghl_location_id?: string | null;
}

// ── Export helpers ────────────────────────────────────────────────────

function formatPST(ms: number | null): { date: string; time: string } {
  if (!ms) return { date: '', time: '' };
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Los_Angeles' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PST',
  };
}

function extractEmails(participantsJson: string | null): string {
  if (!participantsJson) return '';
  try {
    const parsed = JSON.parse(participantsJson) as Array<{ email?: string }>;
    return parsed.map(p => p.email || '').filter(Boolean).join('; ');
  } catch { return ''; }
}

function escapeCsvField(value: string): string {
  if (!value) return '';
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

async function buildExportRows(meetings: MeetingRow[]): Promise<string[][]> {
  const headers = ['Title', 'Date (PST)', 'Time (PST)', 'Attendee Emails', 'Summary', 'Transcript', 'Report Link'];
  const rows: string[][] = [headers];
  for (const m of meetings) {
    const { date, time } = formatPST(m.start_time_ms);
    let transcript = m.transcript_text || '';
    if (!transcript && m.expanded) {
      try { transcript = (await api.readaiGetTranscript(m.id)) || ''; } catch { /* ignore */ }
    }
    rows.push([
      m.title || 'Untitled Meeting', date, time,
      extractEmails(m.participants_json), m.summary || '', transcript, m.report_url || '',
    ]);
  }
  return rows;
}

function downloadCsv(rows: string[][], filename: string): void {
  const csv = rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function copyTsvForSheets(rows: string[][]): void {
  const tsv = rows.map(row =>
    row.map(cell => cell.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')
  ).join('\n');
  navigator.clipboard.writeText(tsv);
}

// ── Copy Icon Button ─────────────────────────────────────────────────

function CopyIconButton({ icon, tooltip, tooltipSuccess, value, fetchValue, disabled }: {
  icon: React.ReactNode; tooltip: string; tooltipSuccess: string;
  value?: string | null; fetchValue?: () => Promise<string | null>; disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    let text = value;
    if (!text && fetchValue) text = await fetchValue();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleClick} disabled={disabled}
      className={`relative p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
      title={copied ? tooltipSuccess : tooltip}>
      {icon}
      {copied && <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-600 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-50">{tooltipSuccess}</span>}
    </button>
  );
}

// ── Sync Dropdown ────────────────────────────────────────────────────

function SyncDropdown({ onSync, syncing }: { onSync: (range: SyncRange) => void; syncing: boolean }) {
  const [open, setOpen] = useState(false);
  const options: Array<{ range: SyncRange; label: string; note: string }> = [
    { range: 'today', label: 'Sync Today', note: 'instant' },
    { range: 'week', label: 'Past Week', note: 'instant' },
    { range: 'month', label: 'Past Month', note: '~2 min' },
    { range: 'quarter', label: 'Past Quarter', note: '~5 min' },
    { range: 'year', label: 'Past Year', note: '~10 min' },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={syncing}
        className="px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium">
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Sync Meetings <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 w-56 py-1">
            {options.map((opt, i) => (
              <Fragment key={opt.range}>
                {i === 2 && <div className="border-t border-slate-100 dark:border-slate-700/50 my-1" />}
                <button onClick={() => { onSync(opt.range); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">{opt.note}</span>
                </button>
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sync Details Dropdown ────────────────────────────────────────────

function SyncDetailsDropdown({ onSync, syncing }: { onSync: (range: SyncRange) => void; syncing: boolean }) {
  const [open, setOpen] = useState(false);
  const options: Array<{ range: SyncRange; label: string; note: string }> = [
    { range: 'today', label: 'Today', note: 'instant' },
    { range: 'week', label: 'Past Week', note: '~1 min' },
    { range: 'month', label: 'Past Month', note: '~5 min' },
    { range: 'quarter', label: 'Past Quarter', note: '~15 min' },
    { range: 'year', label: 'Past Year', note: '~30 min' },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={syncing}
        className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium">
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
        Sync Details <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-50 w-56 py-1">
            <div className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fetch summaries + transcripts</div>
            {options.map((opt, i) => (
              <Fragment key={opt.range}>
                {i === 2 && <div className="border-t border-slate-100 dark:border-slate-700/50 my-1" />}
                <button onClick={() => { onSync(opt.range); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">{opt.note}</span>
                </button>
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Participants Cell with click-to-toggle popover ───────────────────

function ParticipantsCell({ participants, contactMap }: {
  participants: Array<{ name: string; email: string }>;
  contactMap: Map<string, ContactMatch>;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
        setCopiedEmail(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  if (participants.length === 0) return <span className="text-xs text-slate-300 dark:text-slate-600 italic">No attendees</span>;

  const handleCopyEmail = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleOpenGhl = (contact: ContactMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    if (contact.ghl_contact_id && contact.ghl_location_id) {
      api.openInChrome(`https://app.gohighlevel.com/v2/location/${contact.ghl_location_id}/contacts/detail/${contact.ghl_contact_id}`);
    }
  };

  // Inline display: show names colored by link status
  const displayNames = participants.slice(0, 3).map((p, i) => {
    const isLinked = p.email && contactMap.has(p.email.toLowerCase());
    return (
      <span key={i}>
        {i > 0 && <span className="text-slate-400">, </span>}
        <span className={isLinked ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{p.name}</span>
      </span>
    );
  });

  return (
    <div className="relative" ref={popoverRef} style={showPopover ? { zIndex: 60 } : undefined}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowPopover(!showPopover); }}
        className="block cursor-pointer text-xs text-left hover:underline decoration-dotted line-clamp-2 break-words"
      >
        {displayNames}
        {participants.length > 3 && <span className="text-slate-400 dark:text-slate-500"> +{participants.length - 3}</span>}
      </button>
      {showPopover && (
        <div className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-2xl py-1.5 w-80"
          style={{
            zIndex: 9999,
            left: popoverRef.current ? popoverRef.current.getBoundingClientRect().left : 0,
            top: popoverRef.current ? popoverRef.current.getBoundingClientRect().bottom + 4 : 0,
          }}
          onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {participants.length} Attendee{participants.length !== 1 ? 's' : ''}
          </div>
          {participants.map((p, i) => {
            const contact = p.email ? contactMap.get(p.email.toLowerCase()) : undefined;
            const isLinked = !!contact?.ghl_contact_id && !!contact?.ghl_location_id;
            const isCopied = copiedEmail === p.email;
            return (
              <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700">
                {isLinked
                  ? <span title="Linked in GHL"><Link2 size={11} className="text-green-500 shrink-0" /></span>
                  : <span title="Not linked in GHL"><Unlink size={11} className="text-red-400 shrink-0" /></span>}
                <button
                  onClick={(e) => p.email && handleCopyEmail(p.email, e)}
                  className={`font-medium truncate cursor-pointer hover:underline ${isLinked ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  title={p.email ? (isCopied ? 'Copied!' : `Copy ${p.email}`) : 'No email'}
                  disabled={!p.email}
                >
                  {isCopied ? 'Copied!' : p.name}
                </button>
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {isLinked && contact && (
                    <button onClick={(e) => handleOpenGhl(contact, e)}
                      className="p-0.5 rounded hover:bg-green-50 text-green-600 hover:text-green-800"
                      title="Open in GHL">
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Meeting Row ──────────────────────────────────────────────────────

function MeetingTableRow({ meeting, contactMap, isExpanded, onToggle }: {
  meeting: MeetingRow; contactMap: Map<string, ContactMatch>;
  isExpanded: boolean; onToggle: () => void;
}) {
  const date = meeting.start_time_ms ? new Date(meeting.start_time_ms) : null;

  const dayOfWeek = date
    ? date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })
    : '\u2014';
  const dateStr = date
    ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Los_Angeles' })
    : '\u2014';
  const timeStr = date
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PST'
    : '\u2014';

  const hasTranscript = !!(meeting.transcript_text || meeting.expanded === 1);
  const hasReportUrl = !!meeting.report_url;

  let participants: Array<{ name: string; email: string }> = [];
  try {
    const parsed = meeting.participants_json ? JSON.parse(meeting.participants_json) : [];
    participants = parsed.map((p: Participant) => ({
      name: (p.name || p.email || '').trim(),
      email: (p.email || '').trim(),
    })).filter((p: { name: string }) => p.name);
  } catch { /* ignore */ }

  return (
    <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer ${isExpanded ? 'bg-slate-50 dark:bg-slate-800' : ''}`}
      onClick={onToggle}>
      <td className="px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-medium overflow-hidden">
        <div className="line-clamp-2 break-words">
          {meeting.title || 'Untitled Meeting'}
          {meeting.company_name && <span className="ml-1 text-[11px] text-teal-600 dark:text-teal-400 font-normal">{meeting.company_name}</span>}
        </div>
      </td>
      <td className="px-2 py-2.5 text-xs text-slate-500 dark:text-slate-400 text-center">{dayOfWeek}</td>
      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-400">{dateStr}</td>
      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-400">{timeStr}</td>
      <td className="px-3 py-2.5 overflow-hidden" onClick={e => e.stopPropagation()}>
        <ParticipantsCell participants={participants} contactMap={contactMap} />
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 overflow-hidden">
        <span className="line-clamp-2 break-words">{meeting.summary || <span className="text-slate-300 dark:text-slate-600 italic">No summary</span>}</span>
      </td>
      <td className="px-1 py-2.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-0.5 justify-center">
          <CopyIconButton icon={<FileText size={13} />}
            tooltip={hasTranscript ? `Copy transcript of "${meeting.title || 'Untitled'}"` : 'No transcript available'}
            tooltipSuccess="Transcript copied!"
            fetchValue={async () => api.readaiGetTranscript(meeting.id)}
            disabled={!hasTranscript} />
          <CopyIconButton icon={<Share2 size={13} />}
            tooltip="Copy report link" tooltipSuccess="Link copied!"
            value={meeting.report_url} disabled={!hasReportUrl} />
        </div>
      </td>
    </tr>
  );
}

// ── Score Card ───────────────────────────────────────────────────────

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  if (value == null) return (
    <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-slate-300 dark:text-slate-600">&mdash;</div>
    </div>
  );

  // Read.ai returns: read_score as 0-100, engagement/sentiment as 0-1 decimals
  // Normalize all to 0-100 scale
  const normalized = value <= 1 && value >= 0 ? Math.round(value * 100) : Math.round(value);
  const color = normalized >= 70 ? 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/50'
    : normalized >= 40 ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/50'
    : 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30';

  return (
    <div className={`flex-1 rounded-lg border px-4 py-3 text-center ${color}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-xl font-bold">{normalized}</div>
    </div>
  );
}

// ── Meeting Detail Panel ─────────────────────────────────────────────

function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

/** Unwrap API data that might be nested in { data: [...] } or { items: [...] } */
function parseJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed.data)) return parsed.data;
      if (Array.isArray(parsed.items)) return parsed.items;
      if (Array.isArray(parsed.action_items)) return parsed.action_items;
      if (Array.isArray(parsed.topics)) return parsed.topics;
      if (Array.isArray(parsed.key_questions)) return parsed.key_questions;
      if (Array.isArray(parsed.questions)) return parsed.questions;
    }
    return [];
  } catch { return []; }
}

function MeetingDetail({ meeting, onClose }: { meeting: MeetingRow; onClose: () => void }) {
  const [copyAllDone, setCopyAllDone] = useState(false);

  const date = meeting.start_time_ms ? new Date(meeting.start_time_ms) : null;
  const dateStr = date ? date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  }) : '';
  const timeStr = date ? date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  }) + ' PST' : '';

  const actionItems = parseJsonArray<{ text?: string; description?: string; title?: string; assignee?: { name?: string } | string; completed?: boolean; due_date?: string; dueDate?: string }>(meeting.action_items_json);
  const topics = parseJsonArray<string>(meeting.topics_json);
  const keyQuestions = parseJsonArray<string>(meeting.key_questions_json);
  const participants = parseJson<Participant[]>(meeting.participants_json, []);

  const formatActionItem = (item: typeof actionItems[0]) => {
    const text = item.text || item.description || item.title || '';
    const assignee = typeof item.assignee === 'object' ? item.assignee?.name : item.assignee;
    const status = item.completed ? 'done' : 'open';
    const due = item.due_date || item.dueDate;
    return { text, assignee: assignee || null, status, due: due || null };
  };

  // Build section text for copy
  const summaryText = meeting.summary || '';
  const actionItemsText = actionItems.map(a => {
    const f = formatActionItem(a);
    return `- ${f.text}${f.assignee ? ` (${f.assignee})` : ''} [${f.status}]${f.due ? ` due ${f.due}` : ''}`;
  }).join('\n');
  const topicsText = topics.join(', ');
  const questionsText = keyQuestions.map(q => `- ${q}`).join('\n');
  const highlightsText = (topicsText ? `Topics: ${topicsText}\n` : '') + (questionsText ? `Key Questions:\n${questionsText}` : '');

  const handleCopyAll = async () => {
    const participantNames = participants.map(p => p.name || p.email || '').filter(Boolean).join(', ');
    let transcript = meeting.transcript_text || '';
    if (!transcript) {
      try { transcript = (await api.readaiGetTranscript(meeting.id)) || ''; } catch { /* */ }
    }

    const blocks = [
      `Meeting: ${meeting.title || 'Untitled'}`,
      `Date: ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`,
      meeting.duration_minutes ? `Duration: ${meeting.duration_minutes}m` : '',
      meeting.platform ? `Platform: ${meeting.platform}` : '',
      meeting.owner_name ? `Owner: ${meeting.owner_name}` : '',
      participantNames ? `Participants: ${participantNames}` : '',
      meeting.company_name ? `Company: ${meeting.company_name}` : '',
      '',
      meeting.read_score != null ? `Read Score: ${meeting.read_score}` : '',
      meeting.engagement != null ? `Engagement: ${meeting.engagement <= 1 ? Math.round(meeting.engagement * 100) : Math.round(meeting.engagement)}` : '',
      meeting.sentiment != null ? `Sentiment: ${meeting.sentiment <= 1 ? Math.round(meeting.sentiment * 100) : Math.round(meeting.sentiment)}` : '',
      '',
      summaryText ? `Summary:\n${summaryText}` : '',
      '',
      actionItems.length > 0 ? `Action Items:\n${actionItemsText}` : '',
      '',
      topicsText ? `Topics: ${topicsText}` : '',
      keyQuestions.length > 0 ? `Key Questions:\n${questionsText}` : '',
      '',
      transcript ? `Transcript:\n${transcript}` : '',
      '',
      meeting.report_url ? `Report: ${meeting.report_url}` : '',
    ].filter(Boolean).join('\n');

    await navigator.clipboard.writeText(blocks);
    setCopyAllDone(true);
    setTimeout(() => setCopyAllDone(false), 2000);
  };

  return (
    <td colSpan={7} className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-6 py-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={handleCopyAll}
          className="flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
          <ClipboardCopy size={13} />
          {copyAllDone ? 'Copied!' : 'Copy All Meeting Data'}
        </button>
        <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
          <X size={16} />
        </button>
      </div>

      {/* Score cards */}
      <div className="flex gap-3 mb-4">
        <ScoreCard label="Read Score" value={meeting.read_score} />
        <ScoreCard label="Engagement" value={meeting.engagement} />
        <ScoreCard label="Sentiment" value={meeting.sentiment} />
      </div>

      {/* Summary */}
      {summaryText && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Summary</h4>
            <CopyIconButton icon={<ClipboardCopy size={12} />} tooltip="Copy summary" tooltipSuccess="Copied!" value={summaryText} />
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{summaryText}</p>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Action Items</h4>
            <CopyIconButton icon={<ClipboardCopy size={12} />} tooltip="Copy action items" tooltipSuccess="Copied!" value={actionItemsText} />
          </div>
          <ul className="space-y-1.5">
            {actionItems.map((item, i) => {
              const f = formatActionItem(item);
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${f.status === 'done' ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className={`text-slate-700 dark:text-slate-300 ${f.status === 'done' ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                    {f.text}
                    {f.assignee && <span className="text-slate-400 dark:text-slate-500 ml-1">— {f.assignee}</span>}
                    {f.due && <span className="text-slate-400 dark:text-slate-500 ml-1 text-xs">due {f.due}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Highlights: Topics + Key Questions */}
      {(topics.length > 0 || keyQuestions.length > 0) && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Highlights</h4>
            <CopyIconButton icon={<ClipboardCopy size={12} />} tooltip="Copy highlights" tooltipSuccess="Copied!" value={highlightsText} />
          </div>
          {topics.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase mb-1">Topics</div>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t, i) => (
                  <span key={i} className="rounded-full bg-teal-50 dark:bg-teal-900/50 border border-teal-200 dark:border-teal-800 px-2.5 py-0.5 text-xs text-teal-700 dark:text-teal-400">{typeof t === 'string' ? t : JSON.stringify(t)}</span>
                ))}
              </div>
            </div>
          )}
          {keyQuestions.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 uppercase mb-1">Key Questions</div>
              <ul className="space-y-1">
                {keyQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                    <span className="text-teal-400 mt-0.5 shrink-0">?</span>
                    <span>{typeof q === 'string' ? q : JSON.stringify(q)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!summaryText && actionItems.length === 0 && topics.length === 0 && keyQuestions.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">No detail data available. Try syncing details for this meeting.</p>
      )}
    </td>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function MeetingsPage() {
  const [allMeetings, setAllMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [participantFilter, setParticipantFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [expandingSyncing, setExpandingSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<ReadAiSyncState | null>(null);
  const [page, setPage] = useState(1);
  const [contactMap, setContactMap] = useState<Map<string, ContactMatch>>(new Map());
  const location = useLocation();
  const routeState = location.state as { expandMeetingId?: string } | null;
  const [expandedId, setExpandedId] = useState<string | null>(routeState?.expandMeetingId ?? null);
  const [exporting, setExporting] = useState(false);
  const [sheetsCopied, setSheetsCopied] = useState(false);

  // If navigated here with a meeting to expand, clear the route state
  useEffect(() => {
    if (routeState?.expandMeetingId) {
      window.history.replaceState({}, '');
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    const data = await api.readaiGetMeetingsList(5000, 0) as MeetingRow[];

    // Batch lookup GHL-linked emails
    const allEmails = new Set<string>();
    for (const m of data) {
      try {
        const parsed = m.participants_json ? JSON.parse(m.participants_json) : [];
        for (const p of parsed) { if (p.email) allEmails.add(p.email.toLowerCase()); }
      } catch { /* ignore */ }
    }
    if (allEmails.size > 0) {
      try {
        const matches = await api.getContactsByEmails(Array.from(allEmails)) as ContactMatch[];
        const map = new Map<string, ContactMatch>();
        for (const c of matches) {
          if (c.email) map.set(c.email.toLowerCase(), c);
        }
        setContactMap(map);
      } catch { /* ignore */ }
    }

    setAllMeetings(data);
    setLoading(false);
  }, []);

  const refreshState = useCallback(async () => {
    const state = await api.readaiGetSyncState();
    setSyncState(state);
  }, []);

  useEffect(() => { loadMeetings(); refreshState(); }, []);

  const handleSync = async (range: SyncRange) => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.readaiSyncRange(range);
      setSyncMessage(result.message);
      if (!result.scheduled) await loadMeetings();
      await refreshState();
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleExpandRange = async (range: SyncRange) => {
    setExpandingSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.readaiExpandRange(range);
      setSyncMessage(result.message || `Expanded ${result.expanded} meetings.`);
      await loadMeetings();
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : 'Expand failed');
    } finally {
      setExpandingSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const rows = await buildExportRows(filtered);
      downloadCsv(rows, `meetings-export-${new Date().toISOString().split('T')[0]}.csv`);
    } finally { setExporting(false); }
  };

  const handleCopyForSheets = async () => {
    setExporting(true);
    try {
      const rows = await buildExportRows(filtered);
      copyTsvForSheets(rows);
      setSheetsCopied(true);
      setTimeout(() => setSheetsCopied(false), 2000);
    } finally { setExporting(false); }
  };

  // Unique participants for filter dropdown
  const allParticipants = useMemo(() => {
    const names = new Set<string>();
    for (const m of allMeetings) {
      try {
        const parsed = m.participants_json ? JSON.parse(m.participants_json) : [];
        for (const p of parsed) {
          const name = (p.name || p.email || '').trim();
          if (name) names.add(name);
        }
      } catch { /* ignore */ }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allMeetings]);

  // Filter + sort (most recent first)
  const filtered = useMemo(() => {
    let list = [...allMeetings];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        (m.title ?? '').toLowerCase().includes(q) ||
        (m.summary ?? '').toLowerCase().includes(q) ||
        (m.owner_name ?? '').toLowerCase().includes(q) ||
        (m.company_name ?? '').toLowerCase().includes(q) ||
        (m.participants_json ?? '').toLowerCase().includes(q)
      );
    }

    if (participantFilter) {
      const pf = participantFilter.toLowerCase();
      list = list.filter(m => {
        try {
          const parsed = m.participants_json ? JSON.parse(m.participants_json) : [];
          return parsed.some((p: Participant) =>
            (p.name || '').toLowerCase().includes(pf) || (p.email || '').toLowerCase().includes(pf)
          );
        } catch { return false; }
      });
    }

    if (dateFrom) {
      const fromMs = new Date(dateFrom).getTime();
      list = list.filter(m => (m.start_time_ms ?? 0) >= fromMs);
    }
    if (dateTo) {
      const toMs = new Date(dateTo + 'T23:59:59').getTime();
      list = list.filter(m => (m.start_time_ms ?? 0) <= toMs);
    }

    list.sort((a, b) => (b.start_time_ms ?? 0) - (a.start_time_ms ?? 0));
    return list;
  }, [allMeetings, search, participantFilter, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageEnd);

  useEffect(() => { setPage(1); }, [search, participantFilter, dateFrom, dateTo]);

  const relativeTime = (iso: string | null) => {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading meetings...</div>;

  return (
    <div className="flex h-full flex-col">
      {/* Frozen header */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-teal-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Meetings</h1>
              {syncState && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {syncState.totalMeetingsSynced} synced
                  {syncState.lastSyncAt && <> &middot; Last sync: {relativeTime(syncState.lastSyncAt)}</>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopyForSheets} disabled={exporting || filtered.length === 0}
              title={sheetsCopied ? 'Copied to clipboard!' : 'Copy for Google Sheets'}
              className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
              {sheetsCopied ? <Check size={13} className="text-green-600 dark:text-green-400" /> : <Table2 size={13} />}
              {sheetsCopied ? 'Copied!' : 'Sheets'}
            </button>
            <button onClick={handleExportCsv} disabled={exporting || filtered.length === 0}
              title="Download CSV export"
              className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} CSV
            </button>
            <SyncDetailsDropdown onSync={handleExpandRange} syncing={expandingSyncing || syncing} />
            <SyncDropdown onSync={handleSync} syncing={syncing || expandingSyncing} />
          </div>
        </div>

        {syncMessage && (
          <div className="mx-6 mb-2 rounded bg-teal-50 dark:bg-teal-900/50 px-3 py-1.5 text-xs text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">{syncMessage}</div>
        )}

        {/* Filters */}
        <div className="px-6 py-2 flex items-center gap-3 flex-wrap border-t border-slate-100 dark:border-slate-700/50">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search meetings..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1.5 pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
          </div>
          <select value={participantFilter} onChange={e => setParticipantFilter(e.target.value)}
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm max-w-[200px]">
            <option value="">All Participants</option>
            {allParticipants.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm" />
            <span>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm" />
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{filtered.length} meetings</span>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="mt-10 text-center">
            <Users size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {allMeetings.length === 0 ? 'No meetings synced yet. Click Sync Meetings to import from Read.ai.' : 'No meetings match your filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm table-fixed">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[20%]">Title</th>
                <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center w-[4%]">Day</th>
                <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[8%]">Date</th>
                <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[8%]">Time</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[22%]">Participants</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[32%]">Summary</th>
                <th className="px-1 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center w-[6%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(m => (
                <Fragment key={m.id}>
                  <MeetingTableRow
                    meeting={m}
                    contactMap={contactMap}
                    isExpanded={expandedId === m.id}
                    onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  />
                  {expandedId === m.id && (
                    <tr>
                      <MeetingDetail meeting={m} onClose={() => setExpandedId(null)} />
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Always-visible footer */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-2 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length > 0
            ? `Showing ${pageStart + 1}\u2013${Math.min(pageEnd, filtered.length)} of ${filtered.length} meetings`
            : 'No meetings'}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400 px-2">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
