import { useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/ipc';

/**
 * Listens to batched IPC events and debounces state updates.
 * Processes the LATEST event per unique key (e.g., companyId),
 * discarding intermediate updates.
 */
export function useBatchedIPC<T>(
  channel: string,
  onUpdate: (latest: Map<string, T>) => void,
  keyExtractor: (event: T) => string,
  debounceMs: number = 300,
) {
  const accumulatorRef = useRef<Map<string, T>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushToState = useCallback(() => {
    if (accumulatorRef.current.size > 0) {
      onUpdate(new Map(accumulatorRef.current));
      accumulatorRef.current.clear();
    }
  }, [onUpdate]);

  useEffect(() => {
    const handler = (_event: unknown, batch: T[]) => {
      // Keep only the latest event per key
      for (const item of batch) {
        const key = keyExtractor(item);
        accumulatorRef.current.set(key, item);
      }

      // Debounce the state update
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushToState, debounceMs);
    };

    api.onBatch(channel, handler as (...args: unknown[]) => void);

    return () => {
      api.offBatch(channel, handler as (...args: unknown[]) => void);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [channel, keyExtractor, flushToState, debounceMs]);
}
