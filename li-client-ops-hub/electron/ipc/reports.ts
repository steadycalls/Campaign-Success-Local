import { ipcMain, shell } from 'electron';
import fs from 'fs';
import { queryAll, queryOne, execute } from '../../db/client';
import { generateWeeklyReport } from '../../reports/generator';
import { getDrilldownData } from '../../reports/drilldown';
import { logger } from '../../lib/logger';

export function registerReportsHandlers(): void {

  // Generate a report
  ipcMain.handle('reports:generate', (_, options?: { periodEnd?: string }) => {
    try {
      const periodEnd = options?.periodEnd ? new Date(options.periodEnd) : undefined;
      const reportId = generateWeeklyReport({ periodEnd });
      return { success: true, reportId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Report', 'Generation failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // List all reports
  ipcMain.handle('reports:list', () => {
    return queryAll(`
      SELECT id, report_date, title, generated_at, auto_generated, export_path,
        action_items_json, highlights_json
      FROM weekly_reports
      ORDER BY report_date DESC LIMIT 52
    `);
  });

  // Get a specific report (full data)
  ipcMain.handle('reports:get', (_, reportId: string) => {
    return queryOne('SELECT * FROM weekly_reports WHERE id = ?', [reportId]);
  });

  // Get latest report
  ipcMain.handle('reports:getLatest', () => {
    return queryOne('SELECT * FROM weekly_reports ORDER BY report_date DESC LIMIT 1');
  });

  // Open report file in default browser
  ipcMain.handle('reports:openInBrowser', (_, reportId: string) => {
    const report = queryOne('SELECT export_path FROM weekly_reports WHERE id = ?', [reportId]);
    if (report?.export_path && fs.existsSync(report.export_path as string)) {
      shell.openPath(report.export_path as string);
      return { success: true };
    }
    return { success: false, message: 'Report file not found' };
  });

  // Drill-down data for a specific metric
  ipcMain.handle('reports:drilldown', (_, reportId: string, metric: string) => {
    try {
      const report = queryOne(
        'SELECT period_start, period_end FROM weekly_reports WHERE id = ?',
        [reportId]
      );
      if (!report) return { metric, title: 'Report Not Found', columns: [], rows: [] };
      return getDrilldownData(
        metric,
        report.period_start as string,
        report.period_end as string,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Report', 'Drilldown failed', { error: msg });
      return { metric, title: 'Error', columns: [], rows: [] };
    }
  });

  // Delete a report
  ipcMain.handle('reports:delete', (_, reportId: string) => {
    const report = queryOne('SELECT export_path FROM weekly_reports WHERE id = ?', [reportId]);
    if (report?.export_path && fs.existsSync(report.export_path as string)) {
      fs.unlinkSync(report.export_path as string);
    }
    execute('DELETE FROM weekly_reports WHERE id = ?', [reportId]);
    return { success: true };
  });
}
