-- Content hash columns for entity tables (contacts already has one from 022)
ALTER TABLE ghl_users ADD COLUMN content_hash TEXT;
ALTER TABLE ghl_workflows ADD COLUMN content_hash TEXT;
ALTER TABLE ghl_funnels ADD COLUMN content_hash TEXT;
ALTER TABLE ghl_sites ADD COLUMN content_hash TEXT;
ALTER TABLE ghl_email_templates ADD COLUMN content_hash TEXT;
ALTER TABLE ghl_custom_fields ADD COLUMN content_hash TEXT;

-- Change log: tracks what changed in each sync for UI highlighting
CREATE TABLE IF NOT EXISTS change_log (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  company_id      TEXT,
  change_type     TEXT NOT NULL,
  old_hash        TEXT,
  new_hash        TEXT,
  sync_run_id     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_change_log_company ON change_log(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entity_type, entity_id);
