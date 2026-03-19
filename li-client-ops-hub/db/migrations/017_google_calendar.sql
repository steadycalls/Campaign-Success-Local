ALTER TABLE google_auth ADD COLUMN scopes TEXT;

CREATE TABLE IF NOT EXISTS google_calendars (
  id                  TEXT PRIMARY KEY,
  google_calendar_id  TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  primary_calendar    INTEGER DEFAULT 0,
  color               TEXT,
  selected            INTEGER DEFAULT 1,
  access_role         TEXT,
  raw_json            TEXT,
  synced_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id                  TEXT PRIMARY KEY,
  google_event_id     TEXT NOT NULL,
  calendar_id         TEXT NOT NULL,
  calendar_name       TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  start_time          TEXT NOT NULL,
  end_time            TEXT,
  all_day             INTEGER DEFAULT 0,
  timezone            TEXT,
  status              TEXT,
  recurring           INTEGER DEFAULT 0,
  recurring_event_id  TEXT,
  organizer_name      TEXT,
  organizer_email     TEXT,
  is_organizer        INTEGER DEFAULT 0,
  attendees_json      TEXT,
  attendees_count     INTEGER DEFAULT 0,
  accepted_count      INTEGER DEFAULT 0,
  hangout_link        TEXT,
  conference_url      TEXT,
  company_id          TEXT REFERENCES companies(id),
  matched_client_ids  TEXT,
  match_method        TEXT,
  matched_domains     TEXT,
  raw_json            TEXT NOT NULL,
  synced_at           TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(google_event_id, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_cal_events_company ON calendar_events(company_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_calendar ON calendar_events(calendar_id);

ALTER TABLE companies ADD COLUMN has_meeting_this_week INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN next_meeting_at TEXT;
ALTER TABLE companies ADD COLUMN next_meeting_title TEXT;
ALTER TABLE companies ADD COLUMN meetings_this_week INTEGER DEFAULT 0;
