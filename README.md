# Campaign Success Local — Client Ops Hub

A local Electron desktop app for managing Logic Inbound's client operations. Syncs data from GHL sub-accounts, Teamwork, Read.ai, and Google Drive into a local SQLite database and renders a real-time operations dashboard with 7-day communication SLA tracking.

## What This Does

This application syncs every 2 hours (6 AM–8 PM CT, weekdays) from GHL, Teamwork, Read.ai, and Google Drive. It provides 7-day SLA tracking that flags client contacts who haven't received outbound communication within 7 days, a portfolio overview showing all companies in one table with SLA badges and Teamwork budget bars, and a company drilldown view with contacts, message timeline, Teamwork budget, meetings, and Drive documents per company. Per-company manual sync allows triggering a real-time sync from the UI, and stale sync alerting fires at 12h, 24h, and 48h if syncs stop running. A Settings tab manages all integration credentials from the UI (writes to `.env`), and the app minimizes to the system tray for background operation with a quick-sync option from the tray menu.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33+ |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS 3 |
| Database | SQLite via better-sqlite3 |
| Scheduler | node-cron |
| APIs | GHL v2, Teamwork v3, Read.ai, Google Drive v3 |

## Quick Start

### Prerequisites

Run the prerequisite checker (PowerShell as Admin):

```powershell
.\setup-environment.ps1
```

This checks for and installs: Node.js 20+, Git, Python 3.11+, C++ Build Tools, VS Code, and required VS Code extensions.

Or install manually:

| Dependency | Command |
|---|---|
| Node.js 20+ | `winget install OpenJS.NodeJS.LTS` |
| Python 3.11+ | `winget install Python.Python.3.11` |
| Git | `winget install Git.Git` |
| C++ Build Tools | [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) → select "Desktop development with C++" |

### Clone & Open

```powershell
cd C:\Users\kjrpu\Documents\2. LI\Claude
git clone https://github.com/steadycalls/Campaign-Success-Local.git
cd Campaign-Success-Local
code .
```

### Install Dependencies

Open the VS Code integrated terminal (`Ctrl+``):

```powershell
npm install
```

If `better-sqlite3` fails to compile:

```powershell
npx electron-rebuild
```

### Configure Credentials

Copy the example env file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in your credentials (or configure them later in the Settings tab):

```env
GHL_CLIENT_ID=your_client_id
GHL_CLIENT_SECRET=your_client_secret
GHL_COMPANY_ID=fhrGiUKTIN4dmRk5cRq2
GHL_RI_TOKEN=your_ri_token
GHL_RI_LOCATION_ID=g6zCuamu3IQlnY1ympGx
TEAMWORK_API_KEY=your_teamwork_key
TEAMWORK_SITE=logicinbound
READAI_API_KEY=your_readai_key
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./credentials/service-account.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=your_folder_id
```

### Run in Development

```powershell
npm run dev
```

This starts Vite (hot reload) + TypeScript watcher + Electron. The app window opens automatically.

### Build & Package

```powershell
npm run build       # Compile TypeScript + bundle React
npm run package     # Create Windows installer in release/
```

## Project Structure

```
Campaign-Success-Local/
├── electron/              ← Electron main process
│   ├── main.ts            ← App entry, window, tray
│   ├── preload.ts         ← Secure IPC bridge
│   ├── tray.ts            ← System tray icon + menu
│   └── ipc/               ← IPC handlers (db, sync, settings)
├── src/                   ← React renderer (frontend)
│   ├── pages/             ← Portfolio, Company, Logs, Settings
│   ├── components/        ← Reusable UI components
│   ├── hooks/             ← Data fetching hooks (IPC)
│   └── types/             ← Shared TypeScript types
├── sync/                  ← Sync engine (runs in main process)
│   ├── scheduler.ts       ← node-cron job setup
│   ├── engine.ts          ← Orchestrates per-company sync
│   ├── adapters/          ← GHL, Teamwork, Read.ai, Drive
│   └── utils/             ← Rate limiting, logging
├── db/                    ← SQLite schema + migrations
│   ├── schema.sql         ← Full database schema
│   ├── migrations/        ← Versioned SQL migrations
│   └── client.ts          ← better-sqlite3 wrapper
├── data/                  ← SQLite database (gitignored)
├── .vscode/               ← VS Code settings, tasks, launch configs
├── .env.example           ← Credential template
└── CLAUDE.md              ← Claude Code project context
```

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite + Electron with hot reload |
| `npm run build` | Compile for production |
| `npm run package` | Create Windows NSIS installer |
| `npm run sync:now` | Run full sync headless (no UI) |
| `npm run sync:company -- --id=X` | Sync a single company headless |
| `npm run status` | Show sync status and alert count |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:reset` | Reset database (destructive) |

## Data Sources

| Source | What's pulled | Auth |
|---|---|---|
| **GHL Agency** | Sub-accounts (locations), contacts, messages | OAuth client ID/secret |
| **GHL Restoration Inbound** | Client-tagged contacts, messages | Private integration token |
| **Teamwork** | Active projects, budgets, task counts | API key |
| **Read.ai** | Meetings, action items, transcripts | API key |
| **Google Drive** | Client folder metadata, recent files | Service account JSON |

## Sync Schedule

- **Auto-sync:** Every 2 hours at 6, 8, 10, 12, 14, 16, 18, 20 CT — weekdays only
- **Manual sync:** Per-company from the UI or full portfolio from tray menu
- **SLA recomputation:** Every hour
- **Stale sync check:** Every 30 minutes

## Architecture

All sync runs in the Electron main process (Node.js). The React renderer communicates via IPC through a secure `contextBridge`. No data leaves your machine — everything is stored in a local SQLite database.

```
React Renderer ←→ IPC Bridge ←→ Electron Main Process
                                    ├── Sync Engine
                                    │   ├── GHL Adapter
                                    │   ├── Teamwork Adapter
                                    │   ├── Read.ai Adapter
                                    │   └── Drive Adapter
                                    ├── SQLite Database
                                    └── Scheduler (node-cron)
```

## VS Code Setup

The repo includes preconfigured `.vscode/` settings. When you open the project, recommended extensions will auto-prompt — install all of them. `Ctrl+Shift+B` runs the default build task (`npm run dev`), `F5` launches Electron in debug mode, and the SQLite Viewer extension lets you click any `.db` file in the Explorer to inspect tables directly.

### Required Extensions

| Extension | What it does |
|---|---|
| ESLint | Real-time error checking |
| Tailwind CSS IntelliSense | Autocomplete for Tailwind classes |
| TypeScript Importer | Auto-imports on type |
| Prettier | Format on save |
| SQLite Viewer | View ops-hub.db tables in VS Code |
| Error Lens | Shows errors inline (huge time saver) |

## Build With Claude Code

This project is built via sequenced Claude Code prompts (27–34). Open Claude Code in the repo and run prompts in order:

| Prompt | What it builds |
|---|---|
| P27 | Electron + Vite + React scaffold |
| P28 | SQLite schema + IPC bridge |
| P29 | Settings page + .env management |
| P30 | GHL adapter + SLA computation |
| P31 | Portfolio + Company detail pages |
| P32 | Teamwork adapter |
| P33 | Read.ai + Google Drive adapters |
| P34 | Scheduler + sync logs + tray + packaging |

Validate each prompt before moving to the next.
