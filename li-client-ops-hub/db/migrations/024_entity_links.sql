-- Unified company-level cross-platform linking
CREATE TABLE IF NOT EXISTS entity_links (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id),
  platform        TEXT NOT NULL,
  platform_id     TEXT NOT NULL,
  platform_name   TEXT,
  match_type      TEXT NOT NULL,
  confidence      REAL DEFAULT 1.0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, platform, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_company ON entity_links(company_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_platform ON entity_links(platform, platform_id);
