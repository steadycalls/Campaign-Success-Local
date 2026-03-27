import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { api } from '../lib/ipc';
import type { Integration } from '../types';
import IntegrationCard from '../components/settings/IntegrationCard';

// ── Integrations ──────────────────────────────────────────────────────

function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api.getIntegrations();
    setIntegrations(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-slate-400 dark:text-slate-500">Loading...</p>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {integrations.map((int) => (
        <IntegrationCard key={int.id} integration={int} onStatusChange={load} />
      ))}
    </div>
  );
}

// ── SLA ───────────────────────────────────────────────────────────────

function SLASection() {
  const [warning, setWarning] = useState('5');
  const [violation, setViolation] = useState('7');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const w = await api.getAppState('sla_warning_days');
      const v = await api.getAppState('sla_violation_days');
      if (w) setWarning(w);
      if (v) setViolation(v);
    })();
  }, []);

  const handleSave = async () => {
    await api.setAppState('sla_warning_days', warning);
    await api.setAppState('sla_violation_days', violation);
    await api.saveEnvValue('SLA_WARNING_DAYS', warning);
    await api.saveEnvValue('SLA_VIOLATION_DAYS', violation);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-end gap-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Warning threshold (days)</label>
        <input type="number" min={1} value={warning} onChange={(e) => setWarning(e.target.value)} className="mt-1 w-24 rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Violation threshold (days)</label>
        <input type="number" min={1} value={violation} onChange={(e) => setViolation(e.target.value)} className="mt-1 w-24 rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm dark:bg-slate-800 dark:text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
      </div>
      <button onClick={handleSave} className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
        {saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  );
}

// ── Sync Schedule ─────────────────────────────────────────────────────

function SyncScheduleSection() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const val = await api.getAppState('auto_sync_enabled');
      if (val !== null) setEnabled(val === 'true');
    })();
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await api.setAppState('auto_sync_enabled', String(next));
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-700 dark:text-slate-300">Every 2 hours, 6 AM - 8 PM CT, weekdays</p>
      <label className="flex cursor-pointer items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{enabled ? 'Enabled' : 'Disabled'}</span>
        <div className="relative">
          <input type="checkbox" checked={enabled} onChange={toggle} className="sr-only" />
          <div className={`h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
          <div className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </div>
      </label>
    </div>
  );
}

// ── App Info ──────────────────────────────────────────────────────────

function AppInfoSection() {
  const [info, setInfo] = useState<{ version: string; dbPath: string; userData: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => { api.getAppInfo().then(setInfo); }, []);

  const handleReset = async () => {
    if (!window.confirm('This will delete all local data and recreate the database. Continue?')) return;
    setResetting(true);
    await api.resetDatabase();
    setResetting(false);
    window.alert('Database has been reset.');
  };

  if (!info) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Version</span>
        <span className="font-mono text-slate-800 dark:text-slate-200">{info.version}</span>
        <span className="text-slate-500 dark:text-slate-400">Database</span>
        <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-400">{info.dbPath}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => api.openDataFolder()} className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          <FolderOpen size={13} /> Open Data Folder
        </button>
        <button onClick={handleReset} disabled={resetting} className="flex items-center gap-1.5 rounded border border-red-300 dark:border-red-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40">
          <RotateCcw size={13} /> {resetting ? 'Resetting...' : 'Reset Database'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">{children}</h2>;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">{children}</div>;
}

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage integrations and sync configuration.</p>
      </div>

      <section>
        <SectionHeading>Integrations</SectionHeading>
        <IntegrationsSection />
      </section>

      <section>
        <SectionHeading>Sync Schedule</SectionHeading>
        <SectionCard><SyncScheduleSection /></SectionCard>
      </section>

      <section>
        <SectionHeading>SLA Configuration</SectionHeading>
        <SectionCard><SLASection /></SectionCard>
      </section>

      <section>
        <SectionHeading>App Info</SectionHeading>
        <SectionCard><AppInfoSection /></SectionCard>
      </section>
    </div>
  );
}
