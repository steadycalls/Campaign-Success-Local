# CLAUDE CODE PROMPTS — Client Ops Hub (Local Electron Desktop App)

#logic-inbound #client-ops-hub #electron

Parent spec: `spec_local_client_ops_hub.md`
Notion AI Inbox page: `328fd93f-a8f3-81b8-b993-ceeeecdf3007`

---

## PROMPT 27 — Client Ops Hub: Electron + Vite + React Scaffold

```
You are creating a new standalone project: li-client-ops-hub.
This is a local Electron desktop app for Windows with React/Vite/TypeScript frontend.
It will be pinned to the Windows taskbar and run syncs in the background.

#logic-inbound #client-ops-hub #electron #scaffold

## OBJECTIVE

Scaffold the complete Electron + React + Vite + TypeScript + Tailwind project with:
- Electron main process with BrowserWindow + system tray
- React renderer with Vite dev server hot reload
- Tailwind CSS configured
- contextBridge preload for secure IPC
- Electron-builder config for Windows packaging
- Dev mode: Vite dev server + Electron watching
- Prod mode: Vite build + Electron loads dist/index.html

## FILE STRUCTURE

Create the full project:

li-client-ops-hub/
├── electron/
│   ├── main.ts                    ← Electron main process entry
│   ├── preload.ts                 ← contextBridge IPC exposure
│   └── tray.ts                    ← system tray icon + menu
├── src/                           ← React renderer
│   ├── main.tsx                   ← React entry
│   ├── App.tsx                    ← Router shell with sidebar
│   ├── pages/
│   │   ├── PortfolioPage.tsx      ← placeholder
│   │   ├── CompanyPage.tsx        ← placeholder
│   │   ├── SyncLogsPage.tsx       ← placeholder
│   │   └── SettingsPage.tsx       ← placeholder
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx        ← nav with icons
│   │       ├── TopBar.tsx         ← alert banner + sync status
│   │       └── AlertBanner.tsx
│   ├── hooks/
│   │   └── useDB.ts              ← placeholder IPC hook
│   ├── lib/
│   │   └── ipc.ts                ← typed IPC client
│   └── types/
│       └── index.ts              ← shared type definitions
├── sync/                          ← sync engine stubs
│   └── scheduler.ts              ← node-cron placeholder
├── db/
│   └── client.ts                 ← better-sqlite3 placeholder
├── assets/
│   ├── icon.png                  ← app icon (create a simple placeholder)
│   └── tray-icon.png             ← tray icon placeholder
├── data/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
└── CLAUDE.md

## KEY IMPLEMENTATION DETAILS

### electron/main.ts

```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';

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
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Client Ops Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => mainWindow?.show() },
    { label: 'Sync Now', click: () => { /* TODO: trigger full sync */ } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

app.whenReady().then(async () => {
  createTray();
  await createWindow();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', (e: Event) => { /* keep running in tray */ });
```

### electron/preload.ts

Expose a typed API object on window. For now, stub all methods:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // DB queries (stubs)
  getCompanies: (filters?: any) => ipcRenderer.invoke('db:getCompanies', filters),
  getCompany: (id: string) => ipcRenderer.invoke('db:getCompany', id),
  getSyncLogs: (filters?: any) => ipcRenderer.invoke('db:getSyncLogs', filters),
  getAlerts: (unackedOnly?: boolean) => ipcRenderer.invoke('db:getAlerts', unackedOnly),

  // Sync triggers (stubs)
  syncCompany: (companyId: string) => ipcRenderer.invoke('sync:company', companyId),
  syncAll: () => ipcRenderer.invoke('sync:all'),
  onSyncProgress: (cb: (event: any, data: any) => void) =>
    ipcRenderer.on('sync:progress', cb),
  offSyncProgress: (cb: any) =>
    ipcRenderer.removeListener('sync:progress', cb),

  // Settings (stubs)
  getIntegrations: () => ipcRenderer.invoke('settings:getIntegrations'),
  testIntegration: (name: string) => ipcRenderer.invoke('settings:testIntegration', name),
  saveEnvValue: (key: string, value: string) =>
    ipcRenderer.invoke('settings:setEnvValue', key, value),
});
```

### src/App.tsx

React Router with sidebar layout. Four routes:
- `/` → PortfolioPage
- `/company/:id` → CompanyPage
- `/logs` → SyncLogsPage
- `/settings` → SettingsPage

Sidebar has icons and labels for each route.

### Sidebar design direction

Dark sidebar (slate-900), main content area light (slate-50). 
Use Lucide React icons. Sidebar items: Portfolio (LayoutGrid), Company detail is navigated from portfolio clicks, Sync Logs (Activity), Settings (Settings). 
Active route: highlighted with a left border accent in teal/cyan.

### vite.config.ts

Configure for Electron renderer:
- `base: './'` for file:// protocol in production
- Resolve `@/` alias to `src/`

### electron-builder.yml

```yaml
appId: com.logicinbound.client-ops-hub
productName: Client Ops Hub
win:
  target: nsis
  icon: assets/icon.ico
nsis:
  oneClick: false
  perMachine: false
directories:
  output: release
files:
  - dist/**/*
  - electron/**/*.js
  - assets/**/*
  - node_modules/**/*
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsc -w -p tsconfig.electron.json\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && tsc -p tsconfig.electron.json",
    "package": "npm run build && electron-builder --win",
    "start": "electron ."
  }
}
```

### Tailwind config

Dark mode: 'class'. Extend theme with custom colors for SLA badges:
- `sla-ok`: green-500
- `sla-warning`: amber-500
- `sla-violation`: red-500

### CLAUDE.md

```markdown
# Client Ops Hub

Local Electron desktop app for Logic Inbound client operations.

## Stack
- Electron 33+ (main process)
- React 18 + Vite + TypeScript (renderer)
- Tailwind CSS 3
- better-sqlite3 (local database)
- node-cron (sync scheduling)

## Dev
npm run dev — starts Vite + Electron with hot reload

## Architecture
- electron/ — main process (Node.js)
- src/ — renderer (React)
- sync/ — sync adapters (run in main process)
- db/ — SQLite wrapper + migrations

## IPC
All renderer ↔ main communication via contextBridge.
Never use nodeIntegration. All DB/sync/file operations go through IPC.

## Data
SQLite database at data/ops-hub.db (gitignored).
Credentials in .env (gitignored).
```

## DEPENDENCIES

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.0.0",
    "electron-is-dev": "^3.0.0",
    "lucide-react": "^0.383.0",
    "node-cron": "^3.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^9.0.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "wait-on": "^8.0.0"
  },
  "main": "electron/main.js"
}
```

## ACCEPTANCE CRITERIA

1. `npm install` completes without errors
2. `npm run dev` opens Electron window with Vite hot reload, sidebar renders with 4 nav items
3. Clicking sidebar items navigates between placeholder pages
4. Closing window minimizes to system tray (tray icon visible)
5. Double-clicking tray icon restores window
6. Right-click tray shows menu: Open, Sync Now, Quit
7. Quit from tray actually exits the app
8. `npm run build` produces dist/ folder with built React + compiled Electron JS
9. All placeholder pages render with route name as heading
10. TypeScript compiles without errors for both electron and renderer
```

---

## PROMPT 28 — Client Ops Hub: SQLite Schema + IPC Bridge

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #database #ipc

## OBJECTIVE

Create the full SQLite database schema and wire up the IPC bridge so the
React renderer can query data from the main process.

## FILE SEARCH GUIDANCE

- Search for: `db/client.ts`, `electron/preload.ts`, `electron/main.ts`, `src/types/index.ts`
- Search for: existing IPC handler registration patterns

## REQUIRED CHANGES

### 1. SQLite Schema

Create `db/schema.sql` with all tables. Then create `db/migrations/001_initial.sql` with the same content.

Tables to create (see full spec for column details):

1. **companies** — master company list with GHL location ID, linked Teamwork/Drive IDs, SLA fields, budget snapshot, count rollups
2. **contacts** — GHL contacts with communication tracking (last_outbound_at, days_since_outbound, sla_status)
3. **messages** — GHL messages with direction, type, timestamp, body_preview (200 chars max)
4. **teamwork_projects** — project name, status, budget fields (total, used, percent), task counts
5. **meetings** — Read.ai meetings with title, date, duration, participants JSON, summary
6. **action_items** — meeting action items with text, assignee, status, due date
7. **drive_files** — Google Drive file metadata (name, mime_type, size, modified_at, web_view_url)
8. **company_domains** — email domain → company mapping for Read.ai matching
9. **company_links** — manual cross-source linking overrides
10. **sync_runs** — every sync run with trigger, adapter, status, item counts, errors
11. **sync_alerts** — stale sync alerts, sync failures, SLA violations
12. **integrations** — integration metadata (status, env key names, last test)
13. **app_state** — key-value store for scheduler state, page tokens, etc.

Key schema points:
- `companies.sla_status` TEXT — ok | warning | violation
- `companies.sla_days_since_contact` INTEGER
- `contacts.last_outbound_at` TEXT — timestamp of last outbound message
- `contacts.days_since_outbound` INTEGER — computed on each sync
- `contacts.sla_status` TEXT — ok | warning | violation
- `messages.direction` TEXT — inbound | outbound
- `messages.body_preview` TEXT — first 200 chars only
- `sync_runs.trigger` TEXT — scheduled | manual
- `sync_runs.adapter` TEXT — ghl | teamwork | readai | gdrive | all
- All tables use TEXT PRIMARY KEY with UUIDs
- All tables have created_at TEXT DEFAULT (datetime('now'))
- Add indexes on: companies(slug), companies(sla_status), contacts(company_id), contacts(sla_status), contacts(last_outbound_at), messages(contact_id), messages(company_id), messages(direction, message_at), sync_runs(started_at DESC), sync_alerts(acknowledged, created_at DESC)

### 2. Database Client

Create `db/client.ts`:

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    const dbDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'ops-hub.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDB(): void {
  const database = getDB();
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  seedIntegrations(database);
}

