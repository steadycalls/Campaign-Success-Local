-- Read.ai OAuth 2.1 token storage (replaces READAI_API_KEY)

CREATE TABLE IF NOT EXISTS readai_auth (
  id                TEXT PRIMARY KEY DEFAULT 'default',
  access_token      TEXT,
  refresh_token     TEXT,
  expires_at        TEXT,
  email             TEXT,
  scope             TEXT,
  authorized_at     TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Update integration env_keys from old API key to OAuth credentials
UPDATE integrations SET env_keys = '["READAI_CLIENT_ID","READAI_CLIENT_SECRET"]' WHERE name = 'readai_api';
