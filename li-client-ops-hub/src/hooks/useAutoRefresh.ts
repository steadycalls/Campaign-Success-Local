import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/ipc';

const DEFAULT_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useAutoRefresh<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs: number = DEFAULT_INTERVAL
): { data: T | null; loading: boolean; refresh: () => void; lastRefreshed: Date | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Auto-refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, deps);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Polling interval
  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  // Sync completion triggers immediate refresh
  useEffect(() => {
    const handler = (_event: unknown, d: { phase?: string }) => {
      if (d?.phase === 'complete') refresh();
    };
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offSyncProgress(handler as (...args: unknown[]) => void); };
  }, [refresh]);

  return { data, loading, refresh, lastRefreshed };
}
