import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, ExternalLink, AlertTriangle, Clock, Calendar, BarChart3, Activity, Heart, Zap, ShieldAlert, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import BudgetBar from '../components/shared/BudgetBar';
import HealthBadge from '../components/shared/HealthBadge';
import { formatContactName } from '../lib/formatName';
import type { AtRiskCompany, HealthComponent, SmartPriority, ChurnRiskCompany } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function formatTimeFromMs(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// ── Section wrapper ──────────────────────────────────────────────────

function Section({ icon: Icon, title, color, count, children }: {
  icon: typeof Sun;
  title: string;
  color: 'red' | 'amber' | 'blue' | 'slate' | 'green';
  count?: number;
  children: React.ReactNode;
}) {
  const colors = {
    red: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
    amber: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    slate: 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    green: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
  };
  const textColors = {
    red: 'text-red-700 dark:text-red-400', amber: 'text-amber-700 dark:text-amber-400', blue: 'text-blue-700 dark:text-blue-400',
    slate: 'text-slate-700 dark:text-slate-300', green: 'text-green-700 dark:text-green-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={textColors[color]} />
        <h2 className={`text-sm font-semibold ${textColors[color]}`}>{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            color === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' :
            color === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Overdue Clients ──────────────────────────────────────────────────

function OverdueClientsCard({ violations, navigate }: { violations: unknown[]; navigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const items = violations as Array<Record<string, unknown>>;
  const shown = expanded ? items : items.slice(0, 5);

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Overdue Clients ({items.length})</h3>
        <button onClick={() => navigate('/clients')} className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">View All &rarr;</button>
      </div>
      <div className="space-y-1">
        {shown.map((c) => {
          const name = formatContactName(c.first_name as string, c.last_name as string);
          const locationId = c.ghl_location_id as string;
          const contactId = c.ghl_contact_id as string;
          const ghlUrl = locationId && contactId
            ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`
            : null;

          return (
            <div key={c.id as string} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/20 dark:hover:bg-red-900/30 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-red-600 dark:text-red-400">{String(c.days_since_outbound)}d</span>
                {c.phone ? <span className="text-xs text-slate-500 dark:text-slate-400">{String(c.phone)}</span> : null}
                {ghlUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); api.openInChrome(ghlUrl); }}
                    className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-0.5"
                  >
                    GHL <ExternalLink size={10} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {items.length > 5 && !expanded && (
        <button onClick={() => setExpanded(true)} className="mt-1 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
          +{items.length - 5} more
        </button>
      )}
    </div>
  );
}

// ── Budget Alerts ────────────────────────────────────────────────────

function BudgetAlertsCard({ alerts, navigate }: { alerts: unknown[]; navigate: (path: string) => void }) {
  const items = alerts as Array<Record<string, unknown>>;
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase mb-2">Budget Critical ({items.length})</h3>
      <div className="space-y-1.5">
        {items.map((p, i) => (
          <div
            key={i}
            onClick={() => p.company_id && navigate(`/company/${p.company_id}`)}
            className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-red-100/50 dark:hover:bg-red-900/30 cursor-pointer transition-colors"
          >
            <span className="text-sm text-slate-800 dark:text-slate-200 truncate flex-1">{p.project_name as string}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{p.company_name as string}</span>
            <span className="text-sm font-bold text-red-600 dark:text-red-400">{Math.round(p.budget_percent as number)}%</span>
            <div className="w-16">
              <BudgetBar percent={p.budget_percent as number} used={p.budget_used as number} total={p.budget_total as number} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sync Issues ──────────────────────────────────────────────────────

// Replace raw UUIDs in message text with the company name
function formatAlertMessage(message: string, companyName?: string, companyId?: string): string {
  if (!message) return '';
  let formatted = message;
  // Replace the company_id UUID in the message with the company name
  if (companyId && companyName) {
    formatted = formatted.replace(companyId, companyName);
  }
  // Also strip any remaining bare UUIDs and replace with "unknown"
  formatted = formatted.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => {
    // If this UUID matches companyId we already replaced, skip
    if (match === companyId) return companyName || match;
    return 'unknown';
  });
  return formatted;
}

function SyncIssuesCard({ alerts, navigate }: { alerts: unknown[]; navigate: (path: string) => void }) {
  const items = alerts as Array<Record<string, unknown>>;
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase mb-2">Sync Issues ({items.length})</h3>
      <div className="space-y-1">
        {items.map((a) => {
          const companyId = a.company_id as string | undefined;
          const companyName = a.company_name as string | undefined;
          const message = formatAlertMessage(a.message as string, companyName, companyId);

          return (
            <div
              key={a.id as string}
              className="text-xs text-slate-600 dark:text-slate-400 py-1 px-2 rounded hover:bg-red-100/50 dark:hover:bg-red-900/30 flex items-center gap-1.5"
            >
              <AlertTriangle size={12} className={`flex-shrink-0 ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
              <span className="flex-1">
                {companyName && companyId ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/company/${companyId}`); }}
                      className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-300 hover:underline"
                    >
                      {companyName}
                    </button>
                    {' \u2014 '}
                  </>
                ) : null}
                <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200" onClick={() => navigate('/logs')}>
                  {companyName ? message.replace(`${companyName} — `, '').replace(`${companyName}`, '').replace(/^\s*[—\-:]\s*/, '') : message}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Watch List Item (compact inline) ─────────────────────────────────

function WatchListInline({ label, items, renderItem }: {
  label: string;
  items: unknown[];
  renderItem: (item: unknown, i: number) => React.ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="py-1.5">
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">{label} ({items.length})</span>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-1.5">
        {items.slice(0, 6).map(renderItem)}
        {items.length > 6 && <span className="text-xs text-amber-500 dark:text-amber-400">+{items.length - 6} more</span>}
      </div>
    </div>
  );
}

// ── Today's Meetings ─────────────────────────────────────────────────

function MeetingsPanel({ meetings, navigate }: { meetings: unknown[]; navigate: (path: string, options?: { state?: unknown }) => void }) {
  const items = meetings as Array<Record<string, unknown>>;

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500 italic">No meetings scheduled for today</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((m) => (
        <div key={m.id as string} className="flex items-center gap-3 py-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0 font-mono">
            {formatTimeFromMs(m.start_time_ms as number)}
          </span>
          <span className="text-sm text-slate-800 dark:text-slate-200 flex-1 truncate">{String(m.title || 'Untitled')}</span>
          {m.platform ? <span className="text-xs text-slate-400 dark:text-slate-500">{String(m.platform)}</span> : null}
          {m.company_name ? <span className="text-xs text-teal-600 dark:text-teal-400">{String(m.company_name)}</span> : null}
          <button
            onClick={() => navigate('/meetings', { state: { expandMeetingId: m.id } })}
            className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-0.5"
          >
            Details <ExternalLink size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Portfolio Pulse ──────────────────────────────────────────────────

function PulsePanel({ pulse, navigate }: { pulse: Record<string, unknown>; navigate: (path: string, options?: { state?: unknown }) => void }) {
  const c = pulse.companies as Record<string, unknown> | null;
  if (!c) return null;

  const stats = [
    { value: (c.total_active as number) || 0, label: 'Active Clients', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-800', onClick: () => navigate('/portfolio') },
    { value: (c.sla_ok as number) || 0, label: 'SLA OK', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30', icon: '\uD83D\uDFE2', onClick: () => navigate('/portfolio', { state: { slaFilter: 'ok' } }) },
    { value: (c.sla_warning as number) || 0, label: 'Warning', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: '\uD83D\uDFE1', onClick: () => navigate('/portfolio', { state: { slaFilter: 'warning' } }) },
    { value: (c.sla_violation as number) || 0, label: 'Overdue', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', icon: '\uD83D\uDD34', onClick: () => navigate('/portfolio', { state: { slaFilter: 'violation' } }) },
  ];

  const syncStatus = pulse.syncStatus as Record<string, unknown> | null;
  const queueStats = pulse.queueStats as Record<string, unknown> | null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        {stats.map((stat, i) => (
          <button key={i} onClick={stat.onClick} className={`${stat.bg} rounded-lg p-3 text-center hover:opacity-80 transition-opacity`}>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-400">
        <div>New contacts (7d): <span className="font-medium text-green-600 dark:text-green-400">+{((pulse.newContacts7d as number) || 0).toLocaleString()}</span></div>
        <div>Outbound messages (7d): <span className="font-medium dark:text-slate-300">{((pulse.outboundMessages7d as number) || 0).toLocaleString()}</span></div>
        <div>Sync: <span className="font-medium dark:text-slate-300">{(syncStatus?.synced as number) || 0}/{(syncStatus?.enabled as number) || 0}</span> sub-accounts</div>
        <div>Queue: <span className="font-medium dark:text-slate-300">{(queueStats?.running as number) || 0} running, {(queueStats?.pending as number) || 0} pending</span></div>
      </div>
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────

function ActivityFeed({ activities }: { activities: unknown[] }) {
  const items = activities as Array<Record<string, unknown>>;
  if (items.length === 0) return <p className="text-sm text-slate-400 dark:text-slate-500 italic">No recent activity</p>;

  return (
    <div className="space-y-0.5">
      {items.map((a, i) => {
        const ts = a.timestamp ? new Date(a.timestamp as string).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
        const type = a.activity_type as string;
        let icon = '\u2022';
        let desc = '';

        if (type === 'sync') {
          icon = a.status === 'success' ? '\u2705' : '\u274C';
          const parts: string[] = [];
          if ((a.items_created as number) > 0) parts.push(`+${a.items_created} created`);
          if ((a.items_updated as number) > 0) parts.push(`+${a.items_updated} updated`);
          desc = `${a.company_name || 'Unknown'} synced${parts.length ? ' \u2014 ' + parts.join(', ') : ''}`;
        } else if (type === 'alert') {
          icon = a.severity === 'error' ? '\uD83D\uDD34' : '\u26A0\uFE0F';
          desc = (a.message as string) || (a.title as string) || 'Alert';
        }

        return (
          <div key={i} className="flex items-start gap-2 py-1 text-sm">
            <span className="text-xs text-slate-400 dark:text-slate-500 w-16 shrink-0 text-right font-mono">{ts}</span>
            <span>{icon}</span>
            <span className="text-slate-600 dark:text-slate-400">{desc}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Health helpers ───────────────────────────────────────────────────

function getLowestComponent(json: string | null | undefined): string {
  if (!json) return '';
  try {
    const components = JSON.parse(json) as HealthComponent[];
    if (components.length === 0) return '';
    const lowest = components.reduce((min, c) => c.score < min.score ? c : min, components[0]);
    return `\u2193 ${lowest.name}: ${lowest.detail}`;
  } catch { return ''; }
}

// ── Smart Priorities Card ────────────────────────────────────────────

function SmartPrioritiesCard({ priorities, onRefresh, refreshing }: {
  priorities: SmartPriority[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const navigate = useNavigate();
  if (priorities.length === 0) return null;

  const urgencyColors: Record<string, string> = {
    critical: 'border-l-red-500 bg-red-50 dark:bg-red-950/30',
    high: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/30',
    medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',
    low: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/30',
  };

  const urgencyBadge: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
  };

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/40 dark:to-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Today's Priorities</h2>
          <span className="text-xs text-indigo-400 dark:text-indigo-500">(AI-generated)</span>
        </div>
        <button onClick={onRefresh} disabled={refreshing}
          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50">
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>
      <div className="space-y-2">
        {priorities.map((p, i) => (
          <div key={i}
            onClick={() => p.companyId && navigate(`/company/${p.companyId}`)}
            className={`border-l-4 rounded-r-lg p-3 ${urgencyColors[p.urgency] ?? urgencyColors.medium} ${p.companyId ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110' : ''}`}>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">{p.priority}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {p.action}
                  {p.ghlContactUrl && p.contactName && (
                    <button
                      onClick={(e) => { e.stopPropagation(); api.openInChrome(p.ghlContactUrl!); }}
                      className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 hover:underline"
                      title={`Open ${p.contactName} in GHL`}
                    >
                      {p.contactName} <ExternalLink size={10} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.reason}</div>
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${urgencyBadge[p.urgency] ?? urgencyBadge.medium}`}>
                {p.urgency}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Churn Risk Section ──────────────────────────────────────────────

function ChurnRiskCard({ companies, navigate }: { companies: ChurnRiskCompany[]; navigate: (path: string) => void }) {
  if (companies.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Churn Risk ({companies.length})</h3>
        <button onClick={() => navigate('/portfolio')} className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">View Portfolio &rarr;</button>
      </div>
      <div className="space-y-1.5">
        {companies.map(c => (
          <div key={c.id}
            onClick={() => navigate(`/company/${c.id}`)}
            className="flex items-center gap-3 py-2 px-2 rounded hover:bg-red-100/50 dark:hover:bg-red-900/30 cursor-pointer transition-colors">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
              c.churn_risk_grade === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
            }`}>
              {c.churn_risk_score}
            </span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{c.name}</span>
            {c.monthly_revenue && <span className="text-xs text-green-600 dark:text-green-400 font-medium">${c.monthly_revenue.toLocaleString()}/mo</span>}
            <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">{c.churn_risk_reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function TodayPage() {
  const navigate = useNavigate();

  const { data: sla } = useAutoRefresh(() => api.getSlaViolations(), []);
  const { data: budgets } = useAutoRefresh(() => api.getBudgetAlerts(), []);
  const { data: syncAlerts } = useAutoRefresh(() => api.getSyncAlerts(), []);
  const { data: unlinked } = useAutoRefresh(() => api.getUnassociatedClients(), []);
  const { data: pulse } = useAutoRefresh(() => api.getPortfolioPulse(), []);
  const { data: meetings } = useAutoRefresh(() => api.getTodaysMeetings(), []);
  const { data: activity } = useAutoRefresh(() => api.getRecentActivity(), [], 60000);
  const { data: atRisk } = useAutoRefresh(() => api.getAtRiskCompanies(), []);
  const { data: linkingGaps } = useAutoRefresh(() => api.getLinkingGaps(), []);
  const { data: churnRisks } = useAutoRefresh(() => api.getChurnRisks(), []);
  const [priorities, setPriorities] = useState<SmartPriority[]>([]);
  const [prioritiesLoading, setPrioritiesLoading] = useState(false);
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false);

  // Load smart priorities on mount (uses 4h cache)
  if (!prioritiesLoaded && !prioritiesLoading) {
    setPrioritiesLoading(true);
    setPrioritiesLoaded(true);
    api.getSmartPriorities().then(p => { setPriorities(p); setPrioritiesLoading(false); }).catch(() => setPrioritiesLoading(false));
  }

  const handleRefreshPriorities = () => {
    setPrioritiesLoading(true);
    api.getSmartPriorities(true).then(p => { setPriorities(p); setPrioritiesLoading(false); }).catch(() => setPrioritiesLoading(false));
  };

  const actionCount =
    ((sla?.violations as unknown[])?.length || 0) +
    ((budgets?.critical as unknown[])?.length || 0) +
    ((syncAlerts as unknown[])?.length || 0);

  const watchCount =
    ((sla?.warnings as unknown[])?.length || 0) +
    ((budgets?.warning as unknown[])?.length || 0) +
    ((unlinked as unknown[])?.length || 0);

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sun size={24} className="text-amber-500" />
            {getGreeting()}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{formatDate()}</p>
        </div>
      </div>

      {/* Smart Priorities (AI-generated) */}
      <SmartPrioritiesCard priorities={priorities} onRefresh={handleRefreshPriorities} refreshing={prioritiesLoading} />

      {/* Churn Risk */}
      {churnRisks && churnRisks.length > 0 && (
        <Section icon={ShieldAlert} title="Churn Risk" color="red" count={churnRisks.length}>
          <ChurnRiskCard companies={churnRisks as ChurnRiskCompany[]} navigate={navigate} />
        </Section>
      )}

      {/* Action Required */}
      {actionCount > 0 && (
        <Section icon={AlertTriangle} title="Action Required" color="red" count={actionCount}>
          <div className="space-y-4">
            <OverdueClientsCard violations={sla?.violations || []} navigate={navigate} />
            <BudgetAlertsCard alerts={budgets?.critical || []} navigate={navigate} />
            <SyncIssuesCard alerts={syncAlerts || []} navigate={navigate} />
          </div>
        </Section>
      )}

      {/* Watch List */}
      {watchCount > 0 && (
        <Section icon={Clock} title="Watch List" color="amber" count={watchCount}>
          <div className="space-y-1 divide-y divide-amber-100 dark:divide-amber-900/30">
            <WatchListInline
              label="Approaching SLA"
              items={(sla?.warnings || []) as unknown[]}
              renderItem={(item, i) => {
                const c = item as Record<string, unknown>;
                const name = formatContactName(c.first_name as string | null, c.last_name as string | null, '');
                return <span key={i} className="text-sm">{name} ({String(c.days_since_outbound)}d){i < Math.min(((sla?.warnings as unknown[])?.length || 0), 6) - 1 ? ' \u00B7 ' : ''}</span>;
              }}
            />
            <WatchListInline
              label="Budget 75-90%"
              items={(budgets?.warning || []) as unknown[]}
              renderItem={(item, i) => {
                const p = item as Record<string, unknown>;
                return <span key={i} className="text-sm">{String(p.company_name)} {Math.round(p.budget_percent as number)}%{i < Math.min(((budgets?.warning as unknown[])?.length || 0), 6) - 1 ? ' \u00B7 ' : ''}</span>;
              }}
            />
            {(unlinked as unknown[])?.length > 0 && (
              <div className="py-1.5">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">Unlinked Clients ({(unlinked as unknown[]).length})</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{(unlinked as unknown[]).length} client contacts have no sub-account association</span>
                  <button onClick={() => navigate('/clients')} className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300">Fix Now &rarr;</button>
                </div>
              </div>
            )}
            {linkingGaps && (linkingGaps.noTeamwork.length > 0 || linkingGaps.noDrive.length > 0) && (
              <div className="py-1.5 space-y-1">
                {linkingGaps.noTeamwork.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{linkingGaps.noTeamwork.length} companies have no Teamwork project linked</span>
                  </div>
                )}
                {linkingGaps.noDrive.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{linkingGaps.noDrive.length} companies have no Drive folder linked</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* At-Risk Clients (Health Score) */}
      {atRisk && atRisk.length > 0 && (
        <Section icon={Heart} title="At-Risk Clients" color="red" count={atRisk.length}>
          <div className="space-y-1.5">
            {(atRisk as AtRiskCompany[]).map((company) => (
              <div
                key={company.id}
                onClick={() => navigate(`/company/${company.id}`)}
                className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-red-100/50 dark:hover:bg-red-900/30 cursor-pointer transition-colors"
              >
                <HealthBadge score={company.health_score} trend={company.health_trend} />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{company.name}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                  {getLowestComponent(company.health_components_json)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* No issues! */}
      {actionCount === 0 && watchCount === 0 && (
        <Section icon={Sun} title="All Clear" color="green">
          <p className="text-sm text-green-700 dark:text-green-400">No action items or warnings. Everything looks good!</p>
        </Section>
      )}

      {/* Today's Meetings */}
      <Section icon={Calendar} title="Today's Meetings" color="slate" count={meetings?.meetings?.length}>
        <MeetingsPanel meetings={meetings?.meetings || []} navigate={navigate} />
      </Section>

      {/* Portfolio Pulse */}
      {pulse && (
        <Section icon={BarChart3} title="Portfolio Pulse" color="slate">
          <PulsePanel pulse={pulse as Record<string, unknown>} navigate={navigate} />
        </Section>
      )}

      {/* Recent Activity */}
      <Section icon={Activity} title="Recent Activity (24h)" color="slate">
        <ActivityFeed activities={activity || []} />
      </Section>
    </div>
  );
}
