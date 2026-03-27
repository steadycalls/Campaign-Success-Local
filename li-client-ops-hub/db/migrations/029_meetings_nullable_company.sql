-- Allow meetings without a matched company (Read.ai syncs all meetings,
-- many won't match a company domain).
-- SQLite doesn't support ALTER COLUMN, so recreate the table.

CREATE TABLE IF NOT EXISTS meetings_new (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT REFERENCES companies(id) ON DELETE SET NULL,
  readai_meeting_id     TEXT,
  title                 TEXT,
  meeting_date          TEXT NOT NULL,
  duration_minutes      INTEGER,
  participants          TEXT,
  summary               TEXT,
  start_time_ms         INTEGER,
  end_time_ms           INTEGER,
  platform              TEXT,
  platform_id           TEXT,
  owner_name            TEXT,
  owner_email           TEXT,
  participants_json     TEXT,
  participants_count    INTEGER DEFAULT 0,
  attended_count        INTEGER DEFAULT 0,
  topics_json           TEXT,
  key_questions_json    TEXT,
  chapter_summaries_json TEXT,
  read_score            REAL,
  sentiment             REAL,
  engagement            REAL,
  transcript_text       TEXT,
  transcript_json       TEXT,
  report_url            TEXT,
  recording_url         TEXT,
  folders_json          TEXT,
  matched_domains       TEXT,
  match_method          TEXT,
  raw_json              TEXT,
  expanded              INTEGER DEFAULT 0,
  synced_at             TEXT,
  recording_local_path  TEXT,
  live_enabled          INTEGER DEFAULT 0,
  action_items_json     TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO meetings_new SELECT
  id, company_id, readai_meeting_id, title, meeting_date, duration_minutes,
  participants, summary,
  start_time_ms, end_time_ms, platform, platform_id,
  owner_name, owner_email, participants_json, participants_count, attended_count,
  topics_json, key_questions_json, chapter_summaries_json,
  read_score, sentiment, engagement,
  transcript_text, transcript_json,
  report_url, recording_url, folders_json,
  matched_domains, match_method, raw_json, expanded, synced_at,
  recording_local_path, live_enabled, action_items_json,
  created_at
FROM meetings;

DROP TABLE meetings;

ALTER TABLE meetings_new RENAME TO meetings;

CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(start_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_readai_id ON meetings(readai_meeting_id);
