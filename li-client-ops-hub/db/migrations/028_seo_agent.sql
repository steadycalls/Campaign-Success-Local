-- Migration 028: SEO Agent — gap engine, competitor analysis, brand voice, content generation, feedback loop

-- Add GSC property and SEO toggle to companies
ALTER TABLE companies ADD COLUMN gsc_property TEXT;
ALTER TABLE companies ADD COLUMN seo_scan_enabled INTEGER DEFAULT 0;

-- Brand voice profiles (one per company)
CREATE TABLE IF NOT EXISTS brand_profiles (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  company_name        TEXT,
  industry            TEXT,
  target_audience     TEXT,
  value_proposition   TEXT,
  tone_keywords       TEXT,
  avoid_keywords      TEXT,
  writing_style       TEXT,
  example_phrases     TEXT,
  competitors_to_beat TEXT,
  product_services    TEXT,
  geographic_focus    TEXT,
  interview_raw       TEXT,
  status              TEXT DEFAULT 'draft',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generated content (AI-written articles) — defined before gap_keywords to avoid circular FK issues
CREATE TABLE IF NOT EXISTS generated_content (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gap_keyword_id          TEXT,
  title                   TEXT,
  slug                    TEXT,
  target_keyword          TEXT,
  secondary_keywords      TEXT,
  content_html            TEXT,
  content_markdown        TEXT,
  word_count              INTEGER DEFAULT 0,
  meta_title              TEXT,
  meta_description        TEXT,
  headings_json           TEXT,
  internal_link_suggestions TEXT,
  schema_suggestion       TEXT,
  brand_profile_id        TEXT REFERENCES brand_profiles(id) ON DELETE SET NULL,
  competitor_urls_analyzed TEXT,
  generation_prompt       TEXT,
  model_used              TEXT,
  tokens_used             INTEGER DEFAULT 0,
  status                  TEXT DEFAULT 'draft',
  published_url           TEXT,
  published_at            TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gencontent_company ON generated_content(company_id);
CREATE INDEX IF NOT EXISTS idx_gencontent_status ON generated_content(status);

-- Gap zone keywords (auto-detected from GSC data)
CREATE TABLE IF NOT EXISTS gap_keywords (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword                 TEXT NOT NULL,
  current_position        REAL,
  impressions             INTEGER DEFAULT 0,
  clicks                  INTEGER DEFAULT 0,
  ctr                     REAL DEFAULT 0,
  search_volume           INTEGER,
  cpc                     REAL,
  opportunity_score       REAL DEFAULT 0,
  ranking_url             TEXT,
  recommended_action      TEXT,
  action_status           TEXT DEFAULT 'pending',
  content_id              TEXT REFERENCES generated_content(id) ON DELETE SET NULL,
  top_competitor_url      TEXT,
  top_competitor_domain   TEXT,
  competitor_analysis_json TEXT,
  detected_at             TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at         TEXT,
  position_at_detection   REAL,
  position_after_action   REAL,
  resolved_at             TEXT,
  snapshot_date           TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_gap_company ON gap_keywords(company_id);
CREATE INDEX IF NOT EXISTS idx_gap_score ON gap_keywords(opportunity_score);
CREATE INDEX IF NOT EXISTS idx_gap_status ON gap_keywords(action_status);

-- Competitor page analysis data
CREATE TABLE IF NOT EXISTS competitor_pages (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gap_keyword_id      TEXT NOT NULL REFERENCES gap_keywords(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL,
  domain              TEXT,
  serp_position       INTEGER,
  title               TEXT,
  meta_description    TEXT,
  h1                  TEXT,
  headings_json       TEXT,
  word_count          INTEGER,
  topics_covered      TEXT,
  content_summary     TEXT,
  content_gaps        TEXT,
  schema_types        TEXT,
  internal_links      INTEGER DEFAULT 0,
  external_links      INTEGER DEFAULT 0,
  on_page_score       REAL,
  scraped_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(gap_keyword_id, url)
);

CREATE INDEX IF NOT EXISTS idx_comp_gap ON competitor_pages(gap_keyword_id);
CREATE INDEX IF NOT EXISTS idx_comp_company ON competitor_pages(company_id);

-- Content performance: closed-loop feedback tracking
CREATE TABLE IF NOT EXISTS content_performance (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_id          TEXT REFERENCES generated_content(id) ON DELETE SET NULL,
  gap_keyword_id      TEXT REFERENCES gap_keywords(id) ON DELETE SET NULL,
  keyword             TEXT NOT NULL,
  position_before     REAL,
  position_current    REAL,
  position_best       REAL,
  clicks_before       INTEGER DEFAULT 0,
  clicks_current      INTEGER DEFAULT 0,
  impressions_before  INTEGER DEFAULT 0,
  impressions_current INTEGER DEFAULT 0,
  check_count         INTEGER DEFAULT 0,
  first_check_at      TEXT,
  last_check_at       TEXT,
  trend               TEXT DEFAULT 'pending',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(content_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_perftrack_company ON content_performance(company_id);
CREATE INDEX IF NOT EXISTS idx_perftrack_content ON content_performance(content_id);
CREATE INDEX IF NOT EXISTS idx_perftrack_trend ON content_performance(trend);