function seedIntegrations(database: Database.Database) {
  const integrations = [
    { name: 'ghl', display_name: 'GoHighLevel', env_keys: '["GHL_CLIENT_ID","GHL_CLIENT_SECRET","GHL_COMPANY_ID"]' },
    { name: 'ghl_ri', display_name: 'GHL Restoration Inbound', env_keys: '["GHL_RI_TOKEN","GHL_RI_LOCATION_ID"]' },
    { name: 'teamwork', display_name: 'Teamwork', env_keys: '["TEAMWORK_API_KEY","TEAMWORK_SITE"]' },
    { name: 'readai', display_name: 'Read.ai', env_keys: '["READAI_API_KEY"]' },
    { name: 'gdrive', display_name: 'Google Drive', env_keys: '["GOOGLE_SERVICE_ACCOUNT_JSON_PATH","GOOGLE_DRIVE_PARENT_FOLDER_ID"]' },
  ];
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO integrations (id, name, display_name, env_keys, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'not_configured', datetime('now'), datetime('now'))
  `);
  for (const int of integrations) {
    stmt.run(crypto.randomUUID(), int.name, int.display_name, int.env_keys);
  }
}
```

### 3. IPC Handlers

Create `electron/ipc/db.ts`:

Register ipcMain.handle for:
- `db:getCompanies` — SELECT from companies with optional filters (sla_status, status, search)
- `db:getCompany` — SELECT single company by ID with joins
- `db:getContacts` — SELECT contacts for a company, ordered by sla_status DESC, days_since_outbound DESC
- `db:getMessages` — SELECT messages for a contact, ordered by message_at DESC, limit 200
- `db:getMeetings` — SELECT meetings for a company, ordered by meeting_date DESC
- `db:getDriveFiles` — SELECT drive_files for a company, ordered by modified_at DESC
- `db:getSyncLogs` — SELECT sync_runs ordered by started_at DESC, limit 100
- `db:getAlerts` — SELECT sync_alerts, optionally filter to unacknowledged
- `db:acknowledgeAlert` — UPDATE sync_alerts SET acknowledged = 1 WHERE id = ?

Create `electron/ipc/settings.ts`:

Register ipcMain.handle for:
- `settings:getIntegrations` — SELECT from integrations table
- `settings:getEnvValue` — read .env file, return value for key (mask secrets)
- `settings:setEnvValue` — read .env, update key, write back atomically
- `settings:testIntegration` — stub for now, returns { success: false, error: 'Not implemented' }

Create `electron/ipc/sync.ts`:

Register ipcMain.handle for:
- `sync:company` — stub, returns { success: false, error: 'Not implemented' }
- `sync:all` — stub, returns { success: false, error: 'Not implemented' }

Create `electron/ipc/index.ts`:
- Imports and registers all handler modules
- Called from main.ts on app.whenReady()

### 4. Update electron/main.ts

- Import and call `initDB()` on startup
- Import and call `registerIPCHandlers()` from ipc/index.ts
- Load .env from app.getPath('userData') using dotenv

### 5. Update src/types/index.ts

Add TypeScript interfaces for all DB entities:
- Company, Contact, Message, TeamworkProject, Meeting, ActionItem, DriveFile
- SyncRun, SyncAlert, Integration
- SLAStatus type: 'ok' | 'warning' | 'violation'

### 6. Update electron/preload.ts

Expand the API to include all handlers registered above.

## ACCEPTANCE CRITERIA

1. App starts and creates ops-hub.db in Electron userData directory
2. All 13 tables exist with correct schema (verify with `sqlite3 ops-hub.db ".tables"`)
3. Integrations table is seeded with 5 rows on first launch
4. `db:getCompanies` IPC call returns empty array (no data yet)
5. `settings:getIntegrations` returns the 5 seeded integrations
6. `settings:setEnvValue` writes a key to .env and it persists across restart
7. All IPC handlers respond without errors
8. TypeScript compiles without errors
```

---

## PROMPT 29 — Client Ops Hub: Settings Page + .env Management

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #settings #integrations

## OBJECTIVE

Build the Settings page with integration management cards that read/write
the .env file and test connections to each service.

## FILE SEARCH GUIDANCE

- Search for: `src/pages/SettingsPage.tsx`, `src/components/settings/`
- Search for: `electron/ipc/settings.ts`, `src/lib/ipc.ts`
- Search for: `sync/adapters/` for import patterns

## REQUIRED CHANGES

### 1. Integration Card Component

Create `src/components/settings/IntegrationCard.tsx`:

Each card displays:
- Integration name and status badge (Connected green / Error red / Not Configured gray)
- For each env key: a labeled input field
  - Type: password by default, with a Reveal toggle button
  - Value loaded from .env on mount
  - Save button per card (saves all fields for that integration)
- [Test Connection] button — calls the test endpoint, shows result inline
- Last tested timestamp + last error (if any)

### 2. Settings Page Layout

`src/pages/SettingsPage.tsx`:

Sections:
1. **Integrations** — grid of IntegrationCards (2 columns)
   - GHL Agency
   - GHL Restoration Inbound
   - Teamwork
   - Read.ai
   - Google Drive

2. **Sync Schedule** (read-only display for now)
   - "Auto-sync: Every 2 hours, 6 AM – 8 PM CT, weekdays"
   - Toggle: Enable/Disable auto-sync (saves to app_state)

3. **SLA Configuration**
   - Warning threshold (days): number input, default 5
   - Violation threshold (days): number input, default 7
   - Save button → writes to .env as SLA_WARNING_DAYS and SLA_VIOLATION_DAYS

4. **App Info**
   - Version from package.json
   - Database path (from Electron userData)
   - [Open Data Folder] button — calls shell.openPath
   - [Reset Database] button — confirm dialog → deletes and recreates DB

### 3. Test Connection Implementations

Update `electron/ipc/settings.ts` with actual test logic:

**GHL Agency:**
```typescript
const res = await fetch('https://services.leadconnectorhq.com/locations/search', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${env.GHL_CLIENT_SECRET}`,
    'Version': '2021-07-28',
  },
  // Use company ID as query param
});
// Return success if 200, include location count
```

**GHL Restoration Inbound:**
```typescript
const res = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${env.GHL_RI_LOCATION_ID}&limit=1`, {
  headers: {
    'Authorization': `Bearer ${env.GHL_RI_TOKEN}`,
    'Version': '2021-07-28',
  },
});
```

**Teamwork:**
```typescript
const res = await fetch(`https://${env.TEAMWORK_SITE}.teamwork.com/projects.json?status=active&pageSize=1`, {
  headers: { 'Authorization': `Bearer ${env.TEAMWORK_API_KEY}` },
});
```

**Read.ai:**
Test with a simple authenticated GET to the Read.ai API.

**Google Drive:**
```typescript
// Load service account JSON, create auth, list files in parent folder with limit 1
```

Each test returns `{ success: boolean, message: string, details?: any }`.
On success: update integrations table status = 'connected', last_tested_at.
On failure: update status = 'error', last_error.

### 4. .env Atomic Write

In `electron/ipc/settings.ts`, ensure .env writes are atomic:
1. Read current .env into memory
2. Update the target key(s)
3. Write to .env.tmp
4. Rename .env.tmp → .env (atomic on Windows via fs.renameSync)
5. Update process.env in memory

### 5. Credential Input Component

Create `src/components/settings/CredentialInput.tsx`:
- Label
- Password input with monospace font
- Reveal/Hide toggle (eye icon from Lucide)
- On blur or Save: send value to main process via IPC

## ACCEPTANCE CRITERIA

1. Settings page renders with all 5 integration cards
2. Each card shows correct env key labels
3. Typing a value and clicking Save writes to .env file
4. Restarting the app reloads saved values into the cards
5. Test Connection for Teamwork returns success when valid API key provided
6. Test Connection shows error message inline when credentials are wrong
7. Status badge updates to Connected (green) after successful test
8. SLA thresholds can be edited and persist across restart
9. Open Data Folder button opens the Electron userData directory
10. Reset Database shows confirm dialog and recreates DB on confirm
```

---

## PROMPT 30 — Client Ops Hub: GHL Adapter + SLA Computation

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #ghl #sync #sla

## OBJECTIVE

Build the GHL sync adapter that pulls sub-accounts, contacts, and messages,
then computes 7-day communication SLA per contact.

## FILE SEARCH GUIDANCE

- Search for: `sync/adapters/`, `sync/engine.ts`, `sync/utils/rateLimit.ts`
- Search for: `db/client.ts` for DB helper patterns
- Search for: `electron/ipc/sync.ts` for sync trigger wiring

## REQUIRED CHANGES

### 1. Rate Limit Utility

Create `sync/utils/rateLimit.ts`:
- `withBackoff(fn, options)` — retries on 429 with exponential backoff + jitter
- `delay(ms)` — simple sleep
- Max retries: 5, base delay: 200ms, max delay: 30s

### 2. Structured Logger

Create `sync/utils/logger.ts`:
- Logs to console AND inserts into sync_runs / sync_alerts tables
- `logSyncStart(companyId, adapter, trigger)` → creates sync_runs row, returns runId
- `logSyncEnd(runId, status, counts)` → updates sync_runs row
- `logAlert(type, severity, title, message, companyId?)` → inserts sync_alerts row

### 3. GHL Adapter

Create `sync/adapters/ghl.ts`:

**Sub-account sync:**
```typescript
export async function syncLocations(env: EnvConfig): Promise<Company[]> {
  // GET /locations/search with companyId
  // Paginate fully (GHL pagination bug — fetch all pages until empty result)
  // For each location: upsert into companies table
  // Generate slug from company name (lowercase, remove punctuation/spaces)
  // Return list of companies
}
```

**Contact sync (per location):**
```typescript
export async function syncContacts(locationId: string, companyId: string, env: EnvConfig): Promise<SyncCounts> {
  // GET /contacts/?locationId={id}&limit=100
  // Paginate via startAfterId until empty
  // Hard stop at 500 contacts per location (log warning if hit)
  // For each contact: upsert into contacts table
  // Build contact_url: https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}
  // 100ms delay between paginated requests
  // Return { found, created, updated }
}
```

**Message sync (per contact tagged "client"):**
```typescript
export async function syncMessages(contact: Contact, env: EnvConfig): Promise<SyncCounts> {
  // GET /conversations/search?contactId={contactId} → get conversation ID
  // GET /conversations/{conversationId}/messages → get messages
  // For each message:
  //   - Extract: id, direction (inbound/outbound based on message type), timestamp, type
  //   - body_preview: first 200 chars of body
  //   - Upsert into messages table
  // After all messages synced, compute:
  //   - last_outbound_at: MAX(message_at) WHERE direction = 'outbound'
  //   - last_inbound_at: MAX(message_at) WHERE direction = 'inbound'
  //   - days_since_outbound: (now - last_outbound_at) in days
  //   - message_count_7d: COUNT WHERE message_at > 7 days ago
  //   - message_count_30d: COUNT WHERE message_at > 30 days ago
  // Update contact row with computed fields
  // Return { found, created, updated }
}
```

**SLA computation:**
```typescript
export function computeSLA(contact: Contact, config: { warningDays: number, violationDays: number }): SLAStatus {
  if (!contact.last_outbound_at) return 'violation';
  const days = contact.days_since_outbound ?? Infinity;
  if (days > config.violationDays) return 'violation';
  if (days > config.warningDays) return 'warning';
  return 'ok';
}

export function computeCompanySLA(contacts: Contact[]): { status: SLAStatus, daysSinceContact: number } {
  // Filter to client-tagged contacts only
  // Company SLA = worst of any client contact
  // daysSinceContact = MAX(days_since_outbound) across client contacts
}
```

### 4. Sync Engine Orchestrator

Create `sync/engine.ts`:

```typescript
export async function syncCompany(companyId: string, trigger: 'manual' | 'scheduled'): Promise<SyncResult> {
  const runId = logSyncStart(companyId, 'all', trigger);
  try {
    const company = getCompanyById(companyId);

    // GHL contacts
    const contactCounts = await syncContacts(company.ghl_location_id, companyId, env);

    // GHL messages for client-tagged contacts
    const clientContacts = getClientTaggedContacts(companyId);
    let messageCounts = { found: 0, created: 0, updated: 0 };
    for (const contact of clientContacts) {
      const mc = await syncMessages(contact, env);
      messageCounts.found += mc.found;
      messageCounts.created += mc.created;
      // Compute SLA per contact
      const slaStatus = computeSLA(contact, slaConfig);
      updateContactSLA(contact.id, slaStatus);
    }

    // Compute company-level SLA
    const companySLA = computeCompanySLA(getContactsForCompany(companyId));
    updateCompanySLA(companyId, companySLA);

    // Update company roll-up counts
    updateCompanyCounts(companyId);

    logSyncEnd(runId, 'success', { ...contactCounts, net_new_messages: messageCounts.created });
    return { success: true };
  } catch (err) {
    logSyncEnd(runId, 'failed', {}, err.message);
    return { success: false, error: err.message };
  }
}

export async function syncAllCompanies(trigger: 'manual' | 'scheduled'): Promise<void> {
  // First: sync locations list
  await syncLocations(env);

  // Then: sync each active company sequentially
  const companies = getAllActiveCompanies();
  for (const company of companies) {
    try {
      await syncCompany(company.id, trigger);
    } catch (err) {
      // Log error but continue to next company
      logAlert('sync_failed', 'warning', `Sync failed: ${company.name}`, err.message, company.id);
    }
    await delay(500); // breathing room between companies
  }
}
```

### 5. Wire IPC Sync Handlers

Update `electron/ipc/sync.ts`:
- `sync:company` → calls syncCompany, sends progress events via mainWindow.webContents.send('sync:progress', data)
- `sync:all` → calls syncAllCompanies

### 6. Progress Events

During sync, emit IPC events to renderer:
```typescript
mainWindow.webContents.send('sync:progress', {
  companyId,
  phase: 'ghl_contacts',   // ghl_contacts | ghl_messages | teamwork | readai | gdrive | complete
  progress: 45,             // percent
  found: 23,
  message: 'Syncing contacts...'
});
```

## ACCEPTANCE CRITERIA

1. `syncLocations` fetches all sub-accounts and populates companies table
2. `syncContacts` paginates through all contacts for a location
3. `syncMessages` fetches conversation messages for client-tagged contacts
4. `days_since_outbound` computed correctly for each contact
5. Contact SLA flags: ok (≤5d), warning (6-7d), violation (>7d)
6. Company SLA = worst of any client-tagged contact
7. sync_runs table populated with timing and counts after each sync
8. Rate limiting: 100ms between paginated requests, backoff on 429
9. Per-company sync via IPC sends progress events to renderer
10. Full sync processes all active companies sequentially
11. Sync errors logged but don't block remaining companies
```

---

## PROMPT 31 — Client Ops Hub: Portfolio Page + Company Detail Page

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #frontend #portfolio #company

## OBJECTIVE

Build the Portfolio overview page and Company detail page with real data
from SQLite via IPC.

## FILE SEARCH GUIDANCE

- Search for: `src/pages/PortfolioPage.tsx`, `src/pages/CompanyPage.tsx`
- Search for: `src/components/portfolio/`, `src/components/company/`
- Search for: `src/hooks/useDB.ts`, `src/lib/ipc.ts`
- Search for: `electron/ipc/db.ts` for query patterns

## REQUIRED CHANGES

### 1. Portfolio Page

Replace placeholder `src/pages/PortfolioPage.tsx` with full implementation.

**Top bar:**
- "Client Ops Hub" title
- Sync status: "Last sync: X min ago" (green if <2h, amber if 2-4h, red if >4h)
- Alert count badge if unacknowledged alerts exist
- [Sync All] button (admin action, triggers syncAll via IPC)

**Filter row:**
- Search input (fuzzy on company name)
- SLA filter: All / OK / Warning / Violation
- Status filter: Active / Inactive / All

**Table columns:**
| Column | Data | Sorting |
|---|---|---|
| Company | name, links to /company/:id | Alpha |
| SLA | Badge (🟢🟡🔴) + "Xd" days since contact | Numeric (worst first default) |
| Contacts | contacts_total count | Numeric |
| TW Budget | Progress bar showing tw_budget_used_pct, red >90%, amber >75% | Numeric |
| Messages (7d) | messages_last_7d count | Numeric |
| Last Sync | Relative time (X min/h ago) | Datetime |

**Sorting:** Click column header toggles asc/desc. Default: SLA descending (violations first).

**Row click:** Navigate to `/company/:id`.

**Design direction:**
- Clean data table with alternating row backgrounds (slate-50/white)
- SLA badges: colored dots with days text
- Budget bars: inline progress bars, 120px wide, colored by threshold
- Hover rows: subtle highlight
- Use Tailwind only, no extra component library

### 2. Company Detail Page

Replace placeholder `src/pages/CompanyPage.tsx` with full implementation.

**Header:**
- Back arrow → portfolio
- Company name (large)
- SLA badge + "X days since last outbound"
- [Sync Now] button → triggers syncCompany via IPC, shows progress bar
- External links row: GHL (if location_id), Teamwork (if project_id), Drive (if folder_url)

**Tab system (4 tabs):**

**Contacts tab:**
- Table: Name, Phone, Email, Last Outbound (date), Days Since, SLA badge
- Sorted by SLA status (violations first), then days_since_outbound DESC
- Click name → expand inline to show recent messages for that contact
- Only client-tagged contacts shown by default, toggle to show all

**Messages tab:**
- Chronological timeline (newest first)
- Each message: timestamp, direction arrow (→ outbound, ← inbound), type badge (SMS/Email/etc), preview text
- Filter: All / Inbound / Outbound
- Grouped by contact name with collapsible sections

**Teamwork tab:**
- Budget card: total, used, percent with large progress bar
- Tasks summary: active / completed / total
- "No Teamwork project linked" empty state with link to Settings

**Meetings tab (Read.ai):**
- List of meetings for this company
- Each: date, title, duration, participant count
- Expandable: summary + action items list
- "No meetings found" empty state

**Documents tab (Drive):**
- Grid or list of recent files from matched Drive folder
- Each: file icon (by mime type), name, modified date, size
- Click opens web_view_url in default browser
- "No Drive folder linked" empty state

### 3. SLA Badge Component

Create `src/components/portfolio/SLABadge.tsx`:
- ok: green dot + "Xd" in green
- warning: amber dot + "Xd" in amber
- violation: red dot + "Xd" in red + pulsing animation
- null/never contacted: red dot + "Never" text

### 4. Budget Bar Component

Create `src/components/portfolio/BudgetBar.tsx`:
- Horizontal progress bar
- Color: green <75%, amber 75-90%, red >90%
- Shows percentage text
- Null state: gray bar with "—"

### 5. Sync Progress Bar

Create `src/components/sync/SyncProgressBar.tsx`:
- Listens to sync:progress IPC events
- Shows: phase name, progress percentage, items found
- Animated bar fill
- Disappears after 'complete' event

### 6. Data Hooks

Create/update `src/hooks/useDB.ts`:
```typescript
export function useCompanies(filters?: CompanyFilters) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  // Call window.api.getCompanies(filters) on mount and when filters change
  // Return { companies, loading, refresh }
}

