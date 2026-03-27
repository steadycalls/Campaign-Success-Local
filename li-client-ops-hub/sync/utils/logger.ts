import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../../db/client';
import { logger } from '../../lib/logger';

export interface SyncCounts {
  found: number;
  created: number;
  updated: number;
}

export interface PhaseCounts {
  found?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  apiCalls?: number;
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
  logger.sync('Started run', { run_id: id, adapter, trigger, company: companyName || undefined });
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
  logger.sync('Finished run', { run_id: runId, status, fetched: counts.found ?? 0, created: counts.created ?? 0, updated: counts.updated ?? 0, error: errorMessage || undefined });
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
  logger.sync('Alert', { severity, type, message, company_id: companyId || undefined });
}

// ── Phase tracking ────────────────────────────────────────────────────

export function logPhaseStart(
  runId: string,
  companyId: string,
  phaseName: string,
): string {
  const phaseId = randomUUID();
  execute(
    `INSERT INTO sync_phases (id, run_id, company_id, phase_name, status, started_at)
     VALUES (?, ?, ?, ?, 'running', datetime('now'))`,
    [phaseId, runId, companyId, phaseName]
  );
  return phaseId;
}

export function logPhaseEnd(
  phaseId: string,
  status: 'completed' | 'failed' | 'skipped',
  counts: PhaseCounts = {},
  error?: Error | null,
): void {
  execute(
    `UPDATE sync_phases SET
      status = ?,
      ended_at = datetime('now'),
      duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
      items_found = ?, items_created = ?, items_updated = ?,
      items_skipped = ?, items_failed = ?,
      api_calls_made = ?,
      error_message = ?,
      error_stack = ?
    WHERE id = ?`,
    [
      status,
      counts.found ?? 0, counts.created ?? 0, counts.updated ?? 0,
      counts.skipped ?? 0, counts.failed ?? 0,
      counts.apiCalls ?? 0,
      error?.message?.slice(0, 1000) ?? null,
      error?.stack?.slice(0, 2000) ?? null,
      phaseId,
    ]
  );
}

export function getPhases(runId: string): Array<Record<string, unknown>> {
  return queryAll(
    'SELECT * FROM sync_phases WHERE run_id = ? ORDER BY started_at ASC',
    [runId]
  );
}

/** Mark any still-running phases as failed (for stuck sync recovery) */
export function failOrphanedPhases(runId: string): number {
  const result = execute(
    `UPDATE sync_phases SET status = 'failed', ended_at = datetime('now'),
      error_message = 'Orphaned: sync run ended without completing this phase'
     WHERE run_id = ? AND status = 'running'`,
    [runId]
  );
  return result;
}
