import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute, executeInTransaction } from '../db/client';
import { queryAllKeywords } from './gsc-client';
import { logger } from '../lib/logger';

export interface FeedbackReport {
  checked: number;
  improved: number;
  declined: number;
  stable: number;
  resolved: number;
}

/**
 * For every published content piece, pull current GSC position and compare to before.
 * Updates content_performance and auto-resolves gap keywords reaching top 3.
 */
export async function trackPerformanceForCompany(companyId: string): Promise<FeedbackReport> {
  const company = queryOne('SELECT gsc_property FROM companies WHERE id = ?', [companyId]);
  if (!company?.gsc_property) return { checked: 0, improved: 0, declined: 0, stable: 0, resolved: 0 };

  const gscProperty = company.gsc_property as string;

  // Get all published gap keywords
  const tracked = queryAll(
    `SELECT gk.*, gc.published_at
     FROM gap_keywords gk
     LEFT JOIN generated_content gc ON gc.id = gk.content_id
     WHERE gk.company_id = ? AND gk.action_status IN ('done', 'in_progress')
       AND gc.status = 'published'`,
    [companyId]
  );

  if (tracked.length === 0) return { checked: 0, improved: 0, declined: 0, stable: 0, resolved: 0 };

  // Pull current positions from GSC (last 7 days)
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const currentData = await queryAllKeywords(gscProperty, startDate, endDate);
  const posMap = new Map(currentData.map(kw => [kw.query, kw]));

  const now = new Date().toISOString();
  let improved = 0, declined = 0, stable = 0, resolved = 0;

  executeInTransaction(() => {
    for (const kw of tracked) {
      const current = posMap.get(kw.keyword as string);
      if (!current) continue;

      const positionBefore = (kw.position_at_detection as number) ?? (kw.current_position as number) ?? 999;
      const positionNow = current.position;
      const prevBest = (kw.position_after_action as number) ?? 999;
      const best = Math.min(positionNow, prevBest);

      // Determine trend
      const delta = positionBefore - positionNow; // positive = improved
      let trend = 'stable';
      if (positionNow <= 3) { trend = 'resolved'; resolved++; }
      else if (delta >= 3) { trend = 'improving'; improved++; }
      else if (delta <= -3) { trend = 'declining'; declined++; }
      else { stable++; }

      // Upsert content_performance
      const existingPerf = queryOne(
        'SELECT id FROM content_performance WHERE content_id = ? AND keyword = ?',
        [kw.content_id as string, kw.keyword as string]
      );

      if (existingPerf) {
        execute(
          `UPDATE content_performance SET
            position_current=?, position_best=MIN(position_best, ?),
            clicks_current=?, impressions_current=?,
            check_count=check_count+1, last_check_at=?, trend=?
          WHERE id=?`,
          [positionNow, positionNow, current.clicks, current.impressions,
           now, trend, existingPerf.id as string]
        );
      } else {
        execute(
          `INSERT INTO content_performance
            (id, company_id, content_id, gap_keyword_id, keyword,
             position_before, position_current, position_best,
             clicks_before, clicks_current, impressions_before, impressions_current,
             check_count, first_check_at, last_check_at, trend)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
          [randomUUID(), companyId, kw.content_id, kw.id, kw.keyword,
           positionBefore, positionNow, best,
           (kw.clicks as number) ?? 0, current.clicks,
           (kw.impressions as number) ?? 0, current.impressions,
           now, now, trend]
        );
      }

      // Update gap keyword position tracking
      execute(
        `UPDATE gap_keywords SET
          position_after_action=?, current_position=?, last_checked_at=?,
          action_status = CASE WHEN ? <= 3 THEN 'done' ELSE action_status END,
          resolved_at = CASE WHEN ? <= 3 AND resolved_at IS NULL THEN ? ELSE resolved_at END
        WHERE id=?`,
        [positionNow, positionNow, now, positionNow, positionNow, now, kw.id as string]
      );
    }
  });

  logger.sync(`Feedback tracking for ${companyId}: ${tracked.length} checked, ${improved} improved, ${declined} declined, ${resolved} resolved`);
  return { checked: tracked.length, improved, declined, stable, resolved };
}

export async function trackPerformanceAll(): Promise<{ companies: number; checked: number }> {
  const companies = queryAll(
    "SELECT id FROM companies WHERE gsc_property IS NOT NULL AND seo_scan_enabled = 1 AND status = 'active'"
  );

  let totalChecked = 0;
  for (const c of companies) {
    try {
      const result = await trackPerformanceForCompany(c.id as string);
      totalChecked += result.checked;
    } catch (err: unknown) {
      logger.error('SEO', `Feedback tracking failed for company ${c.id}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { companies: companies.length, checked: totalChecked };
}
