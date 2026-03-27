-- ── Client Ops Hub Schema ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  website               TEXT,
  status                TEXT NOT NULL DEFAULT 'active',   -- active | paused | churned
  ghl_location_id       TEXT,
  teamwork_project_id   TEXT,
  drive_folder_id       TEXT,
  sla_status            TEXT NOT NULL DEFAULT 'ok',       -- ok | warning | violation
  sla_days_since_contact INTEGER DEFAULT 0,
  monthly_budget        REAL,
  budget_used           REAL DEFAULT 0,
  budget_percent        REAL DEFAULT 0,
  contact_count         INTEGER DEFAULT 0,
  open_task_count       INTEGER DEFAULT 0,
  last_sync_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ghl_contact_id        TEXT,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  tags                  TEXT,               -- JSON array
  last_outbound_at      TEXT,
  last_inbound_at       TEXT,
  days_since_outbound   INTEGER DEFAULT 0,
  sla_status            TEXT NOT NULL DEFAULT 'ok',  -- ok | warning | violation
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id                    TEXT PRIMARY KEY,
  contact_id            TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ghl_message_id        TEXT,
  direction             TEXT NOT NULL,      -- inbound | outbound
  type                  TEXT,               -- sms | email | call | chat | fb | ig
  body_preview          TEXT,               -- first 200 chars
  message_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teamwork_projects (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  teamwork_id           TEXT,
  name                  TEXT NOT NULL,
  status                TEXT DEFAULT 'active',
  budget_total          REAL,
  budget_used           REAL DEFAULT 0,
  budget_percent        REAL DEFAULT 0,
  task_count_total      INTEGER DEFAULT 0,
  task_count_open       INTEGER DEFAULT 0,
  task_count_completed  INTEGER DEFAULT 0,
  last_sync_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meetings (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT REFERENCES companies(id) ON DELETE SET NULL,
  readai_meeting_id     TEXT,
  title                 TEXT,
  meeting_date          TEXT NOT NULL,
  duration_minutes      INTEGER,
  participants          TEXT,               -- JSON array
  summary               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_items (
  id                    TEXT PRIMARY KEY,
  meeting_id            TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id            TEXT REFERENCES companies(id) ON DELETE SET NULL,
  text                  TEXT NOT NULL,
  assignee              TEXT,
  status                TEXT NOT NULL DEFAULT 'open',  -- open | done
  due_date              TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_files (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  drive_file_id         TEXT,
  name                  TEXT NOT NULL,
  mime_type             TEXT,
  size_bytes            INTEGER,
  modified_at           TEXT,
  web_view_url          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_domains (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain                TEXT NOT NULL UNIQUE,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_links (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source                TEXT NOT NULL,      -- ghl | teamwork | readai | gdrive
  source_id             TEXT NOT NULL,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id                    TEXT PRIMARY KEY,
  trigger               TEXT NOT NULL,      -- scheduled | manual
  adapter               TEXT NOT NULL,      -- ghl | teamwork | readai | gdrive | all
  status                TEXT NOT NULL DEFAULT 'running', -- running | success | error
  items_fetched         INTEGER DEFAULT 0,
  items_created         INTEGER DEFAULT 0,
  items_updated         INTEGER DEFAULT 0,
  error_message         TEXT,
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at           TEXT
);

CREATE TABLE IF NOT EXISTS sync_alerts (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT REFERENCES companies(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL,      -- stale_sync | sync_failure | sla_violation
  severity              TEXT NOT NULL DEFAULT 'warning',  -- info | warning | error
  message               TEXT NOT NULL,
  acknowledged          INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  env_keys              TEXT,               -- JSON array of required env var names
  status                TEXT NOT NULL DEFAULT 'not_configured', -- not_configured | configured | connected | error
  last_tested_at        TEXT,
  last_error            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_state (
  key                   TEXT PRIMARY KEY,
  value                 TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_sla_status ON companies(sla_status);
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_sla_status ON contacts(sla_status);
CREATE INDEX IF NOT EXISTS idx_contacts_last_outbound ON contacts(last_outbound_at);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_company_id ON messages(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction_at ON messages(direction, message_at);
CREATE INDEX IF NOT EXISTS idx_meetings_company_id ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_company_id ON drive_files(company_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_alerts_ack_created ON sync_alerts(acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_domains_company ON company_domains(company_id);
CREATE INDEX IF NOT EXISTS idx_company_links_company ON company_links(company_id);
