# GHL Sync Comparison: ri_sales_pulse vs li-client-ops-hub

**Date:** 2026-03-26
**Status:** ri_sales_pulse GHL sync is working; li-client-ops-hub sync is not
**Goal:** Make ops-hub's GHL sync work reliably across all subaccounts

---

## Architecture Comparison

| Aspect | ri_sales_pulse (working) | li-client-ops-hub (broken) |
|--------|--------------------------|----------------------------|
| **Auth** | Single `GHL_API_KEY` (one location) | Per-company `pit_token` (multi-subaccount) |
| **DB** | better-sqlite3 (native) | sql.js (WASM) |
| **Rate limiter** | Token bucket (5 burst, 3/sec refill) + queue serialization | Simple `delay(100)` between pages, `withBackoff` for retries |
| **429 handling** | Exponential backoff with retry counter on the request itself | `ghlFetch` retries once after `retry-after` header, then throws |
| **Sync model** | `SyncEngine` class with interval timer, sequential phases | Queue-based (`sync_queue` table) with task processor |
| **Contact fields** | 20+ fields (name, address, city, state, source, website, customFields, etc.) | Same fields (recently added in this session) |
| **Message sync** | Scope control (opportunity_contacts vs all), 90-day backfill, smart skip if unchanged | Per-contact with `messages_synced_at` tracking, delta via timestamp |
| **Pagination** | Async generators (`paginateContacts`, `paginateOpportunities`) | Manual cursor loops in `ghlFetch` calls |
| **Error handling** | `GHLApiError` class with status/body/path, 5 retries on 429 | `GHLAPIError` class, single retry on 429, then throw |

---

## Key Differences That Explain Why Sales Pulse Works and Ops Hub Doesn't

### 1. Rate Limiting (CRITICAL)

**Sales Pulse** has a proper token-bucket rate limiter:
```
RateLimiter({ maxTokens: 5, refillRate: 3 })
```
- Serializes concurrent API calls into a queue
- Waits for token availability before each request
- Burst of 5, then sustains 3 requests/second
- Applied to EVERY GHL API call automatically via `this.rateLimiter.acquire()`

**Ops Hub** has NO rate limiter on the API client level:
```
// ghlFetch() just calls fetch() directly — no throttling
const res = await fetch(url, { ... });
```
- Uses `delay(100)` between pagination pages (100ms = 10 req/s — TOO FAST)
- Uses `delay(50)` between per-contact message syncs (20 req/s — WAY TOO FAST)
- The `withBackoff` utility exists but is NOT used by `ghlFetch()`
- Queue manager has `MS_BETWEEN_REQUESTS = 1000` but this is between TASKS, not between API calls within a task

**Result:** Ops hub hammers the GHL API at 10-20 req/s, gets rate-limited (429), retries once, then fails.

### 2. 429 Retry Logic (CRITICAL)

**Sales Pulse** retries up to 5 times with exponential backoff:
```typescript
if (response.status === 429) {
  const attempt = opts?.attempt ?? 0;
  if (attempt >= 5) throw new GHLApiError(429, ...);
  const retryAfter = parseInt(response.headers.get('retry-after') ?? '10', 10);
  await exponentialBackoff(retryAfter, attempt);  // doubles each time, max 60s
  return this.request(method, path, { ...opts, attempt: attempt + 1 });
}
```

**Ops Hub** retries only ONCE:
```typescript
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
  await delay(retryAfter * 1000);
  const retry = await fetch(url, { ... });  // ONE retry, then throw
  if (!retry.ok) throw new GHLAPIError(...);
  return retry.json();
}
```

**Result:** When ops hub hits a 429, it waits once and retries once. If that retry also gets 429'd (likely since there's no backoff), it throws and the entire sync phase fails.

### 3. Authentication Model

**Sales Pulse:** Single `GHL_API_KEY` for one location. Simple, always works.

**Ops Hub:** Per-company `pit_token` stored in DB. Adds complexity:
- Token could be invalid (`pit_status = 'invalid'`)
- Token could expire without detection
- 401 errors during sync need to update `pit_status` and skip company
- The queue manager checks `pit_status = 'valid'` before processing, but doesn't re-validate mid-sync

### 4. Sync Orchestration

**Sales Pulse:** Simple sequential flow in `SyncEngine.runSync()`:
```
pipelines → users → opportunities → contacts → conversations → pulse
```
Each phase runs to completion before the next starts. Clean, predictable.

**Ops Hub:** Complex queue-based system with priorities:
```
Queue picks tasks → processes one at a time → tasks enqueue follow-up tasks
```
- `contact_batch` (priority 50) → enqueues `contact_messages` (priority 30) per contact
- RI subaccount has special 3-phase flow with gate tasks
- Tasks can fail, retry, get orphaned on crash
- More robust but more failure modes

### 5. Inter-Request Delays

| Operation | Sales Pulse | Ops Hub |
|-----------|-------------|---------|
| Between contact pages | Rate limiter (~333ms) | `delay(100)` (too fast) |
| Between message pages | Rate limiter (~333ms) | No delay between pages |
| Between message contacts | Not explicit (rate limiter handles) | `delay(50)` (too fast) |
| Between opportunity pages | Rate limiter (~333ms) | `delay(100)` (too fast) |
| Between sync phases | None needed | `delay(500)` between companies |

---

## Plan to Fix Ops Hub GHL Sync

### Phase 1: Add Token-Bucket Rate Limiter (HIGH PRIORITY)

