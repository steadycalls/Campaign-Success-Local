import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/ipc';

export interface LiveProgress {
  contactsSynced: number;
  contactsApiTotal: number;
  contactsPercent: number;
  contactsStatus: string;
  messagesTotal: number;
  contactsWithMessages: number;
  messagesPercent: number;
  messagesStatus: string;
  overallStatus: string;
  overallPercent: number;
  etaMinutes: number | null;
  etaDisplay: string;
  pendingTasks: number;
  runningTasks: number;
  syncStartedAt: string | null;
  elapsedSeconds: number;
  isActive: boolean;
}

const FAST_POLL_MS = 2500;
const IDLE_POLL_MS = 30000;

const DEFAULT_PROGRESS: LiveProgress = {
  contactsSynced: 0, contactsApiTotal: 0, contactsPercent: 0, contactsStatus: 'idle',
  messagesTotal: 0, contactsWithMessages: 0, messagesPercent: 0, messagesStatus: 'idle',
  overallStatus: 'idle', overallPercent: 0,
  etaMinutes: null, etaDisplay: '\u2014',
  pendingTasks: 0, runningTasks: 0,
  syncStartedAt: null, elapsedSeconds: 0, isActive: false,
};

export function useLiveProgress(companyId: string): LiveProgress {
  const [progress, setProgress] = useState<LiveProgress>(DEFAULT_PROGRESS);
  const isActiveRef = useRef(false);
  const historyRef = useRef<Array<{ time: number; contacts: number; messages: number }>>([]);

  const fetchProgress = useCallback(async () => {
    try {
      const data = await api.getQueueProgressForCompany(companyId) as Record<string, unknown> | null;
      if (!data) { setProgress(DEFAULT_PROGRESS); return; }

      const queueStats = await api.getQueueStats() as Record<string, number>;
      const active = data.overall_status !== 'idle' && data.overall_status !== 'completed';
      isActiveRef.current = active;

      const now = Date.now();
      const contactsSynced = (data.contacts_synced as number) || 0;
      const messagesTotal = (data.messages_synced_total as number) || 0;

      historyRef.current.push({ time: now, contacts: contactsSynced, messages: messagesTotal });
      if (historyRef.current.length > 30) historyRef.current.shift();

      const contactsApiTotal = (data.contacts_api_total as number) || 0;
      const contactsPercent = (data.contacts_sync_percent as number) || 0;
      const contactsWithMessages = (data.contacts_with_messages as number) || 0;

      // ETA calculation
      const eta = calculateETA(historyRef.current, contactsApiTotal, contactsSynced, contactsWithMessages);

      const elapsed = data.updated_at
        ? Math.floor((now - new Date(data.updated_at as string).getTime()) / 1000)
        : 0;

      setProgress({
        contactsSynced,
        contactsApiTotal,
        contactsPercent,
        contactsStatus: (data.contacts_sync_status as string) || 'idle',
        messagesTotal,
        contactsWithMessages,
        messagesPercent: (data.messages_sync_percent as number) || 0,
        messagesStatus: (data.messages_sync_status as string) || 'idle',
        overallStatus: (data.overall_status as string) || 'idle',
        overallPercent: (data.overall_percent as number) || 0,
        etaMinutes: eta.minutes,
        etaDisplay: eta.display,
        pendingTasks: queueStats?.pending || 0,
        runningTasks: queueStats?.running || 0,
        syncStartedAt: null,
        elapsedSeconds: elapsed,
        isActive: active,
      });
    } catch { /* ignore fetch errors */ }
  }, [companyId]);

  useEffect(() => {
    fetchProgress();
    const id = setInterval(fetchProgress, isActiveRef.current ? FAST_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [fetchProgress]);

  useEffect(() => {
    const handler = (_event: unknown, data: { companyId?: string }) => {
      if ((data as Record<string, unknown>)?.companyId === companyId) fetchProgress();
    };
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offSyncProgress(handler as (...args: unknown[]) => void); };
  }, [companyId, fetchProgress]);

  // Batched sync:progress — check if any event in batch is for this company
  useEffect(() => {
    const handler = (_event: unknown, batch: Array<{ companyId?: string }>) => {
      if (Array.isArray(batch) && batch.some((d) => d?.companyId === companyId)) {
        fetchProgress();
      }
    };
    api.onBatch('sync:progress', handler as (...args: unknown[]) => void);
    return () => { api.offBatch('sync:progress', handler as (...args: unknown[]) => void); };
  }, [companyId, fetchProgress]);

  return progress;
}

function calculateETA(
  history: Array<{ time: number; contacts: number; messages: number }>,
  apiTotal: number,
  synced: number,
  withMessages: number
): { minutes: number | null; display: string } {
  if (history.length < 3) return { minutes: null, display: 'Calculating...' };

  const oldest = history[0];
  const newest = history[history.length - 1];
  const elapsedMs = newest.time - oldest.time;
  if (elapsedMs < 5000) return { minutes: null, display: 'Calculating...' };

  const contactsDelta = newest.contacts - oldest.contacts;
  const contactsPerMin = (contactsDelta / elapsedMs) * 60000;
  const contactsRemaining = Math.max(0, apiTotal - synced);

  let contactsEtaMin = 0;
  if (contactsRemaining > 0 && contactsPerMin > 0) {
    contactsEtaMin = contactsRemaining / contactsPerMin;
  }

  const msgContactsRemaining = Math.max(0, synced - withMessages);
  const messagesEtaMin = msgContactsRemaining * 3; // ~3 min per contact

  const totalMinutes = Math.ceil(contactsEtaMin + messagesEtaMin);
  if (totalMinutes <= 0) return { minutes: 0, display: 'Almost done' };
  if (totalMinutes < 60) return { minutes: totalMinutes, display: `~${totalMinutes}m remaining` };

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return { minutes: totalMinutes, display: `~${hours}h ${mins}m remaining` };
}
