import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Circle, Loader2, ExternalLink, ArrowRight } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { Integration, ReadAiAuthStatus } from '../../types';
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
    { label: 'OAuth Docs', url: 'https://support.read.ai/hc/en-us/articles/49381161088531-API-Keys-Authentication' },
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
  kinsta: [
    { label: 'Kinsta API', url: 'https://kinsta.com/docs/kinsta-api/' },
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
          rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300
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
          bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300
          transition-colors text-xs font-medium"
        title="API Documentation"
      >
        ?
      </button>
      {showMenu && (
        <div className="absolute bottom-8 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          rounded-lg shadow-lg py-1 min-w-[180px] z-50">
          {links.map((link, i) => (
            <button
              key={i}
              onClick={() => { window.open(link.url, '_blank'); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400
                hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-teal-600 dark:hover:text-teal-400"
            >
              {link.label} &#8599;
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Read.ai OAuth Section ────────────────────────────────────────────

function ReadAiOAuthSection({ onStatusChange }: { onStatusChange: () => void }) {
  const [readaiAuth, setReadaiAuth] = useState<ReadAiAuthStatus | null>(null);
  const [curlCommand, setCurlCommand] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [exchanging, setExchanging] = useState(false);
  const [exchangeStep, setExchangeStep] = useState<string | null>(null);
  const [readaiTesting, setReadaiTesting] = useState(false);
  const [readaiResult, setReadaiResult] = useState<{ success: boolean; message: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadAuthStatus = useCallback(() => {
    api.readaiGetAuthStatus().then(setReadaiAuth);
  }, []);

  useEffect(() => { loadAuthStatus(); }, [loadAuthStatus]);

  const handleOpenAuth = async () => {
    setReadaiResult(null);
    const result = await api.readaiOpenAuthPage();
    if (!result.success) {
      setReadaiResult({ success: false, message: result.message ?? 'Failed to open auth page' });
    }
  };

  const handleExchangeCurl = async () => {
    if (!curlCommand.trim() && !authCode.trim()) return;
    setExchanging(true);
    setReadaiResult(null);

    setExchangeStep('Parsing curl command...');
    await new Promise(r => setTimeout(r, 200));

    // Build the payload: curl command + optional auth code override
    const payload = authCode.trim()
      ? curlCommand.trim() + ` -d "code=${authCode.trim()}"`
      : curlCommand.trim();

    setExchangeStep('Sending token exchange request...');
    const result = await api.readaiExchangeCurl(payload);

    if (result.success) {
      setExchangeStep('Token stored successfully!');
      setCurlCommand('');
      setAuthCode('');
      loadAuthStatus();
      onStatusChange();
    } else {
      setExchangeStep(null);
    }
    setReadaiResult({ success: result.success, message: result.message });
    setExchanging(false);
    if (result.success) setTimeout(() => setExchangeStep(null), 2000);
  };

  const handleTest = async () => {
    setReadaiTesting(true);
    setReadaiResult(null);
    const result = await api.readaiTestConnection();
    setReadaiResult({ success: result.success, message: result.message });
    setReadaiTesting(false);
    onStatusChange();
  };

  const handleRevoke = async () => {
    setRevoking(true);
    setReadaiResult(null);
    await api.readaiRevoke();
    setReadaiAuth(null);
    setReadaiResult({ success: true, message: 'Authorization revoked.' });
    setRevoking(false);
    onStatusChange();
  };

  const handleReauthorize = () => {
    setReadaiResult(null);
    setReadaiAuth({ authorized: false, email: null, expiresAt: null, isExpired: false, authorizedAt: null, lastRefreshed: null, hasRefreshToken: false });
  };

  const isAuthorized = readaiAuth?.authorized === true;

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-700/50 pt-4">
      <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3">Authorization</h4>

      {/* Auth status display */}
      {isAuthorized && (
        <div className={`rounded px-3 py-2 text-xs mb-3 ${
          !readaiAuth.hasRefreshToken ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' :
          readaiAuth.isExpired ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' :
          'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
        }`}>
          <div>Authorized as <span className="font-medium">{readaiAuth.email ?? 'unknown'}</span></div>
          {readaiAuth.expiresAt && (
            <div className="mt-0.5">
              {readaiAuth.isExpired
                ? readaiAuth.hasRefreshToken
                  ? 'Token expired. Will auto-refresh on next sync.'
                  : 'Token expired. No refresh token — please re-authorize.'
                : `Token expires ${new Date(readaiAuth.expiresAt).toLocaleTimeString()} (auto-refreshes)`}
            </div>
          )}
          {readaiAuth.lastRefreshed && (
            <div className="mt-0.5 opacity-75">
              Last refreshed: {new Date(readaiAuth.lastRefreshed).toLocaleString()}
            </div>
          )}
          {!readaiAuth.hasRefreshToken && (
            <div className="mt-1 font-medium">
              No refresh token stored. Re-authorize with offline_access scope to enable auto-refresh.
            </div>
          )}
        </div>
      )}

      {/* Test/action result */}
      {readaiResult && (
        <div className={`rounded px-3 py-2 text-xs mb-3 ${readaiResult.success ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
          {readaiResult.message}
        </div>
      )}

      {/* Not authorized: show auth flow */}
      {!isAuthorized && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            1. Click "Open Read.ai Auth" — enter your Client ID, Client Secret, and redirect URI<br />
            2. Authorize your account<br />
            3. Copy the <strong>authorization code</strong> shown on the result page<br />
            4. Click "Copy Command" and paste the full curl command below
          </p>

          <button
            onClick={handleOpenAuth}
            className="flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <ExternalLink size={12} />
            Open Read.ai Auth
          </button>

          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Authorization Code</label>
              <input
                type="text"
                value={authCode}
                onChange={e => setAuthCode(e.target.value)}
                placeholder="Paste the authorization code from the result page..."
                className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Curl Command</label>
              <textarea
                value={curlCommand}
                onChange={e => setCurlCommand(e.target.value)}
                placeholder='Paste the full curl command (click "Copy Command" on the result page)'
                rows={3}
                className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:border-teal-400 focus:outline-none resize-y"
              />
            </div>
            <button
              onClick={handleExchangeCurl}
              disabled={(!curlCommand.trim() && !authCode.trim()) || exchanging}
              className="flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exchanging && <Loader2 size={12} className="animate-spin" />}
              Exchange Token
            </button>
            {exchangeStep && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {exchanging && <Loader2 size={10} className="animate-spin text-teal-500" />}
                {!exchanging && exchangeStep.includes('successfully') && <CheckCircle size={10} className="text-green-500" />}
                {exchangeStep}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Authorized: show action buttons */}
      {isAuthorized && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTest}
            disabled={readaiTesting}
            className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {readaiTesting && <Loader2 size={12} className="animate-spin" />}
            Test Connection
          </button>
          <button
            onClick={handleReauthorize}
            className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
          >
            Re-authorize
          </button>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {revoking ? 'Revoking...' : 'Revoke'}
          </button>
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

// ── Google Service Section (replaces credential fields for Gmail/GDrive) ─

function GoogleServiceSection({ authStatus }: { authStatus: { email: string | null; authorized_at: string | null; expires_at: string | null } | null }) {
  const navigate = useNavigate();

  return (
    <div className="mt-4">
      {authStatus?.email ? (
        <div className="rounded bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400 mb-3">
          Authorized as <span className="font-medium">{authStatus.email}</span>
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Not yet authorized. Set up authentication in the Google settings page.
        </p>
      )}
      <button
        onClick={() => navigate('/settings/google')}
        className="flex items-center gap-1.5 rounded border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/30 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/50"
      >
        Manage Google Auth
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

export default function IntegrationCard({ integration, onStatusChange }: Props) {
  const envKeys: string[] = integration.env_keys ? JSON.parse(integration.env_keys) : [];
  const isGdrive = integration.name === 'gdrive';
  const isGmail = integration.name === 'gmail';
  const isGoogleService = isGdrive || isGmail;
  const isReadAi = integration.name === 'readai_api';

  const [values, setValues] = useState<Record<string, string>>({});
  const [hasValues, setHasValues] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [authStatus, setAuthStatus] = useState<{ email: string | null; authorized_at: string | null; expires_at: string | null } | null>(null);

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

  // Load Google Drive auth status
  useEffect(() => {
    if (isGdrive) {
      api.getGdriveAuthStatus().then(setAuthStatus);
    }
  }, [isGdrive]);

  const handleAuthorize = async () => {
    setAuthorizing(true);
    setTestResult(null);
    const result = await api.authorizeGoogleDrive();
    if (result.success) {
      setTestResult({ success: true, message: `Authorized as ${result.email}` });
      api.getGdriveAuthStatus().then(setAuthStatus);
    } else {
      setTestResult({ success: false, message: result.message ?? 'Authorization failed' });
    }
    setAuthorizing(false);
    onStatusChange();
  };

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
    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{integration.display_name}</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {isReadAi ? 'OAuth 2.1 integration for meeting data, summaries, transcripts, and recordings.'
              : isGoogleService ? 'Managed via Google Workspace auth. Uses OAuth or Service Account.'
              : integration.name}
          </p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
          <StatusIcon size={14} />
          {cfg.label}
        </div>
      </div>

      {/* Google services: link to Google Auth page instead of credential fields */}
      {isGoogleService && <GoogleServiceSection authStatus={authStatus} />}

      {/* Standard credential fields (non-Google, non-ReadAi) */}
      {!isGoogleService && envKeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {envKeys.map((key) => (
            <CredentialInput key={key} label={key} value={values[key] ?? ''} hasValue={hasValues[key] ?? false} onChange={(v) => handleChange(key, v)} />
          ))}
          <button onClick={handleSave} disabled={!hasDirtyFields || saving}
            className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
      )}

      {testResult && (
        <div className={`mt-3 rounded px-3 py-2 text-xs ${testResult.success ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
          {testResult.message}
        </div>
      )}

      {integration.last_error && !testResult && (
        <p className="mt-3 text-xs text-red-500">{integration.last_error}</p>
      )}

      {integration.last_tested_at && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Last tested: {new Date(integration.last_tested_at).toLocaleString()}</p>
      )}

      {/* Read.ai OAuth section */}
      {isReadAi && (
        <ReadAiOAuthSection onStatusChange={onStatusChange} />
      )}

      {/* Buttons — only for non-Google, non-ReadAi integrations */}
      {!isGoogleService && !isReadAi && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handleTest} disabled={testing} className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
            {testing && <Loader2 size={12} className="animate-spin" />}
            Test Connection
          </button>
        </div>
      )}

      <DocLinkButton integrationName={integration.name} />
    </div>
  );
}
