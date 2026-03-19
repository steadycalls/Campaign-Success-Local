# SPEC: CLIENT OPS HUB — LOCAL DESKTOP APP

## PURPOSE

Build a local Electron desktop app (Windows, taskbar-pinned) that:
1. Syncs client data from GHL sub-accounts, Teamwork, Read.ai, and Google Drive on a 2-hour cadence (6 AM–8 PM CT)
2. Stores everything in a local SQLite database via better-sqlite3
3. Renders a real-time operations dashboard: contact frequency, communication SLA, Teamwork budgets, meeting history, and document status
4. Tracks a 7-day communication SLA per client contact and flags violations
5. Provides per-company manual sync with progress feedback
6. Logs every sync run with counts, errors, and alerts when syncs go stale
7. Manages all integration credentials from a Settings tab that writes back to `.env`

## STRATEGIC FIT

This replaces the cloud-hosted Campaign Success dashboard with a local-first tool that:
- Eliminates Cloudflare Access latency and cold starts for daily use
- Gives Kyle direct control over sync cadence and data freshness
- Runs entirely on the local machine — no hosting costs, no deploy cycles
- Can be iterated independently of the Campaign Success cloud platform
- Serves as the operational nerve center while CS remains the client-facing/team-facing tool

## NON-GOALS

- Replacing Campaign Success (cs.logicinbound.com) — this is a personal ops tool
- Editing contacts, messages, or Teamwork projects (read-only v1)
- Multi-user access or auth (single-user local app)
- Mobile or web deployment
- Real-time websocket streaming (polling is sufficient)

---

## ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ELECTRON SHELL                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  React / Vite / TypeScript Frontend (renderer process)        │  │
│  │                                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │  │
│  │  │ Portfolio │ │ Company  │ │  Sync    │ │  Settings /      │ │  │
│  │  │ Overview  │ │ Detail   │ │  Logs    │ │  Integrations    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │  │
│  └────────────────────────┬───────────────────────────────────────┘  │
│                           │ IPC bridge                               │
│  ┌────────────────────────▼───────────────────────────────────────┐  │
│  │  Node.js Main Process                                          │  │
│  │                                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │  │
│  │  │ Scheduler│ │  Sync    │ │  SQLite  │ │  .env Manager    │ │  │
│  │  │ (cron)   │ │  Engine  │ │  (db)    │ │                  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │  │
│  │                                                                │  │
│  │  Sync Adapters:                                                │  │
│  │  ┌─────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐           │  │
│  │  │ GHL │ │ Teamwork │ │ Read.ai │ │ Google Drive │           │  │
│  │  └─────┘ └──────────┘ └─────────┘ └──────────────┘           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  data/ops-hub.db  (SQLite via better-sqlite3)                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## STACK

| Component | Tool | Why |
|---|---|---|
| Desktop shell | Electron 33+ | Mature, Windows-native, taskbar pinning, tray support |
| Frontend | React 18 + Vite + TypeScript | Matches existing skill set and CS codebase |
| Styling | Tailwind CSS 3 | Utility-first, fast iteration, dark mode built-in |
| Local DB | better-sqlite3 | Synchronous, zero-config, reliable on Windows, fast |
| Scheduler | node-cron | Lightweight, runs in main process |
| GHL client | Custom (fetch) | GHL v2 REST API, location-scoped tokens |
| Teamwork client | Custom (fetch) | Teamwork v3 REST API |
| Read.ai client | Custom (fetch) | Read.ai REST API |
| Google Drive | googleapis npm | Service account auth, Drive v3 API |
| IPC | Electron contextBridge | Secure renderer ↔ main communication |
| Config | dotenv + fs writes | .env file as source of truth for credentials |

---

## REPOSITORY STRUCTURE

```
li-client-ops-hub/
├── electron/
│   ├── main.ts                    ← Electron main process entry
│   ├── preload.ts                 ← contextBridge IPC exposure
│   ├── tray.ts                    ← system tray icon + menu
│   └── ipc/
│       ├── sync.ts                ← IPC handlers for sync triggers
│       ├── db.ts                  ← IPC handlers for DB queries
│       └── settings.ts            ← IPC handlers for .env read/write
├── src/                           ← React renderer
│   ├── main.tsx                   ← React entry
│   ├── App.tsx
│   ├── pages/
│   │   ├── PortfolioPage.tsx      ← all-company overview table
│   │   ├── CompanyPage.tsx        ← single company drilldown
│   │   ├── SyncLogsPage.tsx       ← sync run history + alerts
│   │   └── SettingsPage.tsx       ← integrations management
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── AlertBanner.tsx
│   │   ├── portfolio/
│   │   │   ├── PortfolioTable.tsx
│   │   │   ├── SLABadge.tsx
│   │   │   └── BudgetBar.tsx
│   │   ├── company/
│   │   │   ├── ContactsPanel.tsx
│   │   │   ├── MessagesTimeline.tsx
│   │   │   ├── TeamworkPanel.tsx
│   │   │   ├── MeetingsPanel.tsx
│   │   │   └── DriveDocsPanel.tsx
│   │   ├── sync/
│   │   │   ├── SyncLogTable.tsx
│   │   │   └── SyncProgressBar.tsx
│   │   └── settings/
│   │       ├── IntegrationCard.tsx
│   │       └── CredentialInput.tsx
│   ├── hooks/
│   │   ├── useDB.ts               ← IPC query hooks
│   │   ├── useSync.ts             ← sync trigger + status hooks
│   │   └── useAlerts.ts           ← stale sync alert hook
│   ├── lib/
│   │   └── ipc.ts                 ← typed IPC client
│   └── types/
│       └── index.ts               ← shared type definitions
├── sync/                          ← sync engine (runs in main process)
│   ├── scheduler.ts               ← node-cron setup
│   ├── engine.ts                  ← orchestrates per-company sync
│   ├── adapters/
│   │   ├── ghl.ts                 ← GHL agency + location sync
│   │   ├── teamwork.ts            ← Teamwork projects + budgets
│   │   ├── readai.ts              ← Read.ai meetings + transcripts
│   │   └── gdrive.ts              ← Google Drive folder scan
│   └── utils/
│       ├── rateLimit.ts           ← exponential backoff + 429 handling
│       └── logger.ts              ← structured logging to DB
├── db/
│   ├── schema.sql                 ← full SQLite schema
│   ├── migrations/                ← versioned migrations
│   │   ├── 001_initial.sql
│   │   └── ...
│   └── client.ts                  ← better-sqlite3 wrapper + helpers
├── data/
│   ├── ops-hub.db                 ← SQLite database (gitignored)
│   └── .gitkeep
├── .env.example
├── .env                           ← actual credentials (gitignored)
├── package.json
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── CLAUDE.md
└── README.md
```

