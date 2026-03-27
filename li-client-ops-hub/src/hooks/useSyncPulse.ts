import { useState, useEffect, useCallback, useRef } from 'react';

interface SyncPulseState {
  running: number;
  pending: number;
  failed: number;
  completed: number;
  isActive: boolean;
  runningCompanies: Array<{ companyId: string; companyName: string; phase: string; progress: number }>;
  failedCompanies: Array<{ companyId: string; companyName: string; error: string }>;
  lastSyncAt: string | null;
}

const IDLE: SyncPulseState = {
  running: 0, pending: 0, failed: 0, completed: 0,
  isActive: false, runningCompanies: [], failedCompanies: [], lastSyncAt: null,
};

export function useSyncPulse(): SyncPulseState {
  const [state, setState] = useState<SyncPulseState>(IDLE);
  const isActiveRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const [stats, progressAll, activeTasks] = await Promise.all([
        window.api.getQueueStats(),
        window.api.getQueueProgressAll() as Promise<Array<Record<string, unknown>>>,
        window.api.getActiveTasks() as Promise<Array<Record<string, unknown>>>,
      ]);

      const running = stats.running || 0;
      const pending = stats.pending || 0;
      const failed = stats.failed || 0;
      const isActive = running > 0 || pending > 0;
      isActiveRef.current = isActive;

      // Extract running companies from progress data
      const runningCompanies = (progressAll || [])
        .filter((p: Record<string, unknown>) => p.overall_status === 'running' || p.overall_status === 'syncing')
        .map((p: Record<string, unknown>) => ({
          companyId: (p.company_id as string) || '',
          companyName: (p.company_name as string) || 'Unknown',
          phase: (p.current_phase as string) || (p.phase as string) || 'syncing',
          progress: (p.overall_percent as number) || (p.percent as number) || 0,
        }));

      // Get failed tasks
      const failedCompanies = (activeTasks || [])
        .filter((t: Record<string, unknown>) => t.status === 'failed')
        .map((t: Record<string, unknown>) => ({
          companyId: (t.company_id as string) || '',
          companyName: (t.company_name as string) || 'Unknown',
          error: (t.error as string) || 'Unknown error',
        }));

      // Get last sync time from most recent completed
      let lastSyncAt: string | null = null;
      try {
        const logs = await window.api.getSyncLogs({ limit: 1 });
        if (logs.length > 0 && logs[0].finished_at) lastSyncAt = logs[0].finished_at;
      } catch { /* ignore */ }

      setState({ running, pending, failed, completed: stats.completed || 0, isActive, runningCompanies, failedCompanies, lastSyncAt });
    } catch { /* ignore polling errors */ }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(() => {
      poll();
    }, isActiveRef.current ? 3000 : 30000);

    // Also listen to batch events for faster updates
    const batchHandler = () => { poll(); };
    window.api.onSyncProgress(batchHandler);

    return () => {
      clearInterval(interval);
      window.api.offSyncProgress(batchHandler);
    };
  }, [poll]);

  return state;
}
