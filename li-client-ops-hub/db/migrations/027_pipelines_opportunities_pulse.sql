-- Migration 027: Pipelines, Opportunities, and Pulse sync tables
-- Adds per-subaccount pipeline/stage/opportunity tracking and pulse classification

-- ── Pipelines per subaccount ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_pipelines (
  id TEXT PRIMARY KEY,
  ghl_pipeline_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_hash TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ghl_pipeline_id, company_id)
);

-- ── Pipeline stages per subaccount ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_pipeline_stages (
  id TEXT PRIMARY KEY,
  ghl_stage_id TEXT NOT NULL,
  ghl_pipeline_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  content_hash TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ghl_stage_id, company_id)
);

-- ── Opportunities per subaccount ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_opportunities (
  id TEXT PRIMARY KEY,
  ghl_opportunity_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ghl_location_id TEXT NOT NULL,
  ghl_pipeline_id TEXT NOT NULL,
  ghl_stage_id TEXT,
  stage_name TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  assigned_to TEXT,
  monetary_value REAL,
  content_hash TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(ghl_opportunity_id, company_id)
);

-- ── Pulse sync log (dedup for writeback) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_sync_log (
  id TEXT PRIMARY KEY,
  source_opp_id TEXT NOT NULL,
  source_pipeline_id TEXT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pulse_opp_id TEXT,
  pulse_stage_name TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  error TEXT,
  written_at TEXT,
  last_synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_opp_id, company_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ghl_pipelines_company ON ghl_pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_stages_pipeline ON ghl_pipeline_stages(ghl_pipeline_id, company_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_company ON ghl_opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_pipeline ON ghl_opportunities(ghl_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_contact ON ghl_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_status ON ghl_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_pulse_sync_log_company ON pulse_sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_pulse_sync_log_status ON pulse_sync_log(status);

-- ── Enrich contacts with additional GHL fields ───────────────────────
ALTER TABLE contacts ADD COLUMN company_name TEXT;
ALTER TABLE contacts ADD COLUMN assigned_to_name TEXT;
ALTER TABLE contacts ADD COLUMN temperature TEXT;
ALTER TABLE contacts ADD COLUMN qualification TEXT;
ALTER TABLE contacts ADD COLUMN priority_score INTEGER;
ALTER TABLE contacts ADD COLUMN source TEXT;
ALTER TABLE contacts ADD COLUMN website TEXT;
ALTER TABLE contacts ADD COLUMN city TEXT;
ALTER TABLE contacts ADD COLUMN state TEXT;
ALTER TABLE contacts ADD COLUMN postal_code TEXT;
ALTER TABLE contacts ADD COLUMN country TEXT;
ALTER TABLE contacts ADD COLUMN address TEXT;
ALTER TABLE contacts ADD COLUMN date_of_birth TEXT;
ALTER TABLE contacts ADD COLUMN custom_fields_json TEXT;
ALTER TABLE contacts ADD COLUMN bant_score INTEGER;
ALTER TABLE contacts ADD COLUMN last_activity_at TEXT;

-- ── Enrich companies with pipeline/pulse tracking ────────────────────
ALTER TABLE companies ADD COLUMN pipelines_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN opportunities_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN pulse_sync_enabled INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN pulse_pipeline_id TEXT;
ALTER TABLE companies ADD COLUMN pulse_dry_run INTEGER DEFAULT 1;
ALTER TABLE companies ADD COLUMN pulse_last_synced_at TEXT;
