import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

function getApp() {
  return require('electron').app as import('electron').App;
}

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

function saveToDisk(): void {
  if (db && dbPath) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

export function getDB(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

export function closeDB(): void {
  if (db) {
    saveToDisk();
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
  saveToDisk();
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

    console.log(`[db] Running migration: ${file}`);
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
        console.error(`[db] Migration ${file} failed on: ${stmt.slice(0, 80)}`, msg);
      }
    }

    db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
    console.log(`[db] Migration applied: ${file}`);
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
      env_keys: '["READAI_API_KEY"]',
    },
    {
      name: 'readai_mcp',
      display_name: 'Read.ai MCP Server',
      env_keys: '["READAI_MCP_URL","READAI_MCP_TOKEN"]',
    },
    {
      name: 'gdrive',
      display_name: 'Google Drive',
      env_keys: '["GOOGLE_SERVICE_ACCOUNT_JSON_PATH","GOOGLE_DRIVE_PARENT_FOLDER_ID"]',
    },
    {
      name: 'discord',
      display_name: 'Discord',
      env_keys: '["DISCORD_BOT_TOKEN","DISCORD_GUILD_ID"]',
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
  saveToDisk();
  return changes;
}
