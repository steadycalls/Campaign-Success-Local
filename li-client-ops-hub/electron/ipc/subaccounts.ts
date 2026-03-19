import { ipcMain, BrowserWindow } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncLocations, testSubAccountPit } from '../../sync/adapters/ghl';
import { syncCompany, type SyncProgressData } from '../../sync/engine';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';

function sendProgress(data: SyncProgressData): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('sync:progress', data);
  }
}

function readEnvVar(key: string): string | undefined {
  return process.env[key] || undefined;
}

export function registerSubAccountHandlers(): void {
  // Get all sub-accounts (pit_token never sent to renderer)
  ipcMain.handle('subaccount:getAll', (_e, filters?: { search?: string; status?: string }) => {
    let sql = `SELECT id, ghl_location_id, name, slug, status, pit_status,
      pit_last_tested_at, pit_last_error, sync_enabled, last_sync_at,
      contact_count, contacts_api_total, phone_numbers_count, users_count, workflows_count, funnels_count,
      sites_count, email_templates_count, custom_fields_count,
      sla_status, sla_days_since_contact
      FROM companies`;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.search) {
      conditions.push('name LIKE ?');
      params.push(`%${filters.search}%`);
    }
    if (filters?.status === 'configured') {
      conditions.push("pit_status != 'not_configured'");
    } else if (filters?.status === 'enabled') {
      conditions.push('sync_enabled = 1');
    } else if (filters?.status === 'not_configured') {
      conditions.push("pit_status = 'not_configured'");
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY name ASC';

    return queryAll(sql, params);
  });

  // Check if PIT exists (without exposing token)
  ipcMain.handle('subaccount:hasPit', (_e, companyId: string) => {
    const row = queryOne('SELECT pit_token FROM companies WHERE id = ?', [companyId]);
    return { hasPit: !!(row?.pit_token) };
  });

  // Save PIT for a sub-account
  ipcMain.handle('subaccount:savePit', (_e, companyId: string, pitToken: string) => {
    execute(
      `UPDATE companies SET pit_token = ?, pit_status = 'untested', pit_last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
      [pitToken, companyId]
    );
    return { success: true };
  });

  // Test sub-account PIT
  ipcMain.handle('subaccount:testPit', async (_e, companyId: string) => {
    const company = queryOne('SELECT pit_token, ghl_location_id FROM companies WHERE id = ?', [companyId]);
    if (!company?.pit_token) return { success: false, message: 'No PIT configured' };

    const result = await testSubAccountPit(
      company.pit_token as string,
      company.ghl_location_id as string
    );

    const now = new Date().toISOString();
    execute(
      `UPDATE companies SET pit_status = ?, pit_last_tested_at = ?, pit_last_error = ?, updated_at = datetime('now') WHERE id = ?`,
      [result.success ? 'valid' : 'invalid', now, result.success ? null : result.message, companyId]
    );

    return result;
  });

  // Toggle auto-sync
  ipcMain.handle('subaccount:toggleSync', (_e, companyId: string, enabled: boolean) => {
    execute(
      'UPDATE companies SET sync_enabled = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [enabled ? 1 : 0, companyId]
    );
    return { success: true };
  });

  // Sync single sub-account
  ipcMain.handle('subaccount:sync', async (_e, companyId: string) => {
    const company = queryOne('SELECT pit_token, pit_status FROM companies WHERE id = ?', [companyId]);
    if (!company?.pit_token || company.pit_status !== 'valid') {
      return { success: false, message: 'PIT not configured or invalid' };
    }
    return syncCompany(companyId, 'manual', (data) => sendProgress(data));
  });

  // ── CSV bulk upload handlers ────────────────────────────────────────

  // Match location IDs against companies table
  ipcMain.handle('subaccount:matchLocationIds', (_e, locationIds: string[]) => {
    const result: Record<string, { companyId: string; name: string; currentPitStatus: string } | null> = {};
    for (const locId of locationIds) {
      const row = queryOne(
        'SELECT id, name, pit_status FROM companies WHERE ghl_location_id = ?',
        [locId]
      );
      result[locId] = row
        ? { companyId: row.id as string, name: row.name as string, currentPitStatus: (row.pit_status as string) ?? 'not_configured' }
        : null;
    }
    return result;
  });

  // Bulk save PITs
  ipcMain.handle('subaccount:bulkSavePits', (_e, entries: Array<{ companyId: string; token: string }>) => {
    const results = { saved: 0, failed: 0, errors: [] as string[] };
    for (const entry of entries) {
      try {
        execute(
          `UPDATE companies SET pit_token = ?, pit_status = 'untested', pit_last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
          [entry.token, entry.companyId]
        );
        results.saved++;
      } catch (err: unknown) {
        results.failed++;
        results.errors.push(`${entry.companyId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return results;
  });

  // Bulk test PITs
  ipcMain.handle('subaccount:bulkTestPits', async (_e, companyIds: string[]) => {
    const results: Record<string, { success: boolean; message: string }> = {};

    for (const companyId of companyIds) {
      const company = queryOne('SELECT ghl_location_id, pit_token FROM companies WHERE id = ?', [companyId]);
      if (!company?.pit_token) {
        results[companyId] = { success: false, message: 'No PIT configured' };
        continue;
      }

      const result = await testSubAccountPit(
        company.pit_token as string,
        company.ghl_location_id as string
      );

      const now = new Date().toISOString();
      execute(
        `UPDATE companies SET pit_status = ?, pit_last_tested_at = ?, pit_last_error = ?, updated_at = datetime('now') WHERE id = ?`,
        [result.success ? 'valid' : 'invalid', now, result.success ? null : result.message, companyId]
      );

      results[companyId] = result;

      // Send progress
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('pit:testProgress', {
          companyId,
          result,
          tested: Object.keys(results).length,
          total: companyIds.length,
        });
      }

      // 1s delay between tests
      if (Object.keys(results).length < companyIds.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return results;
  });

  // Generate template CSV
  ipcMain.handle('subaccount:generateTemplate', () => {
    const companies = queryAll(
      "SELECT ghl_location_id, name FROM companies WHERE status = 'active' ORDER BY name ASC"
    );
    const header = 'subaccount_id,subaccount_name,private_integration_token';
    const rows = companies.map(
      (c) => `${c.ghl_location_id},"${((c.name as string) || '').replace(/"/g, '""')}",`
    );
    return [header, ...rows].join('\n');
  });

  // Refresh sub-account list from agency PIT
  ipcMain.handle('subaccount:refreshList', async () => {
    const agencyPit = readEnvVar('GHL_AGENCY_PIT');
    const companyId = readEnvVar('GHL_COMPANY_ID');
    if (!agencyPit) return { success: false, message: 'GHL_AGENCY_PIT not configured in .env' };
    if (!companyId) return { success: false, message: 'GHL_COMPANY_ID not configured in .env' };

    try {
      const count = await syncLocations(agencyPit, companyId);
      return { success: true, count };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });
}
