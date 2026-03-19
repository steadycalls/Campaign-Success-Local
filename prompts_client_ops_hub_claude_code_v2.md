# CLAUDE CODE PROMPTS — Client Ops Hub (Local Electron Desktop App) v2

#logic-inbound #client-ops-hub #electron

Parent spec: `spec_local_client_ops_hub.md`
Notion AI Inbox page: `328fd93f-a8f3-81b8-b993-ceeeecdf3007`

---

## KNOWN GOTCHAS (READ FIRST)

These are hard-won lessons that **will** stall the build if ignored. Claude Code must internalize these before writing any code.

### 1. `better-sqlite3` + Electron = native module rebuild required
`better-sqlite3` is a C++ native addon. It MUST be compiled against Electron's Node.js version, not the system Node. Without this step, the app crashes on launch with `NODE_MODULE_VERSION` mismatch.

**Fix:** Add `electron-rebuild` to devDependencies and a `postinstall` script:
```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```
Run `npm run postinstall` after every `npm install`. On Windows, this requires Python 3 and Visual Studio Build Tools (C++ workload) installed.

### 2. GHL Auth for a local Electron app
This app cannot use Cloudflare Workers OAuth callbacks. Two viable paths:

**Path A (recommended for MVP): Reuse Campaign Success tokens.**
Kyle already has a valid GHL OAuth refresh token stored in Campaign Success's KV. Export it once, store in `.env` as `GHL_REFRESH_TOKEN`. The local app uses it to:
1. `POST /oauth/token` with `grant_type=refresh_token` → get access token
2. `POST /oauth/locationToken` with `companyId` + `locationId` → get per-location token
3. Auto-refresh when tokens expire (store new refresh token back to `.env`)

**Path B (long-term): Local OAuth server.**
Spin up a temporary Express server on `localhost:3847` to handle the OAuth redirect. Only needed once for initial token grant, then refresh token handles the rest.

**Path C (simplest per-location): Private Integration Tokens.**
For the Restoration Inbound location (`g6zCuamu3IQlnY1ympGx`), use the existing `GHL_RI_TOKEN`. For other locations, the agency token with location exchange is required.

**Decision: Use Path A for agency-wide sync + Path C for RI-specific deep data (client-tagged contacts/messages).**

### 3. GHL message direction is numeric, not string
GHL conversation messages use `direction: 1` (inbound) and `direction: 2` (outbound) — NOT strings. Also, the `type` field values include: `TYPE_SMS`, `TYPE_EMAIL`, `TYPE_CALL`, `TYPE_FACEBOOK`, `TYPE_INSTAGRAM`, etc. Map these to human-readable labels.

### 4. Teamwork uses Basic Auth, NOT Bearer
Teamwork API v1/v2 authenticates via HTTP Basic Auth:
```
Authorization: Basic {base64(API_KEY + ':X')}
```
The `:X` suffix is literal — Teamwork requires a password field but ignores it. Using `Bearer` will return 401.

### 5. GHL `meta.total` is unreliable
Never trust pagination metadata from GHL. Always paginate until the response returns an empty array or no `nextPageUrl`. Count locally.

### 6. Frontend must refresh after sync completes
IPC hooks need to listen for `sync:complete` events and re-query the database. Without this, the UI shows stale data after every sync until the user navigates away and back.

### 7. Discord API rate limits are per-route
Discord rate limits are route-specific (e.g., `/channels/{id}/messages` has its own bucket). The `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers must be respected per-route. Global rate limit is 50 req/sec.

### 8. Read.ai API may not be publicly available
Read.ai's API documentation is limited. If the API is not accessible, **degrade gracefully**: show "Read.ai integration unavailable" in the UI, skip the adapter during sync, and don't block the build. This is a Phase 2 enhancement, not a blocker.

### 9. PowerShell doesn't support `&&` chaining
All npm scripts that chain commands must use `concurrently` or separate script entries, not `&&`.

---

## PROMPT 27 — Electron + Vite + React Scaffold

```
You are creating a new standalone project: li-client-ops-hub.
This is a local Electron desktop app for Windows with React/Vite/TypeScript frontend.
It will be pinned to the Windows taskbar and run syncs in the background.

#logic-inbound #client-ops-hub #electron #scaffold

## CRITICAL: NATIVE MODULE SETUP

better-sqlite3 is a C++ native addon that MUST be compiled against Electron's
Node.js version. Without electron-rebuild, the app will crash on launch.

Add to devDependencies: "electron-rebuild": "^3.7.0"
Add postinstall script: "postinstall": "electron-rebuild -f -w better-sqlite3"

Prerequisites on Windows:
- Python 3 (in PATH)
- Visual Studio Build Tools 2022 with "Desktop development with C++" workload
- Node.js 20+

## OBJECTIVE

Scaffold the complete Electron + React + Vite + TypeScript + Tailwind project.

## FILE STRUCTURE

li-client-ops-hub/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── tray.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── PortfolioPage.tsx
│   │   ├── CompanyPage.tsx
│   │   ├── SyncLogsPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── TopBar.tsx
│   │       └── AlertBanner.tsx
│   ├── hooks/
│   │   └── useDB.ts
│   ├── lib/
│   │   └── ipc.ts
│   └── types/
│       └── index.ts
├── sync/
│   └── scheduler.ts
├── db/
│   └── client.ts
├── assets/
│   ├── icon.png
│   └── tray-icon.png
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

## ELECTRON MAIN PROCESS (electron/main.ts)

Key behaviors:
- BrowserWindow: 1400x900, min 1000x700
- Dev mode: load http://localhost:5173 + open DevTools
- Prod mode: load dist/index.html with `base: './'`
- Close button hides to tray (does NOT quit). Only tray Quit actually exits.
- System tray with icon, tooltip "Client Ops Hub", context menu: Open / Sync Now / Quit
- Double-click tray = show window
- On app.whenReady: init DB (placeholder), register IPC handlers (placeholder), create tray, create window

## PRELOAD (electron/preload.ts)

Expose window.api via contextBridge with stub methods:
- getCompanies, getCompany, getContacts, getMessages, getMeetings, getDriveFiles
- getSyncLogs, getAlerts, acknowledgeAlert
- syncCompany, syncAll
- onSyncProgress / offSyncProgress (event listeners)
- onSyncComplete / offSyncComplete (event listeners — CRITICAL for UI refresh)
- getIntegrations, testIntegration, saveEnvValue, getEnvValue

## REACT APP (src/App.tsx)

React Router v6 with sidebar layout:
- / → PortfolioPage
- /company/:id → CompanyPage
- /logs → SyncLogsPage
- /settings → SettingsPage

Sidebar: dark (slate-900), 220px wide, Lucide icons:
- Portfolio (LayoutGrid icon)
- Sync Logs (Activity icon)
- Settings (Settings icon)
Active route: teal left border + teal text

TopBar: sync status indicator + alert badge (placeholder)

Each page: placeholder with route name heading

