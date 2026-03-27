-- ============================================================
-- A2P COMPLIANCE STATUS PER SUB-ACCOUNT
-- ============================================================
CREATE TABLE IF NOT EXISTS a2p_compliance (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id     TEXT NOT NULL,

  -- Business info (pulled from GHL or manually entered)
  business_name       TEXT,
  domain              TEXT,
  phone               TEXT,

  -- Discovered page URLs (null = not found, empty string = checked but missing)
  contact_page_url    TEXT,
  privacy_policy_url  TEXT,
  terms_of_service_url TEXT,
  sms_policy_url      TEXT,

  -- Analysis status per page: pending | pass | fail | missing | error
  contact_page_status TEXT DEFAULT 'pending',
  privacy_policy_status TEXT DEFAULT 'pending',
  terms_of_service_status TEXT DEFAULT 'pending',
  sms_policy_status   TEXT DEFAULT 'pending',

  -- Analysis detail (JSON: { score, issues[], suggestions[], raw_analysis })
  contact_page_analysis TEXT,
  privacy_policy_analysis TEXT,
  terms_of_service_analysis TEXT,
  sms_policy_analysis TEXT,

  -- Overall status: compliant | non_compliant | partial | pending | no_website
  overall_status      TEXT DEFAULT 'pending',
  issues_count        INTEGER DEFAULT 0,

  -- Content generation queue
  content_queue_status TEXT DEFAULT 'none',
  content_generated_at TEXT,

  -- Timestamps
  last_scanned_at     TEXT,
  last_analyzed_at    TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_a2p_company ON a2p_compliance(company_id);

CREATE INDEX IF NOT EXISTS idx_a2p_status ON a2p_compliance(overall_status);

-- ============================================================
-- A2P GENERATED CONTENT
-- ============================================================
CREATE TABLE IF NOT EXISTS a2p_generated_content (
  id                  TEXT PRIMARY KEY,
  a2p_id              TEXT NOT NULL REFERENCES a2p_compliance(id),
  company_id          TEXT NOT NULL REFERENCES companies(id),
  page_type           TEXT NOT NULL,
  content_md          TEXT NOT NULL,
  content_status      TEXT DEFAULT 'draft',
  exported_to_drive   INTEGER DEFAULT 0,
  drive_file_id       TEXT,
  drive_file_url      TEXT,
  generated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  exported_at         TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_a2p_content_company ON a2p_generated_content(company_id);

CREATE INDEX IF NOT EXISTS idx_a2p_content_type ON a2p_generated_content(a2p_id, page_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_a2p_content_upsert ON a2p_generated_content(a2p_id, page_type);

-- ============================================================
-- A2P PAGE CACHE (crawled HTML for analysis)
-- ============================================================
CREATE TABLE IF NOT EXISTS a2p_page_cache (
  id          TEXT PRIMARY KEY,
  a2p_id      TEXT NOT NULL REFERENCES a2p_compliance(id),
  page_type   TEXT NOT NULL,
  url         TEXT,
  html        TEXT,
  fetched_at  TEXT NOT NULL,
  UNIQUE(a2p_id, page_type)
);
