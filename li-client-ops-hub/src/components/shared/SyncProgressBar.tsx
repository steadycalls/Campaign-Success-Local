import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatETA, formatElapsed } from '../../utils/formatTime';

interface SyncProgress {
  companyId?: string;
  companyName?: string;
  phase: string;
  progress: number;
  found: number;
  message: string;
  companyIndex?: number;
  companyTotal?: number;
  startedAt?: string;
  estimatedEndAt?: string;
}

interface Props {
  companyId?: string;
}

export default function SyncProgressBar({ companyId }: Props) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const handler = (_event: unknown, data: SyncProgress) => {
      if (!companyId || data.companyId === companyId) {
        setProgress(data);
        if (data.phase === 'complete') {
          setTimeout(() => setProgress(null), 3000);
        }
      }
    };

    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => {
      api.offSyncProgress(handler as (...args: unknown[]) => void);
    };
  }, [companyId]);

  // Update elapsed time every second while syncing
  useEffect(() => {
    if (!progress || progress.phase === 'complete' || !progress.startedAt) return;
    const tick = () => setElapsed(formatElapsed(progress.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt, progress?.phase]);

  if (!progress) return null;

  const isComplete = progress.phase === 'complete';
  const isBatch = progress.companyTotal && progress.companyTotal > 1;
  const eta = formatETA(progress.estimatedEndAt);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 my-2">
      {/* Top row: spinner + message + percentage */}
      <div className="flex items-center gap-2">
        {!isComplete && <Loader2 size={14} className="shrink-0 animate-spin text-teal-600" />}
        <span className="flex-1 truncate text-xs text-slate-700">{progress.message}</span>
        <span className="shrink-0 text-xs font-medium text-slate-600">{progress.progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-teal-500'}`}
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* Bottom row: batch counter, elapsed, ETA */}
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          {isBatch && (
            <span>
              Sub-account {progress.companyIndex}/{progress.companyTotal}
              {progress.companyName && `: ${progress.companyName}`}
            </span>
          )}
          {elapsed && !isComplete && <span>Elapsed: {elapsed}</span>}
        </div>
        {eta && !isComplete && (
          <span className="text-teal-600">Est. completion: {eta}</span>
        )}
        {isComplete && (
          <span className="text-green-600">
            {progress.found > 0 ? `${progress.found} items synced` : 'Done'}
          </span>
        )}
      </div>
    </div>
  );
}