## TAILWIND CONFIG

Dark mode: 'class'
Extend colors:
- sla-ok: '#22c55e' (green-500)
- sla-warning: '#f59e0b' (amber-500)
- sla-violation: '#ef4444' (red-500)
- budget-ok: '#22c55e'
- budget-warn: '#f59e0b'
- budget-critical: '#ef4444'

Font: 'Inter' from Google Fonts (or system font stack as fallback)

## VITE CONFIG

- `base: './'` for Electron file:// protocol
- Resolve `@/` alias to `src/`
- React plugin

## PACKAGE.JSON

```json
{
  "name": "li-client-ops-hub",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"tsc -w -p tsconfig.electron.json\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && tsc -p tsconfig.electron.json",
    "package": "npm run build && electron-builder --win",
    "start": "electron .",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.0.0",
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
    "electron-rebuild": "^3.7.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "wait-on": "^8.0.0"
  }
}
```

## CLAUDE.md

Include:
- Stack description
- Dev command: `npm run dev`
- Architecture: electron/ = main process, src/ = renderer, sync/ = adapters, db/ = SQLite
- IPC rule: all DB/sync/file operations through contextBridge, never nodeIntegration
- Native module note: run `npm run postinstall` after any `npm install`
- Known gotchas from the KNOWN GOTCHAS section above (copy all 9 items)

## ACCEPTANCE CRITERIA

