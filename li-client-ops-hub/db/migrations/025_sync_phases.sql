-- Per-phase detail within a sync run
CREATE TABLE IF NOT EXISTS sync_phases (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  company_id      TEXT,
  phase_name      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  duration_ms     INTEGER,
  items_found     INTEGER DEFAULT 0,
  items_created   INTEGER DEFAULT 0,
  items_updated   INTEGER DEFAULT 0,
  items_skipped   INTEGER DEFAULT 0,
  items_failed    INTEGER DEFAULT 0,
  error_message   TEXT,
  error_stack     TEXT,
  api_calls_made  INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_phases_run ON sync_phases(run_id);
