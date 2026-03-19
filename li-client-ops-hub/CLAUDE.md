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
All renderer <-> main communication via contextBridge.
Never use nodeIntegration. All DB/sync/file operations go through IPC.

## Data
SQLite database at data/ops-hub.db (gitignored).
Credentials in .env (gitignored).
