import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/ipc';
import type {
  Company,
  CompanyFilters,
  Contact,
  Message,
  Meeting,
  DriveFile,
  SyncRun,
  SyncAlert,
  Integration,
} from '../types';

// ── Sync-complete listener for auto-refresh ───────────────────────────

function useSyncRefresh(refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const handler = (_event: unknown, data: { phase?: string }) => {
      if (data?.phase === 'complete') {
        refreshRef.current();
      }
    };
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => {
      api.offSyncProgress(handler as (...args: unknown[]) => void);
    };
  }, []);
}

// ── Companies ─────────────────────────────────────────────────────────

export function useCompanies(filters?: CompanyFilters) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getCompanies(filters).then((data) => {
      setCompanies(data);
      setLoading(false);
    });
  }, [filters?.sla_status, filters?.status, filters?.search]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { companies, loading, refresh: load };
}

export function useCompany(id: string | undefined) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!id) return;
    api.getCompany(id).then((data) => {
      setCompany(data);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { company, loading, refresh: load };
}

// ── Contacts ──────────────────────────────────────────────────────────

export function useContacts(companyId: string | undefined) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!companyId) return;
    api.getContacts(companyId).then((data) => {
      setContacts(data);
      setLoading(false);
    });
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { contacts, loading, refresh: load };
}

// ── Messages ──────────────────────────────────────────────────────────

export function useMessages(contactId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!contactId) return;
    setLoading(true);
    api.getMessages(contactId).then((data) => {
      setMessages(data);
      setLoading(false);
    });
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  return { messages, loading, refresh: load };
}

// ── Meetings ──────────────────────────────────────────────────────────

export function useMeetings(companyId: string | undefined) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!companyId) return;
    api.getMeetings(companyId).then((data) => {
      setMeetings(data);
      setLoading(false);
    });
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { meetings, loading, refresh: load };
}

// ── Drive Files ───────────────────────────────────────────────────────

export function useDriveFiles(companyId: string | undefined) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!companyId) return;
    api.getDriveFiles(companyId).then((data) => {
      setFiles(data);
      setLoading(false);
    });
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { files, loading, refresh: load };
}

// ── Sync Logs ─────────────────────────────────────────────────────────

export function useSyncLogs() {
  const [logs, setLogs] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getSyncLogs().then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { logs, loading, refresh: load };
}

// ── Alerts ────────────────────────────────────────────────────────────

export function useAlerts(unackedOnly = true) {
  const [alerts, setAlerts] = useState<SyncAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getAlerts(unackedOnly).then((data) => {
      setAlerts(data);
      setLoading(false);
    });
  }, [unackedOnly]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  return { alerts, loading, refresh: load };
}

// ── Integrations ──────────────────────────────────────────────────────

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getIntegrations().then((data) => {
      setIntegrations(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  return { integrations, loading, refresh: load };
}