export function useCompany(id: string) { ... }
export function useContacts(companyId: string) { ... }
export function useMessages(contactId: string) { ... }
export function useSyncLogs(filters?: any) { ... }
```

## ACCEPTANCE CRITERIA

1. Portfolio page loads and displays all companies from DB
2. SLA column shows correct badge color and days for each company
3. Clicking a company navigates to detail page
4. Company detail shows correct contacts with SLA status
5. Expanding a contact inline shows recent messages
6. Messages tab shows chronological timeline with direction arrows
7. SLA filter on portfolio correctly filters companies
8. Search filters companies by name
9. Column sorting works on all sortable columns
10. Sync Now on company page triggers sync with visible progress bar
11. Empty states shown when Teamwork/Meetings/Drive data not available
12. Budget bar shows correct colors at threshold boundaries
```

---

## PROMPT 32 — Client Ops Hub: Teamwork Adapter

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #teamwork #sync

## OBJECTIVE

Build the Teamwork sync adapter that pulls active projects, budget data,
and task counts, then links them to companies.

## FILE SEARCH GUIDANCE

- Search for: `sync/adapters/teamwork.ts`, `sync/engine.ts`
- Search for: `db/client.ts` for upsert patterns
- Search for: `src/components/company/TeamworkPanel.tsx`

