import { useState, useEffect } from 'react';
import { Upload, CheckCircle2, XCircle, Loader2, RefreshCw, Users, ExternalLink } from 'lucide-react';
import { api } from '../../lib/ipc';

// ── Types ────────────────────────────────────────────────────────────

interface ServiceAccountTest {
  drive: boolean;
  gmail: boolean;
  calendar: boolean;
  directory: boolean;
  errors: string[];
}

interface TeamMailbox {
  email: string;
  name: string;
  is_active: number;
}

interface OAuthAccount {
  id: string;
  email: string | null;
  authorized_at: string | null;
  expires_at: string | null;
}

// ── Main Page ────────────────────────────────────────────────────────

export default function GoogleAuthPage() {
  const [tab, setTab] = useState<'service_account' | 'oauth'>('service_account');
  const [isServiceAccount, setIsServiceAccount] = useState(false);
  const [loading, setLoading] = useState(true);

  // Service account state
  const [keyJson, setKeyJson] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<ServiceAccountTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [mailboxes, setMailboxes] = useState<TeamMailbox[]>([]);
  const [discovering, setDiscovering] = useState(false);

  // OAuth state
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccount[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const [authResult, setAuthResult] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [isSA, accounts, mboxes] = await Promise.all([
        api.googleIsServiceAccountMode(),
        api.googleListAccounts(),
        api.googleGetTeamMailboxes(),
      ]);
      setIsServiceAccount(isSA);
      setOauthAccounts(accounts as unknown as OAuthAccount[]);
      setMailboxes(mboxes as TeamMailbox[]);
      if (isSA) setTab('service_account');
    } catch { /* ignore */ }
    setLoading(false);
  };

  // ── Service Account handlers ───────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setKeyJson(reader.result as string);
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!keyJson.trim() || !adminEmail.trim()) {
      setSaveResult({ success: false, message: 'Both JSON key and admin email are required.' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await api.googleSetServiceAccount(keyJson, adminEmail.trim());
      if (result.success) {
        setSaveResult({ success: true, message: 'Service account saved.' });
        setIsServiceAccount(true);
        // Auto-test after save
        await handleTest();
      } else {
        setSaveResult({ success: false, message: result.error || 'Failed to save.' });
      }
    } catch (err: unknown) {
      setSaveResult({ success: false, message: err instanceof Error ? err.message : 'Failed' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.googleTestServiceAccount();
      setTestResult(result as ServiceAccountTest);
    } catch (err: unknown) {
      setTestResult({ drive: false, gmail: false, calendar: false, directory: false, errors: [err instanceof Error ? err.message : 'Test failed'] });
    }
    setTesting(false);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await api.googleDiscoverTeamMailboxes();
      const mboxes = await api.googleGetTeamMailboxes();
      setMailboxes(mboxes as TeamMailbox[]);
    } catch { /* ignore */ }
    setDiscovering(false);
  };

  const handleToggleMailbox = async (email: string, active: boolean) => {
    await api.googleToggleTeamMailbox(email, active);
    setMailboxes(prev => prev.map(m => m.email === email ? { ...m, is_active: active ? 1 : 0 } : m));
  };

  // ── OAuth handlers ─────────────────────────────────────────────────

  const handleAuthorize = async () => {
    setAuthorizing(true);
    setAuthResult(null);
    try {
      const result = await api.authorizeGoogleDrive();
      if (result.success) {
        setAuthResult('Authorized successfully');
        await loadAll();
      } else {
        setAuthResult(result.message || 'Authorization failed');
      }
    } catch (err: unknown) {
      setAuthResult(err instanceof Error ? err.message : 'Authorization failed');
    }
    setAuthorizing(false);
  };

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Google Workspace</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Connect Google Drive, Gmail, and Calendar. Service Account mode is recommended for organizations.
      </p>

      {/* Mode indicator */}
      <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${isServiceAccount ? 'bg-green-500' : oauthAccounts.length > 0 ? 'bg-teal-500' : 'bg-slate-300'}`} />
        <div className="text-sm text-slate-700 dark:text-slate-300">
          {isServiceAccount ? (
            <><span className="font-medium text-green-700 dark:text-green-400">Service Account</span> — domain-wide delegation active</>
          ) : oauthAccounts.length > 0 ? (
            <><span className="font-medium text-teal-700 dark:text-teal-400">OAuth</span> — {oauthAccounts.length} account{oauthAccounts.length !== 1 ? 's' : ''} authorized</>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Not configured</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mt-5">
        <button onClick={() => setTab('service_account')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'service_account' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Service Account
        </button>
        <button onClick={() => setTab('oauth')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'oauth' ? 'border-teal-500 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          OAuth
        </button>
      </div>

      {/* Service Account Tab */}
      {tab === 'service_account' && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload your Google service account JSON key and specify an admin email for domain-wide delegation.
            This allows the app to access Drive, Gmail, Calendar, and Directory for all users in your Google Workspace domain.
          </p>

          {/* Upload JSON key */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Service Account JSON Key</label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <Upload size={13} />
                Choose File
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
              {keyJson && <span className="text-xs text-green-600 dark:text-green-400">Key loaded</span>}
            </div>
            {keyJson && (
              <pre className="mt-2 rounded bg-slate-100 dark:bg-slate-800 p-2 text-[11px] text-slate-600 dark:text-slate-400 overflow-x-auto max-h-24">
                {(() => { try { const k = JSON.parse(keyJson); return `Project: ${k.project_id}\nEmail: ${k.client_email}\nClient ID: ${k.client_id}`; } catch { return 'Invalid JSON'; } })()}
              </pre>
            )}
          </div>

          {/* Admin email */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Admin Email (for impersonation)</label>
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
              placeholder="admin@yourdomain.com"
              className="w-full max-w-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none" />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              A Google Workspace admin. The service account will impersonate this user for Directory API access.
            </p>
          </div>

          {/* Save + Test */}
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving || !keyJson.trim()}
              className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Save & Test
            </button>
            {isServiceAccount && (
              <button onClick={handleTest} disabled={testing}
                className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Re-test Access
              </button>
            )}
          </div>

          {saveResult && (
            <div className={`rounded px-3 py-2 text-xs ${saveResult.success ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
              {saveResult.message}
            </div>
          )}

          {/* Test results */}
          {testResult && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">API Access Status</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['drive', 'gmail', 'calendar', 'directory'] as const).map(svc => (
                  <div key={svc} className="flex items-center gap-2 text-sm">
                    {testResult[svc]
                      ? <CheckCircle2 size={14} className="text-green-500" />
                      : <XCircle size={14} className="text-red-400" />}
                    <span className={testResult[svc] ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {svc.charAt(0).toUpperCase() + svc.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
              {testResult.errors.length > 0 && (
                <div className="mt-2 text-xs text-red-500 dark:text-red-400 space-y-0.5">
                  {testResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Team Mailboxes */}
          {isServiceAccount && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Team Mailboxes</h3>
                <button onClick={handleDiscover} disabled={discovering}
                  className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                  {discovering ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                  Discover Users
                </button>
              </div>
              {mailboxes.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">No mailboxes discovered yet. Click "Discover Users" to find workspace accounts.</p>
              ) : (
                <div className="space-y-1">
                  {mailboxes.map(m => (
                    <label key={m.email} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-2 py-1">
                      <input type="checkbox" checked={!!m.is_active}
                        onChange={() => handleToggleMailbox(m.email, !m.is_active)}
                        className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
                      <span className="text-slate-700 dark:text-slate-300">{m.name || m.email}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{m.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Active mailboxes will have their Gmail and Calendar synced when using Service Account mode.
              </p>
            </div>
          )}
        </div>
      )}

      {/* OAuth Tab */}
      {tab === 'oauth' && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each user authorizes individually via Google's consent screen. You'll only see data the authorized user has access to.
          </p>

          <button onClick={handleAuthorize} disabled={authorizing}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {authorizing ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Add Account
          </button>

          {authResult && (
            <div className={`rounded px-3 py-2 text-xs ${authResult.includes('success') ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
              {authResult}
            </div>
          )}

          {oauthAccounts.length > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Authorized Accounts</h3>
              <div className="space-y-2">
                {oauthAccounts.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={14} className="text-green-500" />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{a.email || a.id}</span>
                    {a.authorized_at && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                        Authorized {new Date(a.authorized_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">No accounts authorized yet.</p>
          )}

          {isServiceAccount && (
            <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Service Account mode is active. OAuth accounts are only needed as a fallback or for personal Drive access.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
