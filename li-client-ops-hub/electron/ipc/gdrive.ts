import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { authorizeGoogleDrive } from '../../sync/adapters/gdrive-auth';
import {
  syncClientFolders,
  syncFolderFiles,
  computeFolderSuggestions,
  testGoogleDriveConnection,
  linkFolderToCompany,
  acceptFolderSuggestion,
} from '../../sync/adapters/gdrive';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

export function registerGdriveHandlers(): void {
  // ── Authorize (starts OAuth flow) ──────────────────────────────────
  ipcMain.handle('gdrive:authorize', async () => {
    const clientId = getEnvValue('GOOGLE_CLIENT_ID');
    const clientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return { success: false, message: 'Client ID and Secret required. Save them first.' };
    }

    try {
      const tokens = await authorizeGoogleDrive(clientId, clientSecret);

      // Get user email
      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const userInfo = (await userInfoRes.json()) as { email?: string };

      const expiresAt = new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString();

      execute(
        `INSERT OR REPLACE INTO google_auth (id, access_token, refresh_token, expires_at, email, authorized_at, updated_at)
         VALUES ('default', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [tokens.access_token, tokens.refresh_token, expiresAt, userInfo.email || null]
      );

      // Update integration status
      execute(
        `UPDATE integrations SET status = 'connected', last_tested_at = datetime('now'), last_error = NULL, updated_at = datetime('now') WHERE name = 'gdrive'`
      );

      return { success: true, email: userInfo.email || 'unknown' };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── Auth status ────────────────────────────────────────────────────
  ipcMain.handle('gdrive:getAuthStatus', () => {
    const auth = queryOne(
      'SELECT email, authorized_at, expires_at FROM google_auth WHERE id = ?',
      ['default']
    );
    return auth || null;
  });

  // ── Sync folders ───────────────────────────────────────────────────
  ipcMain.handle('gdrive:syncFolders', async () => {
    const runId = logSyncStart('gdrive', 'manual');
    try {
      const counts = await syncClientFolders();
      computeFolderSuggestions();
      logSyncEnd(runId, 'success', counts);
      return { success: true, ...counts };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      return { success: false, message };
    }
  });

  // ── Sync files for a folder ────────────────────────────────────────
  ipcMain.handle('gdrive:syncFolderFiles', async (_e, driveFolderId: string) => {
    try {
      const counts = await syncFolderFiles(driveFolderId);
      return { success: true, ...counts };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── Get all folders with association status ────────────────────────
  ipcMain.handle('gdrive:getFolders', () => {
    return queryAll(`
      SELECT df.*,
        c.name as linked_company_name,
        ca.target_name as linked_client_name,
        ca.client_contact_id as linked_client_id
      FROM drive_folders df
      LEFT JOIN companies c ON c.id = df.company_id
      LEFT JOIN client_associations ca ON ca.target_id = df.drive_folder_id
        AND ca.association_type = 'drive_folder'
      ORDER BY df.name ASC
    `);
  });

  // ── Get files for a folder ─────────────────────────────────────────
  ipcMain.handle('gdrive:getFolderFiles', (_e, driveFolderId: string) => {
    return queryAll(
      `SELECT * FROM drive_files WHERE folder_id = ? ORDER BY modified_at DESC LIMIT 50`,
      [driveFolderId]
    );
  });

  // ── Accept suggestion ──────────────────────────────────────────────
  ipcMain.handle('gdrive:acceptSuggestion', (_e, folderId: string) => {
    return acceptFolderSuggestion(folderId);
  });

  // ── Link folder to company manually ────────────────────────────────
  ipcMain.handle(
    'gdrive:linkFolder',
    (_e, folderId: string, companyId: string) => {
      return linkFolderToCompany(folderId, companyId);
    }
  );

  // ── Test connection ────────────────────────────────────────────────
  ipcMain.handle('gdrive:testConnection', async () => {
    return testGoogleDriveConnection();
  });
}