## REQUIRED CHANGES

### 1. Teamwork Adapter

Create `sync/adapters/teamwork.ts`:

**Project sync:**
```typescript
export async function syncProjects(env: EnvConfig): Promise<void> {
  const site = env.TEAMWORK_SITE;
  const apiKey = env.TEAMWORK_API_KEY;
  const baseUrl = `https://${site}.teamwork.com`;

  // GET /projects.json?status=active&include=budget
  // Paginate if needed
  // For each project:
  //   - Upsert into teamwork_projects table
  //   - Extract: name, status, budget fields
  //   - Try to match to a company:
  //     1. Check company_links table for manual override
  //     2. Normalize project name to slug, match against companies.slug
  //     3. Fuzzy match project company_name against companies.name
  //   - If matched: set teamwork_projects.company_id, update companies.teamwork_project_id
}
```

**Budget extraction:**
```typescript
// Teamwork project object may contain:
// - budget (total budget in dollars or hours)
// - budgetType ("dollars" or "hours")
// - percentComplete or similar
// Or may need: GET /projects/{id}/budgets.json
// Extract: total_budget, budget_used, budget_used_pct
// If only percent available, compute: budget_used = total_budget * (percent / 100)
```

**Task counts:**
```typescript
// GET /projects/{id}/tasks.json with status filters
// Or use GET /projects/{id}.json which may include task counts
// Extract: total_tasks, completed_tasks, active_tasks
```

### 2. Update Sync Engine

In `sync/engine.ts`, add Teamwork step to syncCompany:
```typescript
// After GHL sync:
if (company.teamwork_project_id) {
  const twCounts = await syncProjectBudget(company.teamwork_project_id, company.id, env);
  // Update companies table with latest budget snapshot
}
```

And in syncAllCompanies, run project list sync first:
```typescript
// After syncLocations:
await syncProjects(env);
```

### 3. Update Company Detail Teamwork Tab

Replace placeholder in `src/components/company/TeamworkPanel.tsx`:
- Large budget card with progress bar
- Budget type label (hours or dollars)
- Tasks breakdown: active / completed / total
- "No Teamwork project linked" state with suggestion to link in Settings
- Link to Teamwork project (opens in browser)

### 4. Update Portfolio Table

Add TW Budget column to portfolio table:
- Shows budget_used_pct as inline progress bar
- Color thresholds: green <75%, amber 75-90%, red >90%
- Shows "—" when no project linked

## ACCEPTANCE CRITERIA

1. syncProjects fetches all active Teamwork projects
2. Projects auto-matched to companies by name/slug
3. Budget data (total, used, percent) populated in teamwork_projects table
4. Company detail Teamwork tab shows budget bar and task counts
5. Portfolio table shows budget column for linked companies
6. Unlinked companies show "—" in budget column
7. Rate limiting: delays between API calls
8. sync_runs logged for Teamwork adapter
```

