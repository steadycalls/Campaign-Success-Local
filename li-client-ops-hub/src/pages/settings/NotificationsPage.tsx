import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { api } from '../../lib/ipc';
import type {
  NotificationPreferencesUI,
  NotificationHistoryItem,
  NotificationChannelUI,
  NotificationTypeId,
} from '../../types';

// ── Notification type metadata ───────────────────────────────────────

const NOTIFICATION_TYPES: Array<{
  type: NotificationTypeId;
  label: string;
  urgency: 'critical' | 'warning' | 'info';
  defaultDesktop: boolean;
  defaultDiscord: boolean;
}> = [
  { type: 'sla_violation', label: 'SLA Violation (>7d)', urgency: 'critical', defaultDesktop: true, defaultDiscord: true },
  { type: 'sla_warning', label: 'SLA Warning (5-7d)', urgency: 'warning', defaultDesktop: true, defaultDiscord: false },
  { type: 'budget_critical', label: 'Budget Critical (>90%)', urgency: 'critical', defaultDesktop: true, defaultDiscord: true },
  { type: 'budget_warning', label: 'Budget Warning (>75%)', urgency: 'warning', defaultDesktop: true, defaultDiscord: false },
  { type: 'sync_failed', label: 'Sync Failed', urgency: 'warning', defaultDesktop: true, defaultDiscord: false },
  { type: 'sync_stale', label: 'Sync Stale (12h+)', urgency: 'critical', defaultDesktop: true, defaultDiscord: true },
  { type: 'pit_expired', label: 'PIT Expired', urgency: 'warning', defaultDesktop: true, defaultDiscord: false },
  { type: 'new_leads', label: 'New Leads (5+/day)', urgency: 'info', defaultDesktop: true, defaultDiscord: false },
  { type: 'health_drop', label: 'Health Score Drop (10+)', urgency: 'warning', defaultDesktop: true, defaultDiscord: false },
  { type: 'health_critical', label: 'Health Critical (<35)', urgency: 'critical', defaultDesktop: true, defaultDiscord: true },
  { type: 'meeting_soon', label: 'Meeting in 15 min', urgency: 'info', defaultDesktop: true, defaultDiscord: false },
  { type: 'sync_complete', label: 'Sync Complete', urgency: 'info', defaultDesktop: false, defaultDiscord: false },
];

function urgencyBadge(u: string) {
  if (u === 'critical') return <span className="inline-block w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold text-center leading-4">!</span>;
  if (u === 'warning') return <span className="inline-block w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold text-center leading-4">!</span>;
  return <span className="inline-block w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 text-white text-[9px] font-bold text-center leading-4">i</span>;
}

// ── Helper to resolve channel from prefs ─────────────────────────────

function getChannelFlags(
  prefs: NotificationPreferencesUI,
  type: NotificationTypeId,
  defaults: { desktop: boolean; discord: boolean }
): { desktop: boolean; discord: boolean } {
  const ch = prefs.type_channels[type] as NotificationChannelUI | undefined;
  if (!ch) return defaults;
  return {
    desktop: ch === 'desktop' || ch === 'both',
    discord: ch === 'discord' || ch === 'both',
  };
}

function flagsToChannel(desktop: boolean, discord: boolean): NotificationChannelUI {
  if (desktop && discord) return 'both';
  if (desktop) return 'desktop';
  if (discord) return 'discord';
  return 'none';
}

