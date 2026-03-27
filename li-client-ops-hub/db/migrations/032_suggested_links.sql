-- Cross-entity auto-suggestion engine
-- Proposes correlations between companies, contacts, meetings, and platform entities

CREATE TABLE IF NOT EXISTS suggested_links (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  link_type     TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0,
  signals_json  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  accepted_at   TEXT,
  dismissed_at  TEXT,
  pushed_at     TEXT,
  push_detail   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id, target_type, target_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_sl_source ON suggested_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_sl_target ON suggested_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_sl_status ON suggested_links(status);
CREATE INDEX IF NOT EXISTS idx_sl_type ON suggested_links(link_type);
CREATE INDEX IF NOT EXISTS idx_sl_confidence ON suggested_links(confidence DESC);
