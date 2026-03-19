-- Health Score: composite scoring system per company

ALTER TABLE companies ADD COLUMN health_score INTEGER;
ALTER TABLE companies ADD COLUMN health_grade TEXT;
ALTER TABLE companies ADD COLUMN health_status TEXT;
ALTER TABLE companies ADD COLUMN health_trend TEXT;
ALTER TABLE companies ADD COLUMN health_computed_at TEXT;
ALTER TABLE companies ADD COLUMN health_components_json TEXT;

CREATE TABLE IF NOT EXISTS health_score_history (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id),
  health_score    INTEGER NOT NULL,
  health_grade    TEXT,
  components_json TEXT,
  computed_at     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_history_company ON health_score_history(company_id, computed_at DESC);
