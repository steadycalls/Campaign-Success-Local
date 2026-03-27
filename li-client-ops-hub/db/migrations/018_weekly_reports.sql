-- Weekly Operations Reports

CREATE TABLE IF NOT EXISTS weekly_reports (
  id                       TEXT PRIMARY KEY,
  report_date              TEXT NOT NULL,
  period_start             TEXT NOT NULL,
  period_end               TEXT NOT NULL,
  title                    TEXT NOT NULL,
  generated_at             TEXT NOT NULL,
  portfolio_summary_json   TEXT NOT NULL,
  sla_summary_json         TEXT NOT NULL,
  budget_summary_json      TEXT NOT NULL,
  health_summary_json      TEXT NOT NULL,
  sync_summary_json        TEXT NOT NULL,
  meetings_summary_json    TEXT NOT NULL,
  activity_summary_json    TEXT NOT NULL,
  action_items_json        TEXT NOT NULL,
  highlights_json          TEXT NOT NULL,
  html_content             TEXT,
  export_path              TEXT,
  auto_generated           INTEGER DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_date ON weekly_reports(report_date DESC);
