import { ipcMain } from 'electron';
import { syncToCloud, getCloudSyncStatus } from '../../sync/cloud-sync';

export function registerCloudHandlers(): void {
  ipcMain.handle('cloud:syncNow', async (_e, fullResync?: boolean) => {
    return syncToCloud(fullResync ?? false);
  });

  ipcMain.handle('cloud:getStatus', () => {
    return getCloudSyncStatus();
  });

  ipcMain.handle('cloud:setEnabled', (_e, enabled: boolean) => {
    // This is managed via .env — just return current state
    // The user needs to set CLOUD_SYNC_ENABLED=true in .env and restart
    return { enabled: process.env.CLOUD_SYNC_ENABLED === 'true' };
  });
}
