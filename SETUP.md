# VS Code Setup: Client Ops Hub — Rapid Build Guide

## 1. Prerequisites

Open PowerShell as Admin and run the prerequisite checker:

```powershell
.\setup-environment.ps1
```

This handles Node.js 20+, Git, Python 3.11+, C++ Build Tools, VS Code, and all required extensions automatically. If you prefer manual installs:

```powershell
# Node.js 20+
winget install OpenJS.NodeJS.LTS

# Git
winget install Git.Git

# Python 3.11+ (needed for better-sqlite3 native compilation)
winget install Python.Python.3.11

# Windows Build Tools (needed for native Node modules like better-sqlite3)
# If winget method fails, install Visual Studio Build Tools manually:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++" workload
```

Verify installs:

```powershell
node --version   # v20+
npm --version    # 10+
git --version
python --version # 3.11+
```

---

## 2. Clone the Repo

```powershell
cd C:\Users\kjrpu\Documents\2. LI\Claude
git clone https://github.com/steadycalls/Campaign-Success-Local.git
cd Campaign-Success-Local
```

---

## 3. Open in VS Code

```powershell
code .
```

VS Code will detect `.vscode/extensions.json` and prompt you to install all recommended extensions. Click **Install All** on the prompt.

### Required Extensions

| Extension | ID | Purpose |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Catches errors in real-time |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Autocomplete for Tailwind classes |
| TypeScript Importer | `pmneo.tsimporter` | Auto-imports on type |
| Prettier | `esbenp.prettier-vscode` | Consistent formatting |
| SQLite Viewer | `qwtel.sqlite-viewer` | View ops-hub.db in VS Code |
| Error Lens | `usernamehw.errorlens` | Shows errors inline |

---

## 4. Install Dependencies

