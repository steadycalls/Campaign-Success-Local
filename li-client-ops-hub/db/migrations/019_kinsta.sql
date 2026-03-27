CREATE TABLE IF NOT EXISTS kinsta_sites (
  id                      TEXT PRIMARY KEY,
  kinsta_site_id          TEXT UNIQUE NOT NULL,
  kinsta_env_id           TEXT,
  name                    TEXT NOT NULL,
  display_name            TEXT,
  status                  TEXT,
  domain                  TEXT,
  php_version             TEXT,
  wp_version              TEXT,
  datacenter              TEXT,
  plugins_total           INTEGER DEFAULT 0,
  plugins_active          INTEGER DEFAULT 0,
  plugins_needing_update  INTEGER DEFAULT 0,
  themes_total            INTEGER DEFAULT 0,
  themes_needing_update   INTEGER DEFAULT 0,
  company_id              TEXT REFERENCES companies(id),
  company_name            TEXT,
  suggested_company_id    TEXT,
  suggested_company_name  TEXT,
  suggestion_score        REAL,
  raw_json                TEXT NOT NULL,
  synced_at               TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kinsta_sites_company ON kinsta_sites(company_id);
CREATE INDEX IF NOT EXISTS idx_kinsta_sites_domain ON kinsta_sites(domain);

CREATE TABLE IF NOT EXISTS kinsta_plugins (
  id                TEXT PRIMARY KEY,
  kinsta_site_id    TEXT NOT NULL,
  plugin_slug       TEXT NOT NULL,
  plugin_name       TEXT NOT NULL,
  current_version   TEXT,
  new_version       TEXT,
  update_available  INTEGER DEFAULT 0,
  status            TEXT,
  raw_json          TEXT,
  synced_at         TEXT NOT NULL,
  UNIQUE(kinsta_site_id, plugin_slug)
);

CREATE INDEX IF NOT EXISTS idx_kinsta_plugins_site ON kinsta_plugins(kinsta_site_id);
CREATE INDEX IF NOT EXISTS idx_kinsta_plugins_update ON kinsta_plugins(update_available);

CREATE TABLE IF NOT EXISTS kinsta_themes (
  id                TEXT PRIMARY KEY,
  kinsta_site_id    TEXT NOT NULL,
  theme_slug        TEXT NOT NULL,
  theme_name        TEXT NOT NULL,
  current_version   TEXT,
  new_version       TEXT,
  update_available  INTEGER DEFAULT 0,
  status            TEXT,
  raw_json          TEXT,
  synced_at         TEXT NOT NULL,
  UNIQUE(kinsta_site_id, theme_slug)
);

CREATE INDEX IF NOT EXISTS idx_kinsta_themes_site ON kinsta_themes(kinsta_site_id);

ALTER TABLE companies ADD COLUMN has_kinsta INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN kinsta_site_id TEXT;
ALTER TABLE companies ADD COLUMN kinsta_plugins_needing_update INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN kinsta_domain TEXT;