**Port the `RateLimiter` class from sales pulse to ops hub.**

Create or update `sync/utils/rateLimit.ts` to include the token-bucket rate limiter:
```typescript
export class GHLRateLimiter {
  // maxTokens: 5, refillRate: 3 tokens/sec
  // Serializes concurrent callers into a queue
}
```

Update `ghlFetch()` in `sync/adapters/ghl.ts` to acquire a token before every API call:
```typescript
const rateLimiter = new GHLRateLimiter({ maxTokens: 5, refillRate: 3 });

async function ghlFetch(path: string, token: string, options?: RequestInit): Promise<unknown> {
  await rateLimiter.acquire();  // ← ADD THIS
  // ... existing fetch logic
}
```

**Files to modify:**
- `sync/utils/rateLimit.ts` — add `GHLRateLimiter` class (port from sales pulse)
- `sync/adapters/ghl.ts` — integrate rate limiter into `ghlFetch()`

### Phase 2: Fix 429 Retry Logic (HIGH PRIORITY)

**Replace single-retry with exponential backoff (up to 5 retries).**

Update `ghlFetch()` in `sync/adapters/ghl.ts`:
```typescript
if (res.status === 429) {
  const attempt = (options as any)?._attempt ?? 0;
  if (attempt >= 5) {
    throw new GHLAPIError(`Rate limit exceeded after 5 retries`, 429, path, '');
  }
  const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
  const backoffMs = Math.min(retryAfter * 1000 * Math.pow(2, attempt), 60000);
  const jitter = Math.random() * 1000;
  await delay(backoffMs + jitter);
  return ghlFetch(path, token, { ...options, _attempt: attempt + 1 } as any);
}
```

**Files to modify:**
- `sync/adapters/ghl.ts` — update 429 handling in `ghlFetch()`

### Phase 3: Remove Aggressive Inter-Request Delays (MEDIUM)

**Replace hardcoded `delay(50)` and `delay(100)` with rate-limiter-governed pacing.**

Once the rate limiter is in place, remove or reduce the manual delays:

In `sync/engine.ts`:
- Line 171: `await delay(50)` between message syncs → remove (rate limiter handles it)
- Line 240: `await delay(50)` between message syncs → remove
- Line 391: `await delay(500)` between companies → keep (good practice)

In `sync/adapters/ghl.ts`:
- All `await delay(100)` after pagination pages → remove (rate limiter handles it)

The rate limiter at 3 tokens/sec (~333ms between calls) is the right pace. Manual delays on top of that just slow things down.

**Files to modify:**
- `sync/engine.ts` — remove redundant delays
- `sync/adapters/ghl.ts` — remove `delay(100)` after pagination

### Phase 4: Add Per-Company Rate Limiter Isolation (MEDIUM)

Currently the rate limiter would be global. But ops hub syncs multiple companies with different PITs. GHL rate limits are per-location, so each company should have its own rate limit budget.

Create a rate limiter registry:
```typescript
const limiters = new Map<string, GHLRateLimiter>();

function getLimiter(companyId: string): GHLRateLimiter {
  if (!limiters.has(companyId)) {
    limiters.set(companyId, new GHLRateLimiter({ maxTokens: 5, refillRate: 3 }));
  }
  return limiters.get(companyId)!;
}
```

Pass `companyId` context through to `ghlFetch()` so it uses the right limiter.

**Files to modify:**
- `sync/utils/rateLimit.ts` — add limiter registry
- `sync/adapters/ghl.ts` — pass companyId to ghlFetch, use per-company limiter

### Phase 5: Improve PIT Validation During Sync (LOW)

Add mid-sync PIT validation:
- On 401 response during any sync operation, immediately:
  1. Update `pit_status = 'invalid'` in companies table
  2. Log alert via `logAlert()`
  3. Abort remaining phases for that company
  4. Continue to next company

Currently, a 401 during sync throws an error that may not properly update `pit_status`.

**Files to modify:**
- `sync/adapters/ghl.ts` — handle 401 in `ghlFetch()` by updating pit_status
- `sync/engine.ts` — catch 401-specific errors and skip company

### Phase 6: Add Sync Health Monitoring (LOW)

Add per-company sync health tracking so failures are visible:
- Track consecutive sync failures per company
- Show in UI: "Last sync failed: Rate limited" vs "Last sync: 2h ago, 150 contacts"
- Auto-disable sync for companies with 5+ consecutive failures

**Files to modify:**
- `sync/engine.ts` — track failure counts
- `electron/ipc/db.ts` — expose sync health data

---

## Implementation Priority

```
1. [CRITICAL] Add token-bucket rate limiter to ghlFetch     — fixes 90% of sync failures
2. [CRITICAL] Fix 429 retry logic (5 retries + backoff)     — prevents cascade failures
3. [MEDIUM]   Remove aggressive manual delays                — speeds up sync
4. [MEDIUM]   Per-company rate limiter isolation             — proper multi-tenant pacing
5. [LOW]      Improve PIT 401 handling mid-sync             — graceful token expiry
6. [LOW]      Sync health monitoring                        — visibility into failures
```

---

## Estimated Impact

After Phase 1+2 alone, the sync should start working because:
- API calls will be paced at 3/sec instead of 10-20/sec
- 429 responses will be retried 5 times with backoff instead of failing after 1 retry
- The existing queue system, phase ordering, and error recovery are already solid

The root cause is almost certainly **the missing rate limiter** — ops hub sends requests too fast, gets 429'd, retries once, fails, and the sync appears broken.
