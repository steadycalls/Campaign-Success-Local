import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/ipc';

export interface SyncProgressSummary {
  company_id: string;
  contacts_synced: number;
  contacts_api_total: number;
  contacts_sync_percent: number;
  contacts_with_messages: number;
  messages_synced_total: number;
  messages_sync_percent: number;
  overall_status: string;
  overall_percent: number;
}

const POLL_ACTIVE_MS = 5000;   // poll every 5s when syncs are active
const POLL_IDLE_MS = 30000;    // poll every 30s when idle
const BATCH_DEBOUNCE_MS = 500; // debounce batched events before triggering fetch

export function usePortfolioLiveProgress(): Record<string, SyncProgressSummary> {
  const [progressMap, setProgressMap] = useState<Record<string, SyncProgressSummary>>({});
  const hasActiveRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const allProgress = await api.getQueueProgressAll() as Array<Record<string, unknown>>;
      const map: Record<string, SyncProgressSummary> = {};
      let anyActive = false;

      for (const p of allProgress || []) {
        const status = p.overall_status as string;
        if (status && status !== 'idle') {
          map[p.company_id as string] = {
            company_id: p.company_id as string,
            contacts_synced: (p.contacts_synced as number) || 0,
            contacts_api_total: (p.contacts_api_total as number) || 0,
            contacts_sync_percent: (p.contacts_sync_percent as number) || 0,
            contacts_with_messages: (p.contacts_with_messages as number) || 0,
            messages_synced_total: (p.messages_synced_total as number) || 0,
            messages_sync_percent: (p.messages_sync_percent as number) || 0,
            overall_status: status,
            overall_percent: (p.overall_percent as number) || 0,
          };
          if (status !== 'completed') anyActive = true;
        }
      }

      // Adjust polling interval when activity state changes
      if (anyActive !== hasActiveRef.current) {
        hasActiveRef.current = anyActive;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchAll, anyActive ? POLL_ACTIVE_MS : POLL_IDLE_MS);
      }

      setProgressMap(map);
    } catch { /* ignore */ }
  }, []);

  // Polling interval
  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_IDLE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  // Listen to batched sync:progress events — debounce into a single fetch
  useEffect(() => {
    const handler = () => {
      // Debounce: only trigger one fetch per batch window
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(fetchAll, BATCH_DEBOUNCE_MS);
    };

    api.onBatch('sync:progress', handler as (...args: unknown[]) => void);

    // Also keep the legacy listener for backwards compat during transition
    api.onSyncProgress(handler as (...args: unknown[]) => void);

    return () => {
      api.offBatch('sync:progress', handler as (...args: unknown[]) => void);
      api.offSyncProgress(handler as (...args: unknown[]) => void);
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [fetchAll]);

  // Memory pressure: clear stale progress data
  useEffect(() => {
    const handler = () => {
      setProgressMap((prev) => {
        const trimmed: Record<string, SyncProgressSummary> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.overall_status !== 'completed' && v.overall_status !== 'idle') {
            trimmed[k] = v;
          }
        }
        return trimmed;
      });
    };
    window.addEventListener('memory-pressure', handler);
    return () => window.removeEventListener('memory-pressure', handler);
  }, []);

  return progressMap;
}