---

## PROMPT 33 — Client Ops Hub: Read.ai + Google Drive Adapters

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #readai #gdrive #sync

## OBJECTIVE

Build the Read.ai and Google Drive sync adapters.

## FILE SEARCH GUIDANCE

- Search for: `sync/adapters/readai.ts`, `sync/adapters/gdrive.ts`
- Search for: `sync/engine.ts` for integration points
- Search for: `src/components/company/MeetingsPanel.tsx`, `src/components/company/DriveDocsPanel.tsx`

## REQUIRED CHANGES

### 1. Read.ai Adapter

Create `sync/adapters/readai.ts`:

```typescript
export async function syncMeetings(env: EnvConfig): Promise<void> {
  // GET meetings from Read.ai API (last 30 days rolling window)
  // For each meeting:
  //   1. Extract: id, title, date, duration, participants (name + email), summary
  //   2. Match to company via participant email domains:
  //      a. Parse all participant emails → extract domains
  //      b. Look up each domain in company_domains table
  //      c. If match found → set meetings.company_id
  //      d. If no match → leave company_id null (shown in unmatched list)
  //   3. Upsert into meetings table
  //   4. Extract action items → upsert into action_items table
}

export async function syncActionItems(meetingId: string, env: EnvConfig): Promise<void> {
  // GET action items for a specific meeting
  // Upsert into action_items table
}
```