Open the integrated terminal (`Ctrl+``):

```powershell
npm install
```

If `better-sqlite3` fails to compile (common on Windows without C++ Build Tools):

```powershell
npx electron-rebuild
# Or specify the Electron version:
npx electron-rebuild --version 33.0.0
```

---

## 5. Configure Credentials

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in your credentials. You can also configure these later via the Settings tab in the running app.

Before running Prompt 29, have these ready:

| Credential | Where to get it |
|---|---|
| `GHL_CLIENT_ID` | GHL Marketplace → Your App → Client ID |
| `GHL_CLIENT_SECRET` | GHL Marketplace → Your App → Client Secret |
| `GHL_COMPANY_ID` | `fhrGiUKTIN4dmRk5cRq2` (already known) |
| `GHL_RI_TOKEN` | GHL → Restoration Inbound → Settings → Integrations → Private Integration |
| `GHL_RI_LOCATION_ID` | `g6zCuamu3IQlnY1ympGx` (already known) |
| `TEAMWORK_API_KEY` | Teamwork → Profile → API & Webhooks |
| `TEAMWORK_SITE` | `logicinbound` (already known) |
| `READAI_API_KEY` | Read.ai → Settings → API |
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | Same service account from Control Tower |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Parent folder ID for client folders |

---

## 6. Start the Dev Server

```powershell
npm run dev
```

This starts Vite (hot reload) + TypeScript watcher + Electron. The app window opens automatically. You are now in position to fire Prompt 27 in Claude Code.

---

## 7. Terminal Layout for Rapid Dev

Use VS Code's split terminal for parallel processes. Three terminals recommended:

**Terminal 1: Vite Dev Server** (`Ctrl+```)
```powershell
npm run dev:renderer
```

**Terminal 2: Electron + TypeScript Watch**
```powershell
npx tsc -w -p tsconfig.electron.json
```

**Terminal 3: Electron Launch** (after Vite is ready)
```powershell
$env:NODE_ENV="development"; npx electron .
```

Or use the single combined command once `package.json` is set up:
```powershell
npm run dev
```

---

## 8. Claude Code Integration

### Running Prompts

Open Claude Code in the VS Code terminal:
```powershell
claude
```

Paste Prompt 27 to start. Claude Code will read `CLAUDE.md` for context, create all files from the prompt, run `npm install`, and verify the build.

### Validation Checklist Between Prompts

| Prompt | Validation |
|---|---|
| P27 | `npm run dev` — does the Electron window open with sidebar? |
| P28 | `npx tsx db/inspect.ts` — do tables exist? Open `ops-hub.db` in SQLite Viewer. |
| P29 | Settings page renders, `.env` saves/loads, credentials persist on restart. |
| P30 | GHL sync pulls locations + contacts. Check contacts table. SLA computation runs. |
| P31 | Portfolio table renders with real synced data. Company detail shows contacts + SLA. |
| P32 | Teamwork projects synced and matched. Budget bars show on portfolio + company pages. |
| P33 | Read.ai meetings show (if API key available). Drive folders listed. |
| P34 | Scheduler starts, logs page shows runs. `npm run package` creates installer in `release/`. |

---

## 9. Execution Plan

### Morning (Prompts 27–28): Foundation — ~2 hours

Run P27, verify Electron opens with sidebar. Fix any Windows-specific `better-sqlite3` native build issues. Run P28, verify DB created and tables exist via SQLite Viewer.

### Midday (Prompts 29–30): Settings + GHL Sync — ~3 hours

Run P29, verify Settings page renders and `.env` saves/loads. Add real GHL credentials and test connection. Run P30 — this is the longest prompt with the most API integration work. Verify GHL sync pulls locations and contacts, and SLA computation runs on client-tagged contacts.

### Afternoon (Prompts 31–32): UI + Teamwork — ~2 hours

Run P31, verify portfolio table renders with real synced data and company detail shows contacts + SLA. Click through all tabs. Run P32, verify Teamwork projects synced and budget bars show on both portfolio and company pages.

### Evening (Prompts 33–34): Read.ai + Drive + Polish — ~2 hours

Run P33, verify Read.ai meetings show (skip if no API key yet — can add later) and Drive folders listed. Run P34, verify scheduler starts, logs page shows runs, and `npm run package` creates the Windows installer. Install and pin to taskbar.

---

## 10. Common Windows Gotchas

**`better-sqlite3` won't compile:**
```powershell
npx electron-rebuild
```

**Port 5173 in use:**
```powershell
npx kill-port 5173
```

**Electron won't load Vite dev server:** Make sure Vite is running first, then launch Electron. The `wait-on` package in the dev script handles this automatically, but if running manually, wait for "ready in Xms" before starting Electron.

**PowerShell execution policy:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**`.env` not loading in Electron:** The main process needs dotenv loaded before anything else:
```typescript
// First line of electron/main.ts
import 'dotenv/config';
```
For production, `.env` lives in `app.getPath('userData')`, not the repo root. The Settings page handles this.

---

## 11. Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Open terminal | `Ctrl+`` ` |
| Split terminal | `Ctrl+Shift+5` |
| Switch terminal | `Ctrl+PageUp/PageDown` |
| Run build task | `Ctrl+Shift+B` |
| Go to file | `Ctrl+P` |
| Go to symbol | `Ctrl+Shift+O` |
| Find in all files | `Ctrl+Shift+F` |
| Open command palette | `Ctrl+Shift+P` |
| Toggle sidebar | `Ctrl+B` |
| Quick fix / auto-import | `Ctrl+.` |

---

## 12. Key Files to Keep Open

Pin these tabs for fast reference during the build:

1. `CLAUDE.md` — Claude Code reads this on every session start
2. `electron/main.ts` — main process entry
3. `electron/preload.ts` — IPC bridge
4. `src/App.tsx` — router + layout
5. `db/schema.sql` — full schema
6. `.env` — credentials (after Prompt 28)
7. `sync/engine.ts` — sync orchestrator (after Prompt 30)

---

## 13. .gitignore

```
node_modules/
dist/
release/
data/*.db
data/downloads/
.env
credentials/
*.js
*.js.map
*.d.ts
!vite.config.ts
!tailwind.config.js
!postcss.config.js
```
