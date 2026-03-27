// ── Sync Queue Startup Recovery ──────────────────────────────────────
//
// On app launch, detects tasks stuck in 'running' (orphaned by a crash
// or forced close) and resets them to 'pending' so the queue picks them
// up automatically.  All task types use idempotent writes (upserts), so
// re-running is always safe.

import { randomUUID } from 'crypto';
import { queryAll, execute } from '../../db/client';
import { logger } from '../../lib/logger';
import { cleanupOldChangeLogs } from '../utils/cursors';

interface RecoveryDetail {
  taskId: string;
  companyName: string;
  taskType: string;
  stuckSince: string;
  stuckMinutes: number;
}

export interface RecoveryResult {
  recoveredTasks: number;
  recoveredCompanies: string[];
  details: RecoveryDetail[];
}

const STALE_THRESHOLD_MINUTES = 5;

/**
 * Detect tasks stuck in 'running' longer than the threshold and reset
 * them to 'pending'.  Called once during app startup, before the queue
 * processor begins polling.
 */
export function recoverOrphanedTasks(): RecoveryResult {
  const orphaned = queryAll(`
    SELECT
      id,
      company_id,
      company_name,
      task_type,
      started_at,
      ROUND(
        (julianday('now') - julianday(COALESCE(started_at, created_at))) * 24 * 60
      ) as stuck_minutes
    FROM sync_queue
    WHERE status = 'running'
      AND (
        julianday('now') - julianday(COALESCE(started_at, created_at))
      ) * 24 * 60 > ?
    ORDER BY priority DESC, created_at ASC
  `, [STALE_THRESHOLD_MINUTES]);

  if (orphaned.length === 0) {
    return { recoveredTasks: 0, recoveredCompanies: [], details: [] };
  }

  // Reset all orphaned tasks to 'pending'
  for (const task of orphaned) {
    execute(
      `UPDATE sync_queue
       SET status = 'pending',
           started_at = NULL,
           error = 'Recovered after app restart (was stuck in running)'
       WHERE id = ?`,
      [task.id as string]
    );
  }

  // Reset sync_progress rows for affected companies so the UI shows
  // them as active again once the queue picks them up
  const companyIds = [...new Set(orphaned.map(t => t.company_id as string).filter(Boolean))];
  for (const companyId of companyIds) {
    execute(
      `UPDATE sync_progress
       SET overall_status = 'resuming',
           updated_at = datetime('now')
       WHERE company_id = ?
         AND overall_status NOT IN ('idle', 'completed')`,
      [companyId]
    );
  }

  const details: RecoveryDetail[] = orphaned.map(task => ({
    taskId: task.id as string,
    companyName: (task.company_name as string) || 'Unknown',
    taskType: task.task_type as string,
    stuckSince: (task.started_at as string) || 'unknown',
    stuckMinutes: Math.round(task.stuck_minutes as number),
  }));

  const uniqueCompanies = [...new Set(details.map(d => d.companyName))];

  // Log to sync_alerts so it shows on the Sync Logs page
  execute(
    `INSERT INTO sync_alerts (id, type, severity, message, acknowledged, created_at)
     VALUES (?, 'sync_recovered', 'info', ?, 0, datetime('now'))`,
    [
      randomUUID(),
      `Sync resumed: ${orphaned.length} task${orphaned.length > 1 ? 's' : ''} recovered after restart (${uniqueCompanies.join(', ')})`,
    ]
  );

  logger.recovery(`Recovered orphaned tasks`, { tasks: orphaned.length, companies: uniqueCompanies.length });
  for (const d of details) {
    logger.recovery('Recovered task', { company: d.companyName, type: d.taskType, stuck_minutes: d.stuckMinutes });
  }

  return { recoveredTasks: orphaned.length, recoveredCompanies: uniqueCompanies, details };
}

/**
 * Clean up completed/failed tasks older than 7 days to prevent the
 * sync_queue table from growing indefinitely.
 */
export function cleanupOldTasks(): number {
  const before = queryAll(
    "SELECT COUNT(*) as cnt FROM sync_queue WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', '-7 days')"
  );
  const count = (before[0]?.cnt as number) || 0;

  if (count > 0) {
    execute(
      "DELETE FROM sync_queue WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', '-7 days')"
    );
    logger.recovery('Cleaned up old tasks', { count });
  }

  return count;
}

/**
 * Clean up old sync_runs, sync_phases, and sync_alerts older than 30 days.
 */
export function cleanupOldSyncLogs(): { runs: number; phases: number; alerts: number } {
  const cutoff = "datetime('now', '-30 days')";

  const runsRow = queryAll(`SELECT COUNT(*) as cnt FROM sync_runs WHERE started_at < ${cutoff}`);
  const runsCount = (runsRow[0]?.cnt as number) || 0;

  let phasesCount = 0;
  let alertsCount = 0;

  if (runsCount > 0) {
    // Delete phases that belong to old runs
    const oldRunIds = queryAll(`SELECT id FROM sync_runs WHERE started_at < ${cutoff}`);
    if (oldRunIds.length > 0) {
      const ids = oldRunIds.map(r => `'${r.id}'`).join(',');
      try {
        const phasesRow = queryAll(`SELECT COUNT(*) as cnt FROM sync_phases WHERE run_id IN (${ids})`);
        phasesCount = (phasesRow[0]?.cnt as number) || 0;
        execute(`DELETE FROM sync_phases WHERE run_id IN (${ids})`);
      } catch { /* sync_phases table may not exist yet */ }
    }
    execute(`DELETE FROM sync_runs WHERE started_at < ${cutoff}`);
  }

  const alertsRow = queryAll(`SELECT COUNT(*) as cnt FROM sync_alerts WHERE acknowledged = 1 AND created_at < ${cutoff}`);
  alertsCount = (alertsRow[0]?.cnt as number) || 0;
  if (alertsCount > 0) {
    execute(`DELETE FROM sync_alerts WHERE acknowledged = 1 AND created_at < ${cutoff}`);
  }

  // Also clean up old change_log entries
  const changesCount = cleanupOldChangeLogs();

  if (runsCount > 0 || phasesCount > 0 || alertsCount > 0 || changesCount > 0) {
    logger.recovery('Cleaned up old sync logs', { runs: runsCount, phases: phasesCount, alerts: alertsCount, changes: changesCount });
  }

  return { runs: runsCount, phases: phasesCount, alerts: alertsCount };
}
