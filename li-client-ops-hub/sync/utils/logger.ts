import { randomUUID } from 'crypto';
import { queryOne, execute } from '../../db/client';

export interface SyncCounts {
  found: number;
  created: number;
  updated: number;
}

export function logSyncStart(
  adapter: string,
  trigger: 'scheduled' | 'manual',
  companyId?: string,
  companyName?: string
): string {
  const id = randomUUID();
  execute(
    `INSERT INTO sync_runs (id, trigger, adapter, status, company_id, company_name, started_at)
     VALUES (?, ?, ?, 'running', ?, ?, datetime('now'))`,
    [id, trigger, adapter, companyId ?? null, companyName ?? null]
  );
  console.log(`[sync] Started run=${id} adapter=${adapter} trigger=${trigger}${companyName ? ` company=${companyName}` : ''}`);
  return id;
}

export function logSyncEnd(
  runId: string,
  status: 'success' | 'error',
  counts: Partial<SyncCounts> = {},
  errorMessage?: string
): void {
  execute(
    `UPDATE sync_runs
     SET status = ?, items_fetched = ?, items_created = ?, items_updated = ?,
         error_message = ?, finished_at = datetime('now')
     WHERE id = ?`,
    [
      status,
      counts.found ?? 0,
      counts.created ?? 0,
      counts.updated ?? 0,
      errorMessage ?? null,
      runId,
    ]
  );
  console.log(
    `[sync] Finished run=${runId} status=${status} fetched=${counts.found ?? 0} created=${counts.created ?? 0} updated=${counts.updated ?? 0}${errorMessage ? ` error=${errorMessage}` : ''}`
  );
}

export function logAlert(
  type: string,
  severity: 'info' | 'warning' | 'error',
  message: string,
  companyId?: string
): void {
  const id = randomUUID();
  execute(
    `INSERT INTO sync_alerts (id, company_id, type, severity, message, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [id, companyId ?? null, type, severity, message]
  );
  console.log(`[sync:alert] ${severity} ${type}: ${message}`);
}
