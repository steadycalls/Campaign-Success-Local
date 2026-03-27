import { ipcMain, BrowserWindow } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { detectGapsForCompany, detectGapsAll, type GapConfig } from '../../seo/gap-detector';
import { analyzeCompetitorsForKeyword } from '../../seo/competitor-analyzer';
import { BRAND_INTERVIEW_QUESTIONS, processBrandInterview, getBrandProfile } from '../../seo/brand-profiler';
import { generateContentForKeyword, type GenerateOptions } from '../../seo/content-generator';
import { trackPerformanceForCompany } from '../../seo/feedback-tracker';
import { getSEOScheduleConfig, setSEOScheduleConfig } from '../../seo/schedule';
import { getGscProperties } from '../../seo/gsc-client';
import { getValidAccessToken } from '../../seo/gsc-client';

function sendProgress(channel: string, data: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

export function registerSEOHandlers(): void {
  // ── Gap Keywords ──────────────────────────────────────────────────

  ipcMain.handle('seo:getGapKeywords', (_e, companyId: string, filters?: { action?: string; status?: string }) => {
    let sql = 'SELECT * FROM gap_keywords WHERE company_id = ?';
    const params: unknown[] = [companyId];
    if (filters?.action) { sql += ' AND recommended_action = ?'; params.push(filters.action); }
    if (filters?.status) { sql += ' AND action_status = ?'; params.push(filters.status); }
    sql += ' ORDER BY opportunity_score DESC';
    return queryAll(sql, params);
  });

  ipcMain.handle('seo:getGapStats', (_e, companyId: string) => {
    return queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN action_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN action_status = 'done' THEN 1 ELSE 0 END) as done,
        ROUND(AVG(opportunity_score), 1) as avg_score,
        SUM(search_volume) as total_volume,
        ROUND(AVG(current_position), 1) as avg_position
      FROM gap_keywords WHERE company_id = ?
    `, [companyId]);
  });

  ipcMain.handle('seo:detectGaps', async (_e, companyId: string, config?: GapConfig) => {
    sendProgress('seo:gapProgress', { phase: 'start', companyId });
    try {
      const result = await detectGapsForCompany(companyId, config);
      sendProgress('seo:gapProgress', { phase: 'complete', ...result });
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('seo:detectGapsAll', async () => {
    return detectGapsAll();
  });

  ipcMain.handle('seo:updateGapStatus', (_e, gapId: string, status: string) => {
    execute("UPDATE gap_keywords SET action_status = ? WHERE id = ?", [status, gapId]);
    return { success: true };
  });

  ipcMain.handle('seo:dismissGap', (_e, gapId: string) => {
    execute("UPDATE gap_keywords SET action_status = 'skipped' WHERE id = ?", [gapId]);
    return { success: true };
  });

  // ── Competitor Analysis ───────────────────────────────────────────

  ipcMain.handle('seo:analyzeCompetitors', async (_e, gapKeywordId: string) => {
    sendProgress('seo:competitorProgress', { phase: 'start', gapKeywordId });
    try {
      const result = await analyzeCompetitorsForKeyword(gapKeywordId);
      sendProgress('seo:competitorProgress', { phase: 'complete', ...result });
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('seo:getCompetitorPages', (_e, gapKeywordId: string) => {
    return queryAll(
      'SELECT * FROM competitor_pages WHERE gap_keyword_id = ? ORDER BY serp_position ASC',
      [gapKeywordId]
    );
  });

  // ── Brand Profile ─────────────────────────────────────────────────

  ipcMain.handle('seo:getBrandProfile', (_e, companyId: string) => {
    return getBrandProfile(companyId);
  });

  ipcMain.handle('seo:getBrandQuestions', () => {
    return BRAND_INTERVIEW_QUESTIONS;
  });

  ipcMain.handle('seo:saveBrandInterview', async (_e, companyId: string, answers: Record<string, string>) => {
    try {
      const profile = await processBrandInterview(companyId, answers);
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('seo:updateBrandProfile', (_e, companyId: string, fields: Record<string, unknown>) => {
    const allowedFields = ['company_name', 'industry', 'target_audience', 'value_proposition',
      'tone_keywords', 'avoid_keywords', 'writing_style', 'example_phrases',
      'competitors_to_beat', 'product_services', 'geographic_focus'];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.includes(key)) {
        sets.push(`${key} = ?`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    if (sets.length === 0) return { success: false, error: 'No valid fields' };
    sets.push("updated_at = datetime('now')");
    params.push(companyId);
    execute(`UPDATE brand_profiles SET ${sets.join(', ')} WHERE company_id = ?`, params);
    return { success: true };
  });

  // ── Content Generation ────────────────────────────────────────────

  ipcMain.handle('seo:generateContent', async (_e, gapKeywordId: string, companyId: string, options?: GenerateOptions) => {
    sendProgress('seo:generateProgress', { phase: 'start', gapKeywordId });
    try {
      const contentId = await generateContentForKeyword(gapKeywordId, companyId, options);
      sendProgress('seo:generateProgress', { phase: 'complete', contentId });
      return { success: true, contentId };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('seo:getGeneratedContent', (_e, companyId: string, filters?: { status?: string }) => {
    let sql = 'SELECT * FROM generated_content WHERE company_id = ?';
    const params: unknown[] = [companyId];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    sql += ' ORDER BY created_at DESC';
    return queryAll(sql, params);
  });

  ipcMain.handle('seo:getContentDetail', (_e, contentId: string) => {
    return queryOne(`
      SELECT gc.*, gk.keyword as gap_keyword, gk.current_position, gk.search_volume, gk.opportunity_score
      FROM generated_content gc
      LEFT JOIN gap_keywords gk ON gk.id = gc.gap_keyword_id
      WHERE gc.id = ?
    `, [contentId]);
  });

  ipcMain.handle('seo:updateContentStatus', (_e, contentId: string, status: string) => {
    execute(
      `UPDATE generated_content SET status = ?,
        published_at = CASE WHEN ? = 'published' THEN datetime('now') ELSE published_at END,
        updated_at = datetime('now') WHERE id = ?`,
      [status, status, contentId]
    );
    return { success: true };
  });

  ipcMain.handle('seo:publishContent', (_e, contentId: string, publishedUrl: string) => {
    execute(
      `UPDATE generated_content SET status = 'published', published_url = ?, published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [publishedUrl, contentId]
    );
    // Also update the linked gap keyword
    const content = queryOne('SELECT gap_keyword_id FROM generated_content WHERE id = ?', [contentId]);
    if (content?.gap_keyword_id) {
      execute("UPDATE gap_keywords SET action_status = 'done' WHERE id = ?", [content.gap_keyword_id as string]);
    }
    return { success: true };
  });

  // ── Performance Tracking ──────────────────────────────────────────

  ipcMain.handle('seo:trackPerformance', async (_e, companyId: string) => {
    try {
      const result = await trackPerformanceForCompany(companyId);
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('seo:getPerformanceData', (_e, companyId: string) => {
    return queryAll(`
      SELECT cp.*, gk.keyword as gap_keyword, gc.title as content_title
      FROM content_performance cp
      LEFT JOIN gap_keywords gk ON gk.id = cp.gap_keyword_id
      LEFT JOIN generated_content gc ON gc.id = cp.content_id
      WHERE cp.company_id = ? ORDER BY cp.last_check_at DESC
    `, [companyId]);
  });

  ipcMain.handle('seo:getPerformanceSummary', (_e, companyId: string) => {
    return queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN trend = 'improving' THEN 1 ELSE 0 END) as improving,
        SUM(CASE WHEN trend = 'stable' THEN 1 ELSE 0 END) as stable,
        SUM(CASE WHEN trend = 'declining' THEN 1 ELSE 0 END) as declining,
        SUM(CASE WHEN trend = 'resolved' THEN 1 ELSE 0 END) as resolved
      FROM content_performance WHERE company_id = ?
    `, [companyId]);
  });

  // ── Company SEO Config ────────────────────────────────────────────

  ipcMain.handle('seo:getCompanySeoConfig', (_e, companyId: string) => {
    return queryOne(
      'SELECT gsc_property, seo_scan_enabled FROM companies WHERE id = ?',
      [companyId]
    );
  });

  ipcMain.handle('seo:setGscProperty', (_e, companyId: string, property: string) => {
    execute("UPDATE companies SET gsc_property = ?, updated_at = datetime('now') WHERE id = ?", [property || null, companyId]);
    return { success: true };
  });

  ipcMain.handle('seo:toggleSeoScan', (_e, companyId: string, enabled: boolean) => {
    execute("UPDATE companies SET seo_scan_enabled = ?, updated_at = datetime('now') WHERE id = ?", [enabled ? 1 : 0, companyId]);
    return { success: true };
  });

  ipcMain.handle('seo:listGscProperties', async () => {
    try {
      const token = await getValidAccessToken();
      const properties = await getGscProperties();
      return { success: true, properties };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), properties: [] };
    }
  });

  // ── Schedule Config ───────────────────────────────────────────────

  ipcMain.handle('seo:getScheduleConfig', () => {
    return getSEOScheduleConfig();
  });

  ipcMain.handle('seo:setScheduleConfig', (_e, config: Partial<{ enabled: boolean; gapFrequencyDays: number; feedbackFrequencyDays: number }>) => {
    setSEOScheduleConfig(config);
    return { success: true };
  });
}
