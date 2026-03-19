import { app, BrowserWindow, Tray, Menu } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { initDB, closeDB } from '../db/client';
import { registerIPCHandlers } from './ipc';
import { startQueueManager, stopQueueManager, setMainWindow, enqueueFullCompanySync } from '../sync/queue/manager';
import { startCloudSyncTimer, stopCloudSyncTimer } from '../sync/cloud-sync';
import { queryAll } from '../db/client';

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
  createTray();
  await createWindow();

  // Start background queue manager — processes pending tasks from previous sessions
  startQueueManager();

  // Start cloud sync timer (pushes to Cloudflare D1 every 5 min if enabled)
  startCloudSyncTimer();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopQueueManager();
  stopCloudSyncTimer();
  closeDB();
});

app.on('window-all-closed', () => {
  // Keep running in tray
});
