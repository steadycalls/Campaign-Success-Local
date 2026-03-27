-- Allow action items without a matched company (from unmatched Read.ai meetings).

CREATE TABLE IF NOT EXISTS action_items_new (
  id                    TEXT PRIMARY KEY,
  meeting_id            TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id            TEXT REFERENCES companies(id) ON DELETE SET NULL,
  text                  TEXT NOT NULL,
  assignee              TEXT,
  status                TEXT NOT NULL DEFAULT 'open',
  due_date              TEXT,
  raw_json              TEXT,
  synced_at             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO action_items_new SELECT
  id, meeting_id, company_id, text, assignee, status, due_date,
  raw_json, synced_at, created_at, updated_at
FROM action_items;

DROP TABLE action_items;

ALTER TABLE action_items_new RENAME TO action_items;

CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_company ON action_items(company_id);
