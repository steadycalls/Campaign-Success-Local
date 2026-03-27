import { queryOne, execute } from '../db/client';
import { bootstrapA2PRecords } from './bootstrap';
import { scanAllA2P } from './scanner';
import { analyzeAllA2P } from './analyzeCompany';
import { generateAllA2P } from './generateQueue';
import { logger } from '../lib/logger';

const STATE_KEY_FREQUENCY = 'a2p_schedule_frequency';
const STATE_KEY_LAST_RUN = 'a2p_schedule_last_run';
const STATE_KEY_ENABLED = 'a2p_schedule_enabled';

export interface A2PScheduleConfig {
  enabled: boolean;
  frequencyDays: number;  // 30, 90, 180, 365
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export function getA2PScheduleConfig(): A2PScheduleConfig {
  const enabled = getState(STATE_KEY_ENABLED) === 'true';
  const frequencyDays = parseInt(getState(STATE_KEY_FREQUENCY) || '90', 10);
  const lastRunAt = getState(STATE_KEY_LAST_RUN) || null;

  let nextRunAt: string | null = null;
  if (enabled && lastRunAt) {
    const next = new Date(lastRunAt);
    next.setDate(next.getDate() + frequencyDays);
    nextRunAt = next.toISOString();
  } else if (enabled && !lastRunAt) {
    nextRunAt = new Date().toISOString(); // run immediately on first enable
  }

  return { enabled, frequencyDays, lastRunAt, nextRunAt };
}

export function setA2PScheduleConfig(enabled: boolean, frequencyDays: number): void {
  setState(STATE_KEY_ENABLED, enabled ? 'true' : 'false');
  setState(STATE_KEY_FREQUENCY, String(frequencyDays));
}

/**
 * Called once daily by the scheduler. Checks if an A2P run is due and
 * executes the full pipeline: bootstrap → scan → analyze → generate.
 */
export async function checkAndRunA2PSchedule(): Promise<void> {
  const config = getA2PScheduleConfig();
  if (!config.enabled) return;

  const now = new Date();

  // Check if a run is due
  if (config.lastRunAt) {
    const lastRun = new Date(config.lastRunAt);
    const daysSince = Math.floor((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < config.frequencyDays) return;
  }

  logger.scheduler('A2P scheduled run starting', { frequency: `${config.frequencyDays}d` });

  try {
    // Step 1: Bootstrap any new companies
    const created = bootstrapA2PRecords();
    if (created > 0) {
      logger.scheduler('A2P bootstrap', { created });
    }

    // Step 2: Scan all websites
    const scanResult = await scanAllA2P();
    logger.scheduler('A2P scan complete', { scanned: scanResult.scanned, errors: scanResult.errors });

    // Step 3: Analyze with Claude
    const analyzeResult = await analyzeAllA2P();
    logger.scheduler('A2P analysis complete', { analyzed: analyzeResult.analyzed, errors: analyzeResult.errors });

    // Step 4: Generate missing content
    const generateResult = await generateAllA2P();
    logger.scheduler('A2P generation complete', { generated: generateResult.generated, errors: generateResult.errors });

    // Mark run complete
    setState(STATE_KEY_LAST_RUN, now.toISOString());
    logger.scheduler('A2P scheduled run complete');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Scheduler', 'A2P scheduled run failed', { error: msg });
  }
}

function getState(key: string): string | null {
  const row = queryOne('SELECT value FROM app_state WHERE key = ?', [key]);
  return row ? (row.value as string) : null;
}

function setState(key: string, value: string): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value]
  );
}
