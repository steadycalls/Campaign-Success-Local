# Cloud Sync — Cloudflare D1 Mirror

The desktop app pushes data to a Cloudflare D1 database every 5 minutes.
A Cloudflare Worker serves as the API for both receiving sync data and
serving the read-only web dashboard.

## Setup

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create D1 Database

```bash
wrangler d1 create li-ops-hub-cloud
```

Copy the `database_id` from the output into `wrangler.toml`.

### 3. Apply Schema

```bash
cd cloud
wrangler d1 execute li-ops-hub-cloud --file=d1/schema.sql
```

### 4. Set API Key Secret

```bash
wrangler secret put CLOUD_SYNC_API_KEY
# Enter a strong random key (e.g. generate with: openssl rand -hex 32)
```

### 5. Deploy Worker

```bash
cd cloud
wrangler deploy
```

### 6. Configure Desktop App

Add to your `.env` file (in `%APPDATA%/li-client-ops-hub/.env`):

```
CLOUD_SYNC_ENABLED=true
CLOUD_SYNC_WORKER_URL=https://li-ops-hub-api.<your-subdomain>.workers.dev
CLOUD_SYNC_API_KEY=<same key from step 4>
```

Restart the desktop app. It will begin pushing data to D1 every 5 minutes.

## What Syncs

Business data only. Secrets (PIT tokens, API keys, OAuth tokens) and
large binary data (RAG embedding vectors) stay local.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /sync/batch | Receive row upserts from desktop |
| GET | /api/companies | List active companies |
| GET | /api/companies/:id | Company detail |
| GET | /api/companies/:id/contacts | Contacts for a company |
| GET | /api/companies/:id/meetings | Meetings for a company |
| GET | /api/clients | Client-tagged contacts |
| GET | /api/sync-health | Recent sync runs + alerts |
| GET | /api/pulse | Portfolio-level aggregates |

All endpoints require `Authorization: Bearer <API_KEY>` header.
