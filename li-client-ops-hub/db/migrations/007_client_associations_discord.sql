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
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_contact_id, association_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_assoc_client ON client_associations(client_contact_id);
CREATE INDEX IF NOT EXISTS idx_assoc_type ON client_associations(association_type);
CREATE INDEX IF NOT EXISTS idx_assoc_target ON client_associations(target_id);
CREATE INDEX IF NOT EXISTS idx_assoc_type_target ON client_associations(association_type, target_id);

CREATE TABLE IF NOT EXISTS discord_servers (
  id                TEXT PRIMARY KEY,
  discord_server_id TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  icon_url          TEXT,
  raw_json          TEXT NOT NULL,
  synced_at         TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discord_channels (
  id                 TEXT PRIMARY KEY,
  discord_channel_id TEXT UNIQUE NOT NULL,
  discord_server_id  TEXT NOT NULL,
  server_name        TEXT,
  name               TEXT NOT NULL,
  type               TEXT,
  topic              TEXT,
  position           INTEGER,
  parent_id          TEXT,
  raw_json           TEXT NOT NULL,
  synced_at          TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_discord_channels_server ON discord_channels(discord_server_id);

ALTER TABLE companies ADD COLUMN has_teamwork INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN has_discord INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN has_readai INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN client_contact_id TEXT;
ALTER TABLE companies ADD COLUMN client_contact_name TEXT;
