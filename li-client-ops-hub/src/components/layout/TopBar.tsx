import { useState, useEffect } from 'react';
import { RefreshCw, Pause, Moon, Sun } from 'lucide-react';
import { api } from '../../lib/ipc';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { formatETAShort } from '../../utils/formatTime';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb > 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(0)}MB`;
}

export default function TopBar({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [syncActive, setSyncActive] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [eta, setEta] = useState('');

  const { data: queueStats } = useAutoRefresh(() => api.getQueueStats(), [], 10000);
  const { data: memStats } = useAutoRefresh(() => api.getMemoryStats(), [], 30000);

  useEffect(() => {
    const handler = (_event: unknown, data: { phase?: string; estimatedEndAt?: string; companyIndex?: number; companyTotal?: number }) => {
      if (data?.phase === 'complete') {
        setSyncActive(false);
        setSyncMsg('');
      } else if (data?.phase === 'syncing' || data?.companyIndex) {
        setSyncActive(true);
        setSyncMsg(data.companyTotal ? `${data.companyIndex}/${data.companyTotal}` : 'syncing');
        setEta(formatETAShort(data.estimatedEndAt) ?? '');
      }
    };
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offSyncProgress(handler as (...args: unknown[]) => void); };
  }, []);

  const hasQueueWork = queueStats && (queueStats.running > 0 || queueStats.pending > 0);

  return (
    <header className="flex h-10 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {hasQueueWork ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="font-medium text-teal-700 dark:text-teal-400">
                Queue: {queueStats.running} running, {queueStats.pending} pending
              </span>
            </div>
            <button onClick={() => api.pauseQueue()} className="text-slate-400 hover:text-red-500" title="Pause">
              <Pause size={12} />
            </button>
          </>
        ) : syncActive ? (
          <>
            <RefreshCw size={13} className="animate-spin text-teal-600 dark:text-teal-400" />
            <span className="font-medium text-teal-700 dark:text-teal-400">Syncing {syncMsg}</span>
            {eta && <span className="text-slate-400 dark:text-slate-500">ETA: {eta}</span>}
          </>
        ) : (
          <>
            <span>Sync: <span className="font-medium text-green-600 dark:text-green-400">idle</span></span>
            {queueStats && queueStats.completed > 0 && (
              <span className="text-slate-400 dark:text-slate-500">{queueStats.completed} completed (24h)</span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
        {memStats && (
          <span className={memStats.percent > 80 ? 'text-amber-600 dark:text-amber-400' : ''}>
            RAM: {formatBytes(memStats.used)} / {formatBytes(memStats.limit)}
          </span>
        )}
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          Auto-refresh: 5 min
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
