CREATE TABLE IF NOT EXISTS sync_queue (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  company_name      TEXT,
  ghl_location_id   TEXT NOT NULL,
  task_type         TEXT NOT NULL,
  params_json       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  priority          INTEGER DEFAULT 50,
  attempt           INTEGER DEFAULT 0,
  max_attempts      INTEGER DEFAULT 3,
  error             TEXT,
  items_found       INTEGER DEFAULT 0,
  items_processed   INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  started_at        TEXT,
  completed_at      TEXT,
  next_run_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_company ON sync_queue(company_id, task_type);

CREATE TABLE IF NOT EXISTS sync_progress (
  id                       TEXT PRIMARY KEY,
  company_id               TEXT UNIQUE NOT NULL,
  company_name             TEXT,
  contacts_api_total       INTEGER DEFAULT 0,
  contacts_synced          INTEGER DEFAULT 0,
  contacts_sync_percent    REAL DEFAULT 0,
  contacts_sync_status     TEXT DEFAULT 'not_started',
  contacts_with_messages   INTEGER DEFAULT 0,
  messages_synced_total    INTEGER DEFAULT 0,
  messages_sync_status     TEXT DEFAULT 'not_started',
  messages_sync_percent    REAL DEFAULT 0,
  overall_status           TEXT DEFAULT 'idle',
  overall_percent          REAL DEFAULT 0,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE contacts ADD COLUMN messages_sync_status TEXT DEFAULT 'pending';