**Domain matching helper:**
```typescript
function extractDomains(participants: { email: string }[]): string[] {
  return [...new Set(
    participants
      .map(p => p.email?.split('@')[1]?.toLowerCase())
      .filter(Boolean)
  )];
}
```

### 2. Google Drive Adapter

Create `sync/adapters/gdrive.ts`:

```typescript
import { google } from 'googleapis';

export async function syncDriveFolders(env: EnvConfig): Promise<void> {
  // Auth via service account JSON
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // List folders under parent folder
  const res = await drive.files.list({
    q: `'${env.GOOGLE_DRIVE_PARENT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, webViewLink, modifiedTime)',
    pageSize: 200,
  });

  // Match each folder to a company by name/slug
  // Update companies.drive_folder_id and drive_folder_url
}

export async function syncDriveFiles(company: Company, env: EnvConfig): Promise<void> {
  // List top 20 recent files in the company's Drive folder
  const res = await drive.files.list({
    q: `'${company.drive_folder_id}' in parents`,
    orderBy: 'modifiedTime desc',
    pageSize: 20,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
  });

  // Upsert into drive_files table
}
```

### 3. Update Sync Engine

In `sync/engine.ts`, add Read.ai and Drive steps:

```typescript
// In syncAllCompanies, after Teamwork:
await syncMeetings(env);
await syncDriveFolders(env);

