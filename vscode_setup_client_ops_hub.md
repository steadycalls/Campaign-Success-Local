# VS CODE SETUP: Client Ops Hub — Rapid Build Guide

## 1. PREREQUISITES (install if missing)

Open PowerShell as admin and run each separately:

```powershell
# Node.js 20+ (if not installed)
winget install OpenJS.NodeJS.LTS

# Git (if not installed)
winget install Git.Git

# Python 3.11+ (needed for better-sqlite3 native compilation)
winget install Python.Python.3.11

# Windows Build Tools (needed for native Node modules like better-sqlite3)
npm install -g windows-build-tools
# OR if that fails, install Visual Studio Build Tools manually:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++" workload
```

Verify:
```powershell
node --version   # v20+
npm --version    # 10+
git --version
python --version # 3.11+
```

---

## 2. CREATE THE REPO

```powershell
cd C:\Users\kjrpu\Documents\2. LI\Claude
mkdir li-client-ops-hub
cd li-client-ops-hub
git init
```

---

## 3. VS CODE SETUP

### Open the project
```powershell
code .
```

### Required Extensions (install these now)

Open VS Code Extensions panel (Ctrl+Shift+X) and install:

| Extension | ID | Why |
|---|---|---|
| **ESLint** | `dbaeumer.vscode-eslint` | Catches errors in real-time |
| **Tailwind CSS IntelliSense** | `bradlc.vscode-tailwindcss` | Autocomplete for Tailwind classes |
| **TypeScript Importer** | `pmneo.tsimporter` | Auto-imports on type |
| **Prettier** | `esbenp.prettier-vscode` | Consistent formatting |
| **SQLite Viewer** | `qwtel.sqlite-viewer` | View ops-hub.db in VS Code |
| **Error Lens** | `usernamehw.errorlens` | Shows errors inline (huge time saver) |
| **Claude Code** | (if not installed) | Your prompt execution engine |

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "'([^']*)'"]
  ],
  "files.exclude": {
    "node_modules": true,
    "release": true,
    "dist": true
  },
  "search.exclude": {
    "node_modules": true,
    "release": true,
    "dist": true,
    "data/*.db": true
  },
  "editor.quickSuggestions": {
    "strings": "on"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Launch Configs

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron: Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": ["."],
      "env": {
        "NODE_ENV": "development"
      },
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/electron/**/*.js"]
    },
    {
      "name": "Electron: Renderer (Chrome)",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/src",
      "sourceMaps": true
    }
  ],
  "compounds": [
    {
      "name": "Electron: Full App",
      "configurations": ["Electron: Main", "Electron: Renderer (Chrome)"]
    }
  ]
}
```

### Task Runner

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Dev: Full App",
      "type": "shell",
      "command": "npm run dev",
      "isBackground": true,
      "problemMatcher": {
        "pattern": { "regexp": "." },
        "background": {
          "activeOnStart": true,
          "beginsPattern": ".",
          "endsPattern": "ready in"
        }
      },
      "group": { "kind": "build", "isDefault": true }
    },
    {
      "label": "Build: Production",
      "type": "shell",
      "command": "npm run build",
      "group": "build"
    },
    {
      "label": "Package: Windows Installer",
      "type": "shell",
      "command": "npm run package",
      "group": "build"
    },
    {
      "label": "DB: View Tables",
      "type": "shell",
      "command": "npx tsx db/inspect.ts",
      "group": "test"
    },
    {
      "label": "Sync: Manual Full",
      "type": "shell",
      "command": "npm run sync:now",
      "group": "test"
    }
  ]
}
```

---

## 4. TERMINAL LAYOUT

Use VS Code's split terminal for rapid dev. Set up 3 terminals:

