import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Sun, LayoutGrid, Users, Activity, Settings, Brain, FileText, Globe, ShieldCheck, Mic, MessageCircle, Mail, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useSyncPulse } from '../../hooks/useSyncPulse';

const mainNav = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/portfolio', label: 'Portfolio', icon: LayoutGrid, end: true },
  { to: '/clients', label: 'Clients', icon: Users, end: true },
  { to: '/a2p', label: 'A2P', icon: ShieldCheck, end: true },
  { to: '/logs', label: 'Sync Logs', icon: Activity, end: true },
  { to: '/reports', label: 'Reports', icon: FileText, end: true },
  { to: '/meetings', label: 'Meetings', icon: Mic, end: true },
  { to: '/discord', label: 'Discord', icon: MessageCircle, end: true },
  { to: '/kinsta', label: 'Kinsta', icon: Globe, end: true },
  { to: '/gmail', label: 'Gmail', icon: Mail, end: true },
  { to: '/rag', label: 'RAG', icon: Brain, end: true },
];

const settingsNav = [
  { to: '/settings', label: 'Integrations', end: true },
  { to: '/settings/subaccounts', label: 'Sub-Accounts', end: true },
  { to: '/settings/teamwork', label: 'Teamwork', end: true },
  { to: '/settings/google', label: 'Google', end: true },
  { to: '/settings/calendar', label: 'Google Calendar', end: true },
  { to: '/settings/gdrive', label: 'Google Drive', end: true },
  { to: '/settings/associations', label: 'Associations', end: true },
  { to: '/settings/notifications', label: 'Notifications', end: true },
];

// ── Sync Pulse (sidebar footer) ──────────────────────────────────────

function SyncPulse() {
  const pulse = useSyncPulse();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const relTime = (iso: string | null) => {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  // Determine status
  const hasFailures = pulse.failed > 0 || pulse.failedCompanies.length > 0;
  const isRunning = pulse.isActive;

  return (
    <div className="relative">
      {/* Expanded popover */}
      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-slate-800 dark:bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
            {/* Running syncs */}
            {pulse.runningCompanies.length > 0 && (
              <div className="p-2.5">
                <div className="text-[10px] uppercase text-slate-400 tracking-wider mb-1.5">Running</div>
                {pulse.runningCompanies.map((c, i) => (
                  <div key={i} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-200 font-medium truncate">{c.companyName}</span>
                      <span className="text-teal-400 text-[11px]">{c.phase} {c.progress}%</span>
                    </div>
                    <div className="mt-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${c.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Failed syncs */}
            {pulse.failedCompanies.length > 0 && (
              <div className="p-2.5 border-t border-slate-700">
                <div className="text-[10px] uppercase text-red-400 tracking-wider mb-1.5">Failed</div>
                {pulse.failedCompanies.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs mb-1 last:mb-0">
                    <span className="text-slate-300 truncate">{c.companyName}</span>
                    <span className="text-red-400 text-[11px] truncate ml-2 max-w-[120px]">{c.error}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick stats */}
            <div className="p-2.5 border-t border-slate-700 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {pulse.pending > 0 ? `${pulse.pending} queued` : 'Queue empty'}
              </span>
              <button
                onClick={() => { setExpanded(false); navigate('/logs'); }}
                className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-0.5"
              >
                Sync Logs <ChevronRight size={10} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Pulse button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-800 transition-colors rounded"
      >
        {/* Status dot */}
        {isRunning ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
          </span>
        ) : hasFailures ? (
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-green-600 shrink-0" />
        )}

        {/* Status text */}
        <div className="flex-1 min-w-0">
          {isRunning ? (
            <div className="text-xs text-teal-400 font-medium">
              Syncing {pulse.running}/{pulse.running + pulse.pending}...
            </div>
          ) : hasFailures ? (
            <div className="text-xs text-red-400 font-medium">
              {pulse.failedCompanies.length} failed
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Last sync: {relTime(pulse.lastSyncAt)}
            </div>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight size={12} className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────────

export default function Sidebar() {
  const location = useLocation();
  const isSettings = location.pathname.startsWith('/settings');

  return (
    <aside className="flex h-full w-56 flex-col bg-slate-900 text-slate-300">
      <div className="flex h-14 items-center px-5">
        <span className="text-lg font-semibold text-white">Client Ops Hub</span>
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-2 overflow-y-auto">
        {mainNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-l-2 border-teal-400 bg-slate-800 text-white'
                  : 'border-l-2 border-transparent hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {/* Settings group */}
        <div className="pt-2">
          <NavLink
            to="/settings"
            end={false}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isSettings
                  ? 'border-l-2 border-teal-400 bg-slate-800 text-white'
                  : 'border-l-2 border-transparent hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings size={18} />
            Settings
          </NavLink>

          {isSettings && (
            <div className="ml-6 mt-1 space-y-0.5">
              {settingsNav.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `block rounded px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'text-teal-400 bg-slate-800'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Sync Pulse */}
      <div className="border-t border-slate-700">
        <SyncPulse />
      </div>

      <div className="px-5 py-2 text-xs text-slate-600">
        v0.1.0
      </div>
    </aside>
  );
}