1. `npm install` completes including electron-rebuild of better-sqlite3
2. `npm run dev` opens Electron window with Vite hot reload
3. Sidebar renders with 3 nav items (Portfolio, Sync Logs, Settings)
4. Clicking nav items navigates between placeholder pages
5. Closing the window hides to system tray (tray icon visible in Windows taskbar)
6. Double-clicking tray icon restores window
7. Right-click tray shows: Open, Sync Now (stub), Quit
8. Quit from tray exits the app process
9. `npm run build` succeeds (Vite build + tsc)
10. TypeScript compiles for both electron/ and src/ without errors
11. Tailwind classes render correctly (test: add a bg-sla-violation class, see red)
```

---

## PROMPT 28 — SQLite Schema + IPC Bridge + Seed Data

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #database #ipc

## OBJECTIVE

Create the full SQLite schema, wire the IPC bridge, and add a seed data
command so the UI can be validated without waiting for a real API sync.

## FILE SEARCH GUIDANCE

- Search for: db/client.ts, electron/preload.ts, electron/main.ts, src/types/index.ts
- Search for: CLAUDE.md for known gotchas

## REQUIRED CHANGES

### 1. SQLite Schema (db/schema.sql)

Create all tables with IF NOT EXISTS (idempotent on re-run):

**companies** — master list
```sql
CREATE TABLE IF NOT EXISTS companies (
  id                    TEXT PRIMARY KEY,
  ghl_location_id       TEXT UNIQUE,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  timezone              TEXT DEFAULT 'America/Chicago',
  status                TEXT DEFAULT 'active',

  -- Linked external IDs
  teamwork_project_id   TEXT,
  teamwork_project_name TEXT,
  drive_folder_id       TEXT,
  drive_folder_url      TEXT,
  discord_channel_id    TEXT,
  discord_channel_name  TEXT,

  -- SLA (computed on sync)
  sla_status            TEXT DEFAULT 'ok',
  sla_days_since_contact INTEGER,
  sla_last_outbound_at  TEXT,

  -- Teamwork budget snapshot
  tw_total_budget       REAL,
  tw_budget_used        REAL,
  tw_budget_used_pct    REAL,
  tw_budget_type        TEXT,
  tw_total_tasks        INTEGER DEFAULT 0,
  tw_completed_tasks    INTEGER DEFAULT 0,
  tw_active_tasks       INTEGER DEFAULT 0,

  -- Discord activity snapshot
  discord_last_message_at   TEXT,
  discord_messages_24h      INTEGER DEFAULT 0,
  discord_messages_48h      INTEGER DEFAULT 0,
  discord_messages_7d       INTEGER DEFAULT 0,
  discord_messages_14d      INTEGER DEFAULT 0,
  discord_messages_30d      INTEGER DEFAULT 0,
  discord_activity_status   TEXT DEFAULT 'unknown',

  -- Count rollups
  contacts_total        INTEGER DEFAULT 0,
  contacts_client_tag   INTEGER DEFAULT 0,
  messages_total        INTEGER DEFAULT 0,
  messages_last_7d      INTEGER DEFAULT 0,
  meetings_last_30d     INTEGER DEFAULT 0,
  drive_files_total     INTEGER DEFAULT 0,

  last_synced_at        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_sla ON companies(sla_status);
```

**contacts** — GHL contacts with SLA tracking
```sql
CREATE TABLE IF NOT EXISTS contacts (
  id                    TEXT PRIMARY KEY,
  ghl_contact_id        TEXT UNIQUE NOT NULL,
  company_id            TEXT NOT NULL,
  ghl_location_id       TEXT NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  tags                  TEXT,
  assigned_to_id        TEXT,
  assigned_to_name      TEXT,
  source                TEXT,
  is_client_tagged      INTEGER DEFAULT 0,

  -- Communication SLA
  last_outbound_at      TEXT,
  last_inbound_at       TEXT,
  last_any_message_at   TEXT,
  days_since_outbound   INTEGER,
  sla_status            TEXT DEFAULT 'ok',
  message_count_7d      INTEGER DEFAULT 0,
  message_count_30d     INTEGER DEFAULT 0,

  date_added            TEXT,
  date_updated          TEXT,
  date_of_last_activity TEXT,
  contact_url           TEXT,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_sla ON contacts(sla_status);
CREATE INDEX IF NOT EXISTS idx_contacts_outbound ON contacts(last_outbound_at);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(is_client_tagged);
```

**messages** — GHL messages for SLA computation
```sql
CREATE TABLE IF NOT EXISTS messages (
  id                    TEXT PRIMARY KEY,
  ghl_message_id        TEXT UNIQUE NOT NULL,
  contact_id            TEXT NOT NULL,
  company_id            TEXT NOT NULL,
  conversation_id       TEXT,
  direction             TEXT NOT NULL,           -- 'inbound' or 'outbound'
  direction_raw         INTEGER,                 -- GHL numeric: 1=inbound, 2=outbound
  type                  TEXT,                    -- sms, email, call, facebook, instagram, etc.
  type_raw              TEXT,                    -- GHL raw: TYPE_SMS, TYPE_EMAIL, etc.
  body_preview          TEXT,                    -- first 200 chars
  message_at            TEXT NOT NULL,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_dir_time ON messages(direction, message_at);
```

**discord_messages** — Discord channel message snapshots
```sql
CREATE TABLE IF NOT EXISTS discord_messages (
  id                    TEXT PRIMARY KEY,
  discord_message_id    TEXT UNIQUE NOT NULL,
  company_id            TEXT NOT NULL,
  channel_id            TEXT NOT NULL,
  author_name           TEXT,
  author_id             TEXT,
  content_preview       TEXT,                    -- first 200 chars
  message_at            TEXT NOT NULL,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discord_msg_company ON discord_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_discord_msg_time ON discord_messages(message_at);
```

**teamwork_projects** — linked Teamwork projects
```sql
CREATE TABLE IF NOT EXISTS teamwork_projects (
  id                    TEXT PRIMARY KEY,
  teamwork_project_id   TEXT UNIQUE NOT NULL,
  company_id            TEXT,
  name                  TEXT NOT NULL,
  status                TEXT,
  total_budget          REAL,
  budget_type           TEXT,
  budget_used           REAL,
  budget_used_pct       REAL,
  total_tasks           INTEGER DEFAULT 0,
  completed_tasks       INTEGER DEFAULT 0,
  active_tasks          INTEGER DEFAULT 0,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tw_company ON teamwork_projects(company_id);
```

**meetings, action_items, drive_files, company_domains, company_links** — same as spec.

**sync_runs** — every sync event
```sql
CREATE TABLE IF NOT EXISTS sync_runs (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT,
  company_name          TEXT,
  trigger_type          TEXT NOT NULL,           -- 'scheduled' or 'manual'
  adapter               TEXT NOT NULL,           -- ghl | teamwork | readai | gdrive | discord | all
  status                TEXT NOT NULL DEFAULT 'running',
  started_at            TEXT NOT NULL,
  ended_at              TEXT,
  items_found           INTEGER DEFAULT 0,
  items_created         INTEGER DEFAULT 0,
  items_updated         INTEGER DEFAULT 0,
  items_failed          INTEGER DEFAULT 0,
  net_new_contacts      INTEGER DEFAULT 0,
  net_new_messages      INTEGER DEFAULT 0,
  error                 TEXT,
  error_detail          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_time ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_runs(status);
```

**sync_alerts** — stale sync, failures, SLA violations
```sql
CREATE TABLE IF NOT EXISTS sync_alerts (
  id                    TEXT PRIMARY KEY,
  alert_type            TEXT NOT NULL,
  severity              TEXT NOT NULL,
  title                 TEXT NOT NULL,
  message               TEXT,
  company_id            TEXT,
  adapter               TEXT,
  acknowledged          INTEGER DEFAULT 0,
  acknowledged_at       TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_unacked ON sync_alerts(acknowledged, created_at DESC);
```

**integrations** — credential metadata
```sql
CREATE TABLE IF NOT EXISTS integrations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  status                TEXT DEFAULT 'not_configured',
  env_keys              TEXT NOT NULL,
  last_tested_at        TEXT,
  last_error            TEXT,
  config_json           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**app_state** — key-value store
```sql
CREATE TABLE IF NOT EXISTS app_state (
  key                   TEXT PRIMARY KEY,
  value                 TEXT NOT NULL,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. Database Client (db/client.ts)

- getDB(): opens/creates ops-hub.db in Electron's userData/data/ directory
- WAL mode + foreign keys enabled
- initDB(): runs schema.sql (idempotent), seeds integrations

Seed integrations (6 rows):
```typescript
const INTEGRATIONS = [
  { name: 'ghl_agency', display_name: 'GHL Agency (OAuth)', env_keys: '["GHL_REFRESH_TOKEN","GHL_CLIENT_ID","GHL_CLIENT_SECRET","GHL_COMPANY_ID"]' },
  { name: 'ghl_ri', display_name: 'GHL Restoration Inbound', env_keys: '["GHL_RI_TOKEN","GHL_RI_LOCATION_ID"]' },
  { name: 'teamwork', display_name: 'Teamwork', env_keys: '["TEAMWORK_API_KEY","TEAMWORK_SITE"]' },
  { name: 'discord', display_name: 'Discord', env_keys: '["DISCORD_BOT_TOKEN","DISCORD_GUILD_ID"]' },
  { name: 'readai', display_name: 'Read.ai', env_keys: '["READAI_API_KEY"]' },
  { name: 'gdrive', display_name: 'Google Drive', env_keys: '["GOOGLE_SERVICE_ACCOUNT_JSON_PATH","GOOGLE_DRIVE_PARENT_FOLDER_ID"]' },
];
```

### 3. Seed Data Script (db/seed.ts)

Create a script runnable via `npm run seed` that inserts 5 fake companies
with varying SLA statuses, budget levels, and message counts. This lets
the Portfolio and Company pages be validated without real API credentials.

```typescript
// npm run seed — inserts test data for UI development
const companies = [
  { name: 'Acme Restoration', sla_status: 'violation', sla_days: 12, tw_budget_used_pct: 78, contacts_total: 34, messages_last_7d: 3, discord_messages_7d: 15, discord_activity_status: 'active' },
  { name: 'Blue Sky Plumbing', sla_status: 'warning', sla_days: 6, tw_budget_used_pct: 42, contacts_total: 18, messages_last_7d: 8, discord_messages_7d: 2, discord_activity_status: 'quiet' },
  { name: 'Delta Roofing', sla_status: 'ok', sla_days: 1, tw_budget_used_pct: 95, contacts_total: 56, messages_last_7d: 22, discord_messages_7d: 0, discord_activity_status: 'inactive' },
  { name: 'Echo Environmental', sla_status: 'violation', sla_days: 21, tw_budget_used_pct: 0, contacts_total: 8, messages_last_7d: 0, discord_messages_7d: 0, discord_activity_status: 'no_channel' },
  { name: 'Fox Fire Damage', sla_status: 'ok', sla_days: 3, tw_budget_used_pct: 67, contacts_total: 41, messages_last_7d: 15, discord_messages_7d: 8, discord_activity_status: 'active' },
];
// Insert companies, contacts (3-5 per company with varying SLA), messages, sync_runs
```

Add script: `"seed": "tsx db/seed.ts"`

### 4. IPC Handlers

Create electron/ipc/db.ts with handlers for all DB queries.
Create electron/ipc/settings.ts for .env management.
Create electron/ipc/sync.ts with stubs.
Create electron/ipc/index.ts that registers all.

**CRITICAL: .env file location**
Store .env in Electron's `app.getPath('userData')` directory, NOT in the project root.
This ensures credentials persist across rebuilds and aren't accidentally committed.

**CRITICAL: .env atomic write**
1. Read current .env
2. Update target key
3. Write to .env.tmp
4. fs.renameSync(.env.tmp, .env) — atomic on Windows
5. Update process.env in memory

### 5. Types (src/types/index.ts)

Define interfaces for all DB entities. Include:
```typescript
type SLAStatus = 'ok' | 'warning' | 'violation';
type DiscordActivityStatus = 'active' | 'quiet' | 'inactive' | 'no_channel' | 'unknown';
type SyncTrigger = 'scheduled' | 'manual';
type SyncAdapter = 'ghl' | 'teamwork' | 'readai' | 'gdrive' | 'discord' | 'all';
```

### 6. IPC Client with Refresh (src/hooks/useDB.ts)

**CRITICAL:** Hooks must re-fetch data when sync completes.

```typescript
export function useCompanies(filters?: CompanyFilters) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await window.api.getCompanies(filters);
    setCompanies(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => { refresh(); }, [refresh]);

  // AUTO-REFRESH: Listen for sync completion events
  useEffect(() => {
    const handler = (_event: any, _data: any) => { refresh(); };
    window.api.onSyncComplete(handler);
    return () => { window.api.offSyncComplete(handler); };
  }, [refresh]);

  return { companies, loading, refresh };
}
```

Every data hook (useCompanies, useCompany, useContacts, etc.) must include
the onSyncComplete listener pattern above.

## ACCEPTANCE CRITERIA

1. initDB() creates all 13 tables (verify with .tables)
2. Integrations table seeded with 6 rows
3. `npm run seed` populates 5 test companies with contacts and messages
4. db:getCompanies returns seeded companies
5. settings:getIntegrations returns 6 integrations
6. settings:setEnvValue writes to .env in userData directory and persists
7. useCompanies hook auto-refreshes when sync:complete fires
8. All IPC handlers respond without errors
9. TypeScript compiles clean
```

---

## PROMPT 29 — Settings Page + Integration Management

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #settings #integrations

## OBJECTIVE

Build the Settings page with integration cards, .env management, connection
testing, and SLA/sync configuration.

## FILE SEARCH GUIDANCE

- Search for: src/pages/SettingsPage.tsx, src/components/settings/
- Search for: electron/ipc/settings.ts
- Search for: CLAUDE.md for auth gotchas (Teamwork Basic Auth, GHL OAuth)

## REQUIRED CHANGES

### 1. IntegrationCard Component

Each card shows:
- Name + status badge (Connected / Error / Not Configured)
- Env key inputs (password type, monospace, Reveal toggle with Eye/EyeOff icons)
- Values loaded from .env on mount
- [Save] button per card → writes all fields to .env via IPC
- [Test Connection] button → shows result inline (green checkmark or red X + error)
- Last tested timestamp, last error

### 2. Settings Page Layout

4 sections:

**Section 1: Integrations** (2-column grid)
6 cards:
- GHL Agency (OAuth): GHL_REFRESH_TOKEN, GHL_CLIENT_ID, GHL_CLIENT_SECRET, GHL_COMPANY_ID
- GHL Restoration Inbound: GHL_RI_TOKEN, GHL_RI_LOCATION_ID
- Teamwork: TEAMWORK_API_KEY, TEAMWORK_SITE
- Discord: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
- Read.ai: READAI_API_KEY
- Google Drive: GOOGLE_SERVICE_ACCOUNT_JSON_PATH, GOOGLE_DRIVE_PARENT_FOLDER_ID

**Section 2: Sync Schedule**
- Display: "Every 2 hours, 6 AM – 8 PM CT, weekdays"
- Toggle: Enable/Disable auto-sync

**Section 3: SLA Configuration**
- Warning threshold: number input, default 5 days
- Violation threshold: number input, default 7 days
- Discord activity thresholds:
  - Active: messages in last 7 days
  - Quiet: messages in last 14 days but not last 7
  - Inactive: no messages in 14+ days

**Section 4: App Info**
- Version, DB path, data directory
- [Open Data Folder], [Reset Database], [Seed Test Data]

### 3. Test Connection Implementations

**GHL Agency:**
```typescript
// First, exchange refresh token for access token:
// POST https://services.leadconnectorhq.com/oauth/token
// body: { grant_type: 'refresh_token', refresh_token, client_id, client_secret }
// Then test: GET /locations/search?companyId={companyId} with new access token
// IMPORTANT: Save the NEW refresh_token from the response back to .env
//   (GHL rotates refresh tokens on each exchange)
```

**GHL RI:**
```typescript
// GET https://services.leadconnectorhq.com/contacts/?locationId={id}&limit=1
// Headers: Authorization: Bearer {GHL_RI_TOKEN}, Version: 2021-07-28
```

**Teamwork (CRITICAL: Basic Auth, NOT Bearer):**
```typescript
const credentials = Buffer.from(`${apiKey}:X`).toString('base64');
const res = await fetch(`https://${site}.teamwork.com/projects.json?status=active&pageSize=1`, {
  headers: { 'Authorization': `Basic ${credentials}` },
});
```

**Discord:**
```typescript
// GET https://discord.com/api/v10/guilds/{guildId}/channels
// Headers: Authorization: Bot {botToken}
// Verify returns channel list
```

**Read.ai:**
```typescript
// Attempt GET to Read.ai API
// If 401 or no docs available: return { success: false, error: 'Read.ai API not available or key invalid' }
// GRACEFUL DEGRADATION: This integration may not be available. Mark as 'unavailable' not 'error'.
```

**Google Drive:**
```typescript
// Load service account JSON → google.auth.GoogleAuth
// List files in parent folder with limit 1
// Return success + file count
```

### 4. GHL Token Auto-Refresh

When testing GHL Agency, the response includes a NEW refresh token.
ALWAYS save it back to .env immediately. GHL refresh tokens are single-use —
if you don't save the new one, the old one is invalidated and the integration breaks.

```typescript
const tokenResponse = await refreshGHLToken(env);
if (tokenResponse.refresh_token) {
  await setEnvValue('GHL_REFRESH_TOKEN', tokenResponse.refresh_token);
}
```

## ACCEPTANCE CRITERIA

1. 6 integration cards render with correct env key labels
2. Save writes values to .env in userData, persists across restart
3. Reveal toggle shows/hides credential values
4. Test Connection for Teamwork uses Basic Auth (NOT Bearer) and succeeds
5. Test Connection for Discord validates bot token against guild
6. GHL Agency test exchanges refresh token and saves new refresh token
7. Read.ai gracefully shows "unavailable" if API doesn't respond
8. SLA thresholds editable and persisted
9. Seed Test Data button populates DB with fake data
10. Reset Database recreates DB after confirmation
```

---

## PROMPT 30 — GHL Adapter + SLA Computation

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #ghl #sync #sla

## OBJECTIVE

Build the GHL sync adapter: sub-accounts, contacts, messages. Compute
7-day communication SLA per client-tagged contact.

## CRITICAL GOTCHAS — READ BEFORE CODING

1. GHL message direction is NUMERIC: 1 = inbound, 2 = outbound
   Map: { 1: 'inbound', 2: 'outbound' }

2. GHL message type is a string enum:
   TYPE_SMS, TYPE_EMAIL, TYPE_CALL, TYPE_FACEBOOK, TYPE_INSTAGRAM, etc.
   Map to friendly labels: { TYPE_SMS: 'sms', TYPE_EMAIL: 'email', TYPE_CALL: 'call', ... }

3. GHL pagination: NEVER trust meta.total. Paginate until response.contacts
   is empty or response.nextPageUrl is null. Count rows locally.

4. GHL location-scoped tokens: Use agency OAuth access token to call
   POST /oauth/locationToken with { companyId, locationId } to get
   per-location bearer tokens. Cache these for the sync duration.
   Fallback: Use GHL_RI_TOKEN for the Restoration Inbound location.

5. GHL conversations API:
   - GET /conversations/search?contactId={id} → returns { conversations: [...] }
   - Each conversation has an `id`
   - GET /conversations/{conversationId}/messages → returns { messages: [...] }
   - Each message: { id, body, dateAdded, direction (1|2), type (TYPE_SMS|etc) }

6. Rate limits: ~100 req/min per location token. Add 100ms between pagination
   calls. Backoff on 429. Hard stop: 500 contacts per location per cycle.

## FILE SEARCH GUIDANCE

- Search for: sync/adapters/, sync/engine.ts, sync/utils/
- Search for: db/client.ts for upsert patterns
- Search for: electron/ipc/sync.ts

## REQUIRED CHANGES

### 1. Rate Limit Utility (sync/utils/rateLimit.ts)

withBackoff(fn, { maxRetries: 5, baseDelayMs: 200, maxDelayMs: 30000 })
- On 429: exponential backoff with jitter
- On other errors: throw immediately
- Log each retry with attempt number

delay(ms) — simple sleep

### 2. Logger (sync/utils/logger.ts)

logSyncStart(companyId, adapter, trigger) → returns runId
logSyncEnd(runId, status, counts, error?)
logAlert(type, severity, title, message, companyId?)

All write to sync_runs / sync_alerts tables via better-sqlite3.

### 3. GHL Auth Helper (sync/adapters/ghlAuth.ts)

```typescript
export async function getAccessToken(env: EnvConfig): Promise<string> {
  // POST https://services.leadconnectorhq.com/oauth/token
  // body: { client_id, client_secret, grant_type: 'refresh_token', refresh_token }
  // IMPORTANT: Save new refresh_token back to .env
  // Return access_token
}

export async function getLocationToken(
  accessToken: string, companyId: string, locationId: string
): Promise<string> {
  // POST https://services.leadconnectorhq.com/oauth/locationToken
  // Headers: Authorization: Bearer {accessToken}, Version: 2021-07-28
  // Body: { companyId, locationId }
  // Return token
}
```

Cache location tokens in memory for the duration of a sync run.

### 4. GHL Adapter (sync/adapters/ghl.ts)

syncLocations(env) → fetch all sub-accounts, upsert companies
syncContacts(locationId, companyId, locationToken) → paginate contacts, upsert
syncMessages(contact, locationToken) → fetch conversation messages, upsert

**Message direction mapping (CRITICAL):**
```typescript
function mapDirection(raw: number): string {
  return raw === 1 ? 'inbound' : raw === 2 ? 'outbound' : 'unknown';
}

function mapType(raw: string): string {
  const MAP: Record<string, string> = {
    'TYPE_SMS': 'sms',
    'TYPE_EMAIL': 'email',
    'TYPE_CALL': 'call',
    'TYPE_FACEBOOK': 'facebook',
    'TYPE_INSTAGRAM': 'instagram',
    'TYPE_LIVE_CHAT': 'livechat',
    'TYPE_WHATSAPP': 'whatsapp',
  };
  return MAP[raw] || raw?.toLowerCase()?.replace('TYPE_', '') || 'unknown';
}
```

### 5. SLA Computation (sync/sla.ts)

```typescript
export function computeContactSLA(
  lastOutboundAt: string | null,
  warningDays: number,
  violationDays: number
): { status: SLAStatus; daysSince: number | null } {
  if (!lastOutboundAt) return { status: 'violation', daysSince: null };
  const days = Math.floor((Date.now() - new Date(lastOutboundAt).getTime()) / 86400000);
  if (days > violationDays) return { status: 'violation', daysSince: days };
  if (days > warningDays) return { status: 'warning', daysSince: days };
  return { status: 'ok', daysSince: days };
}

export function computeCompanySLA(contacts: Contact[]): {
  status: SLAStatus;
  daysSinceContact: number;
} {
  const clientContacts = contacts.filter(c => c.is_client_tagged);
  if (clientContacts.length === 0) return { status: 'ok', daysSinceContact: 0 };
  const worst = clientContacts.reduce((max, c) =>
    (c.days_since_outbound ?? Infinity) > (max.days_since_outbound ?? Infinity) ? c : max
  );
  return {
    status: worst.sla_status as SLAStatus,
    daysSinceContact: worst.days_since_outbound ?? -1,
  };
}
```

### 6. Sync Engine (sync/engine.ts)

syncCompany(companyId, trigger) — orchestrates all adapters for one company
syncAllCompanies(trigger) — syncs location list then each company

**Progress events (IPC):**
```typescript
function emitProgress(companyId: string, phase: string, progress: number, message: string) {
  mainWindow?.webContents.send('sync:progress', { companyId, phase, progress, message });
}
// After all adapters complete for a company:
mainWindow?.webContents.send('sync:complete', { companyId });
// After full portfolio sync:
mainWindow?.webContents.send('sync:complete', { full: true });
```

### 7. Wire IPC Handlers

sync:company → syncCompany with progress events
sync:all → syncAllCompanies

## ACCEPTANCE CRITERIA

1. syncLocations fetches all sub-accounts, populates companies table
2. syncContacts paginates fully (not trusting meta.total)
3. is_client_tagged = 1 for contacts with "client" in tags array
4. syncMessages fetches conversation messages, maps direction 1→inbound 2→outbound
5. last_outbound_at computed from MAX(message_at) WHERE direction='outbound'
6. days_since_outbound computed correctly
7. Contact SLA: ok ≤5d, warning 6-7d, violation >7d (configurable)
8. Company SLA = worst client-tagged contact
9. sync_runs row created with timing and counts
10. 100ms delay between paginated requests, backoff on 429
11. Per-company sync sends progress events to renderer
12. sync:complete event fires after each company and after full sync
13. GHL refresh token saved back to .env after exchange
```

---

## PROMPT 31 — Portfolio Page + Company Detail Page

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #frontend #portfolio #company

## OBJECTIVE

Build the Portfolio overview and Company detail with real data from SQLite.

## FILE SEARCH GUIDANCE

- Search for: src/pages/, src/components/, src/hooks/useDB.ts
- Search for: src/types/index.ts for Company, Contact, Message types

## REQUIRED CHANGES

### 1. Portfolio Page (src/pages/PortfolioPage.tsx)

**Top bar:**
- Title: "Client Ops Hub"
- Sync status: relative time since last successful sync, color-coded (green <2h, amber 2-4h, red >4h)
- Alert badge: count of unacknowledged alerts, click → /logs
- [Sync All] button

**Filters:**
- Search (company name fuzzy)
- SLA: All / OK / Warning / Violation
- Status: Active / Inactive / All

**Table columns:**
| Column | Sortable | Default sort |
|---|---|---|
| Company | Yes (alpha) | — |
| SLA | Yes (numeric) | DESC (worst first) ← DEFAULT |
| Contacts | Yes | — |
| TW Budget | Yes | — |
| Discord | Yes | — |
| Messages (7d) | Yes | — |
| Last Sync | Yes | — |

**SLA column:** SLABadge component — colored dot + "Xd" or "Never"
**TW Budget column:** BudgetBar component — progress bar, green <75%, amber 75-90%, red >90%
**Discord column:** DiscordBadge component:
- 🟢 "Active" (messages in 7d) + message count
- 🟡 "Quiet" (messages in 14d, not 7d) + count
- 🔴 "Inactive" (no messages in 14d+)
- ⚫ "No Channel" (no discord_channel_id)

**Row click:** navigate to /company/:id

### 2. Company Detail (src/pages/CompanyPage.tsx)

**Header:**
- ← Back to portfolio
- Company name (large)
- SLA badge + days text
- [Sync Now ↻] with SyncProgressBar
- External link pills: GHL | Teamwork | Discord | Drive (only shown if linked)

**5 tabs:**

**Contacts tab:**
- Table: Name, Phone, Email, Tags, Last Outbound, Days Since, SLA
- Default filter: client-tagged only (toggle to show all)
- Sort: violations first
- Click name → expand inline message list for that contact (last 20 messages)

**Messages tab:**
- Full timeline, newest first
- Each: timestamp | direction arrow (→/←) | type badge (SMS/Email/Call) | preview
- Filter: All / Inbound / Outbound
- Grouped by contact with collapsible sections

**Teamwork tab:**
- Budget: total / used / percent with large bar
- Budget type: hours or dollars
- Task counts: active / completed / total
- Empty state: "No Teamwork project linked"

**Discord tab:**
- Channel name + link to Discord
- Activity windows: messages in 24h | 48h | 7d | 14d | 30d
- Recent messages: last 20 messages with author, preview, timestamp
- Activity status badge
- Empty state: "No Discord channel found"

**Documents tab (Drive):**
- File list from matched folder
- Icon by mime type, name, modified date, size
- Click → opens in browser
- Empty state: "No Drive folder linked"

### 3. Components

SLABadge.tsx — dot + text, colored by status, pulsing for violation
BudgetBar.tsx — progress bar, colored by threshold
DiscordBadge.tsx — dot + label + count
SyncProgressBar.tsx — listens to sync:progress IPC, animated bar

### 4. Data hooks with auto-refresh

All hooks (useCompanies, useCompany, useContacts, etc.) must:
1. Fetch on mount
2. Re-fetch when sync:complete fires (via IPC listener)
3. Return { data, loading, refresh }

## ACCEPTANCE CRITERIA

1. Portfolio table renders all companies from DB (seeded or real)
2. SLA column shows correct color/days
3. Discord column shows activity badges with message counts
4. Budget bars colored correctly at threshold boundaries
5. Column sorting works on all columns
6. Filters narrow results correctly
7. Company detail loads with correct contacts, messages, tabs
8. Contact expand shows inline message list
9. Discord tab shows activity windows (24h/48h/7d/14d/30d)
10. Sync Now triggers per-company sync with progress bar
11. Data refreshes automatically after sync completes
12. Empty states render when data sources aren't linked
```

---

## PROMPT 32 — Discord Adapter

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #discord #sync

## OBJECTIVE

Build the Discord sync adapter that maps guild channels to companies by
slug, fetches recent messages, and computes activity windows (24h, 48h,
7d, 14d, 30d).

## CRITICAL: DISCORD API SPECIFICS

1. Base URL: https://discord.com/api/v10
2. Auth header: Authorization: Bot {DISCORD_BOT_TOKEN}
3. Rate limits are PER-ROUTE. Read X-RateLimit-Remaining and X-RateLimit-Reset
   headers on every response. Sleep if remaining = 0.
4. GET /channels/{id}/messages returns max 100 per request. Use ?before={lastMessageId}
   for pagination. Messages are returned newest-first.
5. Bot must have "Read Message History" and "View Channel" permissions in the guild.
6. Channel matching: compare channel.name (lowercase) against company.slug.
   Discord channel names are already lowercase with hyphens, so normalize
   company slug to match: "Acme Restoration Co" → "acme-restoration-co" (hyphens, not removed).

   IMPORTANT: The slug format for Discord matching should use HYPHENS between words,
   not the no-space format used elsewhere. Create a discordSlug() helper:
   lowercase → replace non-alphanumeric with hyphens → collapse multiple hyphens → trim hyphens.

## FILE SEARCH GUIDANCE

- Search for: sync/adapters/, sync/engine.ts, db/client.ts
- Search for: src/components/company/ for Discord panel

## REQUIRED CHANGES

### 1. Discord Adapter (sync/adapters/discord.ts)

**Channel discovery:**
```typescript
export async function syncDiscordChannels(env: EnvConfig): Promise<void> {
  // GET /guilds/{guildId}/channels
  // Filter to text channels (type === 0)
  // For each channel:
  //   - Generate discordSlug from each company name
  //   - If channel.name matches a company's discordSlug → link them
  //   - Update companies.discord_channel_id, discord_channel_name
  //   - Companies with no matching channel: discord_activity_status = 'no_channel'
}
```

**Message sync per channel:**
```typescript
export async function syncDiscordMessages(
  company: Company,
  env: EnvConfig
): Promise<DiscordSyncResult> {
  if (!company.discord_channel_id) {
    return { status: 'no_channel', counts: zeroCounts() };
  }

  // Fetch messages from last 30 days (we need 30d window)
  // GET /channels/{channelId}/messages?limit=100
  // Paginate with ?before={oldestMessageId} until:
  //   a) messages are older than 30 days, or
  //   b) 500 message hard stop (log warning)
  // For each message:
  //   - Upsert into discord_messages table
  //   - Track: id, author.username, author.id, content (first 200 chars), timestamp

  // After fetching, compute activity windows from DB:
  const now = new Date();
  const windows = {
    messages_24h: countMessagesSince(channelId, hoursAgo(24)),
    messages_48h: countMessagesSince(channelId, hoursAgo(48)),
    messages_7d:  countMessagesSince(channelId, daysAgo(7)),
    messages_14d: countMessagesSince(channelId, daysAgo(14)),
    messages_30d: countMessagesSince(channelId, daysAgo(30)),
  };

  // Determine activity status:
  let activityStatus: DiscordActivityStatus;
  if (windows.messages_7d > 0) activityStatus = 'active';
  else if (windows.messages_14d > 0) activityStatus = 'quiet';
  else activityStatus = 'inactive';

  // Update companies table with windows + status + last_message_at
  const lastMsg = getLatestDiscordMessage(company.id);
  updateCompanyDiscord(company.id, {
    discord_last_message_at: lastMsg?.message_at,
    discord_messages_24h: windows.messages_24h,
    discord_messages_48h: windows.messages_48h,
    discord_messages_7d: windows.messages_7d,
    discord_messages_14d: windows.messages_14d,
    discord_messages_30d: windows.messages_30d,
    discord_activity_status: activityStatus,
  });

  return { status: activityStatus, counts: windows };
}
```

### 2. Discord Rate Limiter

Discord rate limits are per-route. Implement a route-aware rate limiter:

```typescript
const rateLimitBuckets: Map<string, { remaining: number; resetAt: number }> = new Map();

async function discordFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const route = extractRoute(url); // e.g., "/channels/123/messages"
  const bucket = rateLimitBuckets.get(route);

  if (bucket && bucket.remaining === 0 && Date.now() < bucket.resetAt) {
    const waitMs = bucket.resetAt - Date.now() + 100; // 100ms buffer
    await delay(waitMs);
  }

  const res = await fetch(url, { headers });

  // Update bucket from response headers
  const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') || '10');
  const resetAt = parseFloat(res.headers.get('X-RateLimit-Reset') || '0') * 1000;
  rateLimitBuckets.set(route, { remaining, resetAt });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') || '1') * 1000;
    await delay(retryAfter);
    return discordFetch(url, headers); // retry
  }

  return res;
}
```

### 3. Slug Helper for Discord

```typescript
export function discordSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric → hyphens
    .replace(/-+/g, '-')           // collapse multiple hyphens
    .replace(/^-|-$/g, '');        // trim leading/trailing hyphens
}
```

### 4. Update Sync Engine

In syncAllCompanies: run syncDiscordChannels after syncLocations (maps channels to companies).
In syncCompany: run syncDiscordMessages for the specific company.

### 5. IPC: Discord messages query

Add db:getDiscordMessages handler:
```typescript
ipcMain.handle('db:getDiscordMessages', (_, companyId: string, limit = 20) => {
  return db.prepare(`
    SELECT * FROM discord_messages
    WHERE company_id = ?
    ORDER BY message_at DESC
    LIMIT ?
  `).all(companyId, limit);
});
```

### 6. Discord cleanup cron

Add a monthly cleanup: delete discord_messages older than 60 days to prevent
unbounded SQLite growth.

## ACCEPTANCE CRITERIA

1. syncDiscordChannels lists all guild text channels
2. Channels matched to companies by discordSlug comparison
3. Companies with no matching channel get discord_activity_status = 'no_channel'
4. syncDiscordMessages fetches up to 30 days of messages per channel
5. Activity windows computed correctly: 24h, 48h, 7d, 14d, 30d
6. discord_activity_status: active (7d msgs), quiet (14d not 7d), inactive (no 14d)
7. companies table updated with all discord fields
8. Discord rate limiter respects per-route limits
9. Portfolio table Discord column shows correct badges
10. Company Discord tab shows activity windows + recent messages
11. Hard stop at 500 messages per channel per sync (log warning)
```

---

## PROMPT 33 — Teamwork + Google Drive + Read.ai Adapters

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #teamwork #gdrive #readai #sync

## OBJECTIVE

Build the Teamwork, Google Drive, and Read.ai sync adapters.

## CRITICAL: TEAMWORK AUTH IS BASIC AUTH

Teamwork API uses HTTP Basic Authentication. The username is the API key,
the password is literally the letter "X".

```typescript
const credentials = Buffer.from(`${apiKey}:X`).toString('base64');
const headers = {
  'Authorization': `Basic ${credentials}`,
  'Content-Type': 'application/json',
};
```

Using Bearer auth will return 401. This is the #1 Teamwork integration bug.

## FILE SEARCH GUIDANCE

- Search for: sync/adapters/teamwork.ts, sync/adapters/gdrive.ts, sync/adapters/readai.ts
- Search for: sync/engine.ts, db/client.ts

## REQUIRED CHANGES

### 1. Teamwork Adapter (sync/adapters/teamwork.ts)

**Base URL:** `https://{TEAMWORK_SITE}.teamwork.com`

syncProjects(env):
- GET /projects.json?status=active — paginate until complete
- For each project: upsert teamwork_projects
- Match to companies by: 1) company_links override, 2) slug match, 3) name fuzzy
- Extract budget fields from project object

syncProjectDetail(projectId, companyId, env):
- GET /projects/{id}.json — get budget details
- GET /projects/{id}/tasks.json?getSubTasks=false — count tasks
  - Or if task counts are in the project object, use those
- Update teamwork_projects with budget + task counts
- Update companies table with tw_* snapshot fields

**Budget extraction:**
```typescript
// Teamwork project may have:
// - budget: total budget amount
// - budgetType: "dollars" or "hours"
// - subStatus / percentComplete
// If budget fields missing on list endpoint, try single project endpoint
// If only percent available: budget_used = total_budget * (pct / 100)
```

### 2. Google Drive Adapter (sync/adapters/gdrive.ts)

```typescript
import { google } from 'googleapis';
// Add googleapis to dependencies: "googleapis": "^144.0.0"

export async function syncDriveFolders(env: EnvConfig): Promise<void> {
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // List child folders under parent
  const res = await drive.files.list({
    q: `'${env.GOOGLE_DRIVE_PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name,webViewLink,modifiedTime)',
    pageSize: 200,
  });

  // Match to companies by name/slug
  // Update companies.drive_folder_id, drive_folder_url
}

