import { NavLink, useLocation } from 'react-router-dom';
import { Sun, LayoutGrid, Users, Activity, Settings, Brain } from 'lucide-react';

const mainNav = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/portfolio', label: 'Portfolio', icon: LayoutGrid, end: true },
  { to: '/clients', label: 'Clients', icon: Users, end: true },
  { to: '/logs', label: 'Sync Logs', icon: Activity, end: true },
  { to: '/rag', label: 'RAG', icon: Brain, end: true },
];

const settingsNav = [
  { to: '/settings', label: 'Integrations', end: true },
  { to: '/settings/subaccounts', label: 'Sub-Accounts', end: true },
  { to: '/settings/teamwork', label: 'Teamwork', end: true },
  { to: '/settings/discord', label: 'Discord', end: true },
  { to: '/settings/readai', label: 'Read.ai', end: true },
  { to: '/settings/gdrive', label: 'Google Drive', end: true },
  { to: '/settings/associations', label: 'Associations', end: true },
];

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

      <div className="border-t border-slate-700 px-5 py-3 text-xs text-slate-500">
        v0.1.0
      </div>
    </aside>
  );
}
