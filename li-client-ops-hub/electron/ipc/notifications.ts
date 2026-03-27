import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { getNotificationPreferences } from '../../notifications/dispatcher';

export function registerNotificationHandlers(): void {
  // ── Get preferences ────────────────────────────────────────────────
  ipcMain.handle('notifications:getPreferences', () => {
    return getNotificationPreferences();
  });

  // ── Save preferences ───────────────────────────────────────────────
  ipcMain.handle('notifications:savePreferences', (_e, prefs: Record<string, unknown>) => {
    execute(
      `UPDATE notification_preferences SET
        type_channels = ?,
        desktop_enabled = ?,
        discord_enabled = ?,
        discord_webhook_url = ?,
        quiet_start = ?,
        quiet_end = ?,
        quiet_enabled = ?,
        new_leads_threshold = ?,
        health_drop_threshold = ?,
        sla_notify_interval_hours = ?,
        updated_at = datetime('now')
      WHERE id = 'default'`,
      [
        JSON.stringify(prefs.type_channels || {}),
        prefs.desktop_enabled ? 1 : 0,
        prefs.discord_enabled ? 1 : 0,
        (prefs.discord_webhook_url as string) || null,
        (prefs.quiet_start as string) || '20:00',
        (prefs.quiet_end as string) || '07:00',
        prefs.quiet_enabled ? 1 : 0,
        (prefs.new_leads_threshold as number) || 5,
        (prefs.health_drop_threshold as number) || 10,
        (prefs.sla_notify_interval_hours as number) || 24,
      ]
    );
    return { success: true };
  });

  // ── Test Discord webhook ───────────────────────────────────────────
  ipcMain.handle('notifications:testDiscord', async (_e, webhookUrl: string) => {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: '\u2705 Client Ops Hub Connected',
              description:
                'Discord webhook is working. Notifications will be posted here.',
              color: 0x0d9488,
              timestamp: new Date().toISOString(),
              footer: { text: 'Client Ops Hub — Test Notification' },
            },
          ],
        }),
      });
      return { success: res.ok, status: res.status };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── Get history ────────────────────────────────────────────────────
  ipcMain.handle('notifications:getHistory', (_e, limit?: number) => {
    return queryAll(
      `SELECT * FROM notification_history ORDER BY created_at DESC LIMIT ?`,
      [limit || 50]
    );
  });

  // ── Clear history ──────────────────────────────────────────────────
  ipcMain.handle('notifications:clearHistory', () => {
    execute('DELETE FROM notification_history');
    return { success: true };
  });

  // ── Get unread count ───────────────────────────────────────────────
  ipcMain.handle('notifications:getUnreadCount', () => {
    const row = queryOne(
      `SELECT COUNT(*) as cnt FROM notification_history
       WHERE created_at >= datetime('now', '-24 hours')
         AND desktop_clicked = 0
         AND urgency IN ('critical', 'warning')`,
      []
    );
    return (row?.cnt as number) || 0;
  });
}