**Terminal 1: Vite Dev Server** (Ctrl+`)
```powershell
npm run dev:renderer
# or: npx vite
```

**Terminal 2: Electron + TypeScript Watch**
```powershell
npx tsc -w -p tsconfig.electron.json
```

**Terminal 3: Electron Launch** (after Vite is ready)
```powershell
$env:NODE_ENV="development"; npx electron .
```

OR use the single command once package.json is set up:
```powershell
npm run dev
```

---

## 5. CLAUDE CODE INTEGRATION

### CLAUDE.md (project root)

This is already spec'd in the prompts. Claude Code reads this on every session start. The key is having it in the repo root so Claude Code auto-loads context.

### Running Prompts

Open Claude Code terminal in VS Code (if using the CLI):
```powershell
claude
```

Then paste Prompt 27 to start. Claude Code will:
1. Read CLAUDE.md for context
2. Create all files from the prompt
3. Run npm install
4. Verify the build

### Between Prompts — Validate

After each prompt completes, validate before moving to the next:

```powershell
# Prompt 27: Does the app open?
npm run dev

# Prompt 28: Do tables exist?
npx tsx db/inspect.ts
# Or open data/ops-hub.db with SQLite Viewer extension

# Prompt 29: Do settings save?
# Open app → Settings → type a value → Save → restart → check it loaded

# Prompt 30: Does sync work?
# Open app → Settings → add GHL credentials → Test Connection
# Then trigger a manual sync from the UI

# Prompt 31: Does data render?
# Check portfolio table and company detail after a sync

# Prompt 32-33: Do Teamwork/Read.ai/Drive adapters work?
# Add credentials in Settings → test → sync → verify

# Prompt 34: Does scheduler fire? Does packaging work?
npm run package
# Check release/ folder for installer
```

---

## 6. KEY FILES TO KEEP OPEN (VS Code tabs)

Pin these tabs for fast reference during the build:

1. `CLAUDE.md` — Claude Code reads this
2. `electron/main.ts` — main process entry
3. `electron/preload.ts` — IPC bridge
4. `src/App.tsx` — router + layout
5. `db/schema.sql` — full schema
6. `.env` — credentials (after Prompt 28)
7. `sync/engine.ts` — sync orchestrator (after Prompt 30)

---

## 7. KEYBOARD SHORTCUTS FOR SPEED

| Action | Shortcut |
|---|---|
| Open terminal | Ctrl+` |
| Split terminal | Ctrl+Shift+5 |
| Switch terminal | Ctrl+PageUp/PageDown |
| Go to file | Ctrl+P |
| Go to symbol | Ctrl+Shift+O |
| Find in all files | Ctrl+Shift+F |
| Open command palette | Ctrl+Shift+P |
| Run build task | Ctrl+Shift+B |
| Toggle sidebar | Ctrl+B |
| Quick fix (auto-import) | Ctrl+. |

---

## 8. .gitignore

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

---

## 9. EXECUTION PLAN FOR TODAY

### Morning (Prompts 27-28): Foundation — ~2 hours

```
1. Run Prompt 27 in Claude Code
   → Verify: npm run dev opens Electron with sidebar
   → Fix any Windows-specific issues (better-sqlite3 native build)

2. Run Prompt 28 in Claude Code
   → Verify: DB created, tables exist, IPC responds
   → Open ops-hub.db in SQLite Viewer to confirm tables
```

### Midday (Prompts 29-30): Settings + GHL Sync — ~3 hours

```
3. Run Prompt 29 in Claude Code
   → Verify: Settings page renders, .env saves/loads
   → Add your real GHL credentials, test connection

4. Run Prompt 30 in Claude Code
   → Verify: GHL sync pulls locations + contacts
   → Check contacts table in SQLite Viewer
   → Verify SLA computation on client-tagged contacts
   → This is the longest prompt — most API integration work
```

### Afternoon (Prompts 31-32): UI + Teamwork — ~2 hours

```
5. Run Prompt 31 in Claude Code
   → Verify: Portfolio table renders with real synced data
   → Verify: Company detail page shows contacts + SLA
   → Click through all tabs, confirm navigation

6. Run Prompt 32 in Claude Code
   → Verify: Teamwork projects synced and matched
   → Verify: Budget bars show on portfolio + company pages
```

### Evening (Prompts 33-34): Read.ai + Drive + Polish — ~2 hours

```
7. Run Prompt 33 in Claude Code
   → Verify: Read.ai meetings show (if API key available)
   → Verify: Drive folders listed
   → Skip if no Read.ai API key yet — can add later

8. Run Prompt 34 in Claude Code
   → Verify: Scheduler starts, logs page shows runs
   → Verify: npm run package creates installer
   → Install and pin to taskbar
```

---

## 10. COMMON WINDOWS GOTCHAS

### better-sqlite3 won't compile
```powershell
# Rebuild native modules for Electron
npx electron-rebuild
# Or specify the Electron version:
npx electron-rebuild --version 33.0.0
```

### Port 5173 in use
```powershell
npx kill-port 5173
```

### Electron won't load Vite dev server
Make sure Vite is running FIRST, then launch Electron. The `wait-on` package in the dev script handles this, but if running manually, wait for "ready in Xms" before starting Electron.

### PowerShell execution policy
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### .env not loading
Electron's main process needs dotenv loaded before anything else:
```typescript
// First line of electron/main.ts
import 'dotenv/config';
```
But for production, .env lives in `app.getPath('userData')`, not the repo root. The Settings page handles this.

---

## 11. CREDENTIALS TO HAVE READY

Before running Prompt 29, gather these:

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