---

## DATA SOURCES + SYNC ADAPTERS

### 1. GHL (GoHighLevel)

#### Auth

Two token types needed:

| Token | Purpose | Scope |
|---|---|---|
| Agency API key OR Agency OAuth token | List all sub-accounts (locations) | `GET /locations/search` |
| Private Integration Token (per location) OR Location Access Token (via OAuth exchange) | Per-location contacts, messages, users | Location-scoped bearer |

**Preferred approach:** Use the existing OAuth flow from Campaign Success. Exchange the agency-level token for location-scoped tokens via `POST /oauth/locationToken` per the existing `LESSONS.md` pattern.

**Fallback:** If the Restoration Inbound Private Integration Token (`GHL_RI_TOKEN`) is the only available credential for contact-level data, use it for the Restoration Inbound location and rely on the agency token for sub-account listing only.

#### What to sync

**Sub-accounts (locations):**
- `GET /locations/search` with company ID `fhrGiUKTIN4dmRk5cRq2`
- Paginate fully (known pagination bug — fetch all pages until empty)
- Store: location ID, name, timezone, status

**Contacts per location:**
- `GET /contacts/?locationId={id}&limit=100` — paginate via `startAfterId`
- For Restoration Inbound specifically: filter `tags[]=client` for client roster
- Store: contact ID, name, email, phone, tags, assigned user, `dateAdded`, `dateUpdated`, `dateOfLastActivity`

**Messages per contact (for communication SLA):**
- `GET /conversations/search?contactId={id}` → get conversation ID
- `GET /conversations/{conversationId}/messages` → get message list
- Store: message ID, contact ID, direction (inbound/outbound), timestamp, type (SMS, email, etc.)
- **Critical metric:** `last_outbound_message_at` per contact — this drives the 7-day SLA

**Users per location:**
- `GET /locations/{locationId}/users`
- Cache for assigned-to name resolution

#### Sync cadence

- **Full sub-account list:** Once per day (first sync of the day)
- **Contacts + messages:** Every 2 hours during window
- **Incremental:** Use `dateUpdated` filter where GHL supports it; otherwise full pagination with upsert

#### Rate limiting

- GHL rate limits: ~100 req/min per location token
- Add 100ms delay between paginated requests
- Exponential backoff on 429 (max 5 retries, jitter)
- Hard stop: 500 contacts per location per sync cycle (log warning if exceeded)

---

### 2. Teamwork

#### Auth

| Token | Purpose |
|---|---|
| `TEAMWORK_API_KEY` | Bearer token for Teamwork v3 API |
| `TEAMWORK_SITE` | Subdomain (e.g., `logicinbound`) |

Base URL: `https://{TEAMWORK_SITE}.teamwork.com/`

#### What to sync

**Projects (active):**
- `GET /projects.json?status=active`
- Store: project ID, name, status, company name, budget fields

**Budget per project:**
- Budget fields from the project object or `GET /projects/{id}.json`
- Store: `total_budget`, `budget_used`, `budget_used_percent`
- If Teamwork only exposes hours: store hours and compute dollar value if rate is known

**Tasks per project (counts):**
- `GET /projects/{id}/tasks.json` — paginate and count
- Or use `GET /projects/{id}/tasks/count.json` if available
- Store: total tasks, completed tasks, active tasks

**Time entries (optional, Phase 2):**
- `GET /projects/{id}/time_entries.json` for burn rate calculation

#### Matching to GHL locations

Match Teamwork projects to GHL locations by:
1. Exact match: `teamwork_project.company_name` → `ghl_accounts.client_name`
2. Slug match: normalize both to slugs and compare
3. Manual override: stored in `company_links` table

---

### 3. Read.ai

#### Auth

| Token | Purpose |
|---|---|
| `READAI_API_KEY` | Bearer token for Read.ai API |

#### What to sync

**Meetings:**
- List recent meetings (last 30 days)
- Store: meeting ID, title, date, duration, participants, summary

