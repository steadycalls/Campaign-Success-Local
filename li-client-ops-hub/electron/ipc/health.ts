import { ipcMain } from 'electron';
import { queryAll, queryOne } from '../../db/client';
import { computeAllHealthScores } from '../../sync/health/compute';

export function registerHealthHandlers(): void {

  // Get health score for a single company (with component breakdown)
  ipcMain.handle('health:getForCompany', (_, companyId: string) => {
    const row = queryOne(`
      SELECT health_score, health_grade, health_status, health_trend,
        health_computed_at, health_components_json
      FROM companies WHERE id = ?
    `, [companyId]);

    if (!row) return null;

    return {
      score: row.health_score as number | null,
      grade: row.health_grade as string | null,
      status: row.health_status as string | null,
      trend: row.health_trend as string | null,
      computedAt: row.health_computed_at as string | null,
      components: row.health_components_json
        ? JSON.parse(row.health_components_json as string)
        : [],
    };
  });

  // Get health score history for trend chart (last 30 days)
  ipcMain.handle('health:getHistory', (_, companyId: string) => {
    return queryAll(`
      SELECT health_score, health_grade, computed_at
      FROM health_score_history
      WHERE company_id = ?
      ORDER BY computed_at ASC
      LIMIT 30
    `, [companyId]);
  });

  // Get all companies sorted by health score (for portfolio)
  ipcMain.handle('health:getRanking', () => {
    return queryAll(`
      SELECT id, name, health_score, health_grade, health_status, health_trend
      FROM companies
      WHERE status = 'active' AND health_score IS NOT NULL
      ORDER BY health_score ASC
    `);
  });

  // Get critical/at-risk companies (for morning briefing)
  ipcMain.handle('health:getAtRisk', () => {
    const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';
    return queryAll(`
      SELECT co.id, co.name, co.health_score, co.health_grade, co.health_status, co.health_trend,
        co.health_components_json,
        (SELECT c.first_name FROM client_associations ca
         JOIN contacts c ON c.id = ca.client_contact_id
         WHERE ca.target_id = co.id AND ca.association_type = 'sub_account' LIMIT 1) as client_first_name,
        (SELECT c.last_name FROM client_associations ca
         JOIN contacts c ON c.id = ca.client_contact_id
         WHERE ca.target_id = co.id AND ca.association_type = 'sub_account' LIMIT 1) as client_last_name
      FROM companies co
      WHERE co.status = 'active' AND co.health_status IN ('at_risk', 'critical')
        AND (co.ghl_location_id IS NULL OR co.ghl_location_id != ?)
      ORDER BY co.health_score ASC
    `, [RI_LOCATION_ID]);
  });

  // Force recompute all health scores
  ipcMain.handle('health:recompute', () => {
    return computeAllHealthScores();
  });
}