export async function syncDriveFiles(company: Company, env: EnvConfig): Promise<void> {
  // List top 20 recent files in company's folder
  // Upsert into drive_files table (metadata only, no content download)
}
```

Add googleapis to package.json dependencies.

### 3. Read.ai Adapter (sync/adapters/readai.ts)

**IMPORTANT: Read.ai API may not be publicly accessible.**

Build the adapter structure but wrap all calls in try/catch with graceful degradation:

```typescript
export async function syncMeetings(env: EnvConfig): Promise<void> {
  if (!env.READAI_API_KEY) {
    console.log('[Read.ai] No API key configured, skipping');
    return;
  }

  try {
    // Attempt to fetch meetings from Read.ai API
    // If API is not available, log and return gracefully
    const res = await fetch('https://api.read.ai/v1/meetings?limit=50', {
      headers: { 'Authorization': `Bearer ${env.READAI_API_KEY}` },
    });

    if (!res.ok) {
      console.warn(`[Read.ai] API returned ${res.status}, skipping sync`);
      return;
    }

    // Process meetings...
    // Match to companies via participant email domains (company_domains table)
    // Upsert meetings + action_items
  } catch (err) {
    console.warn('[Read.ai] API unavailable, skipping:', err.message);
    // DO NOT throw — graceful degradation, not a sync failure
  }
}
```

**Domain matching:**
```typescript
function matchMeetingToCompany(participants: { email: string }[], db: Database): string | null {
  for (const p of participants) {
    const domain = p.email?.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    const match = db.prepare('SELECT company_id FROM company_domains WHERE domain = ?').get(domain);
    if (match) return match.company_id;
  }
  return null;
}
```

### 4. Update Sync Engine

Full sync order in syncAllCompanies:
1. GHL: syncLocations → for each company: syncContacts, syncMessages
2. Discord: syncDiscordChannels → for each company: syncDiscordMessages
3. Teamwork: syncProjects → for each linked company: syncProjectDetail
4. Google Drive: syncDriveFolders → for each linked company: syncDriveFiles
5. Read.ai: syncMeetings (global, matches to companies by domain)
6. Compute SLA flags for all companies
7. Emit sync:complete

Per-company sync (syncCompany) follows same order but only for that company.

### 5. Update Company Detail Panels

TeamworkPanel: budget bar + task counts + link to Teamwork
DriveDocsPanel: file list + click to open
MeetingsPanel: meeting list + expandable summary + action items

### 6. Company Domain Management

Add to Settings or Company Detail page:
- Table of company_domains
- Add: domain input + company select + Save
- Delete: remove with confirm
- Pre-populated with common domains from contact emails during GHL sync

## ACCEPTANCE CRITERIA

1. Teamwork sync uses Basic Auth (NOT Bearer) — verify no 401
2. Budget and task counts populated for linked projects
3. Drive folders matched and files listed (metadata only)
4. Read.ai degrades gracefully when API unavailable
5. All adapters log sync_runs with counts
6. Company detail tabs show correct data for each adapter
7. Domain management allows adding/removing company_domains
8. googleapis dependency added and working
```

