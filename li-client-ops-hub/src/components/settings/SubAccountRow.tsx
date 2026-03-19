import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Copy, Check, ExternalLink } from 'lucide-react';
import { api } from '../../lib/ipc';
import type { SubAccount } from '../../types';

const statusConfig: Record<string, { dot: string; label: string }> = {
  valid: { dot: 'bg-green-500', label: 'Valid' },
  invalid: { dot: 'bg-red-500', label: 'Invalid' },
  untested: { dot: 'bg-amber-400', label: 'Untested' },
  not_configured: { dot: 'bg-slate-300', label: 'None' },
};

interface Props {
  account: SubAccount;
  onUpdate: () => void;
}

export default function SubAccountRow({ account, onUpdate }: Props) {
  const [pitValue, setPitValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Listen for sync progress for this specific sub-account
  useEffect(() => {
    if (!syncing) return;
    const handler = (_event: unknown, data: { companyId?: string; message?: string; phase?: string }) => {
      if (data?.companyId === account.id) {
        if (data.phase === 'complete') {
          setSyncMsg(null);
        } else if (data.message) {
          setSyncMsg(data.message);
        }
      }
    };
    api.onSyncProgress(handler as (...args: unknown[]) => void);
    return () => { api.offSyncProgress(handler as (...args: unknown[]) => void); };
  }, [syncing, account.id]);

  const cfg = statusConfig[account.pit_status] ?? statusConfig.not_configured;
  const hasToken = account.pit_status !== 'not_configured';
  const isValid = account.pit_status === 'valid';

  const handleSave = async () => {
    if (!pitValue.trim()) return;
    setSaving(true);
    await api.savePit(account.id, pitValue.trim());
    setPitValue('');
    setSaving(false);
    setTestMsg(null);
    onUpdate();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg(null);
    const result = await api.testPit(account.id);
    setTestMsg(result.success ? result.message : `Error: ${result.message}`);
    setTesting(false);
    onUpdate();
  };

  const handleSync = async () => {
    setSyncing(true);
    await api.syncSubAccount(account.id);
    setSyncing(false);
    onUpdate();
  };

  const handleToggle = async (enabled: boolean) => {
    await api.toggleSubAccountSync(account.id, enabled);
    onUpdate();
  };

  const copyLocationId = () => {
    if (account.ghl_location_id) {
      navigator.clipboard.writeText(account.ghl_location_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      {/* Name */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-slate-900">{account.name}</span>
          {account.ghl_location_id && (
            <button
              onClick={() => api.openInChrome(`https://app.gohighlevel.com/v2/location/${account.ghl_location_id}/settings/private-integrations`)}
              className="inline-flex items-center gap-0.5 rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-100 hover:border-teal-300 flex-shrink-0 transition-colors"
              title="Open PIT settings in GHL (Chrome)"
            >
              <ExternalLink size={10} />
              GHL
            </button>
          )}
        </div>
        {(account.contacts_api_total || account.contact_count > 0) && (
          <div className="text-[10px] text-slate-400">
            {account.contacts_api_total
              ? `${account.contacts_api_total.toLocaleString()} contacts`
              : `${account.contact_count.toLocaleString()} contacts`}
            {account.phone_numbers_count > 0 && ` \u00b7 ${account.phone_numbers_count} phones`}
            {account.users_count > 0 && ` \u00b7 ${account.users_count} users`}
            {account.workflows_count > 0 && ` \u00b7 ${account.workflows_count} workflows`}
          </div>
        )}
      </td>

      {/* Location ID */}
      <td className="px-3 py-2.5">
        <button
          onClick={copyLocationId}
          className="flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-slate-800"
          title={account.ghl_location_id ?? ''}
        >
          {account.ghl_location_id?.slice(0, 10)}...
          {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
        </button>
      </td>

      {/* PIT input */}
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <input
            type="password"
            value={pitValue}
            onChange={(e) => setPitValue(e.target.value)}
            placeholder={hasToken ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'Paste PIT'}
            className="w-28 rounded border border-slate-200 px-2 py-1 font-mono text-[11px] focus:border-teal-500 focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={!pitValue.trim() || saving}
            className="rounded bg-teal-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-teal-700 disabled:opacity-30"
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
          <span className="text-xs text-slate-600">{cfg.label}</span>
        </div>
        {account.pit_last_error && account.pit_status === 'invalid' && (
          <p className="mt-0.5 text-[10px] text-red-500 truncate max-w-[120px]" title={account.pit_last_error}>
            {account.pit_last_error}
          </p>
        )}
        {testMsg && (
          <p className={`mt-0.5 text-[10px] truncate max-w-[120px] ${testMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
            {testMsg}
          </p>
        )}
      </td>

      {/* Test */}
      <td className="px-3 py-2.5">
        {hasToken && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            {testing ? <Loader2 size={10} className="animate-spin" /> : 'Test'}
          </button>
        )}
      </td>

      {/* Sync */}
      <td className="px-3 py-2.5">
        {isValid && (
          <div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-40"
            >
              {syncing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              {syncing ? 'Syncing' : 'Sync'}
            </button>
            {syncMsg && (
              <p className="mt-0.5 text-[10px] text-teal-600 truncate max-w-[120px]">{syncMsg}</p>
            )}
          </div>
        )}
      </td>

      {/* Auto-sync toggle */}
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={!!account.sync_enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={!isValid}
          className="rounded disabled:opacity-30"
        />
      </td>
    </tr>
  );
}
