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

export function usePortfolioLiveProgress(): Record<string, SyncProgressSummary> {
  const [progressMap, setProgressMap] = useState<Record<string, SyncProgressSummary>>({});
  const hasActiveRef = useRef(false);

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
      hasActiveRef.current = anyActive;
      setProgressMap(map);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, hasActiveRef.current ? 3000 : 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  useEffect(() => {
    const handler = () => fetchAll();
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offSyncProgress(handler as (...args: unknown[]) => void); };
  }, [fetchAll]);

  return progressMap;
}