---

## PROMPT 34 — Sync Scheduler + Logs Page + Tray + Packaging

```
You are working inside the li-client-ops-hub project.
Local Electron + React + TypeScript desktop app.

#logic-inbound #client-ops-hub #scheduler #logs #tray #packaging

## OBJECTIVE

Wire automated sync, build sync logs page with alerts, polish tray, package.

## FILE SEARCH GUIDANCE

- Search for: sync/scheduler.ts, sync/alerts.ts, electron/tray.ts
- Search for: src/pages/SyncLogsPage.tsx
- Search for: electron-builder.yml, package.json

## REQUIRED CHANGES

### 1. Scheduler (sync/scheduler.ts)

node-cron jobs:
- Full sync: `0 6,8,10,12,14,16,18,20 * * 1-5` (America/Chicago timezone)
- Stale check: every 30 minutes
- SLA recompute: every hour
- Discord message cleanup: monthly (delete >60 days)

Toggle enable/disable via app_state table.

### 2. Stale Sync Alerting (sync/alerts.ts)

checkStaleSyncs():
- Query last successful full sync
- Alert at 12h (info), 24h (warning), 48h (critical)
- Per-adapter staleness check
- Dedup: don't create same alert type within 6 hours

Alert includes actionable text:
```
"No successful GHL sync in 26 hours.
→ Check: Is GHL_REFRESH_TOKEN still valid? Test in Settings → Integrations.
→ File: sync/adapters/ghl.ts"
```

### 3. Sync Logs Page

**Alert panel (top):**
- Unacknowledged alerts, sorted by severity
- Each: severity icon, title, message, time, [Acknowledge] button
- Critical: red bg, pulsing icon
- Warning: amber bg

**Sync run table:**
- Columns: Time | Trigger | Adapter | Scope | Status | Items | Duration
- Click row → expand detail: error message, per-adapter breakdown, advisory
- Filters: Status (all/success/partial/failed), Adapter, Date range (24h/7d/30d)
- Auto-refresh: re-query every 30 seconds

### 4. Tray Status

Tray icon color based on system health:
- Green: last sync <2h, no critical alerts
- Amber: last sync 2-4h, or warning alerts
- Red: last sync >4h, or critical alerts, or SLA violations

Context menu:
- "Open Client Ops Hub"
- "Sync Now" → full sync
- "Last sync: X ago"
- "3 alerts" (if any, with severity color)
- ---
- "Quit"

Tooltip: "Client Ops Hub — Last sync: X ago"

### 5. Packaging (electron-builder.yml)

```yaml
appId: com.logicinbound.client-ops-hub
productName: Client Ops Hub
win:
  target: nsis
  icon: assets/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