**Action items:**
- Per-meeting action items
- Store: action item text, assignee, status, due date

**Matching to companies:**
- Match meetings to companies via participant email domains
- e.g., participant `john@acmerestore.com` → match to Acme Restoration by domain
- Store domain-to-company mapping in `company_domains` table
- Manual override available in Settings

#### Sync cadence

- Every 2 hours with other syncs
- Only pull meetings from last 7 days (rolling window)

---

### 4. Google Drive

#### Auth

| Token | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | Service account credentials file |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Root client folders parent |

#### What to sync

**Client folders:**
- List folders under parent folder ID
- Match folder names to company names
- Store: folder ID, name, URL, file count, last modified date

**Recent files per folder (metadata only):**
- `GET /files?q='{folderId}' in parents` with `orderBy=modifiedTime desc`
- Top 20 most recent files per client folder
- Store: file ID, name, MIME type, modified date, size
- No file content download — metadata only for v1

#### Sync cadence

- Every 2 hours with other syncs
- Change detection via Drive API `changes` endpoint with stored page token

---

## DATABASE SCHEMA (SQLite)

### Core tables

```sql
-- Company/location master list
CREATE TABLE companies (
  id                    TEXT PRIMARY KEY,         -- UUID
  ghl_location_id       TEXT UNIQUE,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  timezone              TEXT DEFAULT 'America/Chicago',
  status                TEXT DEFAULT 'active',    -- active | inactive | offboarded

  -- Linked IDs
  teamwork_project_id   TEXT,
  teamwork_project_name TEXT,
  drive_folder_id       TEXT,
  drive_folder_url      TEXT,
  discord_channel_id    TEXT,

  -- Computed SLA fields (updated on each sync)
  sla_status            TEXT DEFAULT 'ok',        -- ok | warning | violation
  sla_days_since_contact INTEGER,
  sla_last_outbound_at  TEXT,

  -- Teamwork budget snapshot
  tw_total_budget       REAL,
  tw_budget_used        REAL,
  tw_budget_used_pct    REAL,
  tw_total_tasks        INTEGER DEFAULT 0,
  tw_completed_tasks    INTEGER DEFAULT 0,
  tw_active_tasks       INTEGER DEFAULT 0,

  -- Counts (updated on sync)
  contacts_total        INTEGER DEFAULT 0,
  contacts_client_tag   INTEGER DEFAULT 0,
  messages_total        INTEGER DEFAULT 0,
  messages_last_7d      INTEGER DEFAULT 0,
  meetings_last_30d     INTEGER DEFAULT 0,
  drive_files_total     INTEGER DEFAULT 0,

  -- Timestamps
  last_synced_at        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_sla ON companies(sla_status);
```

```sql
-- GHL contacts
CREATE TABLE contacts (
  id                    TEXT PRIMARY KEY,         -- UUID
  ghl_contact_id        TEXT UNIQUE NOT NULL,
  company_id            TEXT NOT NULL REFERENCES companies(id),
  ghl_location_id       TEXT NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  tags                  TEXT,                     -- JSON array
  assigned_to_id        TEXT,
  assigned_to_name      TEXT,
  source                TEXT,

  -- Communication tracking
  last_outbound_at      TEXT,                     -- last outbound message timestamp
  last_inbound_at       TEXT,                     -- last inbound message timestamp
  last_any_message_at   TEXT,                     -- most recent message either direction
  days_since_outbound   INTEGER,                  -- computed on sync
  sla_status            TEXT DEFAULT 'ok',        -- ok | warning | violation
  message_count_7d      INTEGER DEFAULT 0,
  message_count_30d     INTEGER DEFAULT 0,

  -- GHL metadata
  date_added            TEXT,
  date_updated          TEXT,
  date_of_last_activity TEXT,

  -- Deep link
  contact_url           TEXT,

  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_sla ON contacts(sla_status);
CREATE INDEX idx_contacts_last_outbound ON contacts(last_outbound_at);
```

```sql
-- GHL messages (for SLA computation)
CREATE TABLE messages (
  id                    TEXT PRIMARY KEY,         -- UUID
  ghl_message_id        TEXT UNIQUE NOT NULL,
  contact_id            TEXT NOT NULL REFERENCES contacts(id),
  company_id            TEXT NOT NULL REFERENCES companies(id),
  conversation_id       TEXT,
  direction             TEXT NOT NULL,            -- inbound | outbound
  type                  TEXT,                     -- sms | email | call | fb | ig | etc
  body_preview          TEXT,                     -- first 200 chars (no full body needed)
  message_at            TEXT NOT NULL,            -- message timestamp
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_company ON messages(company_id);
CREATE INDEX idx_messages_direction_time ON messages(direction, message_at);
```

```sql
-- Teamwork projects
CREATE TABLE teamwork_projects (
  id                    TEXT PRIMARY KEY,
  teamwork_project_id   TEXT UNIQUE NOT NULL,
  company_id            TEXT REFERENCES companies(id),
  name                  TEXT NOT NULL,
  status                TEXT,                     -- active | archived | etc
  total_budget          REAL,
  budget_type           TEXT,                     -- hours | dollars
  budget_used           REAL,
  budget_used_pct       REAL,
  total_tasks           INTEGER DEFAULT 0,
  completed_tasks       INTEGER DEFAULT 0,
  active_tasks          INTEGER DEFAULT 0,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tw_projects_company ON teamwork_projects(company_id);
```

