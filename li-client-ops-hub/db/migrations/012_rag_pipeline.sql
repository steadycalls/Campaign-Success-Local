CREATE TABLE IF NOT EXISTS rag_chunks (
  id                TEXT PRIMARY KEY,
  source_type       TEXT NOT NULL,
  source_table      TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  chunk_index       INTEGER DEFAULT 0,
  company_id        TEXT,
  company_name      TEXT,
  contact_id        TEXT,
  meeting_id        TEXT,
  content           TEXT NOT NULL,
  word_count        INTEGER NOT NULL,
  metadata_json     TEXT,
  embedding_status  TEXT DEFAULT 'pending',
  embedding_vector  BLOB,
  embedding_model   TEXT,
  embedding_dim     INTEGER,
  embedded_at       TEXT,
  error             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_table, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_source ON rag_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rag_status ON rag_chunks(embedding_status);
CREATE INDEX IF NOT EXISTS idx_rag_company ON rag_chunks(company_id);

CREATE TABLE IF NOT EXISTS rag_processing_stats (
  id                TEXT PRIMARY KEY,
  source_type       TEXT UNIQUE NOT NULL,
  total_source_rows INTEGER DEFAULT 0,
  eligible_rows     INTEGER DEFAULT 0,
  chunks_created    INTEGER DEFAULT 0,
  chunks_embedded   INTEGER DEFAULT 0,
  chunks_failed     INTEGER DEFAULT 0,
  chunks_skipped    INTEGER DEFAULT 0,
  last_processed_at TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