directories:
  output: release
files:
  - dist/**/*
  - electron/**/*.js
  - sync/**/*.js
  - db/**/*
  - assets/**/*
  - node_modules/**/*
asarUnpack:
  - node_modules/better-sqlite3/**/*
```

**CRITICAL: better-sqlite3 must be in asarUnpack.** Native modules can't
load from inside asar archives. Without this, the packaged app crashes.

### 6. CLI Sync (sync/cli.ts)

For debugging without Electron:
```
npm run sync:now     — full sync headless
npm run sync:company -- --id=<id>  — one company
npm run sync:status  — show last sync time, alert count, DB stats
```

## ACCEPTANCE CRITERIA

1. Scheduler runs at 6,8,10,12,14,16,18,20 CT on weekdays
2. Stale alert fires at 12h/24h/48h with actionable text
3. SLA flags recomputed hourly
4. Sync Logs page shows runs with status, counts, duration
5. Failed run detail shows error and file reference
6. Alert panel shows unacknowledged alerts with acknowledge buttons
7. TopBar alert badge reflects unacknowledged count
8. Tray icon color matches system health
9. `npm run package` produces Windows NSIS installer
10. Installed app launches, creates DB, tray works
11. better-sqlite3 works in packaged app (asarUnpack)
12. CLI sync commands work headless
13. Scheduler can be toggled from Settings
14. Discord messages older than 60 days cleaned up monthly
```

