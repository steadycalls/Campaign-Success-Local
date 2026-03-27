import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';

function getApp() {
  return require('electron').app as import('electron').App;
}

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

function saveToDiskSync(): void {
  if (db && dbPath) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

// ── Debounced save for high-throughput writes ──────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDirty = false;
let isSaving = false;

function scheduleSave(): void {
  saveDirty = true;
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (saveDirty && !isSaving) {
        saveDirty = false;
        saveToDiskAsync();
      }
    }, 2000);
  }
}

/** Async disk write — export is sync but the file write is async */
function saveToDiskAsync(): void {
  if (!db || !dbPath || isSaving) return;
  isSaving = true;
  try {
    const data = db.export();
    const buf = Buffer.from(data);
    fs.writeFile(dbPath, buf, (err) => {
      isSaving = false;
      if (err) logger.error('D1', 'Async save failed', { error: err instanceof Error ? err.message : String(err) });
      // If more writes happened while we were saving, schedule another
      if (saveDirty) scheduleSave();
    });
  } catch (err) {
    isSaving = false;
    logger.error('D1', 'Export failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Flush any pending debounced save immediately (call before app quit). */
export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (saveDirty) {
    saveDirty = false;
    saveToDiskSync();
  }
}

export function getDB(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

export function closeDB(): void {
  if (db) {
    flushSave();
    db.close();
    db = null;
  }
}

export async function initDB(): Promise<void> {
  const SQL = await initSqlJs();

  const app = getApp();
  const dbDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  dbPath = path.join(dbDir, 'ops-hub.db');

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // Run base schema (CREATE IF NOT EXISTS — safe to re-run)
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'db', 'schema.sql')
    : path.join(__dirname, '..', '..', 'db', 'schema.sql');
  db.run(fs.readFileSync(basePath, 'utf-8'));

  // Run migrations
  runMigrations(app);

  seedIntegrations(db);
  saveToDiskSync();
}

function runMigrations(app: import('electron').App): void {
  if (!db) return;

  // Track applied migrations
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const migrationsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'db', 'migrations')
    : path.join(__dirname, '..', '..', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Skip 001_initial — that's the base schema
    if (file === '001_initial.sql') continue;

    const applied = queryAll('SELECT name FROM _migrations WHERE name = ?', [file]);
    if (applied.length > 0) continue;

    logger.d1('Running migration', { file });
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    // Strip comment lines, then split into individual statements
    const stripped = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = stripped
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        db.run(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Ignore "duplicate column" errors (migration already partially applied)
        if (msg.includes('duplicate column') || msg.includes('already exists')) {
          continue;
        }
        logger.error('D1', 'Migration failed', { file, statement: stmt.slice(0, 80), error: msg });
      }
    }

    db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
    logger.d1('Migration applied', { file });
  }
}

function seedIntegrations(database: SqlJsDatabase): void {
  const integrations = [
    {
      name: 'ghl_agency',
      display_name: 'GHL Agency (Sub-Account Listing)',
      env_keys: '["GHL_AGENCY_PIT","GHL_COMPANY_ID"]',
    },
    {
      name: 'teamwork',
      display_name: 'Teamwork',
      env_keys: '["TEAMWORK_API_KEY","TEAMWORK_SITE"]',
    },
    {
      name: 'readai_api',
      display_name: 'Read.ai Cloud API',
      env_keys: '["READAI_CLIENT_ID","READAI_CLIENT_SECRET"]',
    },
    {
      name: 'readai_mcp',
      display_name: 'Read.ai MCP Server',
      env_keys: '["READAI_MCP_URL","READAI_MCP_TOKEN"]',
    },
    {
      name: 'gdrive',
      display_name: 'Google Drive',
      env_keys: '["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_DRIVE_CLIENT_FOLDER_ID"]',
      description: 'Sync client folders and documents from Google Drive.',
    },
    {
      name: 'discord',
      display_name: 'Discord',
      env_keys: '["DISCORD_BOT_TOKEN","DISCORD_GUILD_ID"]',
    },
    {
      name: 'kinsta',
      display_name: 'Kinsta',
      env_keys: '["KINSTA_API_KEY","KINSTA_COMPANY_ID"]',
    },
    {
      name: 'anthropic',
      display_name: 'Claude AI (Anthropic)',
      env_keys: '["ANTHROPIC_API_KEY"]',
      description: 'Claude API key for A2P compliance analysis and content generation.',
    },
    {
      name: 'gmail',
      display_name: 'Gmail',
      env_keys: '["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET"]',
      description: 'Gmail sync for client email tracking. Uses same Google OAuth credentials.',
    },
    {
      name: 'dataforseo',
      display_name: 'DataForSEO',
      env_keys: '["DATAFORSEO_LOGIN","DATAFORSEO_PASSWORD"]',
      description: 'SERP data, competitor page analysis, and keyword volume lookups.',
    },
  ];

  for (const int of integrations) {
    database.run(
      `INSERT OR IGNORE INTO integrations (id, name, display_name, env_keys, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'not_configured', datetime('now'), datetime('now'))`,
      [randomUUID(), int.name, int.display_name, int.env_keys]
    );
  }

  // Clean up old entries
  database.run("DELETE FROM integrations WHERE name IN ('ghl', 'ghl_ri', 'readai')");
}

// ── Query helpers ─────────────────────────────────────────────────────

export interface QueryResult {
  [column: string]: unknown;
}

export function queryAll(sql: string, params: unknown[] = []): QueryResult[] {
  const database = getDB();
  const stmt = database.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows: QueryResult[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as QueryResult);
  }
  stmt.free();
  return rows;
}

export function queryOne(sql: string, params: unknown[] = []): QueryResult | null {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

export function execute(sql: string, params: unknown[] = []): number {
  const database = getDB();
  database.run(sql, params);
  const changes = database.getRowsModified();
  scheduleSave();
  return changes;
}

/**
 * Execute multiple statements inside a single transaction.
 * Reduces disk I/O by batching writes — only one scheduleSave() at the end.
 */
export function executeInTransaction(fn: () => void): void {
  const database = getDB();
  database.run('BEGIN TRANSACTION');
  try {
    fn();
    database.run('COMMIT');
  } catch (err) {
    database.run('ROLLBACK');
    throw err;
  }
  scheduleSave();
}

/**
 * Batch upsert helper: runs upsertFn for each item in batches inside transactions.
 * Returns count of written and errored items.
 */
export function batchUpsert<T>(
  items: T[],
  upsertFn: (item: T) => void,
  batchSize: number = 100,
): { written: number; errors: number } {
  const database = getDB();
  let written = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    database.run('BEGIN TRANSACTION');
    try {
      for (const item of batch) {
        try {
          upsertFn(item);
          written++;
        } catch {
          errors++;
        }
      }
      database.run('COMMIT');
    } catch {
      try { database.run('ROLLBACK'); } catch { /* already rolled back */ }
      errors += batch.length;
    }
  }

  scheduleSave();
  return { written, errors };
}
