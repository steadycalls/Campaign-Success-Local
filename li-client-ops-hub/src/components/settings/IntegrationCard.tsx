import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Circle, Loader2 } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { Integration } from '../../types';
import CredentialInput from './CredentialInput';

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  connected: { icon: CheckCircle, color: 'text-green-600', label: 'Connected' },
  configured: { icon: Circle, color: 'text-blue-500', label: 'Configured' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error' },
  not_configured: { icon: Circle, color: 'text-slate-400', label: 'Not Configured' },
};

// ── Doc link definitions ─────────────────────────────────────────────

interface DocLink {
  label: string;
  url: string;
}

const INTEGRATION_DOC_LINKS: Record<string, DocLink[]> = {
  readai_api: [
    { label: 'API Reference', url: 'https://support.read.ai/hc/en-us/articles/49381161088659-API-Reference' },
    { label: 'API Keys & Auth', url: 'https://support.read.ai/hc/en-us/articles/49381161088531-API-Keys-Authentication' },
  ],
  readai_mcp: [
    { label: 'MCP Server Docs', url: 'https://support.read.ai/hc/en-us/articles/49381161088787-MCP-Server' },
    { label: 'MCP Overview', url: 'https://support.read.ai/hc/en-us/articles/49381161088723-Read-AI-API-and-MCP-Overview' },
  ],
  ghl_agency: [
    { label: 'GHL API Docs', url: 'https://highlevel.stoplight.io/docs/integrations' },
  ],
  teamwork: [
    { label: 'Teamwork API', url: 'https://apidocs.teamwork.com/' },
  ],
  discord: [
    { label: 'Discord API', url: 'https://discord.com/developers/docs/intro' },
  ],
  gdrive: [
    { label: 'Drive API', url: 'https://developers.google.com/drive/api/reference/rest/v3' },
  ],
};

function DocLinkButton({ integrationName }: { integrationName: string }) {
  const links = INTEGRATION_DOC_LINKS[integrationName] || [];
  const [showMenu, setShowMenu] = useState(false);

  if (links.length === 0) return null;

  if (links.length === 1) {
    return (
      <button
        onClick={() => window.open(links[0].url, '_blank')}
        className="absolute bottom-3 right-3 w-6 h-6 flex items-center justify-center
          rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600
          transition-colors text-xs font-medium"
        title={`Open ${links[0].label}`}
      >
        ?
      </button>
    );
  }

  return (
    <div className="absolute bottom-3 right-3">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-6 h-6 flex items-center justify-center rounded-full
          bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600
          transition-colors text-xs font-medium"
        title="API Documentation"
      >
        ?
      </button>
      {showMenu && (
        <div className="absolute bottom-8 right-0 bg-white border border-slate-200
          rounded-lg shadow-lg py-1 min-w-[180px] z-50">
          {links.map((link, i) => (
            <button
              key={i}
              onClick={() => { window.open(link.url, '_blank'); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-600
                hover:bg-slate-50 hover:text-teal-600"
            >
              {link.label} &#8599;
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Integration Card ─────────────────────────────────────────────────

interface Props {
  integration: Integration;
  onStatusChange: () => void;
}

export default function IntegrationCard({ integration, onStatusChange }: Props) {
  const envKeys: string[] = integration.env_keys ? JSON.parse(integration.env_keys) : [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [hasValues, setHasValues] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadValues = useCallback(async () => {
    const results: Record<string, string> = {};
    const has: Record<string, boolean> = {};
    for (const key of envKeys) {
      const res = await api.getEnvValue(key);
      results[key] = '';
      has[key] = res.hasValue;
    }
    setValues(results);
    setHasValues(has);
    setDirty({});
  }, [integration.name]);

  useEffect(() => { loadValues(); }, [loadValues]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    setSaving(true);
    for (const key of envKeys) {
      if (dirty[key] && values[key]) {
        await api.saveEnvValue(key, values[key]);
      }
    }
    setSaving(false);
    setDirty({});
    await loadValues();
    onStatusChange();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await api.testIntegration(integration.name);
    setTestResult({
      success: result.success,
      message: result.success ? result.message ?? 'Connection successful' : result.error ?? 'Unknown error',
    });
    setTesting(false);
    onStatusChange();
  };

  const hasDirtyFields = Object.values(dirty).some(Boolean);
  const cfg = statusConfig[integration.status] ?? statusConfig.not_configured;
  const StatusIcon = cfg.icon;

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{integration.display_name}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{integration.name}</p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
          <StatusIcon size={14} />
          {cfg.label}
        </div>
      </div>

      {envKeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {envKeys.map((key) => (
            <CredentialInput key={key} label={key} value={values[key] ?? ''} hasValue={hasValues[key] ?? false} onChange={(v) => handleChange(key, v)} />
          ))}
        </div>
      )}

      {testResult && (
        <div className={`mt-3 rounded px-3 py-2 text-xs ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.message}
        </div>
      )}

      {integration.last_error && !testResult && (
        <p className="mt-3 text-xs text-red-500">{integration.last_error}</p>
      )}

      {integration.last_tested_at && (
        <p className="mt-2 text-xs text-slate-400">Last tested: {new Date(integration.last_tested_at).toLocaleString()}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={handleSave} disabled={!hasDirtyFields || saving} className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={handleTest} disabled={testing} className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          {testing && <Loader2 size={12} className="animate-spin" />}
          Test Connection
        </button>
      </div>

      <DocLinkButton integrationName={integration.name} />
    </div>
  );
}
