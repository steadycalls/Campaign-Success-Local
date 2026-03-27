import os from 'os';
import { queryOne } from '../../db/client';
import { logger } from '../../lib/logger';

export interface SystemHealth {
  ramUsedPercent: number;
  ramAvailableMB: number;
  cpuLoadPercent: number;
  sqliteQueueDepth: number;
  recommendedConcurrency: number;
}

const MAX_CONCURRENCY = 5;
const MIN_CONCURRENCY = 1;

export function getSystemHealth(): SystemHealth {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsedPercent = ((totalMem - freeMem) / totalMem) * 100;
  const ramAvailableMB = freeMem / (1024 * 1024);

  const loadAvg = os.loadavg()[0];
  const cores = os.cpus().length;
  const cpuLoadPercent = (loadAvg / cores) * 100;

  let sqliteQueueDepth = 0;
  try {
    const row = queryOne("SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'pending'");
    sqliteQueueDepth = (row?.cnt as number) || 0;
  } catch { /* table may not exist */ }

  let recommended = MAX_CONCURRENCY;

  // RAM pressure
  if (ramUsedPercent > 85) recommended = Math.min(recommended, 2);
  else if (ramUsedPercent > 75) recommended = Math.min(recommended, 3);

  // CPU pressure
  if (cpuLoadPercent > 80) recommended = Math.min(recommended, 2);
  else if (cpuLoadPercent > 60) recommended = Math.min(recommended, 3);

  // Queue depth pressure — too many pending means we're creating faster than processing
  if (sqliteQueueDepth > 300) recommended = Math.min(recommended, 2);

  recommended = Math.max(MIN_CONCURRENCY, recommended);

  return { ramUsedPercent, ramAvailableMB, cpuLoadPercent, sqliteQueueDepth, recommendedConcurrency: recommended };
}

/**
 * Check if the queue is saturated (too many pending or running tasks).
 * Used by the scheduler to skip enqueuing new sync cycles.
 */
export function isQueueSaturated(): boolean {
  try {
    const row = queryOne(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
      FROM sync_queue
    `);
    const pending = (row?.pending as number) || 0;
    const running = (row?.running as number) || 0;
    return pending > 200 || running > 10;
  } catch {
    return false;
  }
}

// ── Periodic health logging ────────────────────────────────────────────

let healthLogTimer: ReturnType<typeof setInterval> | null = null;

export function startHealthLogging(): void {
  if (healthLogTimer) return;
  healthLogTimer = setInterval(() => {
    const h = getSystemHealth();
    if (h.sqliteQueueDepth > 0 || h.ramUsedPercent > 70) {
      logger.perf('System', 'Health check', {
        ram_pct: Math.round(h.ramUsedPercent),
        ram_avail_mb: Math.round(h.ramAvailableMB),
        cpu_pct: Math.round(h.cpuLoadPercent),
        queue_depth: h.sqliteQueueDepth,
        concurrency: h.recommendedConcurrency,
      });
    }
  }, 60000);
}

export function stopHealthLogging(): void {
  if (healthLogTimer) {
    clearInterval(healthLogTimer);
    healthLogTimer = null;
  }
}
