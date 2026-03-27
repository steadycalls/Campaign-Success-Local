import { useNavigate } from 'react-router-dom';
import { ChevronRight, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { WeeklyReportFull } from '../../types';
import type {
  PortfolioSummary, SLASummary, BudgetSummary, HealthSummary,
  ReportActionItem, ReportHighlight,
} from './reportTypes';
import { formatContactName } from '../../lib/formatName';

// ── Helpers ──────────────────────────────────────────────────────────

function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

// ── StatCard ─────────────────────────────────────────────────────────

function StatCard({ value, label, color, metric, reportId }: {
  value: string | number;
  label: string;
  color?: 'green' | 'amber' | 'red' | 'default';
  metric?: string;
  reportId?: string;
}) {
  const navigate = useNavigate();
  const clickable = !!metric && !!reportId;

  const colorClass =
    color === 'green' ? 'text-green-600' :
    color === 'amber' ? 'text-amber-600' :
    color === 'red' ? 'text-red-600' :
    'text-slate-900';

  return (
    <button
      onClick={clickable ? () => navigate(`/reports/drill/${reportId}/${metric}`) : undefined}
      disabled={!clickable}
      className={`bg-white border border-slate-200 rounded-lg p-4 text-center transition-all
        ${clickable
          ? 'hover:border-teal-300 hover:shadow-md hover:bg-teal-50/30 cursor-pointer group'
          : 'cursor-default'}`}
    >
      <div className={`text-2xl font-bold ${colorClass}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1 flex items-center justify-center gap-1">
        {label}
        {clickable && (
          <ChevronRight size={12} className="text-slate-300 group-hover:text-teal-500 transition-colors" />
        )}
      </div>
    </button>
  );
}

// ── Section Header ───────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-slate-700 mt-6 mb-3 pb-1.5 border-b border-slate-200">
      {title}
    </h2>
  );
}

// ── Trend Arrow ──────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp size={14} className="text-green-500" />;
  if (trend === 'declining') return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-slate-400" />;
}

// ── Inline Tables ────────────────────────────────────────────────────

function ViolationsTable({ violations }: { violations: SLASummary['violations'] }) {
  if (violations.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold text-slate-600 mb-1.5">Overdue Clients</h3>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 font-medium text-slate-500">Client</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Days Overdue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {violations.map((v, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5 text-slate-700">
                {formatContactName(v.first_name, v.last_name)}
              </td>
              <td className="px-3 py-1.5">
                <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 text-[11px] font-semibold">
                  {v.days_since_outbound}d
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthTable({ clients, label }: {
  clients: HealthSummary['topClients'];
  label: string;
}) {
  if (clients.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold text-slate-600 mb-1.5">{label}</h3>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 font-medium text-slate-500">Client</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Score</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Grade</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clients.map((c, i) => {
            const badgeColor = c.health_score >= 75 ? 'bg-green-100 text-green-700'
              : c.health_score >= 55 ? 'bg-amber-100 text-amber-700'
              : c.health_score >= 35 ? 'bg-orange-100 text-orange-700'
              : 'bg-red-100 text-red-700';
            return (
              <tr key={i}>
                <td className="px-3 py-1.5 text-slate-700">{c.name}</td>
                <td className="px-3 py-1.5">{c.health_score}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${badgeColor}`}>
                    {c.health_grade}
                  </span>
                </td>
                <td className="px-3 py-1.5"><TrendArrow trend={c.health_trend} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CriticalBudgetsTable({ projects }: { projects: BudgetSummary['critical'] }) {
  if (projects.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold text-slate-600 mb-1.5">Critical Budgets</h3>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 font-medium text-slate-500">Project</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Client</th>
            <th className="px-3 py-1.5 font-medium text-slate-500">Used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((b, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5 text-slate-700">{b.name}</td>
              <td className="px-3 py-1.5 text-slate-500">{b.company_name || '—'}</td>
              <td className="px-3 py-1.5">
                <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 text-[11px] font-semibold">
                  {Math.round(b.budget_percent)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Action Items & Highlights ────────────────────────────────────────

function ActionItemsList({ items }: { items: ReportActionItem[] }) {
  if (items.length === 0) return null;
  const priorityStyle = {
    high: 'bg-red-50 border-l-red-500 text-red-800',
    medium: 'bg-amber-50 border-l-amber-500 text-amber-800',
    low: 'bg-green-50 border-l-green-500 text-green-800',
  };
  return (
    <>
      <SectionHeader title={`Action Items (${items.length})`} />
      <div className="space-y-1">
        {items.map((a, i) => (
          <div key={i} className={`px-3 py-2 rounded border-l-[3px] text-xs ${priorityStyle[a.priority]}`}>
            <strong>{a.category}:</strong> {a.action}
          </div>
        ))}
      </div>
    </>
  );
}

function HighlightsList({ items }: { items: ReportHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title="Highlights" />
      <div className="space-y-1">
        {items.map((h, i) => (
          <div key={i} className="px-3 py-2 rounded border-l-[3px] border-l-green-500 bg-green-50 text-xs text-green-800">
            <strong>{h.category}:</strong> {h.text}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Meetings & Sync Summaries ────────────────────────────────────────

function MeetingsSummary({ meetings }: { meetings: { totalMeetings: number; matchedToClients: number; clientsWithNoMeeting30d: Array<{ name: string }> } }) {
  return (
    <>
      <SectionHeader title="Meetings" />
      <p className="text-xs text-slate-600">
        {meetings.totalMeetings} meetings this week ({meetings.matchedToClients} matched to clients)
      </p>
      {meetings.clientsWithNoMeeting30d.length > 0 && (
        <div className="mt-2">
          <h3 className="text-xs font-semibold text-slate-600 mb-1">
            No Meeting in 30+ Days ({meetings.clientsWithNoMeeting30d.length})
          </h3>
          <p className="text-xs text-slate-500">
            {meetings.clientsWithNoMeeting30d.map(c => c.name).join(', ')}
          </p>
        </div>
      )}
    </>
  );
}

function SyncSummarySection({ sync }: { sync: { totalRuns: number; successful: number; failed: number; failedCompanies: Array<{ company_name: string }>; ragChunksTotal: number; ragChunksEmbedded: number } }) {
  return (
    <>
      <SectionHeader title="Sync & Data" />
      <p className="text-xs text-slate-600">
        Sync runs this week: {sync.totalRuns} ({sync.successful} successful, {sync.failed} failed)
        <br />
        RAG pipeline: {sync.ragChunksEmbedded.toLocaleString()} / {sync.ragChunksTotal.toLocaleString()} chunks embedded
        {sync.failedCompanies.length > 0 && (
          <>
            <br />
            <span className="text-red-600">Failed syncs: {sync.failedCompanies.map(f => f.company_name).join(', ')}</span>
          </>
        )}
      </p>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  report: WeeklyReportFull | null;
}

export default function ReportDashboard({ report }: Props) {
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertTriangle size={48} className="mb-3" />
        <p className="text-sm">No reports generated yet.</p>
        <p className="text-xs mt-1">Click "Generate Now" to create your first weekly report.</p>
      </div>
    );
  }

  const id = report.id;
  const portfolio = parseJson<PortfolioSummary>(report.portfolio_summary_json, {
    totalActive: 0, syncEnabled: 0, pitsValid: 0, totalContactsSynced: 0,
    totalContactsApi: 0, totalMessages: 0, newContactsThisWeek: 0,
    newMessagesThisWeek: 0, outboundThisWeek: 0, inboundThisWeek: 0,
  });
  const sla = parseJson<SLASummary>(report.sla_summary_json, {
    totalClients: 0, ok: 0, warning: 0, violation: 0, slaComplianceRate: 0,
    violations: [], warnings: [],
  });
  const budget = parseJson<BudgetSummary>(report.budget_summary_json, {
    totalProjects: 0, critical: [], warning: [], onTrack: 0, avgUtilization: 0,
  });
  const health = parseJson<HealthSummary>(report.health_summary_json, {
    distribution: { grade_a: 0, grade_b: 0, grade_c: 0, grade_d: 0, grade_f: 0 },
    avgScore: 0, topClients: [], bottomClients: [], improvers: [], decliners: [],
  });
  const meetings = parseJson(report.meetings_summary_json, {
    totalMeetings: 0, matchedToClients: 0, clientMeetings: [], clientsWithNoMeeting30d: [],
  });
  const sync = parseJson(report.sync_summary_json, {
    totalRuns: 0, successful: 0, failed: 0, failedCompanies: [],
    ragChunksTotal: 0, ragChunksEmbedded: 0,
  });
  const actions = parseJson<ReportActionItem[]>(report.action_items_json, []);
  const highlights = parseJson<ReportHighlight[]>(report.highlights_json, []);

  return (
    <div>
      {/* Action Items & Highlights first */}
      <ActionItemsList items={actions} />
      <HighlightsList items={highlights} />

      {/* Portfolio Overview */}
      <SectionHeader title="Portfolio Overview" />
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={portfolio.totalActive} label="Active Clients" metric="portfolio-active" reportId={id} />
        <StatCard value={`+${portfolio.newContactsThisWeek.toLocaleString()}`} label="New Contacts" color="green" metric="portfolio-contacts" reportId={id} />
        <StatCard value={portfolio.outboundThisWeek.toLocaleString()} label="Outbound Msgs" metric="portfolio-outbound" reportId={id} />
        <StatCard value={portfolio.inboundThisWeek.toLocaleString()} label="Inbound Msgs" metric="portfolio-inbound" reportId={id} />
      </div>

      {/* Communication SLA */}
      <SectionHeader title="Communication SLA" />
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={`${sla.slaComplianceRate}%`} label="Compliance Rate" />
        <StatCard value={sla.ok} label="On Track" color="green" metric="sla-ok" reportId={id} />
        <StatCard value={sla.warning} label="Warning" color="amber" metric="sla-warning" reportId={id} />
        <StatCard value={sla.violation} label="Overdue" color="red" metric="sla-violation" reportId={id} />
      </div>
      <ViolationsTable violations={sla.violations} />

      {/* Client Health Scores */}
      <SectionHeader title="Client Health Scores" />
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={health.avgScore} label="Avg Score" />
        <StatCard value={health.distribution.grade_a + health.distribution.grade_b} label="A + B" color="green" metric="health-ab" reportId={id} />
        <StatCard value={health.distribution.grade_c} label="C" color="amber" metric="health-c" reportId={id} />
        <StatCard value={health.distribution.grade_d + health.distribution.grade_f} label="D + F" color="red" metric="health-df" reportId={id} />
      </div>
      <HealthTable clients={health.topClients} label="Top 5 Clients" />
      <HealthTable clients={health.bottomClients} label="Bottom 5 Clients (Need Attention)" />

      {/* Teamwork Budgets */}
      <SectionHeader title="Teamwork Budgets" />
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={budget.totalProjects} label="Active Projects" metric="budget-active" reportId={id} />
        <StatCard value={`${budget.avgUtilization}%`} label="Avg Utilization" metric="budget-utilization" reportId={id} />
        <StatCard value={budget.critical.length} label="Critical (>90%)" color="red" metric="budget-critical" reportId={id} />
        <StatCard value={budget.warning.length} label="Warning (>75%)" color="amber" metric="budget-warning" reportId={id} />
      </div>
      <CriticalBudgetsTable projects={budget.critical} />

      {/* Meetings */}
      <MeetingsSummary meetings={meetings} />

      {/* Sync & Data */}
      <SyncSummarySection sync={sync} />
    </div>
  );
}
