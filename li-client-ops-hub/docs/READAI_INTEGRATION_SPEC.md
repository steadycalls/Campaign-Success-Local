# Read.ai Integration — Technical Specification

**App:** li-client-ops-hub (Electron + React + sql.js)
**Last Updated:** 2026-03-26
**Purpose:** Portable spec for copying this integration to other apps

---

## 1. Overview

Two-pass sync that imports meetings from Read.ai, then expands each with summaries, transcripts, action items, and engagement metrics. Uses OAuth 2.1 for auth with automatic token refresh. Matches meetings to companies via participant email domains.

---

## 2. Environment Variables

```
READAI_CLIENT_ID=       # OAuth client ID from Read.ai developer portal
READAI_CLIENT_SECRET=   # OAuth client secret
```

---

## 3. OAuth 2.1 Authentication

### 3.1 Endpoints

| Purpose | URL | Method |
|---------|-----|--------|
| Token exchange/refresh | `https://authn.read.ai/oauth2/token` | POST |
| OAuth UI (browser) | `https://api.read.ai/oauth/ui` | GET |
| User info | `https://api.read.ai/oauth/userinfo` | GET |
| Connection test | `https://api.read.ai/oauth/test-token-with-scopes` | GET |

### 3.2 Scopes

```
openid email offline_access profile meeting:read mcp:execute
```

### 3.3 Token Refresh

Tokens refresh automatically with a **5-minute buffer** before expiration:

```typescript
const expiresAt = new Date(auth.expires_at).getTime();
if (Date.now() >= expiresAt - 300_000) {
  // Refresh now
}
```

**Refresh request:**
```
POST https://authn.read.ai/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={REFRESH_TOKEN}
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "def_...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "openid email offline_access profile meeting:read mcp:execute"
}
```

Store new `access_token`, `refresh_token` (if returned), and compute `expires_at = now + expires_in seconds`.

### 3.4 Auth Table Schema

```sql
CREATE TABLE readai_auth (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  access_token    TEXT,
  refresh_token   TEXT,
  expires_at      TEXT,           -- ISO-8601
  email           TEXT,
  scope           TEXT,
  authorized_at   TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Singleton pattern — always `id = 'default'`.

---

## 4. Meeting Sync — Two-Pass Architecture

### 4.1 Pass 1: List Meetings (metadata only)

**Endpoint:**
```
GET https://api.read.ai/v1/meetings?limit=10&start_time_ms.gte={MS}&cursor={CURSOR}
Authorization: Bearer {ACCESS_TOKEN}
```

**Response:**
```json
{
  "data": [
    {
      "id": "m_abc123",
      "title": "Weekly Standup",
      "start_time_ms": 1711425600000,
      "end_time_ms": 1711429200000,
      "participants": [
        { "name": "John Doe", "email": "john@acme.com", "attended": true },
        { "name": "Jane Smith", "email": "jane@partner.io", "attended": true }
      ],
      "owner": { "name": "John Doe", "email": "john@acme.com" },
      "platform": "zoom",
      "platform_id": "zoom_123",
      "report_url": "https://app.read.ai/analytics/meetings/...",
      "folders": []
    }
  ],
  "has_more": true
}
```

**Pagination:** Cursor-based. Use `meeting.id` as cursor for next page. Stop when `has_more === false` or `data` is empty.

**Rate limiting:** 500ms delay between pages. On 429, parse `Retry-After` header and wait.

**Fields stored in Pass 1:** id, title, meeting_date, start_time_ms, end_time_ms, duration_minutes, platform, platform_id, owner_name, owner_email, participants_json, participants_count, attended_count, report_url, folders_json, matched_domains, match_method, company_id, raw_json, synced_at. Set `expanded = 0`.

### 4.2 Pass 2: Expand Meeting Details (summaries + transcripts)

**Endpoint:**
```
GET https://api.read.ai/v1/meetings/{READAI_ID}?expand[]=summary&expand[]=action_items&expand[]=metrics&expand[]=key_questions&expand[]=topics&expand[]=transcript&expand[]=chapter_summaries&expand[]=recording_download
Authorization: Bearer {ACCESS_TOKEN}
```

**Response fields (nested — requires safe unwrapping):**

| Field | Path(s) | Type | Notes |
|-------|---------|------|-------|
| Summary | `data.summary` or `data.summary.data.text` | string | Plain text meeting summary |
| Transcript | `data.transcript.text` or `data.transcript.data.text` | string | Full text transcript |
| Transcript JSON | `data.transcript` | object | Structured with `segments[{speaker, text}]` |
| Topics | `data.topics` or `data.topics.data` | string[] | Array of topic names |
| Key Questions | `data.key_questions` or `data.key_questions.data` | object[] | Questions raised |
| Chapter Summaries | `data.chapter_summaries` or `data.chapter_summaries.data` | object[] | Per-chapter summaries |
| Action Items | `data.action_items` or `data.action_items.items` | object[] | `{text, assignee}` |
| Read Score | `data.metrics.read_score` | number | 0-100 |
| Sentiment | `data.metrics.sentiment` or `sentiment_score` | number | 0-1 decimal |
| Engagement | `data.metrics.engagement` or `engagement_score` | number | 0-1 decimal |
| Recording URL | `data.recording_download` | string | Download link |

**Critical: Safe value unwrapping**

The Read.ai API nests data inconsistently. Some fields return `{ data: { text: "..." } }`, others return the value directly. Use safe extractors:

```typescript
function safeString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && 'text' in val) return String(val.text);
  return String(val);
}

