-- D1 Cloud Schema — mirrors local SQLite minus secrets and ephemeral data
-- Generated from li-client-ops-hub db/schema.sql + migrations

CREATE TABLE IF NOT EXISTS companies (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  website               TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  ghl_location_id       TEXT,
  teamwork_project_id   TEXT,
  drive_folder_id       TEXT,
  sla_status            TEXT NOT NULL DEFAULT 'ok',
  sla_days_since_contact INTEGER DEFAULT 0,
  monthly_budget        REAL,
  budget_used           REAL DEFAULT 0,
  budget_percent        REAL DEFAULT 0,
  contact_count         INTEGER DEFAULT 0,
  contacts_api_total    INTEGER,
  contacts_added_7d     INTEGER DEFAULT 0,
  contacts_added_30d    INTEGER DEFAULT 0,
  contacts_added_90d    INTEGER DEFAULT 0,
  contacts_added_365d   INTEGER DEFAULT 0,
  messages_synced_total INTEGER DEFAULT 0,
  phone_numbers_count   INTEGER DEFAULT 0,
  open_task_count       INTEGER DEFAULT 0,
  users_count           INTEGER DEFAULT 0,
  workflows_count       INTEGER DEFAULT 0,
  funnels_count         INTEGER DEFAULT 0,
  sites_count           INTEGER DEFAULT 0,
  email_templates_count INTEGER DEFAULT 0,
  custom_fields_count   INTEGER DEFAULT 0,
  sync_enabled          INTEGER DEFAULT 0,
  has_teamwork          INTEGER DEFAULT 0,
  has_discord           INTEGER DEFAULT 0,
  has_readai            INTEGER DEFAULT 0,
  client_contact_id     TEXT,
  client_contact_name   TEXT,
  last_sync_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL,
  ghl_contact_id        TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  tags                  TEXT,
  last_outbound_at      TEXT,
  last_inbound_at       TEXT,
  days_since_outbound   INTEGER DEFAULT 0,
  sla_status            TEXT NOT NULL DEFAULT 'ok',
  messages_synced_at    TEXT,
  messages_sync_status  TEXT DEFAULT 'pending',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id                    TEXT PRIMARY KEY,
  contact_id            TEXT NOT NULL,
  company_id            TEXT NOT NULL,
  ghl_message_id        TEXT,
  direction             TEXT NOT NULL,
  type                  TEXT,
  body_preview          TEXT,
  body_full             TEXT,
  subject               TEXT,
  message_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meetings (
  id                    TEXT PRIMARY KEY,
  readai_meeting_id     TEXT,
  company_id            TEXT,
  title                 TEXT,
  meeting_date          TEXT NOT NULL,
  start_time_ms         INTEGER,
  end_time_ms           INTEGER,
  duration_minutes      INTEGER,
  platform              TEXT,
  owner_name            TEXT,
  owner_email           TEXT,
  participants_json     TEXT,
  participants_count    INTEGER DEFAULT 0,
  attended_count        INTEGER DEFAULT 0,
  summary               TEXT,
  topics_json           TEXT,
  key_questions_json    TEXT,
  chapter_summaries_json TEXT,
  read_score            REAL,
  sentiment             REAL,
  engagement            REAL,
  transcript_text       TEXT,
  report_url            TEXT,
  match_method          TEXT,
  expanded              INTEGER DEFAULT 0,
  synced_at             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_items (
  id                    TEXT PRIMARY KEY,
  meeting_id            TEXT NOT NULL,
  company_id            TEXT,
  text                  TEXT NOT NULL,
  assignee              TEXT,
  status                TEXT DEFAULT 'open',
  due_date              TEXT,
  synced_at             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_associations (
  id                TEXT PRIMARY KEY,
  client_contact_id TEXT NOT NULL,
  ghl_contact_id    TEXT NOT NULL,
  association_type  TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  target_name       TEXT,
  target_detail     TEXT,
  created_by        TEXT DEFAULT 'manual',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_domains (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  domain      TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_users (
  id TEXT PRIMARY KEY, ghl_user_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT, email TEXT, phone TEXT, role TEXT,
  permissions TEXT, synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_workflows (
  id TEXT PRIMARY KEY, ghl_workflow_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT, version INTEGER,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_funnels (
  id TEXT PRIMARY KEY, ghl_funnel_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT, steps_count INTEGER DEFAULT 0, url TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_sites (
  id TEXT PRIMARY KEY, ghl_site_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT, url TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_email_templates (
  id TEXT PRIMARY KEY, ghl_template_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT NOT NULL, subject TEXT, status TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghl_custom_fields (
  id TEXT PRIMARY KEY, ghl_field_id TEXT NOT NULL, company_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL, name TEXT NOT NULL, field_key TEXT, data_type TEXT,
  placeholder TEXT, position INTEGER, model TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL, drive_file_id TEXT,
  name TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER, modified_at TEXT, web_view_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discord_servers (
  id TEXT PRIMARY KEY, discord_server_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, icon_url TEXT, synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY, discord_channel_id TEXT UNIQUE NOT NULL,
  discord_server_id TEXT NOT NULL, server_name TEXT, name TEXT NOT NULL,
  type TEXT, topic TEXT, position INTEGER, parent_id TEXT, tag TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY, trigger TEXT NOT NULL, adapter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', company_id TEXT, company_name TEXT,
  items_fetched INTEGER DEFAULT 0, items_created INTEGER DEFAULT 0, items_updated INTEGER DEFAULT 0,
  error_message TEXT, detail_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_alerts (
  id TEXT PRIMARY KEY, company_id TEXT, type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning', message TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cloud sync metadata
CREATE TABLE IF NOT EXISTS cloud_sync_meta (
  table_name TEXT PRIMARY KEY,
  last_synced_at TEXT,
  row_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_sla ON companies(sla_status);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_sla ON contacts(sla_status);
CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assoc_client ON client_associations(client_contact_id);
