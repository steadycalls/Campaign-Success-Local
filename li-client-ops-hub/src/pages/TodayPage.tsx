import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, ExternalLink, AlertTriangle, Clock, Calendar, BarChart3, Activity } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import BudgetBar from '../components/shared/BudgetBar';

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
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeFromMs(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    red: 'bg-red-50 border-red-200',
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
    slate: 'bg-white border-slate-200',
    green: 'bg-green-50 border-green-200',
  };
  const textColors = {
    red: 'text-red-700', amber: 'text-amber-700', blue: 'text-blue-700',
    slate: 'text-slate-700', green: 'text-green-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={textColors[color]} />
        <h2 className={`text-sm font-semibold ${textColors[color]}`}>{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            color === 'red' ? 'bg-red-100 text-red-700' :
            color === 'amber' ? 'bg-amber-100 text-amber-700' :
            'bg-slate-100 text-slate-700'
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
        <h3 className="text-xs font-semibold text-red-700 uppercase">Overdue Clients ({items.length})</h3>
        <button onClick={() => navigate('/clients')} className="text-xs text-red-600 hover:text-red-700">View All &rarr;</button>
      </div>
      <div className="space-y-1">
        {shown.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
          const locationId = c.ghl_location_id as string;
          const contactId = c.ghl_contact_id as string;
          const ghlUrl = locationId && contactId
            ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`
            : null;

          return (
            <div key={c.id as string} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-50/50 hover:bg-red-100/50 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-slate-800 truncate">{name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-red-600">{String(c.days_since_outbound)}d</span>
                {c.phone ? <span className="text-xs text-slate-500">{String(c.phone)}</span> : null}
                {ghlUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); api.openInChrome(ghlUrl); }}
                    className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-0.5"
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
        <button onClick={() => setExpanded(true)} className="mt-1 text-xs text-red-500 hover:text-red-600">
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
      <h3 className="text-xs font-semibold text-red-700 uppercase mb-2">Budget Critical ({items.length})</h3>
      <div className="space-y-1.5">
        {items.map((p, i) => (
          <div
            key={i}
            onClick={() => p.company_id && navigate(`/company/${p.company_id}`)}
            className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-red-100/50 cursor-pointer transition-colors"
          >
            <span className="text-sm text-slate-800 truncate flex-1">{p.project_name as string}</span>
            <span className="text-xs text-slate-500">{p.company_name as string}</span>
            <span className="text-sm font-bold text-red-600">{Math.round(p.budget_percent as number)}%</span>
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

function SyncIssuesCard({ alerts, navigate }: { alerts: unknown[]; navigate: (path: string) => void }) {
  const items = alerts as Array<Record<string, unknown>>;
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-red-700 uppercase mb-2">Sync Issues ({items.length})</h3>
      <div className="space-y-1">
        {items.map((a) => (
          <div
            key={a.id as string}
            onClick={() => navigate('/logs')}
            className="text-xs text-slate-600 py-1 px-2 rounded hover:bg-red-100/50 cursor-pointer flex items-center gap-1.5"
          >
            <AlertTriangle size={12} className={a.severity === 'error' ? 'text-red-500' : 'text-amber-500'} />
            {a.message as string}
          </div>
        ))}
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
      <span className="text-xs font-semibold text-amber-700 uppercase">{label} ({items.length})</span>
      <div className="mt-1 text-sm text-slate-600 flex flex-wrap gap-x-1.5">
        {items.slice(0, 6).map(renderItem)}
        {items.length > 6 && <span className="text-xs text-amber-500">+{items.length - 6} more</span>}
      </div>
    </div>
  );
}

// ── Today's Meetings ─────────────────────────────────────────────────

function MeetingsPanel({ meetings }: { meetings: unknown[] }) {
  const items = meetings as Array<Record<string, unknown>>;

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 italic">No meetings scheduled for today</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((m) => (
        <div key={m.id as string} className="flex items-center gap-3 py-1.5">
          <span className="text-xs text-slate-500 w-16 shrink-0 font-mono">
            {formatTimeFromMs(m.start_time_ms as number)}
          </span>
          <span className="text-sm text-slate-800 flex-1 truncate">{String(m.title || 'Untitled')}</span>
          {m.platform ? <span className="text-xs text-slate-400">{String(m.platform)}</span> : null}
          {m.company_name ? <span className="text-xs text-teal-600">{String(m.company_name)}</span> : null}
          {m.report_url ? (
            <a href={m.report_url as string} target="_blank" rel="noopener noreferrer"
              className="text-xs text-teal-600 hover:text-teal-700" onClick={e => e.stopPropagation()}>
              Report <ExternalLink size={10} className="inline" />
            </a>
          ) : null}
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
    { value: (c.total_active as number) || 0, label: 'Active Clients', color: 'text-slate-700', bg: 'bg-slate-50', onClick: () => navigate('/portfolio') },
    { value: (c.sla_ok as number) || 0, label: 'SLA OK', color: 'text-green-700', bg: 'bg-green-50', icon: '\uD83D\uDFE2', onClick: () => navigate('/portfolio', { state: { slaFilter: 'ok' } }) },
    { value: (c.sla_warning as number) || 0, label: 'Warning', color: 'text-amber-700', bg: 'bg-amber-50', icon: '\uD83D\uDFE1', onClick: () => navigate('/portfolio', { state: { slaFilter: 'warning' } }) },
    { value: (c.sla_violation as number) || 0, label: 'Overdue', color: 'text-red-700', bg: 'bg-red-50', icon: '\uD83D\uDD34', onClick: () => navigate('/portfolio', { state: { slaFilter: 'violation' } }) },
  ];

  const syncStatus = pulse.syncStatus as Record<string, unknown> | null;
  const queueStats = pulse.queueStats as Record<string, unknown> | null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        {stats.map((stat, i) => (
          <button key={i} onClick={stat.onClick} className={`${stat.bg} rounded-lg p-3 text-center hover:opacity-80 transition-opacity`}>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
        <div>New contacts (7d): <span className="font-medium text-green-600">+{((pulse.newContacts7d as number) || 0).toLocaleString()}</span></div>
        <div>Outbound messages (7d): <span className="font-medium">{((pulse.outboundMessages7d as number) || 0).toLocaleString()}</span></div>
        <div>Sync: <span className="font-medium">{(syncStatus?.synced as number) || 0}/{(syncStatus?.enabled as number) || 0}</span> sub-accounts</div>
        <div>Queue: <span className="font-medium">{(queueStats?.running as number) || 0} running, {(queueStats?.pending as number) || 0} pending</span></div>
      </div>
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────

function ActivityFeed({ activities }: { activities: unknown[] }) {
  const items = activities as Array<Record<string, unknown>>;
  if (items.length === 0) return <p className="text-sm text-slate-400 italic">No recent activity</p>;

  return (
    <div className="space-y-0.5">
      {items.map((a, i) => {
        const ts = a.timestamp ? new Date(a.timestamp as string).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
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
            <span className="text-xs text-slate-400 w-16 shrink-0 text-right font-mono">{ts}</span>
            <span>{icon}</span>
            <span className="text-slate-600">{desc}</span>
          </div>
        );
      })}
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
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Sun size={24} className="text-amber-500" />
            {getGreeting()}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{formatDate()}</p>
        </div>
      </div>

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
          <div className="space-y-1 divide-y divide-amber-100">
            <WatchListInline
              label="Approaching SLA"
              items={(sla?.warnings || []) as unknown[]}
              renderItem={(item, i) => {
                const c = item as Record<string, unknown>;
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
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
                <span className="text-xs font-semibold text-amber-700 uppercase">Unlinked Clients ({(unlinked as unknown[]).length})</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-600">{(unlinked as unknown[]).length} client contacts have no sub-account association</span>
                  <button onClick={() => navigate('/clients')} className="text-xs text-teal-600 hover:text-teal-700">Fix Now &rarr;</button>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* No issues! */}
      {actionCount === 0 && watchCount === 0 && (
        <Section icon={Sun} title="All Clear" color="green">
          <p className="text-sm text-green-700">No action items or warnings. Everything looks good!</p>
        </Section>
      )}

      {/* Today's Meetings */}
      <Section icon={Calendar} title="Today's Meetings" color="slate" count={meetings?.meetings?.length}>
        <MeetingsPanel meetings={meetings?.meetings || []} />
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
