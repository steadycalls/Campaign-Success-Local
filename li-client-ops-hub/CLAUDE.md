# Client Ops Hub

Hybrid Electron + Cloudflare app for Logic Inbound client operations.

## Stack
- **Local**: Electron 33+, React 18 + Vite + TypeScript, sql.js (SQLite), node-cron
- **Cloud**: Cloudflare Workers, D1 (SQLite at edge), wrangler CLI
- **Shared**: TypeScript types + SLA logic in `shared/`

## Dev
npm run dev — starts Vite + Electron with hot reload

## Architecture
- electron/ — main process (Node.js, IPC handlers)
- src/ — renderer (React, Tailwind CSS 3)
- sync/ — sync adapters + queue manager (8 adapters: GHL, Read.ai, GDrive, GCal, Kinsta, Teamwork, Discord, cloud push)
- db/ — sql.js wrapper + 26 migrations
- shared/ — platform-agnostic types, DB interface, SLA logic
- cloud/ — Cloudflare Worker API + D1 schema (read-only mirror)
- docs/ — migration plan + architecture docs

## Hybrid Model
Local app syncs FROM integrations (GHL, Read.ai, etc.) and pushes TO Cloudflare D1 every 5 min. Cloud Worker serves read-only API at the edge. See `docs/CLOUD_MIGRATION_PLAN.md` for the full migration path.

## IPC
All renderer <-> main communication via contextBridge.
Never use nodeIntegration. All DB/sync/file operations go through IPC.

## Data
SQLite database at data/ops-hub.db (gitignored).
Credentials in .env (gitignored).

## Build & Deploy
- `npm run build` — compiles Vite frontend + TypeScript electron backend
- `npm start` — launches production Electron app
- Always run `npm run build` before `npm start` after code changes
- Clear Vite cache if bundle doesn't update: `rm -rf dist node_modules/.vite && npm run build`

## Troubleshooting: "No Data Showing in App"

When the app opens but shows blank pages / no data, the cause is almost always a **TypeScript compile error** that prevents the Vite build from including the affected page.

### How to diagnose
```bash
npx tsc --noEmit          # checks frontend (src/) types
npx tsc --noEmit -p tsconfig.electron.json  # checks backend (electron/) types
```

If either command outputs errors, **fix them before building**. Vite will silently exclude modules that fail type resolution, causing blank pages with no console errors.

### Common causes
1. **Referencing a property that doesn't exist on a type** — e.g., `live.phase` when `SyncProgressSummary` has no `phase` field. Fix: use the correct property name from the interface.
2. **Importing a function that isn't exported** — e.g., using `ghlFetch` in queue manager when it wasn't exported from the adapter. Fix: add `export` to the function.
3. **Stale Vite cache** — sometimes Vite produces the same output hash even after source changes. Fix: `rm -rf dist node_modules/.vite` then rebuild.
4. **Migration table recreation** — migrations that recreate tables (e.g., 029_meetings) can drop columns that code depends on. Fix: ensure all columns are preserved in the INSERT...SELECT.

### Prevention checklist
Before every build:
1. Run `npx tsc --noEmit` — zero errors required
2. Run `npx tsc --noEmit -p tsconfig.electron.json` — zero errors required
3. Then `npm run build`

### DB location
The SQLite database is at: `%APPDATA%/li-client-ops-hub/data/ops-hub.db` (157MB+)
Migrations run automatically on app startup from `db/migrations/` (sorted alphabetically).
