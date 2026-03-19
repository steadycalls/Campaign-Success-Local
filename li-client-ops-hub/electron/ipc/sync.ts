import { ipcMain, BrowserWindow } from 'electron';
import { syncCompany, syncAllCompanies, type SyncProgressData } from '../../sync/engine';

function sendProgress(data: SyncProgressData): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('sync:progress', data);
  }
}

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:company', async (_e, companyId: string) => {
    return syncCompany(companyId, 'manual', (data) => sendProgress(data));
  });

  ipcMain.handle('sync:all', async () => {
    await syncAllCompanies('manual', (data) => sendProgress(data));
    return { success: true };
  });
}