```sql
-- Read.ai meetings
CREATE TABLE meetings (
  id                    TEXT PRIMARY KEY,
  readai_meeting_id     TEXT UNIQUE NOT NULL,
  company_id            TEXT REFERENCES companies(id),  -- matched via domain
  title                 TEXT,
  meeting_date          TEXT NOT NULL,
  duration_minutes      INTEGER,
  participants          TEXT,                     -- JSON array of {name, email}
  summary               TEXT,
  transcript_url        TEXT,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_meetings_company ON meetings(company_id);
CREATE INDEX idx_meetings_date ON meetings(meeting_date);
```

```sql
-- Read.ai action items
CREATE TABLE action_items (
  id                    TEXT PRIMARY KEY,
  meeting_id            TEXT NOT NULL REFERENCES meetings(id),
  company_id            TEXT REFERENCES companies(id),
  text                  TEXT NOT NULL,
  assignee              TEXT,
  status                TEXT DEFAULT 'open',      -- open | done
  due_date              TEXT,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX idx_action_items_status ON action_items(status);
```

```sql
-- Google Drive file metadata
CREATE TABLE drive_files (
  id                    TEXT PRIMARY KEY,
  drive_file_id         TEXT UNIQUE NOT NULL,
  company_id            TEXT REFERENCES companies(id),
  folder_id             TEXT,
  file_name             TEXT NOT NULL,
  mime_type             TEXT,
  size_bytes            INTEGER,
  modified_at           TEXT,
  web_view_url          TEXT,
  synced_at             TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_drive_files_company ON drive_files(company_id);
```

```sql
-- Company-to-domain mapping (for Read.ai matching)
CREATE TABLE company_domains (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id),
  domain                TEXT NOT NULL UNIQUE,      -- e.g. "acmerestore.com"
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```sql
-- Cross-source linking overrides
CREATE TABLE company_links (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id),
  source                TEXT NOT NULL,             -- teamwork | readai | gdrive
  external_id           TEXT NOT NULL,             -- project ID, domain, folder ID
  linked_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, source)
);
```

### Sync infrastructure tables

```sql
-- Sync run log
CREATE TABLE sync_runs (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT,                      -- NULL for full-portfolio syncs
  company_name          TEXT,
  trigger               TEXT NOT NULL,             -- scheduled | manual
  adapter               TEXT NOT NULL,             -- ghl | teamwork | readai | gdrive | all
  status                TEXT NOT NULL DEFAULT 'running',  -- running | success | partial | failed
  started_at            TEXT NOT NULL,
  ended_at              TEXT,

  -- Counts
  items_found           INTEGER DEFAULT 0,
  items_created         INTEGER DEFAULT 0,
  items_updated         INTEGER DEFAULT 0,
  items_failed          INTEGER DEFAULT 0,
  net_new_contacts      INTEGER DEFAULT 0,
  net_new_messages      INTEGER DEFAULT 0,

  -- Error info
  error                 TEXT,
  error_detail          TEXT,

  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_runs_company ON sync_runs(company_id);
CREATE INDEX idx_sync_runs_status ON sync_runs(status);
CREATE INDEX idx_sync_runs_time ON sync_runs(started_at DESC);
```

```sql
-- Sync alerts (stale syncs, failures)
CREATE TABLE sync_alerts (
  id                    TEXT PRIMARY KEY,
  alert_type            TEXT NOT NULL,             -- stale_sync | sync_failed | sla_violation
  severity              TEXT NOT NULL,             -- info | warning | critical
  title                 TEXT NOT NULL,
  message               TEXT,
  company_id            TEXT,
  adapter               TEXT,
  acknowledged          INTEGER DEFAULT 0,
  acknowledged_at       TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_alerts_unacked ON sync_alerts(acknowledged, created_at DESC);
```

```sql
-- Integration credentials metadata (actual secrets in .env)
CREATE TABLE integrations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,       -- ghl | teamwork | readai | gdrive
  display_name          TEXT NOT NULL,
  status                TEXT DEFAULT 'not_configured',  -- configured | connected | error | not_configured
  env_keys              TEXT NOT NULL,              -- JSON array of env key names
  last_tested_at        TEXT,
  last_error            TEXT,
  config_json           TEXT,                       -- non-secret config (company IDs, site names, etc.)
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```sql
-- App state (scheduler state, page tokens, etc.)
CREATE TABLE app_state (
  key                   TEXT PRIMARY KEY,
  value                 TEXT NOT NULL,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## SYNC ENGINE DESIGN

### Scheduler (node-cron in main process)

```typescript
// sync/scheduler.ts
import cron from 'node-cron';

// Every 2 hours from 6 AM to 8 PM CT (UTC: 11:00 to 01:00 next day)
// CT = UTC-6 (CST) or UTC-5 (CDT)
// Cron in local time: 6,8,10,12,14,16,18,20
const SYNC_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];

export function startScheduler() {
  // Full portfolio sync at scheduled hours
  cron.schedule('0 6,8,10,12,14,16,18,20 * * 1-5', async () => {
    await runFullSync('scheduled');
  }, { timezone: 'America/Chicago' });

  // Stale sync check every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await checkStaleSyncs();
  });

  // SLA computation every hour
  cron.schedule('0 * * * *', async () => {
    await computeSLAFlags();
  });
}
```

### Full sync flow

```
1.  Create sync_runs row (trigger=scheduled, adapter=all, status=running)
2.  GHL: Fetch all locations → upsert companies table
3.  For each active company:
    a.  GHL: Fetch contacts → upsert contacts table
    b.  GHL: For each contact tagged "client":
        - Fetch conversation → messages
        - Upsert messages table
        - Compute last_outbound_at, days_since_outbound
    c.  Teamwork: Fetch matched project → budget, tasks
    d.  Read.ai: Fetch meetings matched by domain
    e.  Google Drive: Fetch matched folder → recent files
    f.  Compute SLA flags
    g.  Update companies roll-up fields