// In syncCompany, after Teamwork:
if (company has meetings) {
  // Meetings are synced globally, just update counts
}
if (company.drive_folder_id) {
  await syncDriveFiles(company, env);
}
```

### 4. Meetings Panel

Create `src/components/company/MeetingsPanel.tsx`:
- List of meetings sorted by date DESC
- Each row: date, title, duration, participant count badge
- Expandable: summary text + action items list
- Action items show: text, assignee, status (open/done), due date
- Empty state: "No meetings found for this company"

### 5. Drive Docs Panel

Create `src/components/company/DriveDocsPanel.tsx`:
- List/grid of files sorted by modified date DESC
- Each: file type icon (from mime_type), file name, modified date, size (human-readable)
- Click opens webViewLink in default browser
- Empty state: "No Drive folder linked"

### 6. Company Domain Management

Add to Settings page or Company detail:
- Table of company_domains entries
- Add domain: input field + company dropdown + Save
- Delete domain: remove button with confirm
- Used for Read.ai auto-matching

## ACCEPTANCE CRITERIA

1. syncMeetings fetches Read.ai meetings from last 30 days
2. Meetings matched to companies via participant email domains
3. Action items synced per meeting
4. MeetingsPanel shows meetings with expandable summaries and action items
5. syncDriveFolders lists client folders and links to companies
6. syncDriveFiles populates top 20 recent files per folder
7. DriveDocsPanel shows files with click-to-open in browser
8. Domain management UI allows adding/removing company_domains
9. Unmatched meetings (no domain match) visible in a global view
10. sync_runs logged for both adapters
```

---

## PROMPT 34 — Client Ops Hub: Sync Scheduler + Logs Page + Tray + Packaging

```
You are working inside the li-client-ops-hub project.
This is a local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #scheduler #logs #tray #packaging

## OBJECTIVE

Wire up the automated sync scheduler, build the sync logs page with
alert management, polish the system tray, and configure packaging.

## FILE SEARCH GUIDANCE

- Search for: `sync/scheduler.ts`, `electron/tray.ts`, `electron/main.ts`
- Search for: `src/pages/SyncLogsPage.tsx`, `src/components/sync/`
- Search for: `electron-builder.yml`, `package.json`

## REQUIRED CHANGES

### 1. Sync Scheduler

Update `sync/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { syncAllCompanies } from './engine';
import { checkStaleSyncs, computeAllSLAFlags } from './alerts';

let schedulerEnabled = true;

export function startScheduler() {
  // Full portfolio sync: every 2 hours, 6 AM–8 PM CT, weekdays
  cron.schedule('0 6,8,10,12,14,16,18,20 * * 1-5', async () => {
    if (!schedulerEnabled) return;
    console.log('[Scheduler] Starting full portfolio sync');
    await syncAllCompanies('scheduled');
  }, { timezone: 'America/Chicago' });

  // Stale sync check: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await checkStaleSyncs();
  });

  // SLA recomputation: every hour
  cron.schedule('0 * * * *', async () => {
    await computeAllSLAFlags();
  });

  console.log('[Scheduler] Started — syncing every 2h from 6AM-8PM CT, weekdays');
}

export function toggleScheduler(enabled: boolean) {
  schedulerEnabled = enabled;
  // Persist to app_state table
}
```

### 2. Stale Sync Alerting

Create `sync/alerts.ts`:

```typescript
export async function checkStaleSyncs(): Promise<void> {
  const lastSuccess = /* query last successful full sync from sync_runs */;
  const hoursSince = /* compute */;

  const thresholds = getThresholdsFromEnv(); // 12, 24, 48 hours

  if (hoursSince >= 48) {
    createAlertIfNew('stale_sync', 'critical',
      `No successful sync in ${Math.round(hoursSince)} hours`,
      'Check scheduler and network connectivity. Run manual sync.');
  } else if (hoursSince >= 24) {
    createAlertIfNew('stale_sync', 'warning', ...);
  } else if (hoursSince >= 12) {
    createAlertIfNew('stale_sync', 'info', ...);
  }

  // Per-adapter check
  for (const adapter of ['ghl', 'teamwork', 'readai', 'gdrive']) {
    // Check last successful run for each adapter
    // Alert if stale
  }
}