---

## BUILD EXECUTION ORDER

Run sequentially. Validate each before starting the next.

| # | Prompt | Validates | Blocker if skipped |
|---|---|---|---|
| 27 | Scaffold | `npm run dev` opens Electron with sidebar | Everything |
| 28 | Schema + IPC + Seed | DB tables exist, seed data shows in IPC queries | All data display |
| 29 | Settings | .env management works, Test Connection succeeds | All API syncs |
| 30 | GHL + SLA | Real contacts + messages in DB, SLA computed | Core dashboard value |
| 31 | Portfolio + Company | UI renders real data, auto-refreshes on sync | User-facing app |
| 32 | Discord | Channel activity windows display on portfolio + company | Discord visibility |
| 33 | TW + Drive + Read.ai | Budget bars, file lists, meetings render | Full picture |
| 34 | Scheduler + Logs + Tray + Package | Auto-sync runs, alerts fire, app installs | Production readiness |

**Validation checkpoints:**
- After P27: Can you see the Electron window with sidebar? Tray works?
- After P28: Does `npm run seed` put data in DB? Does IPC return it?
- After P29: Can you save a Teamwork API key and test connection (200)?
- After P30: Run manual sync → do contacts + SLA appear in DB?
- After P31: Does portfolio show companies? Do SLA badges, Discord badges, budget bars render?
- After P32: Does Discord show message counts for 24h/48h/7d/14d/30d?
- After P33: Does Teamwork budget show? Drive files list?
- After P34: Does `npm run package` produce an installer that works on a clean Windows machine?
