# Client Ops Hub: Hybrid Cloud Migration Plan

## Current Architecture (Local-First)

```
┌────────────────────────────────────────────────────────────┐
│                 Local Electron Desktop App                  │
│                                                            │
│  ┌───────────┐  ┌───────────┐  ┌────────────────────────┐│
│  │ React UI  │  │ sql.js    │  │ Sync Engine            ││
│  │ (Vite)    │  │ (SQLite)  │  │ ├─ GHL adapter         ││
│  │           │  │           │  │ ├─ Read.ai adapter      ││
│  │           │  │           │  │ ├─ Google Drive/Cal     ││
│  │           │  │           │  │ ├─ Kinsta adapter       ││
│  │           │  │           │  │ ├─ Teamwork adapter     ││
│  │           │  │           │  │ └─ Discord adapter      ││
│  └───────────┘  └───────────┘  └────────────────────────┘│
│        ↕ IPC         ↕              ↕                      │
│  ┌───────────┐  ┌───────────┐  ┌────────────────────────┐│
│  │ Preload   │  │ Queue Mgr │  │ Cloud Sync Push        ││
│  │ Bridge    │  │ (5 conc.) │  │ (every 5 min → D1)     ││
│  └───────────┘  └───────────┘  └────────────────────────┘│
└────────────────────────────────────────────────────────────┘
                         │
                    Push (HTTP)
                         ↓
┌────────────────────────────────────────────────────────────┐
│              Cloudflare (Read-Only Mirror)                  │
│  ┌──────────────────┐  ┌────────────────────────────────┐ │
│  │ Worker            │  │ D1 Database                     │ │
│  │ POST /sync/batch  │  │ (mirror of local SQLite)        │ │
│  │ GET  /api/*       │  │                                 │ │
│  └──────────────────┘  └────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## Target Architecture (Hybrid)

```
┌────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
│  ┌──────────┐  ┌──────┐  ┌──────────┐  ┌───────────────┐│
│  │ Workers   │  │  D1  │  │ Queues   │  │ Vectorize     ││
│  │ (API +    │  │      │  │ (sync    │  │ (RAG embed-   ││
│  │  cron     │  │      │  │  fanout) │  │  dings)       ││
│  │  sync)    │  │      │  │          │  │               ││
│  └──────────┘  └──────┘  └──────────┘  └───────────────┘│
│  ┌──────────┐  ┌──────────┐                              │
│  │ Pages    │  │ Access   │                              │
│  │ (React   │  │ (Google  │                              │
│  │  SPA)    │  │  OAuth)  │                              │
│  └──────────┘  └──────────┘                              │
└────────────────────────────────────────────────────────────┘
          ↕ API (read + write)
┌────────────────────────────────────────────────────────────┐
│              Local Electron (Kyle's workstation)           │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ SQLite   │  │ Heavy    │  │ RAG (FTS5 + local      │ │
│  │ (offline │  │ sync     │  │  vector embeddings)     │ │
│  │  cache)  │  │ engine   │  │                         │ │
│  └──────────┘  └──────────┘  └────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## Migration Phases

### Phase A: Shared Codebase (DONE)
- [x] DB helper abstraction (`queryAll`/`queryOne`/`execute`)
- [x] Cloud sync push mechanism (local → D1)
- [x] Cloudflare Worker with read-only API
- [x] D1 database with same schema as local SQLite
- [x] `shared/types/` with core domain types
- [x] `shared/db/interface.ts` with `DBAdapter` interface
- [x] `shared/sync/interface.ts` with `SyncRunner` interface
- [x] `shared/sla.ts` with shared SLA computation logic

### Phase B: Cloud API Expansion
- [ ] Add write routes to Worker (create/update companies, contacts)
- [ ] Cloudflare Access for auth (Google OAuth → Evan, COO, Hayk)
- [ ] React SPA on Cloudflare Pages (reuse existing React components)
- [ ] API routes mirror IPC handlers (1:1 mapping)
- [ ] Deploy at ops.logicinbound.com or cs.logicinbound.com/ops

