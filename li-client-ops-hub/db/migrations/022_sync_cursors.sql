-- Delta sync: cursor tracking per company per entity type
CREATE TABLE IF NOT EXISTS sync_cursors (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  last_synced_at  TEXT NOT NULL,
  last_cursor     TEXT,
  last_count      INTEGER DEFAULT 0,
  full_sync_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, entity_type)
);

-- Content hash on contacts for skipping unchanged records during sync
ALTER TABLE contacts ADD COLUMN content_hash TEXT;
