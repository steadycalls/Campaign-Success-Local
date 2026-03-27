import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import {
  setServiceAccountKey, setServiceAccountAdminEmail,
  testServiceAccountAccess, isServiceAccountMode,
} from '../../sync/adapters/google-service-account';
import { discoverTeamMailboxes } from '../../sync/adapters/google-directory';

export function registerGoogleAccountHandlers(): void {
  // ── List Google accounts ──────────────────────────────────────────
  ipcMain.handle('google:listAccounts', () => {
    return queryAll('SELECT * FROM google_accounts ORDER BY added_at ASC');
  });

  // ── Check if service account is configured ────────────────────────
  ipcMain.handle('google:isServiceAccountMode', () => {
    return isServiceAccountMode();
  });

  // ── Upload service account key ────────────────────────────────────
  ipcMain.handle('google:setServiceAccount', (_e, json: string, adminEmail: string) => {
    try {
      JSON.parse(json); // validate JSON
      setServiceAccountKey(json);
      setServiceAccountAdminEmail(adminEmail);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  });

  // ── Test service account access ───────────────────────────────────
  ipcMain.handle('google:testServiceAccount', async () => {
    try {
      return await testServiceAccountAccess();
    } catch (err: unknown) {
      return { drive: false, gmail: false, calendar: false, directory: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  });

  // ── Discover team mailboxes ───────────────────────────────────────
  ipcMain.handle('google:discoverTeamMailboxes', async () => {
    try {
      const result = await discoverTeamMailboxes();
      return { success: true, ...result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── List team mailboxes ───────────────────────────────────────────
  ipcMain.handle('google:getTeamMailboxes', () => {
    return queryAll('SELECT * FROM team_mailboxes ORDER BY name ASC');
  });

  // ── Toggle team mailbox active ────────────────────────────────────
  ipcMain.handle('google:toggleTeamMailbox', (_e, email: string, active: boolean) => {
    execute('UPDATE team_mailboxes SET is_active = ? WHERE email = ?', [active ? 1 : 0, email]);
    return { success: true };
  });
}