### Phase C: Cloud Sync
- [ ] Cloudflare Cron Triggers replace node-cron for scheduling
- [ ] Cloudflare Queues replace local queue manager for fanout
- [ ] Sync adapters run on Workers (fetch-based, no Node.js deps)
- [ ] GHL sync runs in cloud instead of local
- [ ] Rate limit management via Durable Objects (shared across requests)

### Phase D: Local Becomes Offline Mirror
- [ ] Local app syncs FROM cloud D1 instead of FROM GHL directly
- [ ] Cloud is the single source of truth for all data
- [ ] Local provides: offline access, heavy computation (RAG), bulk analysis
- [ ] Cloud provides: team-wide access, scheduling, API endpoints

## What Already Exists

| Component | Local | Cloud | Status |
|-----------|-------|-------|--------|
| Database | sql.js (SQLite) | D1 | Both exist, local → cloud push |
| API | IPC (100+ handlers) | Worker (6 routes) | Cloud needs expansion |
| Sync | Full (8 adapters) | None (receives push) | Cloud sync not started |
| Auth | None (desktop app) | API key only | Needs Cloudflare Access |
| UI | React (Electron) | None | Needs Pages deployment |
| RAG | Local (vector + FTS) | None | Needs Vectorize |
| Scheduling | node-cron | None | Needs Cron Triggers |
| Queue | In-memory (5 conc.) | None | Needs CF Queues |

## Key Decision Points

- [ ] **Deployment URL**: Keep cs.logicinbound.com or create ops.logicinbound.com?
- [ ] **Database**: Share existing D1 (`li-ops-hub-cloud`) or create a new one?
- [ ] **Access control**: Which users get access? (Evan, COO, Hayk — or broader?)
- [ ] **Sync ownership**: Does cloud do its own GHL sync or keep receiving push from local?
- [ ] **PIT token storage**: Secrets in local .env — how to handle in cloud? (Workers Secrets)
- [ ] **RAG in cloud**: Use Vectorize or keep RAG local-only?
- [ ] **Offline behavior**: Does local app work fully offline or degrade gracefully?

## IPC → API Route Mapping

The existing 100+ IPC handlers in `electron/ipc/` map directly to REST API routes:

| IPC Channel | HTTP Route | Priority |
|-------------|-----------|----------|
| `db:getCompanies` | `GET /api/companies` | P0 (exists) |
| `db:getCompany` | `GET /api/companies/:id` | P0 (exists) |
| `db:getContacts` | `GET /api/companies/:id/contacts` | P0 (exists) |
| `db:getMeetings` | `GET /api/companies/:id/meetings` | P0 (exists) |
| `briefing:*` | `GET /api/briefing/*` | P1 |
| `health:*` | `GET /api/health/*` | P1 |
| `queue:syncAll` | `POST /api/sync/all` | P2 |
| `queue:syncCompany` | `POST /api/sync/:companyId` | P2 |
| `rag:search` | `POST /api/rag/search` | P3 |

## File Structure

```
li-client-ops-hub/
├── shared/              ← NEW: platform-agnostic code
│   ├── types/index.ts   ← Core domain types
│   ├── db/interface.ts  ← DBAdapter interface
│   ├── sync/interface.ts← SyncRunner interface
│   └── sla.ts           ← SLA computation (shared logic)
├── cloud/               ← EXISTING: Cloudflare deployment
│   ├── worker/src/      ← Worker API (expand in Phase B)
│   ├── d1/schema.sql    ← D1 schema (mirrors local)
│   └── wrangler.toml    ← Worker config (live D1 ID)
├── electron/            ← EXISTING: local main process
├── src/                 ← EXISTING: React renderer
├── sync/                ← EXISTING: sync adapters + engine
├── db/                  ← EXISTING: SQLite wrapper
└── docs/                ← NEW: architecture documentation
```
