import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncKinstaSites, testKinstaConnection } from '../../sync/adapters/kinsta';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';
import { ipcBatcher } from './batcher';

export function registerKinstaHandlers(): void {

  // ── Get all sites ──────────────────────────────────────────────────
  ipcMain.handle('kinsta:getSites', () => {
    const sites = queryAll(`
      SELECT ks.*, c.name as linked_company_name
      FROM kinsta_sites ks
      LEFT JOIN companies c ON c.id = ks.company_id
      ORDER BY ks.plugins_needing_update DESC, ks.name ASC
    `);

    // Attach linked client names per site
    for (const site of sites) {
      const clients = queryAll(`
        SELECT ct.id, ct.first_name, ct.last_name
        FROM kinsta_site_clients ksc
        JOIN contacts ct ON ct.id = ksc.client_contact_id
        WHERE ksc.kinsta_site_id = ?
        ORDER BY ct.first_name ASC
      `, [site.id]);
      (site as Record<string, unknown>).linked_clients = clients.map(c => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      }));
    }

    return sites;
  });

  // ── Get plugins for a site ─────────────────────────────────────────
  ipcMain.handle('kinsta:getPlugins', (_e, kinstaSiteId: string) => {
    return queryAll(`
      SELECT * FROM kinsta_plugins WHERE kinsta_site_id = ?
      ORDER BY update_available DESC, plugin_name ASC
    `, [kinstaSiteId]);
  });

  // ── Get themes for a site ──────────────────────────────────────────
  ipcMain.handle('kinsta:getThemes', (_e, kinstaSiteId: string) => {
    return queryAll(`
      SELECT * FROM kinsta_themes WHERE kinsta_site_id = ?
      ORDER BY update_available DESC, theme_name ASC
    `, [kinstaSiteId]);
  });

  // ── Sync all ───────────────────────────────────────────────────────
  ipcMain.handle('kinsta:sync', async () => {
    const runId = logSyncStart('kinsta', 'manual');
    const win = BrowserWindow.getAllWindows()[0];
    try {
      const counts = await syncKinstaSites((progress) => {
        ipcBatcher.send('kinsta:syncProgress', progress);
      });
      logSyncEnd(runId, 'success', counts);
      return { success: true, ...counts };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      return { success: false, message };
    }
  });

  // ── Link / unlink site to company ──────────────────────────────────
  ipcMain.handle('kinsta:linkSite', (_e, siteId: string, companyId: string) => {
    const site = queryOne('SELECT * FROM kinsta_sites WHERE id = ?', [siteId]);
    if (!site) return { success: false, message: 'Site not found' };

    if (!companyId) {
      // Unlink
      execute('UPDATE kinsta_sites SET company_id = NULL, company_name = NULL, updated_at = datetime(\'now\') WHERE id = ?', [siteId]);
      if (site.company_id) {
        execute('UPDATE companies SET has_kinsta = 0, kinsta_site_id = NULL, kinsta_domain = NULL, kinsta_plugins_needing_update = 0, updated_at = datetime(\'now\') WHERE id = ?',
          [site.company_id]);
      }
      return { success: true };
    }

    // Link
    execute('UPDATE kinsta_sites SET company_id = ?, company_name = (SELECT name FROM companies WHERE id = ?), updated_at = datetime(\'now\') WHERE id = ?',
      [companyId, companyId, siteId]);
    execute(`
      UPDATE companies SET has_kinsta = 1, kinsta_site_id = ?, kinsta_domain = ?,
        kinsta_plugins_needing_update = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [site.kinsta_site_id, site.domain, site.plugins_needing_update, companyId]);
    return { success: true };
  });

  // ── Accept suggestion ──────────────────────────────────────────────
  ipcMain.handle('kinsta:acceptSuggestion', (_e, siteId: string) => {
    const site = queryOne('SELECT suggested_company_id FROM kinsta_sites WHERE id = ?', [siteId]);
    if (!site?.suggested_company_id) return { success: false };

    // Reuse link logic
    const fullSite = queryOne('SELECT * FROM kinsta_sites WHERE id = ?', [siteId]);
    if (!fullSite) return { success: false };

    execute('UPDATE kinsta_sites SET company_id = ?, company_name = (SELECT name FROM companies WHERE id = ?), suggested_company_id = NULL, suggested_company_name = NULL, suggestion_score = NULL, updated_at = datetime(\'now\') WHERE id = ?',
      [site.suggested_company_id, site.suggested_company_id, siteId]);
    execute(`
      UPDATE companies SET has_kinsta = 1, kinsta_site_id = ?, kinsta_domain = ?,
        kinsta_plugins_needing_update = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [fullSite.kinsta_site_id, fullSite.domain, fullSite.plugins_needing_update, site.suggested_company_id]);
    return { success: true };
  });

  // ── Link / unlink clients to a site (multi-select) ────────────────
  ipcMain.handle('kinsta:setClients', (_e, siteId: string, clientIds: string[]) => {
    // Remove all existing links for this site
    execute('DELETE FROM kinsta_site_clients WHERE kinsta_site_id = ?', [siteId]);

    // Insert new links
    for (const clientId of clientIds) {
      execute(
        'INSERT OR IGNORE INTO kinsta_site_clients (id, kinsta_site_id, client_contact_id) VALUES (?, ?, ?)',
        [randomUUID(), siteId, clientId]
      );
    }
    return { success: true };
  });

  // ── Stats ──────────────────────────────────────────────────────────
  ipcMain.handle('kinsta:getStats', () => {
    const total = queryOne("SELECT COUNT(*) as cnt FROM kinsta_sites WHERE status = 'live'");
    const healthy = queryOne("SELECT COUNT(*) as cnt FROM kinsta_sites WHERE status = 'live' AND plugins_needing_update = 0 AND themes_needing_update = 0");
    const withUpdates = queryOne("SELECT COUNT(*) as cnt FROM kinsta_sites WHERE status = 'live' AND (plugins_needing_update > 0 OR themes_needing_update > 0)");
    const critical = queryOne("SELECT COUNT(*) as cnt FROM kinsta_sites WHERE status = 'live' AND plugins_needing_update >= 5");
    const unlinked = queryOne("SELECT COUNT(*) as cnt FROM kinsta_sites WHERE status = 'live' AND company_id IS NULL");

    return {
      total: (total?.cnt as number) || 0,
      healthy: (healthy?.cnt as number) || 0,
      withUpdates: (withUpdates?.cnt as number) || 0,
      critical: (critical?.cnt as number) || 0,
      unlinked: (unlinked?.cnt as number) || 0,
    };
  });

  // ── Kinsta alerts (for morning briefing) ───────────────────────────
  ipcMain.handle('briefing:getKinstaAlerts', () => {
    let critical: unknown[] = [];
    let warning: unknown[] = [];
    let oldPhp: unknown[] = [];

    try {
      critical = queryAll(`
        SELECT ks.name, ks.display_name, ks.domain, ks.plugins_needing_update,
          ks.themes_needing_update, ks.company_id, c.name as company_name
        FROM kinsta_sites ks
        LEFT JOIN companies c ON c.id = ks.company_id
        WHERE ks.plugins_needing_update >= 5 AND ks.status = 'live'
        ORDER BY ks.plugins_needing_update DESC
      `);

      warning = queryAll(`
        SELECT ks.name, ks.display_name, ks.domain, ks.plugins_needing_update,
          ks.themes_needing_update, ks.company_id, c.name as company_name
        FROM kinsta_sites ks
        LEFT JOIN companies c ON c.id = ks.company_id
        WHERE ks.plugins_needing_update BETWEEN 1 AND 4 AND ks.status = 'live'
        ORDER BY ks.plugins_needing_update DESC
      `);

      oldPhp = queryAll(`
        SELECT name, display_name, domain, php_version, company_id
        FROM kinsta_sites
        WHERE php_version IS NOT NULL AND status = 'live'
          AND CAST(REPLACE(SUBSTR(php_version, 1, 3), '.', '') AS INTEGER) < 80
      `);
    } catch { /* kinsta_sites table may not exist yet */ }

    return { critical, warning, oldPhp };
  });

  // ── Test connection ────────────────────────────────────────────────
  ipcMain.handle('kinsta:testConnection', async () => {
    return testKinstaConnection();
  });
}