4.  Update sync_runs (status=success|partial|failed, counts)
5.  Check for stale syncs → create alerts
```

### Per-company manual sync

```
1.  UI sends IPC: syncCompany(companyId)
2.  Create sync_runs row (trigger=manual, company_id=X)
3.  Run steps 3a–3g for just that company
4.  Update sync_runs
5.  Send IPC progress events back to renderer:
    - { phase: 'ghl_contacts', progress: 45, found: 23 }
    - { phase: 'ghl_messages', progress: 60, found: 187 }
    - { phase: 'teamwork', progress: 80, found: 1 }
    - { phase: 'complete', success: true }
6.  Renderer shows progress bar + counts
```

### Communication SLA computation

```typescript
// Called after message sync for each client-tagged contact
function computeContactSLA(contact: Contact): SLAStatus {
  const daysSince = contact.days_since_outbound;

  if (daysSince === null || daysSince === undefined) {
    return 'violation';  // never contacted
  }
  if (daysSince > 7) {
    return 'violation';  // past 7-day window
  }
  if (daysSince > 5) {
    return 'warning';    // approaching deadline
  }
  return 'ok';
}

// Company-level SLA: worst SLA of any client-tagged contact
function computeCompanySLA(contacts: Contact[]): SLAStatus {
  const clientContacts = contacts.filter(c =>
    JSON.parse(c.tags || '[]').includes('client')
  );
  if (clientContacts.some(c => c.sla_status === 'violation')) return 'violation';
  if (clientContacts.some(c => c.sla_status === 'warning')) return 'warning';
  return 'ok';
}
```

### Stale sync alerting

```typescript
async function checkStaleSyncs() {
  const thresholds = {
    warning_hours: 12,
    critical_hours: 24,
    emergency_hours: 48,
  };

  const lastRun = db.prepare(`
    SELECT MAX(ended_at) as last_sync
    FROM sync_runs
    WHERE status IN ('success', 'partial')
      AND adapter = 'all'
  `).get();

  const hoursSince = /* compute hours since last_sync */;

  if (hoursSince >= thresholds.emergency_hours) {
    createAlert('stale_sync', 'critical',
      `No successful sync in ${Math.round(hoursSince)} hours`,
      `Last sync: ${lastRun.last_sync}. Check sync/scheduler.ts and sync logs.`
    );
  } else if (hoursSince >= thresholds.critical_hours) {
    createAlert('stale_sync', 'warning', ...);
  }

  // Per-adapter staleness check
  for (const adapter of ['ghl', 'teamwork', 'readai', 'gdrive']) {
    const lastAdapterRun = /* query last successful run for this adapter */;
    if (/* stale */) {
      createAlert('stale_sync', 'warning',
        `${adapter} sync hasn't run in ${hours}h`,
        `Check the ${adapter} adapter. Last run: ${lastAdapterRun}.`
      );
    }
  }
}
```

---

## RATE LIMITING UTILITY

```typescript
// sync/utils/rateLimit.ts
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 5, baseDelayMs = 200, maxDelayMs = 30000, onRetry } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      if (err?.status === 429 || err?.message?.includes('rate limit')) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        );
        onRetry?.(attempt + 1, err);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err; // non-retryable error
      }
    }
  }
  throw new Error('Unreachable');
}

// Inter-request delay
export function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
```

---

## IPC BRIDGE

### Preload (contextBridge)

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // DB queries
  getCompanies: (filters?: any) => ipcRenderer.invoke('db:getCompanies', filters),
  getCompany: (id: string) => ipcRenderer.invoke('db:getCompany', id),
  getContacts: (companyId: string) => ipcRenderer.invoke('db:getContacts', companyId),
  getMessages: (contactId: string) => ipcRenderer.invoke('db:getMessages', contactId),
  getMeetings: (companyId: string) => ipcRenderer.invoke('db:getMeetings', companyId),
  getDriveFiles: (companyId: string) => ipcRenderer.invoke('db:getDriveFiles', companyId),
  getSyncLogs: (filters?: any) => ipcRenderer.invoke('db:getSyncLogs', filters),
  getAlerts: (unackedOnly?: boolean) => ipcRenderer.invoke('db:getAlerts', unackedOnly),
  acknowledgeAlert: (id: string) => ipcRenderer.invoke('db:acknowledgeAlert', id),

  // Sync triggers
  syncCompany: (companyId: string) => ipcRenderer.invoke('sync:company', companyId),
  syncAll: () => ipcRenderer.invoke('sync:all'),
  onSyncProgress: (cb: (event: any, data: any) => void) =>
    ipcRenderer.on('sync:progress', cb),
  offSyncProgress: (cb: any) =>
    ipcRenderer.removeListener('sync:progress', cb),

  // Settings
  getIntegrations: () => ipcRenderer.invoke('settings:getIntegrations'),
  testIntegration: (name: string) => ipcRenderer.invoke('settings:testIntegration', name),
  saveIntegration: (name: string, config: any) =>
    ipcRenderer.invoke('settings:saveIntegration', name, config),
  getEnvValue: (key: string) => ipcRenderer.invoke('settings:getEnvValue', key),
  setEnvValue: (key: string, value: string) =>
    ipcRenderer.invoke('settings:setEnvValue', key, value),
});
```

