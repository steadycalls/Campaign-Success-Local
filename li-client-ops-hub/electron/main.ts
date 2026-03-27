import { app, BrowserWindow, Tray, Menu } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { initDB, closeDB } from '../db/client';
import { registerIPCHandlers } from './ipc';
import { startQueueManager, stopQueueManager, setMainWindow, enqueueFullCompanySync } from '../sync/queue/manager';
import { startCloudSyncTimer, stopCloudSyncTimer } from '../sync/cloud-sync';
import { queryAll, execute } from '../db/client';
import { setNotificationWindow, getUnreadNotificationCount } from '../notifications/dispatcher';
import { startScheduler, stopScheduler } from '../sync/scheduler';
import { recoverOrphanedTasks, cleanupOldTasks, cleanupOldSyncLogs } from '../sync/queue/recovery';
import { setShuttingDown } from '../sync/queue/state';
import { reconcileReadAiAuthOnStartup } from './ipc/readai-auth';
import { logger } from '../lib/logger';
import { ipcBatcher } from './ipc/batcher';

const PROJECT_ROOT = path.join(__dirname, '..', '..');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Client Ops Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(PROJECT_ROOT, 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Give queue manager access to the window for progress events
  setMainWindow(mainWindow);

  // Give notification dispatcher access to the window
  setNotificationWindow(mainWindow as unknown as Parameters<typeof setNotificationWindow>[0]);
}

function createTray() {
  const iconPath = path.join(PROJECT_ROOT, 'assets', 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Client Ops Hub');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: () => mainWindow?.show() },
      {
        label: 'Sync Now',
        click: () => {
          // Enqueue all enabled sub-accounts via the queue system
          const enabled = queryAll(
            "SELECT id, name, ghl_location_id FROM companies WHERE sync_enabled = 1 AND pit_status = 'valid' AND status = 'active'"
          );
          for (const c of enabled) {
            enqueueFullCompanySync(
              { id: c.id as string, name: (c.name as string) ?? '', ghl_location_id: c.ghl_location_id as string },
              100
            );
          }
          startQueueManager();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', () => mainWindow?.show());
}

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  dotenv.config({ path: path.join(app.getPath('userData'), '.env') });

  await initDB();
  registerIPCHandlers();

  // Reconcile Read.ai OAuth state — refresh tokens if expired, update integration status
  reconcileReadAiAuthOnStartup().catch(err =>
    logger.warn('Startup', 'Read.ai auth reconciliation failed', { error: err instanceof Error ? err.message : String(err) })
  );

  createTray();
  await createWindow();

  // Initialize IPC batcher — buffers high-frequency events like sync:progress
  if (mainWindow) {
    ipcBatcher.setWindow(mainWindow);
  }

  // ── Sync Queue Recovery ──────────────────────────────────────────────
  // Detect tasks orphaned by a previous crash/force-close and reset them
  // to 'pending' so the queue picks them up.  Runs before the queue
  // processor starts so recovered tasks are immediately visible.
  try {
    const recovery = recoverOrphanedTasks();

    if (recovery.recoveredTasks > 0) {
      // Send toast to renderer once the page finishes loading
      const sendRecoveryToast = () => {
        mainWindow?.webContents.send('notification:new', {
          type: 'sync_recovered',
          title: `Sync resumed: ${recovery.recoveredTasks} task${recovery.recoveredTasks > 1 ? 's' : ''} recovered`,
          body: `Resuming sync for: ${recovery.recoveredCompanies.join(', ')}`,
          urgency: 'info',
          actionUrl: '/logs',
          timestamp: new Date().toISOString(),
        });
      };

      if (mainWindow?.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', sendRecoveryToast);
      } else {
        sendRecoveryToast();
      }
    }

    cleanupOldTasks();
    cleanupOldSyncLogs();
  } catch (err) {
    logger.error('Startup', 'Sync recovery failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Start background queue manager — processes pending tasks from previous sessions
  startQueueManager();

  // Start cloud sync timer (pushes to Cloudflare D1 every 5 min if enabled)
  startCloudSyncTimer();

  // Start background scheduler (notifications, health, calendar, etc.)
  startScheduler();

  // Update tray badge every 60 seconds
  setInterval(() => {
    try {
      const count = getUnreadNotificationCount();
      if (count > 0) {
        tray?.setToolTip(`Client Ops Hub — ${count} alert${count !== 1 ? 's' : ''}`);
      } else {
        tray?.setToolTip('Client Ops Hub');
      }
    } catch {
      // DB not ready yet
    }
  }, 60_000);
});

app.on('before-quit', () => {
  isQuitting = true;
  setShuttingDown(true);
  ipcBatcher.destroy();
  stopQueueManager();
  stopCloudSyncTimer();
  stopScheduler();

  // Reset any running tasks back to pending so they resume on next launch
  try {
    const result = execute(
      "UPDATE sync_queue SET status = 'pending', started_at = NULL, error = NULL WHERE status = 'running'"
    );
    if (result > 0) {
      logger.shutdown('Reset running tasks to pending', { count: result });
    }
  } catch (err) {
    logger.error('Shutdown', 'Failed to reset running tasks', { error: err instanceof Error ? err.message : String(err) });
  }

  closeDB();
});

app.on('window-all-closed', () => {
  // Keep running in tray
});
