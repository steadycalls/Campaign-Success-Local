-- Google Drive OAuth + folder sync

CREATE TABLE IF NOT EXISTS google_auth (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  access_token      TEXT,
  refresh_token     TEXT,
  expires_at        TEXT,
  email             TEXT,
  authorized_at     TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_folders (
  id                     TEXT PRIMARY KEY,
  drive_folder_id        TEXT UNIQUE NOT NULL,
  name                   TEXT NOT NULL,
  web_view_url           TEXT,
  modified_at            TEXT,
  created_at_drive       TEXT,
  owner_email            TEXT,
  shared                 INTEGER DEFAULT 0,
  file_count             INTEGER DEFAULT 0,
  company_id             TEXT REFERENCES companies(id),
  client_contact_id      TEXT,
  suggested_company_id   TEXT,
  suggested_company_name TEXT,
  suggestion_score       REAL,
  raw_json               TEXT NOT NULL,
  synced_at              TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drive_folders_company ON drive_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_name ON drive_folders(name);

ALTER TABLE drive_files ADD COLUMN raw_json TEXT;
ALTER TABLE drive_files ADD COLUMN folder_id TEXT;
ALTER TABLE drive_files ADD COLUMN synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_drive_files_folder ON drive_files(folder_id);

ALTER TABLE companies ADD COLUMN has_drive INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN drive_folder_url TEXT;
ALTER TABLE companies ADD COLUMN drive_file_count INTEGER DEFAULT 0;