---

## SETTINGS / INTEGRATIONS TAB

### .env management

The Settings page reads and writes the `.env` file through IPC:

```typescript
// electron/ipc/settings.ts
import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'dotenv';
import path from 'path';

const ENV_PATH = path.join(app.getPath('userData'), '.env');

function readEnv(): Record<string, string> {
  try {
    return parse(readFileSync(ENV_PATH, 'utf-8'));
  } catch { return {}; }
}

function writeEnv(env: Record<string, string>) {
  const lines = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(ENV_PATH, lines, 'utf-8');
}

ipcMain.handle('settings:setEnvValue', (_, key: string, value: string) => {
  const env = readEnv();
  env[key] = value;
  writeEnv(env);
  // Reload in-memory config
  process.env[key] = value;
  return { success: true };
});
```

### Integration cards

| Integration | Env Keys | Test Action |
|---|---|---|
| **GHL Agency** | `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_COMPANY_ID` | `GET /locations/search` → check returns locations |
| **GHL Restoration Inbound** | `GHL_RI_TOKEN`, `GHL_RI_LOCATION_ID` | `GET /contacts/?locationId=...&limit=1` → check 200 |
| **Teamwork** | `TEAMWORK_API_KEY`, `TEAMWORK_SITE` | `GET /projects.json?status=active&pageSize=1` → check 200 |
| **Read.ai** | `READAI_API_KEY` | `GET /meetings?limit=1` → check 200 |
| **Google Drive** | `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`, `GOOGLE_DRIVE_PARENT_FOLDER_ID` | List files in parent folder → check returns results |

Each card shows:
- Integration name and icon
- Status badge: Connected (green) / Error (red) / Not Configured (gray)
- Masked credential inputs with Reveal toggle
- [Test Connection] button
- [Save] button (writes to .env via IPC)
- Last tested timestamp
- Last error message (if any)

---

## FRONTEND PAGES

### 1. Portfolio Overview (`/`)

**Purpose:** All-company table with SLA, budget, and sync status at a glance.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Client Ops Hub                               🟢 Last sync: 22 min ago   │
│                                               3 alerts (1 critical)      │
├───────────────────────────────────────────────────────────────────────────┤
│  [Search...]  [SLA: All ▾]  [Status: Active ▾]  Showing 47 companies    │
├────────────────┬──────────┬──────────┬────────────┬──────────┬───────────┤
│  Company       │ SLA      │ Contacts │ TW Budget  │ Messages │ Last Sync │
│                │          │          │            │  (7d)    │           │
├────────────────┼──────────┼──────────┼────────────┼──────────┼───────────┤
│  Acme Restore  │ 🔴 9d    │  34      │ ████░ 78%  │   12     │  22m ago  │
│  Blue Sky      │ 🟡 6d    │  18      │ ██░░░ 42%  │    3     │  22m ago  │
│  Delta Roof    │ 🟢 2d    │  56      │ █████ 95%  │   28     │  22m ago  │
│  Echo Plumb    │ 🔴 14d   │   8      │ ░░░░░  0%  │    0     │  22m ago  │
│  ...           │          │          │            │          │           │
└────────────────┴──────────┴──────────┴────────────┴──────────┴───────────┘
```

**Columns:**
| Column | Description |
|---|---|
| Company | Name, links to Company Detail page |
| SLA | Worst days-since-outbound of any client-tagged contact. 🟢 ≤5d, 🟡 6-7d, 🔴 >7d |
| Contacts | Total contacts in GHL sub-account |
| TW Budget | Progress bar showing Teamwork budget used %. Red >90%, amber >75% |
| Messages (7d) | Count of messages (all directions) in last 7 days |
| Last Sync | Relative time since last successful sync for this company |

**Sorting:** Click column headers. Default: SLA descending (worst first).

**Filters:**
- SLA: All / OK / Warning / Violation
- Status: Active / Inactive / All
- Search: fuzzy on company name

---

### 2. Company Detail (`/company/:id`)

**Purpose:** Deep dive into a single company's operational health.

**Header:**
```
┌───────────────────────────────────────────────────────────────────┐
│  ← Back     Acme Restoration Co                [Sync Now ↻]     │
│  SLA: 🔴 9 days since last outbound    Last sync: 22 min ago     │
│  GHL: acme-restoration  │  TW: Acme Project  │  Drive: 📁 Open  │
└───────────────────────────────────────────────────────────────────┘
```

**Tabs:**

**Contacts tab:**
```
┌─────────────────┬────────────┬──────────────┬─────────────────┬──────────┐
│  Name           │  Phone     │  Last Outbound│ Days Since     │  SLA     │
├─────────────────┼────────────┼──────────────┼─────────────────┼──────────┤
│  John Smith     │ 555-1234   │  Mar 10      │  9 days         │  🔴      │
│  Jane Doe       │ 555-5678   │  Mar 17      │  2 days         │  🟢      │
└─────────────────┴────────────┴──────────────┴─────────────────┴──────────┘
```
Clicking a contact opens inline message timeline.

**Messages tab:**
- Chronological message timeline (most recent first)
- Filterable by direction (inbound/outbound/all)
- Shows: timestamp, direction arrow, type badge, preview text
- Grouped by contact

**Teamwork tab:**
```
┌───────────────────────────────────────────────┐
│  Budget: $4,200 / $5,400  (78%)               │
│  ████████████████████░░░░░                     │
│                                                │
│  Tasks: 12 active  |  34 completed  |  46 total│
└───────────────────────────────────────────────┘
```

**Meetings tab (Read.ai):**
- List of meetings matched to this company
- Shows: date, title, duration, participants count
- Expandable: summary text + action items

**Documents tab (Drive):**
- Recent files from matched Drive folder
- Shows: file name, type icon, modified date, size
- Click opens in Google Drive (web_view_url)

---

### 3. Sync Logs (`/logs`)

**Purpose:** Full audit trail of every sync run.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Sync Logs                                                            │
├──────────┬──────────┬─────────┬───────┬────────┬──────────┬───────────┤
│  Time    │ Trigger  │ Adapter │ Scope │ Status │ Items    │ Duration  │
├──────────┼──────────┼─────────┼───────┼────────┼──────────┼───────────┤
│  14:02   │ sched    │ all     │ full  │ ✅      │ 47 co    │ 8m 32s   │
│          │          │         │       │        │ +12 msg  │           │
│  12:15   │ manual   │ all     │ Acme  │ ✅      │ 34 ctc   │ 1m 04s   │
│          │          │         │       │        │ +5 msg   │           │
│  12:00   │ sched    │ all     │ full  │ ⚠️      │ 46/47 co │ 9m 11s   │
│          │          │         │       │        │ 1 fail   │           │
│  10:00   │ sched    │ all     │ full  │ ✅      │ 47 co    │ 7m 58s   │
└──────────┴──────────┴─────────┴───────┴────────┴──────────┴───────────┘
```

