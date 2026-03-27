-- Notification preferences and history

CREATE TABLE IF NOT EXISTS notification_preferences (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  type_channels     TEXT NOT NULL DEFAULT '{}',
  desktop_enabled   INTEGER DEFAULT 1,
  discord_enabled   INTEGER DEFAULT 0,
  discord_webhook_url TEXT,
  quiet_start       TEXT DEFAULT '20:00',
  quiet_end         TEXT DEFAULT '07:00',
  quiet_enabled     INTEGER DEFAULT 1,
  new_leads_threshold INTEGER DEFAULT 5,
  health_drop_threshold INTEGER DEFAULT 10,
  sla_notify_interval_hours INTEGER DEFAULT 24,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO notification_preferences (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS notification_history (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  title             TEXT NOT NULL,
  body              TEXT,
  urgency           TEXT,
  company_id        TEXT,
  company_name      TEXT,
  contact_id        TEXT,
  contact_name      TEXT,
  sent_desktop      INTEGER DEFAULT 0,
  sent_discord      INTEGER DEFAULT 0,
  desktop_clicked   INTEGER DEFAULT 0,
  dedup_key         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_history_type ON notification_history(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_history_dedup ON notification_history(dedup_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_history_created ON notification_history(created_at DESC);
