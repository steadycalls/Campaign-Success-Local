import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Video,
  CheckSquare,
  Square,
  MessageCircle,
  Download,
  Search,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import type { Meeting, ActionItem } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTimestamp(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function highlightSearch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}

// ── Metric Badge ──────────────────────────────────────────────────────

function MetricBadge({ label, value, type }: {
  label: string;
  value: number | null;
  type: 'score' | 'sentiment' | 'engagement';
}) {
  if (value === null || value === undefined) return <span className="text-slate-400 dark:text-slate-500">-</span>;
  let color = 'text-slate-600 dark:text-slate-400';
  if (type === 'sentiment') {
    color = value > 0 ? 'text-green-600' : value > -0.3 ? 'text-amber-600' : 'text-red-600';
  } else {
    color = value > 0.7 ? 'text-green-600' : value > 0.4 ? 'text-amber-600' : 'text-red-600';
  }
  const display = type === 'sentiment' ? value.toFixed(2) : `${Math.round(value * 100)}%`;
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${color}`}>{display}</div>
      <div className="text-[10px] text-slate-400 dark:text-slate-500">{label}</div>
    </div>
  );
}

// ── Transcript Viewer ────────────────────────────────────────────────

function TranscriptViewer({ transcriptText, transcriptJson }: {
  transcriptText: string | null;
  transcriptJson: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Try structured transcript first, fall back to plain text
  let turns: Array<{ speaker?: { name?: string }; text: string; start_time_ms?: number }> = [];
  let firstTimestamp = 0;

  if (transcriptJson) {
    try {
      const parsed = JSON.parse(transcriptJson);
      turns = parsed.turns || parsed.segments || [];
      firstTimestamp = turns[0]?.start_time_ms || 0;
    } catch { /* fallback */ }
  }

  // If structured transcript available, render with speakers + timestamps
  if (turns.length > 0) {
    const filtered = searchQuery
      ? turns.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
      : turns;
    const display = expanded ? filtered : filtered.slice(0, 20);

    return (
      <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-md focus:border-teal-500 focus:outline-none"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
            {filtered.length}/{turns.length} segments
          </span>
        </div>

        <div className="space-y-0.5 max-h-96 overflow-y-auto text-xs">
          {display.map((turn, i) => {
            const ts = turn.start_time_ms ? formatTimestamp(turn.start_time_ms - firstTimestamp) : '';
            return (
              <div key={i} className="flex gap-2 py-0.5">
                {ts && <span className="text-slate-400 dark:text-slate-500 w-10 shrink-0 font-mono text-[10px]">{ts}</span>}
                <span className="font-medium text-slate-700 dark:text-slate-300 shrink-0">{turn.speaker?.name || 'Speaker'}:</span>
                <span className="text-slate-600 dark:text-slate-400">{highlightSearch(turn.text, searchQuery)}</span>
              </div>
            );
          })}
        </div>

        {filtered.length > 20 && !expanded && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(true); }}
            className="mt-2 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
          >
            Show all {filtered.length} segments
          </button>
        )}
      </div>
    );
  }

  // Plain text fallback
  if (!transcriptText) return null;

  const lines = transcriptText.split('\n');
  const filtered = searchQuery
    ? lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines;

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-md focus:border-teal-500 focus:outline-none"
            onClick={e => e.stopPropagation()}
          />
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {filtered.length}/{lines.length} lines
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
          {searchQuery ? filtered.map((line, i) => (
            <div key={i}>{highlightSearch(line, searchQuery)}</div>
          )) : transcriptText}
        </pre>
      </div>
    </div>
  );
}

// ── RAG Readiness ────────────────────────────────────────────────────

function RagStatus({ meeting }: { meeting: Meeting }) {
  const checks = [
    { label: 'Transcript', ready: !!meeting.transcript_text, detail: meeting.transcript_text ? `${meeting.transcript_text.split(/\s+/).length} words` : null },
    { label: 'Summary', ready: !!meeting.summary },
    { label: 'Chapter summaries', ready: !!meeting.chapter_summaries_json },
    { label: 'Action items', ready: !!meeting.action_items_json },
    { label: 'Key questions', ready: !!meeting.key_questions_json },
    { label: 'Topics', ready: !!meeting.topics_json },
    { label: 'Metrics', ready: meeting.read_score !== null },
    { label: 'Raw JSON', ready: !!meeting.raw_json },
    { label: 'Recording', ready: !!meeting.recording_url || !!meeting.recording_local_path },
  ];

  const readyCount = checks.filter(c => c.ready).length;
  const allReady = readyCount === checks.length;

  return (
    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
      <div className="font-medium text-slate-600 dark:text-slate-400 mb-1">
        RAG Readiness: {readyCount}/{checks.length}
        {allReady && <span className="text-green-600 ml-1">&#10003; Complete</span>}
      </div>
      {checks.map((check, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className={check.ready ? 'text-green-500' : 'text-slate-300'}>
            {check.ready ? '\u2713' : '\u25CB'}
          </span>
          <span>{check.label}</span>
          {check.detail && <span className="text-slate-400 dark:text-slate-500">({check.detail})</span>}
        </div>
      ))}
    </div>
  );
}

// ── Recording Button ─────────────────────────────────────────────────

function RecordingSection({ meeting }: { meeting: Meeting }) {
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; filepath?: string; size?: number } | null>(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    const res = await api.downloadRecording(meeting.id);
    setResult(res);
    setDownloading(false);
  };

  if (!meeting.recording_url && !meeting.recording_local_path) {
    return (
      <div className="text-xs text-slate-400 dark:text-slate-500 italic">
        Recording: Not available{!meeting.live_enabled ? ' (live capture was not enabled)' : ''}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {meeting.recording_local_path ? (
        <div className="text-xs text-green-600">
          &#10003; Downloaded: {meeting.recording_local_path.split(/[\\/]/).pop()}
        </div>
      ) : meeting.recording_url ? (
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 disabled:opacity-50"
        >
          <Download size={12} />
          {downloading ? 'Downloading...' : 'Download Recording (MP4)'}
        </button>
      ) : null}
      {result && !result.success && (
        <div className="text-xs text-red-500">{result.message}</div>
      )}
      {result?.success && result.size && (
        <div className="text-xs text-green-600">
          Downloaded: {(result.size / 1048576).toFixed(1)} MB
        </div>
      )}
    </div>
  );
}

// ── Expandable Meeting Row ────────────────────────────────────────────

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const [expanded, setExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showRag, setShowRag] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (expanded) {
      api.getMeetingActionItems(meeting.id).then(setActionItems);
    }
  }, [expanded, meeting.id]);

  const participants: Array<{ name?: string; email?: string; attended?: boolean; invited?: boolean }> = (() => {
    try { return meeting.participants_json ? JSON.parse(meeting.participants_json) : []; }
    catch { return []; }
  })();

  const topics: string[] = (() => {
    try { return meeting.topics_json ? JSON.parse(meeting.topics_json) : []; }
    catch { return []; }
  })();

  const keyQuestions: string[] = (() => {
    try { return meeting.key_questions_json ? JSON.parse(meeting.key_questions_json) : []; }
    catch { return []; }
  })();

  const chapterSummaries: Array<{ title?: string; summary?: string; start_time?: string; end_time?: string }> = (() => {
    try { return meeting.chapter_summaries_json ? JSON.parse(meeting.chapter_summaries_json) : []; }
    catch { return []; }
  })();

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <td className="px-4 py-2.5">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
          {new Date(meeting.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td className="px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100">{meeting.title ?? 'Untitled'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
          {meeting.duration_minutes != null ? `${meeting.duration_minutes}m` : '-'}
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{meeting.platform ?? '-'}</td>
        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{meeting.attended_count}/{meeting.participants_count}</td>
        <td className="px-3 py-2.5">
          {meeting.read_score != null ? (
            <span className={`text-xs font-medium ${meeting.read_score > 0.7 ? 'text-green-600' : meeting.read_score > 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
              {Math.round(meeting.read_score * 100)}%
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">{meeting.expanded ? '-' : 'Pending'}</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="bg-slate-50 dark:bg-slate-800 px-6 py-4">
            <div className="space-y-4">
              {/* Metrics */}
              {(meeting.read_score != null || meeting.sentiment != null || meeting.engagement != null) && (
                <div className="flex gap-8">
                  <MetricBadge label="Read Score" value={meeting.read_score} type="score" />
                  <MetricBadge label="Sentiment" value={meeting.sentiment} type="sentiment" />
                  <MetricBadge label="Engagement" value={meeting.engagement} type="engagement" />
                </div>
              )}

              {/* Summary */}
              {meeting.summary && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Summary</h4>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{meeting.summary}</p>
                </div>
              )}

              {/* Chapter Summaries */}
              {chapterSummaries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Chapter Summaries</h4>
                  <div className="space-y-2">
                    {chapterSummaries.map((ch, i) => (
                      <div key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {i + 1}. {ch.title || `Chapter ${i + 1}`}
                          {(ch.start_time || ch.end_time) && (
                            <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">
                              ({ch.start_time} - {ch.end_time})
                            </span>
                          )}
                        </div>
                        {ch.summary && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{ch.summary}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {actionItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Action Items</h4>
                  <div className="space-y-1">
                    {actionItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 text-xs">
                        {item.status === 'done' ? (
                          <CheckSquare size={13} className="shrink-0 text-green-500 mt-0.5" />
                        ) : (
                          <Square size={13} className="shrink-0 text-slate-400 mt-0.5" />
                        )}
                        <span className={`text-slate-700 dark:text-slate-300 ${item.status === 'done' ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                          {item.text}
                        </span>
                        {item.assignee && <span className="shrink-0 text-slate-400 dark:text-slate-500">(assigned: {item.assignee})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Questions */}
              {keyQuestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Key Questions</h4>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {keyQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-slate-700 dark:text-slate-300">{typeof q === 'string' ? q : JSON.stringify(q)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Topics */}
              {topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Topics</h4>
                  <div className="flex flex-wrap gap-1">
                    {topics.map((t, i) => (
                      <span key={i} className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {typeof t === 'string' ? t : (t as { name?: string }).name ?? JSON.stringify(t)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Participants */}
              {participants.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Participants</h4>
                  <div className="space-y-0.5">
                    {participants.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={p.attended ? 'text-green-600' : 'text-slate-400'}>
                          {p.attended ? '\u2713' : '\u2717'}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">{p.name ?? p.email ?? 'Unknown'}</span>
                        {p.email && <span className="text-slate-400 dark:text-slate-500">{p.email}</span>}
                        {p.attended === false && p.invited && <span className="text-slate-400 dark:text-slate-500 italic">invited, not attended</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Links row */}
              <div className="flex gap-3 pt-1">
                {meeting.report_url && (
                  <a
                    href={meeting.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} /> View Report
                  </a>
                )}
                {(meeting.transcript_text || meeting.transcript_json) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowTranscript(!showTranscript); }}
                    className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300"
                  >
                    <MessageCircle size={12} /> {showTranscript ? 'Hide Transcript' : 'View Transcript'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRag(!showRag); }}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  {showRag ? 'Hide RAG Status' : 'RAG Status'}
                </button>
              </div>

              {/* Transcript */}
              {showTranscript && (
                <TranscriptViewer
                  transcriptText={meeting.transcript_text}
                  transcriptJson={meeting.transcript_json}
                />
              )}

              {/* Recording */}
              <RecordingSection meeting={meeting} />

              {/* RAG readiness */}
              {showRag && <RagStatus meeting={meeting} />}

              {/* Unexpanded notice */}
              {!meeting.expanded && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                  Details pending — run sync to expand this meeting.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main MeetingsTab ──────────────────────────────────────────────────

export default function MeetingsTab({ companyId }: { companyId: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMeetingsForCompany(companyId).then((data) => {
      setMeetings(data);
      setLoading(false);
    });
  }, [companyId]);

  if (loading) return <p className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading meetings...</p>;

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Video size={32} className="mb-2" />
        <p className="text-sm">No meetings found</p>
        <p className="mt-1 text-xs">Connect Read.ai and run a sync to pull meeting data.</p>
      </div>
    );
  }

  // Summary stats
  const last30 = meetings.filter((m) => m.start_time_ms && Date.now() - m.start_time_ms! < 30 * 86400000);
  const avgDuration = last30.length > 0
    ? Math.round(last30.reduce((sum, m) => sum + (m.duration_minutes ?? 0), 0) / last30.length)
    : 0;
  const avgEngagement = (() => {
    const withEng = last30.filter((m) => m.engagement != null);
    return withEng.length > 0 ? withEng.reduce((s, m) => s + m.engagement!, 0) / withEng.length : null;
  })();
  const expandedCount = meetings.filter(m => m.expanded).length;
  const withTranscript = meetings.filter(m => m.transcript_text).length;

  return (
    <div>
      {/* Summary cards */}
      <div className="flex gap-4 border-b border-slate-100 dark:border-slate-700/50 px-4 py-3">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{last30.length}</div>
          <div className="text-[10px] text-slate-400">Meetings (30d)</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{avgDuration}m</div>
          <div className="text-[10px] text-slate-400">Avg Duration</div>
        </div>
        {avgEngagement != null && (
          <div className="text-center">
            <div className={`text-lg font-semibold ${avgEngagement > 0.7 ? 'text-green-600' : avgEngagement > 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
              {Math.round(avgEngagement * 100)}%
            </div>
            <div className="text-[10px] text-slate-400">Avg Engagement</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{expandedCount}/{meetings.length}</div>
          <div className="text-[10px] text-slate-400">Expanded</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{withTranscript}</div>
          <div className="text-[10px] text-slate-400">Transcripts</div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="w-8 px-4 py-2" />
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Date</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Title</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Duration</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Platform</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Attendees</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Score</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
