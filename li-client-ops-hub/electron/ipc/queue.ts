import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import {
  startQueueManager,
  stopQueueManager,
  isQueueRunning,
  getMemoryStats,
  getQueueStats,
  enqueueFullCompanySync,
} from '../../sync/queue/manager';
import { isQueueSaturated } from '../../sync/utils/systemHealth';
import { logAlert } from '../../sync/utils/logger';

export function registerQueueHandlers(): void {
  // Enqueue a single company sync (manual trigger)
  ipcMain.handle('queue:syncCompany', (_e, companyId: string) => {
    const company = queryOne('SELECT id, name, ghl_location_id, pit_token, pit_status FROM companies WHERE id = ?', [companyId]);
    if (!company?.pit_token || company.pit_status !== 'valid') {
      return { success: false, message: 'PIT not configured or invalid' };
    }
    enqueueFullCompanySync(
      { id: company.id as string, name: (company.name as string) ?? '', ghl_location_id: company.ghl_location_id as string },
      100 // manual = highest priority
    );
    startQueueManager();
    return { success: true, message: 'Sync queued' };
  });

  // Enqueue all enabled companies with priority-based scheduling
  ipcMain.handle('queue:syncAll', () => {
    // Backpressure: skip if queue is already overwhelmed
    if (isQueueSaturated()) {
      logAlert('queue_saturated', 'warning', 'Sync All skipped — queue has too many pending tasks');
      return { success: false, message: 'Queue saturated — too many pending tasks. Wait for current syncs to finish.' };
    }

    const enabled = queryAll(
      "SELECT id, name, ghl_location_id, sla_status, last_sync_at FROM companies WHERE sync_enabled = 1 AND pit_status = 'valid' AND status = 'active'"
    );

    for (const c of enabled) {
      const priority = calculateSyncPriority(c);
      enqueueFullCompanySync(
        { id: c.id as string, name: (c.name as string) ?? '', ghl_location_id: c.ghl_location_id as string },
        priority
      );
    }
    startQueueManager();
    return { success: true, message: `${enabled.length} sub-accounts queued` };
  });

  // Progress
  ipcMain.handle('queue:getProgressAll', () => {
    return queryAll('SELECT * FROM sync_progress ORDER BY company_name ASC');
  });

  ipcMain.handle('queue:getProgressForCompany', (_e, companyId: string) => {
    return queryOne('SELECT * FROM sync_progress WHERE company_id = ?', [companyId]);
  });

  ipcMain.handle('queue:getStats', () => getQueueStats());
  ipcMain.handle('queue:getMemory', () => getMemoryStats());
  ipcMain.handle('queue:isRunning', () => isQueueRunning());

  // Per-company queue stats
  ipcMain.handle('queue:getQueueStatsForCompany', (_e, companyId: string) => {
    return queryOne(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM sync_queue
      WHERE company_id = ? AND created_at >= datetime('now', '-24 hours')
    `, [companyId]);
  });

  // Message stats per company (for sync logs)
  ipcMain.handle('syncLogs:getCompanyMessageStats', (_e, companyId: string) => {
    const total = queryOne('SELECT COUNT(*) as cnt FROM messages WHERE company_id = ?', [companyId]);
    const byType = queryAll(`
      SELECT type, COUNT(*) as cnt FROM messages
      WHERE company_id = ?
      GROUP BY type
      ORDER BY cnt DESC
    `, [companyId]);
    return {
      total: (total?.cnt as number) ?? 0,
      byType,
    };
  });

  // Pause/resume
  ipcMain.handle('queue:pause', () => { stopQueueManager(); return { success: true }; });
  ipcMain.handle('queue:resume', () => { startQueueManager(); return { success: true }; });

  // Clear old entries
  ipcMain.handle('queue:clearOld', () => {
    const result = execute(
      "DELETE FROM sync_queue WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', '-24 hours')"
    );
    return { deleted: result };
  });

  // Debug: dump full queue state
  ipcMain.handle('debug:getQueueState', () => {
    const pending = queryAll(
      "SELECT id, company_name, task_type, status, priority, params_json, created_at FROM sync_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 20"
    );
    const running = queryAll(
      "SELECT id, company_name, task_type, status, priority, started_at FROM sync_queue WHERE status = 'running'"
    );
    const recentCompleted = queryAll(
      "SELECT id, company_name, task_type, status, items_found, items_processed, completed_at FROM sync_queue WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 10"
    );
    const recentFailed = queryAll(
      "SELECT id, company_name, task_type, status, error, attempt FROM sync_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10"
    );
    return { pending, running, recentCompleted, recentFailed, isQueueRunning: isQueueRunning() };
  });

  // Get active queue tasks
  ipcMain.handle('queue:getActiveTasks', () => {
    return queryAll(
      `SELECT id, company_id, company_name, task_type, status, priority, items_found, items_processed, started_at, error
       FROM sync_queue
       WHERE status IN ('pending', 'running')
       ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, priority DESC, created_at ASC
       LIMIT 50`
    );
  });
}

// ── Priority calculation ──────────────────────────────────────────────

function calculateSyncPriority(company: Record<string, unknown>): number {
  let priority = 50; // base

  // SLA violations get highest priority
  const sla = company.sla_status as string;
  if (sla === 'violation') priority += 30;
  else if (sla === 'warning') priority += 15;

  // Stale data gets higher priority
  const lastSync = company.last_sync_at as string | null;
  if (lastSync) {
    const hoursSince = (Date.now() - new Date(lastSync).getTime()) / 3600000;
    if (hoursSince > 12) priority += 20;
    else if (hoursSince > 6) priority += 10;
  } else {
    priority += 25; // never synced — urgent
  }

  return Math.min(priority, 99); // cap at 99, manual = 100
}