function safeNumber(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}
```

**Batch processing:** 20 meetings per batch, 1 second delay between meetings. Continue batching until no unexpanded meetings remain.

**After expansion:** Set `expanded = 1`. Upsert action items by `meeting_id + text` uniqueness.

---

## 5. Company Matching

Extract participant email domains and match to companies:

```typescript
function extractDomains(participants: Array<{email?: string}>): string[] {
  const GENERIC = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com']);
  const domains = new Set<string>();
  for (const p of participants) {
    if (!p.email) continue;
    const domain = p.email.split('@')[1]?.toLowerCase();
    if (domain && !GENERIC.has(domain)) domains.add(domain);
  }
  return Array.from(domains);
}

function matchToCompany(domains: string[]): { companyId: string | null; matchMethod: string | null } {
  for (const domain of domains) {
    const match = queryOne('SELECT company_id FROM company_domains WHERE domain = ?', [domain]);
    if (match) return { companyId: match.company_id, matchMethod: 'email_domain' };
  }
  return { companyId: null, matchMethod: null };
}
```

---

## 6. Database Schema — Meetings Table

```sql
CREATE TABLE meetings (
  id                      TEXT PRIMARY KEY,
  company_id              TEXT REFERENCES companies(id) ON DELETE SET NULL,
  readai_meeting_id       TEXT,
  title                   TEXT,
  meeting_date            TEXT NOT NULL,
  duration_minutes        INTEGER,
  participants            TEXT,
  summary                 TEXT,
  start_time_ms           INTEGER,
  end_time_ms             INTEGER,
  platform                TEXT,
  platform_id             TEXT,
  owner_name              TEXT,
  owner_email             TEXT,
  participants_json       TEXT,
  participants_count      INTEGER DEFAULT 0,
  attended_count          INTEGER DEFAULT 0,
  topics_json             TEXT,
  key_questions_json      TEXT,
  chapter_summaries_json  TEXT,
  read_score              REAL,
  sentiment               REAL,
  engagement              REAL,
  transcript_text         TEXT,
  transcript_json         TEXT,
  report_url              TEXT,
  recording_url           TEXT,
  folders_json            TEXT,
  matched_domains         TEXT,
  match_method            TEXT,
  raw_json                TEXT,
  expanded                INTEGER DEFAULT 0,
  synced_at               TEXT,
  recording_local_path    TEXT,
  live_enabled            INTEGER DEFAULT 0,
  action_items_json       TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_meetings_start ON meetings(start_time_ms DESC);
CREATE INDEX idx_meetings_company ON meetings(company_id);
CREATE INDEX idx_meetings_readai_id ON meetings(readai_meeting_id);
```

### Action Items Table

```sql
CREATE TABLE action_items (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  company_id  TEXT REFERENCES companies(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  assignee    TEXT,
  status      TEXT DEFAULT 'open',   -- open | done
  due_date    TEXT,
  raw_json    TEXT,
  synced_at   TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

Deduplicate by `(meeting_id, text)`.

---

## 7. Sync State Tracking

Stored in `app_state` table as JSON under key `'readai_sync_state'`:

```typescript
interface ReadAiSyncState {
  oldestMeetingSynced: string | null;    // ISO-8601
  newestMeetingSynced: string | null;    // ISO-8601
  totalMeetingsSynced: number;
  lastSyncAt: string | null;            // ISO-8601
  historicalSyncComplete: boolean;
  historicalSyncCursor: string | null;   // Resume cursor
  historicalSyncTarget: string | null;
}
```

Enables resume-on-crash: if `historicalSyncCursor` is set and `historicalSyncComplete` is false, resume from cursor on next sync.

---

## 8. Scheduled Tasks (node-cron)

| Task | Schedule | What It Does |
|------|----------|-------------|
| Expand meetings | `:30 every hour` | Expands 10 unexpanded meetings (Pass 2) |
| Daily sync | `Every 2h, 6am-8pm CT, weekdays` | Syncs last 24h of meetings (Pass 1 + 2) |
| Overnight historical | `10 PM CT daily` | Processes large historical syncs (month/quarter/year) in 10pm-6am window |

---

## 9. IPC Handlers (Electron) / API Endpoints

| Handler | Input | Returns | Purpose |
|---------|-------|---------|---------|
| `readai:syncRange` | `range: 'today'\|'week'\|'month'\|'quarter'\|'year'` | `{success, message, fetched, created, updated}` | Manual sync by date range |
| `readai:syncHistoricalNow` | `range` | Same | Force historical sync immediately |
| `readai:getSyncState` | none | `ReadAiSyncState` | Current sync progress |
| `readai:getMeetingsList` | `limit, offset` | `Meeting[]` | Paginated meetings with company join |
| `readai:getTranscript` | `meetingId` | `string \| null` | Transcript text for clipboard |
| `readai:expandAll` | none | `{success, expanded}` | Expand all unexpanded meetings |
| `readai:expandRange` | `range` | `{success, expanded}` | Expand unexpanded meetings |
| `readai:getMeetingsCount` | none | `number` | Total meeting count |
| `readai:getOvernightStatus` | none | `OvernightStatus \| null` | Pending overnight sync |
| `readai:cancelOvernight` | none | `{success}` | Cancel overnight sync |

### Auth Handlers

| Handler | Input | Returns | Purpose |
|---------|-------|---------|---------|
| `readai:openAuthPage` | none | `{success}` | Opens OAuth browser flow |
| `readai:exchangeCode` | `code, codeVerifier?` | `{success, email}` | Complete OAuth code exchange |
| `readai:exchangeCurl` | `curlCommand` | `{success, email}` | Parse OAuth from curl |
| `readai:refreshToken` | none | `{success}` | Manual token refresh |
| `readai:getAuthStatus` | none | `ReadAiAuthStatus` | Current auth state |
| `readai:revoke` | none | `{success}` | Clear tokens |
| `readai:testConnection` | none | `{success, message}` | Validate token + scopes |

---

## 10. Error Handling

| Error | Response |
|-------|----------|
| 429 Rate Limited | Parse `Retry-After` header, wait, retry once |
| 401 Unauthorized | Attempt token refresh; if refresh fails, clear auth, notify user |
| Network error | Throw, let caller handle (queue reschedules) |
| Empty API response | Return empty data, don't crash |
| Nested JSON parsing | Use `safeString()` / `safeNumber()` — never assume structure |

**Critical lesson learned:** The Read.ai API wraps some fields in `{ data: { text: "..." } }` and returns others directly. Always use safe extractors that handle both patterns.

---

## 11. Porting Checklist

- [ ] Create `readai_auth` table (singleton, stores OAuth tokens)
- [ ] Create `meetings` table (40+ columns including expanded fields)
- [ ] Create `action_items` table (deduped by meeting_id + text)
- [ ] Create `app_state` table for sync state JSON storage
- [ ] Set `READAI_CLIENT_ID` and `READAI_CLIENT_SECRET` in environment
- [ ] Implement OAuth flow (browser open → code exchange → token storage)
- [ ] Implement token refresh with 5-minute expiration buffer
- [ ] Implement Pass 1: list meetings with cursor pagination (limit=10, 500ms delay)
- [ ] Implement Pass 2: expand meetings with `?expand[]=...` (batch of 20, 1s delay)
- [ ] Implement safe JSON unwrapping for nested API responses
- [ ] Implement company matching via participant email domains
- [ ] Implement action item upsert by (meeting_id, text)
- [ ] Set up scheduled tasks: hourly expand, daily sync, overnight historical
- [ ] Implement sync state tracking for resume-on-crash
- [ ] Handle HTTP 429 with Retry-After header parsing
- [ ] **Never** reset `expanded = 0` on already-expanded meetings (data loss risk)
- [ ] Test full cycle: OAuth → sync today → expand → verify summary + transcript populated
