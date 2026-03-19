import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../db/client';

// ── Config ────────────────────────────────────────────────────────────

/** Tables to sync and columns to exclude from each */
const SYNC_TABLES: Array<{ table: string; excludeColumns?: string[]; timestampCol?: string }> = [
  { table: 'companies', excludeColumns: ['pit_token', 'pit_status', 'pit_last_tested_at', 'pit_last_error'] },
  { table: 'contacts' },
  { table: 'messages', excludeColumns: ['raw_json'] },
  { table: 'meetings', excludeColumns: ['recording_local_path', 'raw_json'] },
  { table: 'action_items', excludeColumns: ['raw_json'] },
  { table: 'client_associations' },
  { table: 'company_domains' },
  { table: 'ghl_users' },
  { table: 'ghl_workflows' },
  { table: 'ghl_funnels' },
  { table: 'ghl_sites' },
  { table: 'ghl_email_templates' },
  { table: 'ghl_custom_fields' },
  { table: 'drive_files', excludeColumns: ['raw_json'] },
  { table: 'discord_servers', excludeColumns: ['raw_json'] },
  { table: 'discord_channels', excludeColumns: ['raw_json'] },
  { table: 'sync_runs' },
  { table: 'sync_alerts' },
];

const MAX_TEXT_LENGTH = 500_000; // 500KB per text field to stay under D1 limits
const BATCH_SIZE = 50; // statements per API call

// ── Cloud Sync Manager ────────────────────────────────────────────────

export interface CloudSyncStatus {
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  tablesStatus: Array<{ table: string; rowsPushed: number; lastPushedAt: string | null }>;
  isSyncing: boolean;
}

let isSyncing = false;

function getWorkerUrl(): string | null {
  return process.env.CLOUD_SYNC_WORKER_URL || null;
}

function getApiKey(): string | null {
  return process.env.CLOUD_SYNC_API_KEY || null;
}

function isEnabled(): boolean {
  return process.env.CLOUD_SYNC_ENABLED === 'true' && !!getWorkerUrl() && !!getApiKey();
}

function getLastSyncAt(): string | null {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'cloud_last_synced_at'");
  return (row?.value as string) ?? null;
}

function setLastSyncAt(iso: string): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('cloud_last_synced_at', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [iso]
  );
}

function setLastError(err: string | null): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('cloud_last_error', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [err]
  );
}

// ── Get table columns ─────────────────────────────────────────────────

function getTableColumns(table: string): string[] {
  try {
    const rows = queryAll(`PRAGMA table_info(${table})`);
    return rows.map((r) => r.name as string);
  } catch {
    return [];
  }
}

// ── Truncate long text values ─────────────────────────────────────────

function truncateValue(val: unknown): unknown {
  if (typeof val === 'string' && val.length > MAX_TEXT_LENGTH) {
    return val.substring(0, MAX_TEXT_LENGTH);
  }
  return val;
}

// ── Build INSERT OR REPLACE statements ────────────────────────────────

function buildUpsertStatements(
  table: string,
  rows: Array<Record<string, unknown>>,
  excludeColumns: string[] = []
): Array<{ sql: string; params: unknown[] }> {
  if (rows.length === 0) return [];

  const allColumns = Object.keys(rows[0]).filter((c) => !excludeColumns.includes(c));
  const placeholders = allColumns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${allColumns.join(', ')}) VALUES (${placeholders})`;

  return rows.map((row) => ({
    sql,
    params: allColumns.map((col) => truncateValue(row[col] ?? null)),
  }));
}

// ── Push to Worker ────────────────────────────────────────────────────

async function pushBatch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
  const url = getWorkerUrl();
  const key = getApiKey();
  if (!url || !key) throw new Error('Cloud sync not configured');

  const res = await fetch(`${url}/sync/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ statements }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloud sync failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── Sync changed rows ─────────────────────────────────────────────────