**Detail view (click a row):**
- Full error messages and stack traces for failures
- Per-adapter breakdown of what was fetched
- Advisory: "Check sync/adapters/ghl.ts" for failures

**Alert panel (top of page):**
- Unacknowledged alerts with severity badges
- "Acknowledge" button dismisses alert
- Alert types: stale_sync, sync_failed, sla_violation

---

### 4. Settings (`/settings`)

**Purpose:** Manage all integration credentials and app configuration.

**Sections:**

1. **Integrations** — one card per data source (GHL, Teamwork, Read.ai, Drive) as described above

2. **Sync Schedule**
   - Display current schedule (6 AM–8 PM CT, every 2 hours, weekdays)
   - Toggle: Enable/disable auto-sync
   - Override: next manual sync time

3. **SLA Configuration**
   - Warning threshold: default 5 days
   - Violation threshold: default 7 days
   - Editable, saved to `app_state` table

4. **Company Linking**
   - Table of companies with their linked Teamwork project, Drive folder, Read.ai domain
   - Click to manually override any link

5. **App Info**
   - Version, database path, data directory
   - [Open Data Folder] button
   - [Reset Database] button (with confirm dialog)

---

## ELECTRON CONFIGURATION

### Main process entry

```typescript
// electron/main.ts
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { startScheduler } from '../sync/scheduler';
import { initDB } from '../db/client';
import { registerIPCHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Client Ops Hub',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load Vite dev server
  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../assets/tray-icon.png')
  );
  tray = new Tray(icon);
  tray.setToolTip('Client Ops Hub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => mainWindow?.show() },
    { label: 'Sync Now', click: () => runFullSync('manual') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

app.whenReady().then(async () => {
  initDB();
  registerIPCHandlers();
  createTray();
  await createWindow();
  startScheduler();
});

// Keep app running in tray
app.on('window-all-closed', (e: Event) => e.preventDefault());
```

### Build configuration

```yaml
# electron-builder.yml
appId: com.logicinbound.client-ops-hub
productName: Client Ops Hub
win:
  target: nsis
  icon: assets/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
directories:
  output: release
files:
  - dist/**/*
  - electron/**/*
  - sync/**/*
  - db/**/*
  - assets/**/*
  - node_modules/**/*
extraResources:
  - from: data/
    to: data/
```

### Package.json scripts

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsc -w -p tsconfig.electron.json\" \"electron .\"",
    "build": "vite build && tsc -p tsconfig.electron.json",
    "package": "npm run build && electron-builder --win",
    "db:migrate": "tsx db/migrate.ts",
    "db:reset": "tsx db/reset.ts",
    "sync:now": "tsx sync/cli.ts --full",
    "sync:company": "tsx sync/cli.ts --company",
    "status": "tsx sync/cli.ts --status"
  }
}
```

---

## .ENV EXAMPLE

```bash
# === GHL Agency ===
GHL_CLIENT_ID=
GHL_CLIENT_SECRET=
GHL_COMPANY_ID=fhrGiUKTIN4dmRk5cRq2
GHL_REDIRECT_URI=http://localhost:3847/oauth/callback

# === GHL Restoration Inbound (Private Integration Token) ===
GHL_RI_TOKEN=
GHL_RI_LOCATION_ID=g6zCuamu3IQlnY1ympGx