// Dedup: don't create duplicate alerts within 6 hours
function createAlertIfNew(type: string, severity: string, title: string, message: string) {
  const recent = /* check if same type+severity alert exists in last 6h */;
  if (!recent) {
    // Insert into sync_alerts
  }
}

export async function computeAllSLAFlags(): Promise<void> {
  // Recompute SLA for all contacts based on current time
  // Update contact.sla_status and company.sla_status
  // Create alerts for new SLA violations
}
```

### 3. Sync Logs Page

Replace `src/pages/SyncLogsPage.tsx`:

**Alert panel (top):**
- Show unacknowledged alerts sorted by severity (critical first)
- Each alert: severity badge, title, message, timestamp, [Acknowledge] button
- Dismissing an alert marks it acknowledged in DB

**Sync run table:**
- Columns: Time, Trigger (scheduled/manual), Adapter, Scope (full/company name), Status (✅⚠️❌), Items, Duration
- Items column shows: "X companies, +Y messages" for full syncs, "X contacts, +Y messages" for company syncs
- Duration: computed from started_at to ended_at
- Click row → expand to show:
  - Full error message and detail (if failed)
  - Per-adapter breakdown
  - Advisory text: "Check sync/adapters/{adapter}.ts" for troubleshooting

**Filters:**
- Status: All / Success / Partial / Failed
- Adapter: All / GHL / Teamwork / Read.ai / Drive
- Date range (last 24h / 7d / 30d)

**Auto-refresh:** Poll for new sync_runs every 30 seconds.

### 4. Alert Banner in TopBar

Update `src/components/layout/TopBar.tsx`:
- Show alert count badge when unacknowledged alerts > 0
- Click opens Sync Logs page
- Critical alerts: red badge with pulse animation
- Warning alerts: amber badge

### 5. System Tray Polish

Update `electron/tray.ts`:
- Tray icon changes color based on sync status:
  - Green: last sync <2h ago, no alerts
  - Amber: last sync 2-4h ago, or warning alerts
  - Red: last sync >4h ago, or critical alerts
- Context menu:
  - "Open Client Ops Hub"
  - "Sync Now" → triggers full sync
  - "Last sync: X ago"
  - Separator
  - "Alerts: X unacknowledged" (if any)
  - Separator
  - "Quit"
- Tray tooltip updates with last sync time

### 6. Wire Scheduler to Main Process

Update `electron/main.ts`:
- Call startScheduler() after initDB() and registerIPCHandlers()
- Add IPC handlers:
  - `scheduler:toggle` — enable/disable scheduler
  - `scheduler:status` — return { enabled, nextRun, lastRun }

### 7. Electron Packaging

Update `electron-builder.yml` for production:
- Windows NSIS installer
- Auto-launch option (start with Windows)
- Desktop shortcut
- Taskbar pinning instruction in README

Update `package.json`:
- Ensure all production dependencies bundled correctly
- `"main": "electron/main.js"` points to compiled JS
- Add `"postinstall": "electron-builder install-app-deps"` for native modules (better-sqlite3)

### 8. CLI Sync Commands

Create `sync/cli.ts` for headless sync (useful for debugging):
```
npm run sync:now — runs full sync without Electron
npm run sync:company -- --id=<companyId> — syncs one company
npm run status — shows queue status, last sync, alert count
```

## ACCEPTANCE CRITERIA

1. Scheduler starts automatically on app launch
2. Full sync runs at 6, 8, 10, 12, 14, 16, 18, 20 CT on weekdays
3. Stale sync alert fires when no successful sync in 12+ hours
4. SLA flags recomputed hourly
5. Sync Logs page shows all runs with correct status badges
6. Clicking a failed run shows error detail
7. Alert panel shows unacknowledged alerts at top of logs page
8. Acknowledge button dismisses alerts
9. TopBar shows alert count badge
10. Tray icon reflects sync status color
11. Tray context menu shows last sync time and alert count
12. `npm run package` produces Windows NSIS installer
13. Installed app starts, creates DB, pins to taskbar
14. `npm run sync:now` works headless for debugging
15. Scheduler can be toggled on/off from Settings page
```

---

## BUILD EXECUTION ORDER

Run prompts sequentially. Each prompt depends on the previous:

1. **PROMPT 27** — Scaffold (no dependencies)
2. **PROMPT 28** — Schema + IPC (depends on 27)
3. **PROMPT 29** — Settings page (depends on 28)
4. **PROMPT 30** — GHL adapter + SLA (depends on 28, 29)
5. **PROMPT 31** — Portfolio + Company pages (depends on 30)
6. **PROMPT 32** — Teamwork adapter (depends on 30)
7. **PROMPT 33** — Read.ai + Drive adapters (depends on 30)
8. **PROMPT 34** — Scheduler + Logs + Tray + Packaging (depends on all above)

**Validate each prompt before deploying the next.** Key validation:
- P27: `npm run dev` opens Electron with sidebar
- P28: Check DB tables exist, IPC responds
- P29: Settings page saves/loads .env values
- P30: Run manual sync, verify contacts + SLA in DB
- P31: Portfolio and Company pages render with real data
- P32: Teamwork data shows on portfolio and company pages
- P33: Meetings and Drive files appear on company pages
- P34: Scheduler runs, alerts fire, package installs cleanly
