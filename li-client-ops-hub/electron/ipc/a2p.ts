import { ipcMain, BrowserWindow } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { bootstrapA2PRecords } from '../../a2p/bootstrap';
import { scanCompanyA2P, scanAllA2P } from '../../a2p/scanner';
import { analyzeCompanyA2P, analyzeAllA2P } from '../../a2p/analyzeCompany';
import { queueContentGeneration, generateAllA2P } from '../../a2p/generateQueue';
import { exportContentToDrive, exportAllContentToDrive, checkDriveFolder } from '../../a2p/driveExport';
import { getA2PScheduleConfig, setA2PScheduleConfig } from '../../a2p/schedule';

export function registerA2PHandlers(): void {
  // ── List all A2P compliance records with company name ──────────────
  ipcMain.handle('a2p:getAll', (_e, filters?: { status?: string; search?: string }) => {
    let sql = `
      SELECT a.*, c.name as company_name, c.status as company_status
      FROM a2p_compliance a
      JOIN companies c ON c.id = a.company_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.status && filters.status !== 'all') {
      sql += ' AND a.overall_status = ?';
      params.push(filters.status);
    }
    if (filters?.search) {
      sql += ' AND (a.business_name LIKE ? OR a.domain LIKE ? OR c.name LIKE ?)';
      const q = `%${filters.search}%`;
      params.push(q, q, q);
    }

    sql += ' ORDER BY a.business_name ASC';
    return queryAll(sql, params);
  });

  // ── Get stats summary ─────────────────────────────────────────────
  ipcMain.handle('a2p:getStats', () => {
    return queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN overall_status = 'compliant' THEN 1 ELSE 0 END) as compliant,
        SUM(CASE WHEN overall_status = 'partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN overall_status = 'non_compliant' THEN 1 ELSE 0 END) as non_compliant,
        SUM(CASE WHEN overall_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN overall_status = 'no_website' THEN 1 ELSE 0 END) as no_website,
        SUM(CASE WHEN domain IS NULL OR domain = '' THEN 1 ELSE 0 END) as missing_domain
      FROM a2p_compliance
    `);
  });

  // ── Get single record ─────────────────────────────────────────────
  ipcMain.handle('a2p:get', (_e, id: string) => {
    return queryOne(`
      SELECT a.*, c.name as company_name
      FROM a2p_compliance a
      JOIN companies c ON c.id = a.company_id
      WHERE a.id = ?
    `, [id]);
  });

  // ── Update domain manually (resets all page statuses to pending) ──
  ipcMain.handle('a2p:updateDomain', (_e, id: string, domain: string) => {
    execute(
      `UPDATE a2p_compliance SET
        domain = ?,
        contact_page_status = 'pending', privacy_policy_status = 'pending',
        terms_of_service_status = 'pending', sms_policy_status = 'pending',
        contact_page_url = NULL, privacy_policy_url = NULL,
        terms_of_service_url = NULL, sms_policy_url = NULL,
        contact_page_analysis = NULL, privacy_policy_analysis = NULL,
        terms_of_service_analysis = NULL, sms_policy_analysis = NULL,
        overall_status = CASE WHEN ? = '' OR ? IS NULL THEN 'no_website' ELSE 'pending' END,
        last_scanned_at = NULL, last_analyzed_at = NULL,
        updated_at = datetime('now')
      WHERE id = ?`,
      [domain, domain, domain, id]
    );
    return { success: true };
  });

  // ── Update phone manually ─────────────────────────────────────────
  ipcMain.handle('a2p:updatePhone', (_e, id: string, phone: string) => {
    execute(
      `UPDATE a2p_compliance SET phone = ?, updated_at = datetime('now') WHERE id = ?`,
      [phone, id]
    );
    return { success: true };
  });

  // ── Update page URL manually ──────────────────────────────────────
  ipcMain.handle('a2p:updatePageUrl', (_e, id: string, pageType: string, url: string) => {
    const column = pageUrlColumn(pageType);
    if (!column) return { success: false, error: 'Invalid page type' };
    execute(
      `UPDATE a2p_compliance SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`,
      [url, id]
    );
    return { success: true };
  });

  // ── Update page status manually ───────────────────────────────────
  ipcMain.handle('a2p:updatePageStatus', (_e, id: string, pageType: string, status: string) => {
    const column = pageStatusColumn(pageType);
    if (!column) return { success: false, error: 'Invalid page type' };
    execute(
      `UPDATE a2p_compliance SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, id]
    );
    recalcOverallStatus(id);
    return { success: true };
  });

  // ── Bootstrap (populate from companies table) ─────────────────────
  ipcMain.handle('a2p:bootstrap', () => {
    const created = bootstrapA2PRecords();
    return { success: true, created };
  });

  // ── Get generated content for a company ───────────────────────────
  ipcMain.handle('a2p:getGeneratedContent', (_e, a2pId: string) => {
    return queryAll(
      'SELECT * FROM a2p_generated_content WHERE a2p_id = ? ORDER BY page_type',
      [a2pId]
    );
  });

  // ── Scan one company's website ────────────────────────────────────
  ipcMain.handle('a2p:scanOne', async (_e, companyId: string) => {
    try {
      const result = await scanCompanyA2P(companyId);
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Scan all companies (with progress events) ─────────────────────
  ipcMain.handle('a2p:scanAll', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const result = await scanAllA2P((name, index, total) => {
      win?.webContents.send('a2p:scanProgress', { name, index, total });
    });
    return result;
  });

  // ── Analyze one company (Claude API) ──────────────────────────────
  ipcMain.handle('a2p:analyzeOne', async (_e, companyId: string) => {
    try {
      await analyzeCompanyA2P(companyId);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Analyze all scanned companies ─────────────────────────────────
  ipcMain.handle('a2p:analyzeAll', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const result = await analyzeAllA2P((name, index, total) => {
      win?.webContents.send('a2p:analyzeProgress', { name, index, total });
    });
    return result;
  });

  // ── Generate content for one company ────────────────────────────────
  ipcMain.handle('a2p:generateContent', async (_e, companyId: string) => {
    try {
      const count = await queueContentGeneration(companyId);
      return { success: true, generated: count };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Generate content for all non-compliant companies ──────────────
  ipcMain.handle('a2p:generateAll', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const result = await generateAllA2P((name, index, total) => {
      win?.webContents.send('a2p:generateProgress', { name, index, total });
    });
    return result;
  });

  // ── Update generated content markdown ─────────────────────────────
  ipcMain.handle('a2p:updateContent', (_e, contentId: string, newMarkdown: string) => {
    execute(
      "UPDATE a2p_generated_content SET content_md = ?, content_status = 'draft', updated_at = datetime('now') WHERE id = ?",
      [newMarkdown, contentId]
    );
    return { success: true };
  });

  // ── Get analysis with parsed JSON fields ──────────────────────────
  ipcMain.handle('a2p:getAnalysis', (_e, companyId: string) => {
    const a2p = queryOne(
      'SELECT * FROM a2p_compliance WHERE company_id = ?',
      [companyId]
    ) as Record<string, unknown> | null;
    if (!a2p) return null;

    return {
      ...a2p,
      contact_page_analysis: safeParseJson(a2p.contact_page_analysis as string | null),
      privacy_policy_analysis: safeParseJson(a2p.privacy_policy_analysis as string | null),
      terms_of_service_analysis: safeParseJson(a2p.terms_of_service_analysis as string | null),
      sms_policy_analysis: safeParseJson(a2p.sms_policy_analysis as string | null),
    };
  });

  // ── Export single content item to Google Drive ────────────────────
  ipcMain.handle('a2p:exportToDrive', async (_e, contentId: string) => {
    try {
      const result = await exportContentToDrive(contentId);
      return { success: true, fileId: result.fileId, url: result.url };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Export all draft content for a company ─────────────────────────
  ipcMain.handle('a2p:exportAllToDrive', async (_e, companyId: string) => {
    try {
      const result = await exportAllContentToDrive(companyId);
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Check if company has a linked Drive folder ────────────────────
  ipcMain.handle('a2p:checkDriveFolder', (_e, companyId: string) => {
    return checkDriveFolder(companyId);
  });

  // ── Schedule config ───────────────────────────────────────────────
  ipcMain.handle('a2p:getSchedule', () => {
    return getA2PScheduleConfig();
  });

  ipcMain.handle('a2p:setSchedule', (_e, enabled: boolean, frequencyDays: number) => {
    setA2PScheduleConfig(enabled, frequencyDays);
    return { success: true };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pageUrlColumn(pageType: string): string | null {
  const map: Record<string, string> = {
    contact: 'contact_page_url',
    privacy_policy: 'privacy_policy_url',
    terms_of_service: 'terms_of_service_url',
    sms_policy: 'sms_policy_url',
  };
  return map[pageType] ?? null;
}

function pageStatusColumn(pageType: string): string | null {
  const map: Record<string, string> = {
    contact: 'contact_page_status',
    privacy_policy: 'privacy_policy_status',
    terms_of_service: 'terms_of_service_status',
    sms_policy: 'sms_policy_status',
  };
  return map[pageType] ?? null;
}

function safeParseJson(str: string | null): unknown {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function recalcOverallStatus(id: string): void {
  const row = queryOne(
    `SELECT contact_page_status, privacy_policy_status, terms_of_service_status, sms_policy_status, domain
     FROM a2p_compliance WHERE id = ?`,
    [id]
  );
  if (!row) return;

  if (!row.domain) {
    execute(`UPDATE a2p_compliance SET overall_status = 'no_website', updated_at = datetime('now') WHERE id = ?`, [id]);
    return;
  }

  const statuses = [
    row.contact_page_status as string,
    row.privacy_policy_status as string,
    row.terms_of_service_status as string,
    row.sms_policy_status as string,
  ];

  const allPass = statuses.every(s => s === 'pass');
  const anyFail = statuses.some(s => s === 'fail' || s === 'missing');
  const anyPass = statuses.some(s => s === 'pass');
  const issuesCount = statuses.filter(s => s === 'fail' || s === 'missing' || s === 'error').length;

  let overall = 'pending';
  if (allPass) overall = 'compliant';
  else if (anyFail && anyPass) overall = 'partial';
  else if (anyFail) overall = 'non_compliant';

  execute(
    `UPDATE a2p_compliance SET overall_status = ?, issues_count = ?, updated_at = datetime('now') WHERE id = ?`,
    [overall, issuesCount, id]
  );
}