# === Teamwork ===
TEAMWORK_API_KEY=
TEAMWORK_SITE=logicinbound

# === Read.ai ===
READAI_API_KEY=

# === Google Drive ===
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./credentials/service-account.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=

# === Sync Schedule ===
SYNC_START_HOUR=6
SYNC_END_HOUR=20
SYNC_INTERVAL_HOURS=2
SYNC_TIMEZONE=America/Chicago
SYNC_WEEKDAYS_ONLY=true

# === SLA Thresholds ===
SLA_WARNING_DAYS=5
SLA_VIOLATION_DAYS=7

# === Alert Thresholds ===
ALERT_STALE_WARNING_HOURS=12
ALERT_STALE_CRITICAL_HOURS=24
ALERT_STALE_EMERGENCY_HOURS=48
```

---

## BUILD ORDER

1. **Project scaffold** — Electron + Vite + React + TypeScript + Tailwind boilerplate
2. **SQLite schema** — all tables, indexes, migrations runner
3. **IPC bridge** — preload, main-process handlers, typed client
4. **Settings page** — .env read/write, integration cards, test connection
5. **GHL adapter** — sub-account listing, contacts, messages sync
6. **SLA computation** — 7-day outbound tracking, contact + company flags
7. **Portfolio page** — all-company table with SLA badges, budget bars
8. **Company detail page** — contacts, messages timeline, SLA drill-down
9. **Teamwork adapter** — projects, budgets, tasks sync
10. **Read.ai adapter** — meetings, action items, domain matching
11. **Google Drive adapter** — folder scan, file metadata
12. **Sync scheduler** — node-cron, stale alerting, logging
13. **Sync logs page** — run history, error detail, alerts
14. **System tray** — minimize to tray, quick sync, quit
15. **Electron packaging** — installer via electron-builder

---

## ACCEPTANCE CRITERIA

### MVP (Ship This First)

- [ ] App launches, pins to Windows taskbar, minimizes to system tray
- [ ] Settings page shows all 4 integration cards with credential inputs
- [ ] Saving credentials writes to `.env` and reloads in-memory
- [ ] Test Connection button validates each integration
- [ ] GHL sync pulls all sub-accounts and populates companies table
- [ ] GHL sync pulls contacts + messages per location
- [ ] SLA computation flags contacts with >7 days since last outbound
- [ ] Portfolio table shows all companies with SLA badge, contact count, message count (7d)
- [ ] Company detail shows contacts with SLA status and message timeline
- [ ] Per-company Sync Now button triggers sync with progress feedback
- [ ] Auto-sync runs every 2 hours (6 AM–8 PM CT, weekdays)
- [ ] Sync logs page shows run history with item counts and errors
- [ ] Stale sync alert fires when no successful sync in 12+ hours
- [ ] Alert banner shows unacknowledged alerts in top bar

### Phase 2

- [ ] Teamwork adapter: budget bars, task counts on portfolio + company page
- [ ] Read.ai adapter: meetings matched to companies, action items
- [ ] Google Drive adapter: file metadata, recent docs on company page
- [ ] Company linking: manual override for Teamwork ↔ GHL ↔ Drive mapping
- [ ] SLA violation Discord webhook alert
- [ ] Export portfolio data to CSV
- [ ] Sync schedule customization from Settings
- [ ] Dark mode toggle

### Phase 3

- [ ] Offline-first: works without network, syncs when reconnected
- [ ] Embedded search across contacts, messages, meetings, files
- [ ] Trend charts: messages/week, SLA trend over 30d
- [ ] Notification toasts for completed syncs and new violations
- [ ] Auto-update via electron-updater

---

## KEY DIFFERENCES FROM CAMPAIGN SUCCESS

| Dimension | Campaign Success (CS) | Client Ops Hub (Local) |
|---|---|---|
| Hosting | Cloudflare Workers + Pages | Local Electron app |
| Database | Cloudflare D1 | Local SQLite |
| Auth | Cloudflare Access (Google OAuth) | None (single user, local) |
| Sync trigger | Cloudflare Cron + Queues | node-cron in main process |
| Users | Evan, Kyle, Hayk, COO | Kyle only |
| Data scope | Sub-accounts + ecosystem checks | Sub-accounts + messages + meetings + docs |
| SLA tracking | Not built yet | Core feature |
| Message-level data | Deferred/future | MVP |
| Teamwork budgets | Planned | MVP |
| Read.ai | Not planned for CS | Built-in |
| Google Drive | Folder existence check only | File metadata listing |

---

## RISK REGISTER

| Risk | Mitigation |
|---|---|
| GHL rate limits hit during 150-location full sync | Sequential processing with 100ms delays, backoff on 429, 15-min timeout per company |
| Read.ai API access or rate limits | Degrade gracefully — meetings panel shows "Not synced" instead of blocking |
| Message volume overwhelms SQLite | Only store last 90 days of messages, body_preview limited to 200 chars, periodic cleanup |
| .env file corruption from concurrent writes | Lock file during writes, write to temp then atomic rename |
| Electron auto-update complexity | Phase 3 — manual updates for now (rebuild + reinstall) |
| Long sync blocks UI | All sync runs in main process async; renderer stays responsive via IPC |
| GHL `meta.total` unreliable | Never trust meta.total — always paginate fully and count locally |
| PowerShell doesn't support && chaining | Use separate commands in npm scripts, semicolons in bash |