export async function syncToCloud(fullResync: boolean = false): Promise<{ success: boolean; rowsPushed: number; error?: string }> {
  if (!isEnabled()) return { success: false, rowsPushed: 0, error: 'Cloud sync not enabled' };
  if (isSyncing) return { success: false, rowsPushed: 0, error: 'Sync already in progress' };

  isSyncing = true;
  let totalPushed = 0;

  try {
    const lastSync = fullResync ? null : getLastSyncAt();
    const syncStartedAt = new Date().toISOString();

    for (const config of SYNC_TABLES) {
      try {
        const columns = getTableColumns(config.table);
        if (columns.length === 0) continue; // table doesn't exist

        // Query changed rows
        let rows: Array<Record<string, unknown>>;
        const tsCol = config.timestampCol ?? (columns.includes('updated_at') ? 'updated_at' : 'created_at');

        if (lastSync && !fullResync) {
          rows = queryAll(
            `SELECT * FROM ${config.table} WHERE ${tsCol} > ? ORDER BY ${tsCol} ASC LIMIT 5000`,
            [lastSync]
          ) as Array<Record<string, unknown>>;
        } else {
          rows = queryAll(
            `SELECT * FROM ${config.table} ORDER BY rowid ASC LIMIT 10000`
          ) as Array<Record<string, unknown>>;
        }

        if (rows.length === 0) continue;

        // Build and push statements in batches
        const statements = buildUpsertStatements(config.table, rows, config.excludeColumns);

        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
          const batch = statements.slice(i, i + BATCH_SIZE);
          await pushBatch(batch);
          totalPushed += batch.length;
        }

        console.log(`[cloud-sync] ${config.table}: pushed ${rows.length} rows`);
      } catch (err: unknown) {
        console.error(`[cloud-sync] ${config.table} failed:`, err instanceof Error ? err.message : err);
        // Continue with other tables
      }
    }

    // Push deletes
    await pushDeletes();

    // Update last sync timestamp
    setLastSyncAt(syncStartedAt);
    setLastError(null);

    console.log(`[cloud-sync] Complete: ${totalPushed} rows pushed`);
    return { success: true, rowsPushed: totalPushed };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setLastError(message);
    console.error('[cloud-sync] Failed:', message);
    return { success: false, rowsPushed: totalPushed, error: message };
  } finally {
    isSyncing = false;
  }
}

async function pushDeletes(): Promise<void> {
  const deletes = queryAll('SELECT * FROM cloud_delete_log ORDER BY deleted_at ASC LIMIT 500');
  if (deletes.length === 0) return;

  const statements = deletes.map((d) => ({
    sql: `DELETE FROM ${d.table_name} WHERE id = ?`,
    params: [d.row_id as string],
  }));

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await pushBatch(statements.slice(i, i + BATCH_SIZE));
  }

  // Clear processed deletes
  execute('DELETE FROM cloud_delete_log');
  console.log(`[cloud-sync] Pushed ${deletes.length} deletes`);
}

// ── Status ────────────────────────────────────────────────────────────

export function getCloudSyncStatus(): CloudSyncStatus {
  const lastError = queryOne("SELECT value FROM app_state WHERE key = 'cloud_last_error'");
  return {
    enabled: isEnabled(),
    lastSyncAt: getLastSyncAt(),
    lastError: (lastError?.value as string) ?? null,
    tablesStatus: [],
    isSyncing,
  };
}

// ── Auto-sync timer ───────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startCloudSyncTimer(intervalMs: number = 5 * 60 * 1000): void {
  if (syncInterval) return;
  if (!isEnabled()) {
    console.log('[cloud-sync] Not enabled, skipping timer');
    return;
  }

  syncInterval = setInterval(async () => {
    if (!isEnabled()) return;
    await syncToCloud();
  }, intervalMs);

  console.log(`[cloud-sync] Timer started (every ${intervalMs / 1000}s)`);
}

export function stopCloudSyncTimer(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[cloud-sync] Timer stopped');
  }
}
