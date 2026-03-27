import { queryOne, execute } from '../db/client';
import { detectGapsAll } from './gap-detector';
import { trackPerformanceAll } from './feedback-tracker';
import { logger } from '../lib/logger';

export interface SEOScheduleConfig {
  enabled: boolean;
  gapFrequencyDays: number;
  feedbackFrequencyDays: number;
  lastGapRunAt: string | null;
  lastFeedbackRunAt: string | null;
}

export function getSEOScheduleConfig(): SEOScheduleConfig {
  const enabled = queryOne("SELECT value FROM app_state WHERE key = 'seo_schedule_enabled'");
  const gapFreq = queryOne("SELECT value FROM app_state WHERE key = 'seo_gap_frequency_days'");
  const feedbackFreq = queryOne("SELECT value FROM app_state WHERE key = 'seo_feedback_frequency_days'");
  const lastGap = queryOne("SELECT value FROM app_state WHERE key = 'seo_last_gap_run'");
  const lastFeedback = queryOne("SELECT value FROM app_state WHERE key = 'seo_last_feedback_run'");

  return {
    enabled: (enabled?.value as string) === 'true',
    gapFrequencyDays: parseInt((gapFreq?.value as string) ?? '7', 10),
    feedbackFrequencyDays: parseInt((feedbackFreq?.value as string) ?? '7', 10),
    lastGapRunAt: (lastGap?.value as string) ?? null,
    lastFeedbackRunAt: (lastFeedback?.value as string) ?? null,
  };
}

export function setSEOScheduleConfig(config: Partial<SEOScheduleConfig>): void {
  const upsert = (key: string, value: string) => {
    execute(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, value]
    );
  };

  if (config.enabled !== undefined) upsert('seo_schedule_enabled', String(config.enabled));
  if (config.gapFrequencyDays !== undefined) upsert('seo_gap_frequency_days', String(config.gapFrequencyDays));
  if (config.feedbackFrequencyDays !== undefined) upsert('seo_feedback_frequency_days', String(config.feedbackFrequencyDays));
}

function daysSince(isoDate: string | null): number {
  if (!isoDate) return 999;
  return (Date.now() - new Date(isoDate).getTime()) / 86400000;
}

/**
 * Check if gap detection or feedback tracking is due, and run if so.
 * Called by the scheduler daily.
 */
export async function checkAndRunSEOSchedule(): Promise<void> {
  const config = getSEOScheduleConfig();
  if (!config.enabled) return;

  // Gap detection
  if (daysSince(config.lastGapRunAt) >= config.gapFrequencyDays) {
    logger.scheduler('SEO: running scheduled gap detection');
    try {
      const result = await detectGapsAll();
      logger.scheduler('SEO gap detection complete', { scanned: result.scanned, gaps: result.totalGaps, errors: result.errors });
      execute(
        `INSERT INTO app_state (key, value, updated_at) VALUES ('seo_last_gap_run', datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')`,
        []
      );
    } catch (err: unknown) {
      logger.error('SEO', 'Scheduled gap detection failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Feedback tracking
  if (daysSince(config.lastFeedbackRunAt) >= config.feedbackFrequencyDays) {
    logger.scheduler('SEO: running scheduled feedback tracking');
    try {
      const result = await trackPerformanceAll();
      logger.scheduler('SEO feedback tracking complete', { companies: result.companies, checked: result.checked });
      execute(
        `INSERT INTO app_state (key, value, updated_at) VALUES ('seo_last_feedback_run', datetime('now'), datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')`,
        []
      );
    } catch (err: unknown) {
      logger.error('SEO', 'Scheduled feedback tracking failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
