-- Migration 002: PIT auth model + expanded GHL sync tables

-- ── Companies table: add PIT and expanded count columns ───────────────
ALTER TABLE companies ADD COLUMN pit_token TEXT;
ALTER TABLE companies ADD COLUMN pit_status TEXT DEFAULT 'not_configured';
ALTER TABLE companies ADD COLUMN pit_last_tested_at TEXT;
ALTER TABLE companies ADD COLUMN pit_last_error TEXT;
ALTER TABLE companies ADD COLUMN sync_enabled INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN users_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN workflows_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN funnels_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN sites_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN email_templates_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN custom_fields_count INTEGER DEFAULT 0;

-- ── GHL users per sub-account ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_users (
  id TEXT PRIMARY KEY,
  ghl_user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  permissions TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_user_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_users_company ON ghl_users(company_id);

-- ── GHL workflows per sub-account ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_workflows (
  id TEXT PRIMARY KEY,
  ghl_workflow_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  version INTEGER,
  created_at_ghl TEXT,
  updated_at_ghl TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_workflow_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_workflows_company ON ghl_workflows(company_id);

-- ── GHL funnels per sub-account ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_funnels (
  id TEXT PRIMARY KEY,
  ghl_funnel_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  steps_count INTEGER DEFAULT 0,
  url TEXT,
  created_at_ghl TEXT,
  updated_at_ghl TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_funnel_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_funnels_company ON ghl_funnels(company_id);

-- ── GHL sites per sub-account ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_sites (
  id TEXT PRIMARY KEY,
  ghl_site_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  url TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_site_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_sites_company ON ghl_sites(company_id);

-- ── GHL email templates per sub-account ───────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_email_templates (
  id TEXT PRIMARY KEY,
  ghl_template_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  status TEXT,
  body_preview TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_template_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_templates_company ON ghl_email_templates(company_id);

-- ── GHL custom fields per sub-account ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ghl_custom_fields (
  id TEXT PRIMARY KEY,
  ghl_field_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  field_key TEXT,
  data_type TEXT,
  placeholder TEXT,
  position INTEGER,
  model TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ghl_field_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_custom_fields_company ON ghl_custom_fields(company_id);
