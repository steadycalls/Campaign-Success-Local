// ── Health Score: Batch Compute ──────────────────────────────────────
//
// Recomputes health scores for all active, sync-enabled companies.
// Stores results on the companies table and in daily history.

import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { computeHealthScore } from './scoring';

export function computeAllHealthScores(): { computed: number; changed: number } {
  const companies = queryAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM contacts
       WHERE company_id = c.id
         AND created_at >= datetime('now', '-30 days')
      ) as contacts_added_30d_live,
      (SELECT COUNT(*) FROM messages
       WHERE company_id = c.id
         AND message_at >= datetime('now', '-7 days')
      ) as messages_last_7d,
      (SELECT COUNT(*) FROM messages
       WHERE company_id = c.id
         AND message_at >= datetime('now', '-30 days')
      ) as messages_last_30d,
      (SELECT COUNT(*) FROM meetings
       WHERE company_id = c.id
         AND meeting_date >= datetime('now', '-30 days')
      ) as meetings_last_30d,
      (SELECT budget_percent FROM teamwork_projects
       WHERE company_id = c.id AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1
      ) as tw_budget_used_pct
    FROM companies c
    WHERE c.status = 'active' AND c.sync_enabled = 1
  `);

  let computed = 0;
  let changed = 0;

  for (const company of companies) {
    // Use live subquery counts where the stored column may be stale
    if (company.contacts_added_30d_live !== undefined) {
      company.contacts_added_30d = company.contacts_added_30d_live;
    }

    const health = computeHealthScore(company);
    const previousScore = company.health_score as number | null;

    // Update company row
    execute(`
      UPDATE companies SET
        health_score = ?,
        health_grade = ?,
        health_status = ?,
        health_trend = ?,
        health_computed_at = ?,
        health_components_json = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      health.total, health.grade, health.status, health.trend,
      health.computedAt, JSON.stringify(health.components),
      company.id as string,
    ]);

    // Store in history (once per day max)
    const todayStr = new Date().toISOString().split('T')[0];
    const existingToday = queryOne(
      "SELECT id FROM health_score_history WHERE company_id = ? AND computed_at LIKE ?",
      [company.id as string, `${todayStr}%`]
    );

    if (!existingToday) {
      execute(`
        INSERT INTO health_score_history (id, company_id, health_score, health_grade, components_json, computed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        randomUUID(), company.id as string, health.total, health.grade,
        JSON.stringify(health.components), health.computedAt,
      ]);
    } else {
      execute(`
        UPDATE health_score_history SET health_score = ?, health_grade = ?,
          components_json = ?, computed_at = ?
        WHERE id = ?
      `, [
        health.total, health.grade, JSON.stringify(health.components),
        health.computedAt, existingToday.id as string,
      ]);
    }

    computed++;
    if (previousScore !== null && previousScore !== undefined && previousScore !== health.total) {
      changed++;
    }
  }

  return { computed, changed };
}
