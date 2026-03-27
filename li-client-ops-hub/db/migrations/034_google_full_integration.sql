-- Google Full Integration: Gmail, multi-account, team mailboxes, enhanced Drive

-- Multi-account support
CREATE TABLE IF NOT EXISTS google_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  account_type TEXT DEFAULT 'oauth',
  is_active INTEGER DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gmail messages
CREATE TABLE IF NOT EXISTS gmail_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT DEFAULT '[]',
  cc_emails TEXT DEFAULT '[]',
  date TEXT,
  snippet TEXT,
  body_text TEXT,
  body_hash TEXT,
  direction TEXT,
  has_attachments INTEGER DEFAULT 0,
  attachment_meta TEXT DEFAULT '[]',
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  match_method TEXT,
  account_id TEXT DEFAULT 'default',
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gmail_thread ON gmail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_date ON gmail_messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_from ON gmail_messages(from_email);
CREATE INDEX IF NOT EXISTS idx_gmail_company ON gmail_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_gmail_direction ON gmail_messages(direction);
CREATE INDEX IF NOT EXISTS idx_gmail_account ON gmail_messages(account_id);

-- Email-to-company links
CREATE TABLE IF NOT EXISTS email_company_links (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES gmail_messages(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  match_field TEXT,
  UNIQUE(email_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_ecl_email ON email_company_links(email_id);
CREATE INDEX IF NOT EXISTS idx_ecl_company ON email_company_links(company_id);

-- Team mailboxes (service account multi-mailbox sync)
CREATE TABLE IF NOT EXISTS team_mailboxes (
  email TEXT PRIMARY KEY,
  name TEXT,
  is_active INTEGER DEFAULT 1,
  last_gmail_sync TEXT,
  last_calendar_sync TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Enhanced Drive: content extraction + permissions
ALTER TABLE drive_files ADD COLUMN content_text TEXT;
ALTER TABLE drive_files ADD COLUMN content_hash TEXT;
ALTER TABLE drive_files ADD COLUMN permissions_json TEXT;
ALTER TABLE drive_files ADD COLUMN shared_with TEXT DEFAULT '[]';
ALTER TABLE drive_files ADD COLUMN account_id TEXT DEFAULT 'default';

ALTER TABLE drive_folders ADD COLUMN account_id TEXT DEFAULT 'default';
