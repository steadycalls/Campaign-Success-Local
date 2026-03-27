import { Notification } from 'electron';
import { randomUUID } from 'crypto';
import path from 'path';
import { queryOne, execute } from '../db/client';
import { logger } from '../lib/logger';
import type {
  NotificationEvent,
  NotificationPreferences,
  NotificationChannel,
  NotificationType,
} from './types';
import { DEFAULT_CHANNELS } from './types';

// ── Main window ref (set from main.ts) ───────────────────────────────

let mainWindowRef: { show: () => void; focus: () => void; webContents: { send: (ch: string, data: unknown) => void } } | null = null;

export function setNotificationWindow(
  win: typeof mainWindowRef
): void {
  mainWindowRef = win;
}

// ── Preferences ──────────────────────────────────────────────────────

export function getNotificationPreferences(): NotificationPreferences {
  const row = queryOne(
    'SELECT * FROM notification_preferences WHERE id = ?',
    ['default']
  );
  if (!row) {
    execute("INSERT OR IGNORE INTO notification_preferences (id) VALUES ('default')");
    return getNotificationPreferences();
  }
  return {
    ...row,
    type_channels: JSON.parse((row.type_channels as string) || '{}'),
  } as unknown as NotificationPreferences;
}

// ── Dispatch ─────────────────────────────────────────────────────────

export async function dispatchNotification(
  event: NotificationEvent
): Promise<void> {
  const prefs = getNotificationPreferences();

  // Channel for this type
  const channel: NotificationChannel =
    prefs.type_channels[event.type] ??
    DEFAULT_CHANNELS[event.type as NotificationType] ??
    'desktop';

  if (channel === 'none') return;

  // Dedup
  if (isDuplicate(event, prefs)) return;

  // Quiet hours (desktop only)
  const isQuiet =
    prefs.quiet_enabled === 1 &&
    isQuietHours(prefs.quiet_start, prefs.quiet_end);

  let sentDesktop = false;
  let sentDiscord = false;

  if (
    (channel === 'desktop' || channel === 'both') &&
    prefs.desktop_enabled === 1 &&
    !isQuiet
  ) {
    sentDesktop = sendDesktopNotification(event);
  }

  if (
    (channel === 'discord' || channel === 'both') &&
    prefs.discord_enabled === 1 &&
    prefs.discord_webhook_url
  ) {
    sentDiscord = await sendDiscordNotification(
      event,
      prefs.discord_webhook_url
    );
  }

  // Log to history
  const dedupKey = buildDedupKey(event);
  execute(
    `INSERT INTO notification_history
      (id, type, title, body, urgency, company_id, company_name, contact_id, contact_name,
       sent_desktop, sent_discord, dedup_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      randomUUID(),
      event.type,
      event.title,
      event.body,
      event.urgency,
      event.companyId || null,
      event.companyName || null,
      event.contactId || null,
      event.contactName || null,
      sentDesktop ? 1 : 0,
      sentDiscord ? 1 : 0,
      dedupKey,
    ]
  );

  // Send to renderer for in-app toast
  mainWindowRef?.webContents.send('notification:new', event);
}

// ── Desktop Notification ─────────────────────────────────────────────

function sendDesktopNotification(event: NotificationEvent): boolean {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

    const notification = new Notification({
      title: event.title,
      body: event.body,
      icon: iconPath,
      urgency: event.urgency === 'critical' ? 'critical' : 'normal',
      silent: event.urgency === 'info',
      timeoutType: event.urgency === 'critical' ? 'never' : 'default',
    });

    notification.on('click', () => {
      mainWindowRef?.show();
      mainWindowRef?.focus();

      if (event.actionUrl) {
        mainWindowRef?.webContents.send(
          'notification:navigate',
          event.actionUrl
        );
      }

      // Mark as clicked
      const dedupKey = buildDedupKey(event);
      execute(
        `UPDATE notification_history SET desktop_clicked = 1
         WHERE dedup_key = ? AND desktop_clicked = 0
         ORDER BY created_at DESC LIMIT 1`,
        [dedupKey]
      );
    });

    notification.show();
    return true;
  } catch (err) {
    logger.error('Notify', 'Desktop notification failed', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// ── Discord Webhook ──────────────────────────────────────────────────

async function sendDiscordNotification(
  event: NotificationEvent,
  webhookUrl: string
): Promise<boolean> {
  try {
    const color =
      event.urgency === 'critical'
        ? 0xff0000
        : event.urgency === 'warning'
          ? 0xffa500
          : 0x0d9488;

    const emoji =
      event.urgency === 'critical'
        ? '\u{1F534}'
        : event.urgency === 'warning'
          ? '\u{1F7E1}'
          : '\u2139\uFE0F';

    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    if (event.companyName) {
      fields.push({
        name: 'Client',
        value: event.companyName,
        inline: true,
      });
    }
    if (event.contactName) {
      fields.push({
        name: 'Contact',
        value: event.contactName,
        inline: true,
      });
    }
    if (event.externalUrl) {
      fields.push({
        name: 'Link',
        value: `[Open](${event.externalUrl})`,
        inline: false,
      });
    }

    // Type-specific data fields
    if (event.data) {
      if (event.data.daysSince !== undefined) {
        fields.push({
          name: 'Days Since Contact',
          value: String(event.data.daysSince),
          inline: true,
        });
      }
      if (event.data.budgetPercent !== undefined) {
        fields.push({
          name: 'Budget Used',
          value: `${event.data.budgetPercent}%`,
          inline: true,
        });
      }
      if (event.data.healthScore !== undefined) {
        fields.push({
          name: 'Health Score',
          value: `${event.data.healthScore}/100`,
          inline: true,
        });
      }
      if (event.data.newContactCount !== undefined) {
        fields.push({
          name: 'New Contacts',
          value: `+${event.data.newContactCount}`,
          inline: true,
        });
      }
    }

    const embed = {
      title: `${emoji} ${event.title}`,
      description: event.body,
      color,
      timestamp: event.timestamp,
      footer: { text: 'Client Ops Hub' },
      fields,
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      logger.error('Notify', 'Discord webhook failed', { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Notify', 'Discord webhook error', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// ── Dedup ────────────────────────────────────────────────────────────

function buildDedupKey(event: NotificationEvent): string {
  const parts: string[] = [event.type];
  if (event.companyId) parts.push(event.companyId);
  if (event.contactId) parts.push(event.contactId);
  return parts.join(':');
}

function isDuplicate(
  event: NotificationEvent,
  prefs: NotificationPreferences
): boolean {
  const dedupKey = buildDedupKey(event);
  const intervalHours = prefs.sla_notify_interval_hours || 24;

  const recent = queryOne(
    `SELECT id FROM notification_history
     WHERE dedup_key = ? AND created_at >= datetime('now', '-' || ? || ' hours')
     LIMIT 1`,
    [dedupKey, intervalHours]
  );

  return !!recent;
}

// ── Quiet Hours ──────────────────────────────────────────────────────

function isQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight (e.g. 20:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ── Tray badge ───────────────────────────────────────────────────────

export function getUnreadNotificationCount(): number {
  const row = queryOne(
    `SELECT COUNT(*) as cnt FROM notification_history
     WHERE created_at >= datetime('now', '-24 hours')
       AND desktop_clicked = 0
       AND urgency IN ('critical', 'warning')`,
    []
  );
  return (row?.cnt as number) || 0;
}