// ── Page ─────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferencesUI | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordResult, setDiscordResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Local editable state
  const [desktopEnabled, setDesktopEnabled] = useState(true);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState('20:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [newLeadsThreshold, setNewLeadsThreshold] = useState(5);
  const [healthDropThreshold, setHealthDropThreshold] = useState(10);
  const [slaInterval, setSlaInterval] = useState(24);
  const [typeChannels, setTypeChannels] = useState<Record<string, { desktop: boolean; discord: boolean }>>({});

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      api.getNotificationPreferences(),
      api.getNotificationHistory(50),
    ]);
    setPrefs(p);
    setHistory(h);

    // Populate local state
    setDesktopEnabled(p.desktop_enabled === 1);
    setDiscordEnabled(p.discord_enabled === 1);
    setWebhookUrl(p.discord_webhook_url || '');
    setQuietEnabled(p.quiet_enabled === 1);
    setQuietStart(p.quiet_start || '20:00');
    setQuietEnd(p.quiet_end || '07:00');
    setNewLeadsThreshold(p.new_leads_threshold || 5);
    setHealthDropThreshold(p.health_drop_threshold || 10);
    setSlaInterval(p.sla_notify_interval_hours || 24);

    // Build per-type channel state
    const channels: Record<string, { desktop: boolean; discord: boolean }> = {};
    for (const nt of NOTIFICATION_TYPES) {
      channels[nt.type] = getChannelFlags(p, nt.type, {
        desktop: nt.defaultDesktop,
        discord: nt.defaultDiscord,
      });
    }
    setTypeChannels(channels);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const tc: Record<string, NotificationChannelUI> = {};
    for (const [type, flags] of Object.entries(typeChannels)) {
      tc[type] = flagsToChannel(flags.desktop, flags.discord);
    }

    await api.saveNotificationPreferences({
      type_channels: tc,
      desktop_enabled: desktopEnabled,
      discord_enabled: discordEnabled,
      discord_webhook_url: webhookUrl || null,
      quiet_start: quietStart,
      quiet_end: quietEnd,
      quiet_enabled: quietEnabled,
      new_leads_threshold: newLeadsThreshold,
      health_drop_threshold: healthDropThreshold,
      sla_notify_interval_hours: slaInterval,
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestDiscord = async () => {
    setTestingDiscord(true);
    setDiscordResult(null);
    const result = await api.testDiscordWebhook(webhookUrl);
    setDiscordResult(result);
    setTestingDiscord(false);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all notification history?')) return;
    await api.clearNotificationHistory();
    setHistory([]);
  };

  const toggleChannel = (type: string, channel: 'desktop' | 'discord') => {
    setTypeChannels((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type]?.[channel] },
    }));
  };

  if (loading) return <div className="p-6 text-sm text-slate-400 dark:text-slate-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Notification Settings</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Configure desktop and Discord notifications for alerts.
        </p>
      </div>

      {/* ── Channels ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Channels</h2>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={desktopEnabled} onChange={(e) => setDesktopEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Desktop Notifications (Windows toast)</span>
        </label>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={discordEnabled} onChange={(e) => setDiscordEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Discord Webhook</span>
        </label>

        {discordEnabled && (
          <div className="ml-7 space-y-2">
            <div className="flex gap-2">
              <input type="text" value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="flex-1 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:text-slate-200 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              <button onClick={handleTestDiscord} disabled={testingDiscord || !webhookUrl}
                className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40">
                {testingDiscord && <Loader2 size={12} className="animate-spin" />}
                Test
              </button>
            </div>
            {discordResult && (
              <p className={`text-xs ${discordResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {discordResult.success ? 'Webhook test sent!' : discordResult.message || 'Failed'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Per-type settings ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Per-Notification Settings</h2>
        <div className="overflow-auto rounded border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Notification Type</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Urgency</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Desktop</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Discord</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {NOTIFICATION_TYPES.map((nt) => {
                const ch = typeChannels[nt.type] || { desktop: false, discord: false };
                return (
                  <tr key={nt.type} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{nt.label}</td>
                    <td className="px-3 py-2 text-center">{urgencyBadge(nt.urgency)}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={ch.desktop}
                        onChange={() => toggleChannel(nt.type, 'desktop')}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={ch.discord}
                        onChange={() => toggleChannel(nt.type, 'discord')}
                        disabled={!discordEnabled}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500 disabled:opacity-30" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Thresholds ────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Thresholds</h2>
        <div className="flex flex-wrap gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">New leads threshold</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={1} value={newLeadsThreshold}
                onChange={(e) => setNewLeadsThreshold(parseInt(e.target.value) || 5)}
                className="w-20 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
              <span className="text-xs text-slate-400 dark:text-slate-500">contacts/day</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Health drop threshold</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={1} value={healthDropThreshold}
                onChange={(e) => setHealthDropThreshold(parseInt(e.target.value) || 10)}
                className="w-20 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
              <span className="text-xs text-slate-400 dark:text-slate-500">points</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Re-notify interval</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={1} value={slaInterval}
                onChange={(e) => setSlaInterval(parseInt(e.target.value) || 24)}
                className="w-20 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
              <span className="text-xs text-slate-400 dark:text-slate-500">hours</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quiet Hours ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Quiet Hours</h2>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={quietEnabled} onChange={(e) => setQuietEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Enable quiet hours (suppress desktop notifications)</span>
        </label>
        {quietEnabled && (
          <div className="flex items-center gap-2 ml-7">
            <span className="text-xs text-slate-500 dark:text-slate-400">From</span>
            <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
            <span className="text-xs text-slate-500 dark:text-slate-400">to</span>
            <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none" />
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500 ml-7">
          Desktop notifications silenced during quiet hours. Discord still sends.
        </p>
      </section>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div>
        <button onClick={handleSave} disabled={saving}
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* ── History ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Notification History</h2>
          {history.length > 0 && (
            <button onClick={handleClearHistory}
              className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No notifications sent yet.</p>
        ) : (
          <div className="overflow-auto rounded border border-slate-200 dark:border-slate-700 max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Time</th>
                  <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Notification</th>
                  <th className="px-2 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400">Type</th>
                  <th className="px-2 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400">Desktop</th>
                  <th className="px-2 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400">Discord</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(h.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                      {h.title}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {urgencyBadge(h.urgency || 'info')}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {h.sent_desktop ? (
                        <span className="text-green-600 dark:text-green-400">{h.desktop_clicked ? '\u2713\u2713' : '\u2713'}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {h.sent_discord ? (
                        <span className="text-green-600 dark:text-green-400">\u2713</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
