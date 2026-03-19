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

  // Enqueue all enabled companies
  ipcMain.handle('queue:syncAll', () => {
    const enabled = queryAll(
      "SELECT id, name, ghl_location_id FROM companies WHERE sync_enabled = 1 AND pit_status = 'valid' AND status = 'active'"
    );
    for (const c of enabled) {
      enqueueFullCompanySync(
        { id: c.id as string, name: (c.name as string) ?? '', ghl_location_id: c.ghl_location_id as string },
        50
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
