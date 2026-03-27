import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute, executeInTransaction } from '../../db/client';
import { delay, getGHLRateLimiter, getGlobalGHLRateLimiter } from '../utils/rateLimit';
import { type SyncCounts, logAlert } from '../utils/logger';
import { logger } from '../../lib/logger';
import { contactContentHash, entityContentHash, logChange } from '../utils/cursors';

// Track which company context we're syncing for (set by sync functions)
let _currentCompanyId: string | null = null;
export function setCurrentCompanyContext(companyId: string | null): void {
  _currentCompanyId = companyId;
}

// ── Types ─────────────────────────────────────────────────────────────

type SLAStatus = 'ok' | 'warning' | 'violation';

interface SLAConfig {
  warningDays: number;
  violationDays: number;
}

// ── GHL API helper ────────────────────────────────────────────────────

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

class GHLAPIError extends Error {
  status: number;
  path: string;
  responseBody: string;
  constructor(message: string, status: number, path: string, responseBody: string) {
    super(message);
    this.name = 'GHLAPIError';
    this.status = status;
    this.path = path;
    this.responseBody = responseBody;
  }
}

const MAX_429_RETRIES = 5;

export async function ghlFetch(path: string, token: string, options?: RequestInit, _attempt: number = 0): Promise<unknown> {
  // Acquire rate limiter token before making the request
  const limiter = _currentCompanyId
    ? getGHLRateLimiter(_currentCompanyId)
    : getGlobalGHLRateLimiter();
  await limiter.acquire();

  const url = `${GHL_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options?.headers,
  };

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GHLAPIError(`GHL network error at ${path}: ${msg}`, 0, path, msg);
  }

  if (res.status === 429) {
    if (_attempt >= MAX_429_RETRIES) {
      throw new GHLAPIError(`GHL rate limit exceeded after ${MAX_429_RETRIES} retries at ${path}`, 429, path, 'Rate limit exhausted');
    }
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
    const backoffMs = Math.min(retryAfter * 1000 * Math.pow(2, _attempt), 60000);
    const jitter = Math.random() * 1000;
    logger.warn('GHL', 'Rate limited, backing off', { path, attempt: _attempt + 1, max: MAX_429_RETRIES, wait_ms: Math.round(backoffMs + jitter) });
    await delay(backoffMs + jitter);
    return ghlFetch(path, token, options, _attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '[unreadable]');
    throw new GHLAPIError(`GHL ${res.status} at ${path}: ${text.slice(0, 500)}`, res.status, path, text.slice(0, 1000));
  }

  return res.json();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Capitalize first letter of each word. Preserves null. Handles McX, O'X patterns. */
function titleCase(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/\b([a-zA-Z])([a-zA-Z]*)\b/g, (_m, first: string, rest: string) => {
    if (first === first.toUpperCase() && rest !== rest.toUpperCase()) return first + rest;
    return first.toUpperCase() + rest.toLowerCase();
  });
}

// ── Location listing (Agency PIT) ─────────────────────────────────────

export async function syncLocations(agencyPit: string, companyId: string): Promise<number> {
  let count = 0;
  let skip = 0;
  const limit = 100;

  while (true) {
    const data = (await ghlFetch(
      `/locations/search?companyId=${encodeURIComponent(companyId)}&limit=${limit}&skip=${skip}`,
      agencyPit
    )) as { locations?: Array<Record<string, unknown>> };

    const locations = data.locations ?? [];
    if (locations.length === 0) break;

    for (const loc of locations) {
      const locationId = loc.id as string;
      const name = (loc.name as string) ?? 'Unknown';
      const website = (loc.website as string) ?? null;

      const existing = queryOne(
        'SELECT id, pit_token, pit_status, sync_enabled FROM companies WHERE ghl_location_id = ?',
        [locationId]
      );

      if (existing) {
        // Update name/website but NEVER overwrite pit_token, pit_status, sync_enabled
        execute(
          `UPDATE companies SET name = ?, website = ?, updated_at = datetime('now') WHERE id = ?`,
          [name, website, existing.id as string]
        );
      } else {
        const id = randomUUID();
        const slug = slugify(name);
        const existingSlug = queryOne('SELECT id FROM companies WHERE slug = ?', [slug]);
        const finalSlug = existingSlug ? `${slug}-${locationId.slice(0, 8)}` : slug;

        execute(
          `INSERT INTO companies (id, name, slug, website, status, ghl_location_id, sla_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, 'ok', datetime('now'), datetime('now'))`,
          [id, name, finalSlug, website, locationId]
        );
      }
      count++;
    }

    skip += locations.length;
    if (locations.length < limit) break;
    // Rate limiter handles pacing — no manual delay needed
  }

  logger.sync('GHL synced locations', { count });
  return count;
}

// ── Test sub-account PIT ──────────────────────────────────────────────

export async function testSubAccountPit(
  pitToken: string,
  locationId: string
): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
  try {
    const contactsData = (await ghlFetch(
      `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`,
      pitToken
    )) as { meta?: { total?: number } };

    const apiTotal = contactsData.meta?.total ?? null;

    // Store API total immediately so it shows before a full sync
    if (apiTotal !== null) {
      execute(
        `UPDATE companies SET contacts_api_total = ?, updated_at = datetime('now') WHERE ghl_location_id = ?`,
        [apiTotal, locationId]
      );
    }

    const usersData = (await ghlFetch(
      `/users/?locationId=${encodeURIComponent(locationId)}`,
      pitToken
    )) as { users?: unknown[] };

    // Fetch phone numbers count
    let phoneCount = 0;
    try {
      const phoneData = (await ghlFetch(
        `/phone-number/search?locationId=${encodeURIComponent(locationId)}`,
        pitToken
      )) as { data?: unknown[] };
      phoneCount = phoneData.data?.length ?? 0;
      execute(
        `UPDATE companies SET phone_numbers_count = ?, updated_at = datetime('now') WHERE ghl_location_id = ?`,
        [phoneCount, locationId]
      );
    } catch {
      // Phone number endpoint may not be available — ignore
    }

    return {
      success: true,
      message: `Connected. ${apiTotal?.toLocaleString() ?? '?'} contacts, ${usersData.users?.length ?? '?'} users, ${phoneCount} phone numbers.`,
      details: {
        contactCount: apiTotal,
        userCount: usersData.users?.length,
        phoneCount,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
}

// ── Contacts sync ─────────────────────────────────────────────────────

// Sync only contacts matching a specific tag (e.g. "client").
// Uses the GHL contacts search endpoint with query param to filter by tag.
// Returns the DB IDs of contacts that were synced so we can prioritize their messages.
export async function syncContactsByTag(
  locationId: string,
  companyId: string,
  pit: string,
  tag: string
): Promise<{ counts: SyncCounts; contactIds: Array<{ id: string; ghl_contact_id: string }> }> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const contactIds: Array<{ id: string; ghl_contact_id: string }> = [];
  let startAfterId: string | undefined;
  let startAfter: number | string | undefined;

  while (true) {
    let path = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100&query=${encodeURIComponent(tag)}`;
    if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
    if (startAfter != null) path += `&startAfter=${encodeURIComponent(String(startAfter))}`;

    const data = (await ghlFetch(path, pit)) as {
      contacts?: Array<Record<string, unknown>>;
      meta?: { startAfterId?: string; startAfter?: number | string; total?: number };
    };

    const contacts = data.contacts ?? [];
    if (contacts.length === 0) break;

    for (const c of contacts) {
      const ghlId = c.id as string;
      const firstName = titleCase((c.firstName as string) ?? null);
      const lastName = titleCase((c.lastName as string) ?? null);
      const email = (c.email as string) ?? null;
      const phone = (c.phone as string) ?? null;
      const tags = c.tags ? JSON.stringify(c.tags) : null;
      const newHash = contactContentHash(c);

      // Only process contacts that actually have the tag
      const tagList = (c.tags as string[]) ?? [];
      if (!tagList.some(t => t.toLowerCase().includes(tag.toLowerCase()))) continue;

      // Extract enriched fields
      const companyName = (c.companyName as string) ?? null;
      const assignedTo = (c.assignedTo as string) ?? null;
      const dateOfBirth = (c.dateOfBirth as string) ?? null;
      const address = (c.address1 as string) ?? null;
      const city = (c.city as string) ?? null;
      const state = (c.state as string) ?? null;
      const postalCode = (c.postalCode as string) ?? null;
      const country = (c.country as string) ?? null;
      const source = (c.source as string) ?? null;
      const website = (c.website as string) ?? null;
      const customFieldsJson = c.customFields ? JSON.stringify(c.customFields) : null;
      const lastActivity = (c.dateLastActivity as string) ?? (c.lastActivity as string) ?? null;

      const existing = queryOne(
        'SELECT id, content_hash FROM contacts WHERE ghl_contact_id = ? AND company_id = ?',
        [ghlId, companyId]
      );

      let dbId: string;
      if (existing) {
        dbId = existing.id as string;
        if ((existing.content_hash as string) !== newHash) {
          execute(
            `UPDATE contacts SET first_name=?, last_name=?, email=?, phone=?, tags=?,
             company_name=?, assigned_to_name=?, date_of_birth=?, address=?, city=?, state=?,
             postal_code=?, country=?, source=?, website=?, custom_fields_json=?, last_activity_at=?,
             content_hash=?, updated_at=datetime('now') WHERE id=?`,
            [firstName, lastName, email, phone, tags, companyName, assignedTo, dateOfBirth,
             address, city, state, postalCode, country, source, website, customFieldsJson,
             lastActivity, newHash, dbId]
          );
          counts.updated++;
        }
      } else {
        dbId = randomUUID();
        execute(
          `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone, tags,
           company_name, assigned_to_name, date_of_birth, address, city, state, postal_code, country,
           source, website, custom_fields_json, last_activity_at, content_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [dbId, companyId, ghlId, firstName, lastName, email, phone, tags, companyName, assignedTo,
           dateOfBirth, address, city, state, postalCode, country, source, website, customFieldsJson,
           lastActivity, newHash]
        );
        counts.created++;
      }
      counts.found++;
      contactIds.push({ id: dbId, ghl_contact_id: ghlId });
    }

    const prevCursor = startAfterId;
    startAfterId = (data.meta?.startAfterId as string)
      ?? (contacts.length > 0 ? (contacts[contacts.length - 1].id as string) : undefined);
    startAfter = data.meta?.startAfter ?? undefined;
    if (!startAfterId || contacts.length < 100 || startAfterId === prevCursor) break;
    // Rate limiter handles pacing — no manual delay needed
  }

  return { counts, contactIds };
}

export async function syncContacts(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  let startAfterId: string | undefined;
  let startAfter: number | string | undefined;
  let apiTotalCaptured = false;

  while (true) {
    let path = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`;
    if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
    if (startAfter != null) path += `&startAfter=${encodeURIComponent(String(startAfter))}`;

    const data = (await ghlFetch(path, pit)) as {
      contacts?: Array<Record<string, unknown>>;
      meta?: { startAfterId?: string; startAfter?: number | string; total?: number };
    };

    // Capture API total from first page
    if (!apiTotalCaptured && data.meta?.total != null) {
      execute(
        `UPDATE companies SET contacts_api_total = ?, updated_at = datetime('now') WHERE id = ?`,
        [data.meta.total, companyId]
      );
      apiTotalCaptured = true;
    }

    const contacts = data.contacts ?? [];
    if (contacts.length === 0) break;

    // Batch the page's upserts in a single transaction for reduced I/O
    executeInTransaction(() => {
      for (const c of contacts) {
        const ghlId = c.id as string;
        const firstName = (c.firstName as string) ?? null;
        const lastName = (c.lastName as string) ?? null;
        const email = (c.email as string) ?? null;
        const phone = (c.phone as string) ?? null;
        const tags = c.tags ? JSON.stringify(c.tags) : null;
        const newHash = contactContentHash(c);

        // Extract enriched fields
        const companyName = (c.companyName as string) ?? null;
        const assignedTo = (c.assignedTo as string) ?? null;
        const dateOfBirth = (c.dateOfBirth as string) ?? null;
        const address = (c.address1 as string) ?? null;
        const city = (c.city as string) ?? null;
        const state = (c.state as string) ?? null;
        const postalCode = (c.postalCode as string) ?? null;
        const country = (c.country as string) ?? null;
        const source = (c.source as string) ?? null;
        const website = (c.website as string) ?? null;
        const customFieldsJson = c.customFields ? JSON.stringify(c.customFields) : null;
        const lastActivity = (c.dateLastActivity as string) ?? (c.lastActivity as string) ?? null;

        const existing = queryOne(
          'SELECT id, content_hash FROM contacts WHERE ghl_contact_id = ? AND company_id = ?',
          [ghlId, companyId]
        );

        if (existing) {
          if ((existing.content_hash as string) !== newHash) {
            execute(
              `UPDATE contacts SET first_name=?, last_name=?, email=?, phone=?, tags=?,
               company_name=?, assigned_to_name=?, date_of_birth=?, address=?, city=?, state=?,
               postal_code=?, country=?, source=?, website=?, custom_fields_json=?, last_activity_at=?,
               content_hash=?, updated_at=datetime('now') WHERE id=?`,
              [firstName, lastName, email, phone, tags, companyName, assignedTo, dateOfBirth,
               address, city, state, postalCode, country, source, website, customFieldsJson,
               lastActivity, newHash, existing.id as string]
            );
            counts.updated++;
          }
        } else {
          execute(
            `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone, tags,
             company_name, assigned_to_name, date_of_birth, address, city, state, postal_code, country,
             source, website, custom_fields_json, last_activity_at, content_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [randomUUID(), companyId, ghlId, firstName, lastName, email, phone, tags, companyName, assignedTo,
             dateOfBirth, address, city, state, postalCode, country, source, website, customFieldsJson,
             lastActivity, newHash]
          );
          counts.created++;
        }
        counts.found++;
      }
    });

    // GHL pagination requires both startAfterId and startAfter
    const prevCursor = startAfterId;
    startAfterId = (data.meta?.startAfterId as string)
      ?? (contacts.length > 0 ? (contacts[contacts.length - 1].id as string) : undefined);
    startAfter = data.meta?.startAfter ?? undefined;
    // Detect stuck cursor
    if (!startAfterId || contacts.length < 100 || startAfterId === prevCursor) break;
    // Rate limiter handles pacing — no manual delay needed
  }

  execute(
    `UPDATE companies SET contact_count = (SELECT COUNT(*) FROM contacts WHERE company_id = ?), updated_at = datetime('now') WHERE id = ?`,
    [companyId, companyId]
  );

  return counts;
}

// ── Messages sync (per contact) ───────────────────────────────────────

export async function syncMessages(
  contactDbId: string,
  ghlContactId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  // Get conversation ID
  let conversationId: string | null = null;
  try {
    const data = (await ghlFetch(
      `/conversations/search?contactId=${encodeURIComponent(ghlContactId)}`,
      pit
    )) as { conversations?: Array<{ id: string }> };
    conversationId = data.conversations?.[0]?.id ?? null;
  } catch { /* no conversation */ }

  if (!conversationId) return counts;

  let lastMessageId: string | undefined;
  while (true) {
    let path = `/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`;
    if (lastMessageId) path += `&lastMessageId=${encodeURIComponent(lastMessageId)}`;

    let data: { messages?: Array<Record<string, unknown>>; lastMessageId?: string };
    try {
      data = (await ghlFetch(path, pit)) as typeof data;
    } catch { break; }

    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      const ghlMsgId = msg.id as string;
      const direction = classifyDirection(msg);
      const msgType = (msg.messageType as string) ?? (msg.type as string) ?? null;
      const body = (msg.body as string) ?? '';
      const messageAt = (msg.dateAdded as string) ?? (msg.createdAt as string) ?? new Date().toISOString();

      const existing = queryOne('SELECT id FROM messages WHERE ghl_message_id = ?', [ghlMsgId]);
      if (!existing) {
        execute(
          `INSERT INTO messages (id, contact_id, company_id, ghl_message_id, direction, type, body_preview, message_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [randomUUID(), contactDbId, companyId, ghlMsgId, direction, msgType, body.slice(0, 200), messageAt]
        );
        counts.created++;
      }
      counts.found++;
    }

    lastMessageId = data.lastMessageId ?? undefined;
    if (!lastMessageId || messages.length < 50) break;
    // Rate limiter handles pacing — no manual delay needed
  }

  // Update contact message stats + mark messages as synced
  updateContactMessageStats(contactDbId);
  execute(
    `UPDATE contacts SET messages_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [contactDbId]
  );
  return counts;
}

function classifyDirection(msg: Record<string, unknown>): 'inbound' | 'outbound' {
  if (msg.direction === 'inbound' || msg.direction === 'incoming') return 'inbound';
  if (msg.direction === 'outbound' || msg.direction === 'outgoing') return 'outbound';
  const source = msg.source as string | undefined;
  if (source === 'workflow' || source === 'automation' || source === 'bulk_action') return 'outbound';
  return msg.direction === 1 ? 'outbound' : 'inbound';
}

function updateContactMessageStats(contactDbId: string): void {
  const outbound = queryOne(
    `SELECT MAX(message_at) as last_at FROM messages WHERE contact_id = ? AND direction = 'outbound'`,
    [contactDbId]
  );
  const inbound = queryOne(
    `SELECT MAX(message_at) as last_at FROM messages WHERE contact_id = ? AND direction = 'inbound'`,
    [contactDbId]
  );
  const lastOutbound = (outbound?.last_at as string) ?? null;
  const lastInbound = (inbound?.last_at as string) ?? null;
  let daysSince = 9999;
  if (lastOutbound) {
    daysSince = Math.floor((Date.now() - new Date(lastOutbound).getTime()) / 86400000);
  }
  execute(
    `UPDATE contacts SET last_outbound_at=?, last_inbound_at=?, days_since_outbound=?, updated_at=datetime('now') WHERE id=?`,
    [lastOutbound, lastInbound, daysSince, contactDbId]
  );
}

// ── Users sync ────────────────────────────────────────────────────────

export async function syncUsers(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(`/users/?locationId=${encodeURIComponent(locationId)}`, pit)) as {
      users?: Array<Record<string, unknown>>;
    };

    for (const u of data.users ?? []) {
      const ghlUserId = u.id as string;
      const newHash = entityContentHash(u, ['name', 'firstName', 'email', 'phone', 'role', 'type']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_users WHERE ghl_user_id = ? AND company_id = ?',
        [ghlUserId, companyId]
      );
      const name = titleCase((u.name as string) ?? (u.firstName as string) ?? null);
      const email = (u.email as string) ?? null;
      const phone = (u.phone as string) ?? null;
      const role = (u.role as string) ?? (u.type as string) ?? null;
      const permissions = u.permissions ? JSON.stringify(u.permissions) : null;

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_users SET name=?, email=?, phone=?, role=?, permissions=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, email, phone, role, permissions, newHash, now, existing.id as string]
        );
        logChange('user', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_users (id, ghl_user_id, company_id, ghl_location_id, name, email, phone, role, permissions, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlUserId, companyId, locationId, name, email, phone, role, permissions, newHash, now]
        );
        logChange('user', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Users sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Workflows sync ────────────────────────────────────────────────────

export async function syncWorkflows(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(`/workflows/?locationId=${encodeURIComponent(locationId)}`, pit)) as {
      workflows?: Array<Record<string, unknown>>;
    };

    for (const w of data.workflows ?? []) {
      const ghlId = w.id as string;
      const newHash = entityContentHash(w, ['name', 'status', 'version']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_workflows WHERE ghl_workflow_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (w.name as string) ?? 'Unnamed';
      const status = (w.status as string) ?? null;
      const version = (w.version as number) ?? null;

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_workflows SET name=?, status=?, version=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, version, newHash, now, existing.id as string]
        );
        logChange('workflow', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_workflows (id, ghl_workflow_id, company_id, ghl_location_id, name, status, version, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, status, version, newHash, now]
        );
        logChange('workflow', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Workflows sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Funnels sync ──────────────────────────────────────────────────────

export async function syncFunnels(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(`/funnels/?locationId=${encodeURIComponent(locationId)}`, pit)) as {
      funnels?: Array<Record<string, unknown>>;
    };

    for (const f of data.funnels ?? []) {
      const ghlId = f.id as string;
      const newHash = entityContentHash(f, ['name', 'status', 'url']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_funnels WHERE ghl_funnel_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (f.name as string) ?? 'Unnamed';
      const status = (f.status as string) ?? null;
      const stepsCount = (f.steps as unknown[])?.length ?? 0;
      const url = (f.url as string) ?? null;

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_funnels SET name=?, status=?, steps_count=?, url=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, stepsCount, url, newHash, now, existing.id as string]
        );
        logChange('funnel', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_funnels (id, ghl_funnel_id, company_id, ghl_location_id, name, status, steps_count, url, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, status, stepsCount, url, newHash, now]
        );
        logChange('funnel', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Funnels sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Sites sync ────────────────────────────────────────────────────────

export async function syncSites(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    // GHL websites endpoint — may vary by API version
    const data = (await ghlFetch(`/websites/?locationId=${encodeURIComponent(locationId)}`, pit)) as {
      websites?: Array<Record<string, unknown>>;
    };

    for (const s of data.websites ?? []) {
      const ghlId = s.id as string;
      const newHash = entityContentHash(s, ['name', 'status', 'url']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_sites WHERE ghl_site_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (s.name as string) ?? 'Unnamed';
      const status = (s.status as string) ?? null;
      const url = (s.url as string) ?? null;

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_sites SET name=?, status=?, url=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, url, newHash, now, existing.id as string]
        );
        logChange('site', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_sites (id, ghl_site_id, company_id, ghl_location_id, name, status, url, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, status, url, newHash, now]
        );
        logChange('site', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Sites sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Email templates sync ──────────────────────────────────────────────

export async function syncEmailTemplates(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(`/emails/templates?locationId=${encodeURIComponent(locationId)}`, pit)) as {
      templates?: Array<Record<string, unknown>>;
    };

    for (const t of data.templates ?? []) {
      const ghlId = t.id as string;
      const newHash = entityContentHash(t, ['name', 'subject', 'status']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_email_templates WHERE ghl_template_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (t.name as string) ?? 'Unnamed';
      const subject = (t.subject as string) ?? null;
      const status = (t.status as string) ?? null;
      const body = (t.body as string) ?? (t.html as string) ?? '';

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_email_templates SET name=?, subject=?, status=?, body_preview=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, subject, status, body.slice(0, 500), newHash, now, existing.id as string]
        );
        logChange('email_template', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_email_templates (id, ghl_template_id, company_id, ghl_location_id, name, subject, status, body_preview, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, subject, status, body.slice(0, 500), newHash, now]
        );
        logChange('email_template', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Email templates sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Custom fields sync ────────────────────────────────────────────────

export async function syncCustomFields(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(`/locations/${encodeURIComponent(locationId)}/customFields`, pit)) as {
      customFields?: Array<Record<string, unknown>>;
    };

    for (const f of data.customFields ?? []) {
      const ghlId = f.id as string;
      const newHash = entityContentHash(f, ['name', 'fieldKey', 'dataType', 'placeholder', 'model']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_custom_fields WHERE ghl_field_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (f.name as string) ?? 'Unnamed';
      const fieldKey = (f.fieldKey as string) ?? null;
      const dataType = (f.dataType as string) ?? null;
      const placeholder = (f.placeholder as string) ?? null;
      const position = (f.position as number) ?? null;
      const model = (f.model as string) ?? null;

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; continue; }
        execute(
          `UPDATE ghl_custom_fields SET name=?, field_key=?, data_type=?, placeholder=?, position=?, model=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, fieldKey, dataType, placeholder, position, model, newHash, now, existing.id as string]
        );
        logChange('custom_field', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_custom_fields (id, ghl_field_id, company_id, ghl_location_id, name, field_key, data_type, placeholder, position, model, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, fieldKey, dataType, placeholder, position, model, newHash, now]
        );
        logChange('custom_field', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Custom fields sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Pipelines sync ───────────────────────────────────────────────────

export async function syncPipelines(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  try {
    const data = (await ghlFetch(
      `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      pit
    )) as { pipelines?: Array<Record<string, unknown>> };

    for (const p of data.pipelines ?? []) {
      const ghlId = p.id as string;
      const name = (p.name as string) ?? 'Unnamed';
      const newHash = entityContentHash(p, ['name']);
      const existing = queryOne(
        'SELECT id, content_hash FROM ghl_pipelines WHERE ghl_pipeline_id = ? AND company_id = ?',
        [ghlId, companyId]
      );

      if (existing) {
        if ((existing.content_hash as string) === newHash) { counts.found++; }
        else {
          execute(
            `UPDATE ghl_pipelines SET name=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
            [name, newHash, now, existing.id as string]
          );
          logChange('pipeline', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
          counts.updated++;
        }
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO ghl_pipelines (id, ghl_pipeline_id, company_id, ghl_location_id, name, content_hash, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, ghlId, companyId, locationId, name, newHash, now]
        );
        logChange('pipeline', id, companyId, 'created', null, newHash);
        counts.created++;
      }
      counts.found++;

      // Upsert stages for this pipeline
      const stages = (p.stages as Array<Record<string, unknown>>) ?? [];
      for (const s of stages) {
        const stageGhlId = s.id as string;
        const stageName = (s.name as string) ?? 'Unnamed';
        const position = (s.position as number) ?? 0;
        const stageHash = entityContentHash(s, ['name', 'position']);
        const existingStage = queryOne(
          'SELECT id, content_hash FROM ghl_pipeline_stages WHERE ghl_stage_id = ? AND company_id = ?',
          [stageGhlId, companyId]
        );

        if (existingStage) {
          if ((existingStage.content_hash as string) !== stageHash) {
            execute(
              `UPDATE ghl_pipeline_stages SET name=?, position=?, ghl_pipeline_id=?, content_hash=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
              [stageName, position, ghlId, stageHash, now, existingStage.id as string]
            );
            logChange('pipeline_stage', existingStage.id as string, companyId, 'updated', existingStage.content_hash as string, stageHash);
          }
        } else {
          const stageId = randomUUID();
          execute(
            `INSERT INTO ghl_pipeline_stages (id, ghl_stage_id, ghl_pipeline_id, company_id, name, position, content_hash, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [stageId, stageGhlId, ghlId, companyId, stageName, position, stageHash, now]
          );
          logChange('pipeline_stage', stageId, companyId, 'created', null, stageHash);
        }
      }
    }
  } catch (err: unknown) {
    logger.warn('GHL', 'Pipelines sync skipped', { company_id: companyId, error: err instanceof Error ? err.message : String(err) });
  }

  return counts;
}

// ── Opportunities sync ───────────────────────────────────────────────

export async function syncOpportunities(
  locationId: string,
  companyId: string,
  pit: string,
  pipelineId: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  // Build stage name lookup from local DB
  const stageRows = queryAll(
    'SELECT ghl_stage_id, name FROM ghl_pipeline_stages WHERE ghl_pipeline_id = ? AND company_id = ?',
    [pipelineId, companyId]
  );
  const stageMap = new Map(stageRows.map(s => [s.ghl_stage_id as string, s.name as string]));

  let page = 1;
  const limit = 100;

  while (true) {
    let data: { opportunities?: Array<Record<string, unknown>>; meta?: { total?: number } };
    try {
      data = (await ghlFetch(
        `/opportunities/search?location_id=${encodeURIComponent(locationId)}&pipeline_id=${encodeURIComponent(pipelineId)}&page=${page}&limit=${limit}`,
        pit
      )) as typeof data;
    } catch (err: unknown) {
      logger.warn('GHL', 'Opportunities fetch failed', { company_id: companyId, pipeline_id: pipelineId, page, error: err instanceof Error ? err.message : String(err) });
      break;
    }

    const opps = data.opportunities ?? [];
    if (opps.length === 0) break;

    executeInTransaction(() => {
      for (const opp of opps) {
        const ghlOppId = opp.id as string;
        const name = (opp.name as string) ?? 'Unnamed';
        const status = (opp.status as string) ?? 'open';
        const stageId = (opp.pipelineStageId as string) ?? null;
        const stageName = stageId ? (stageMap.get(stageId) ?? '') : '';
        const ghlContactId = (opp.contactId as string) ?? null;
        const assignedTo = (opp.assignedTo as string) ?? null;
        const monetaryValue = (opp.monetaryValue as number) ?? null;
        const createdAt = (opp.createdAt as string) ?? now;
        const updatedAt = (opp.updatedAt as string) ?? now;
        const newHash = entityContentHash(opp, ['name', 'status', 'pipelineStageId', 'monetaryValue', 'assignedTo']);

        // Link to local contact record
        let contactId: string | null = null;
        if (ghlContactId) {
          const contactRow = queryOne(
            'SELECT id FROM contacts WHERE ghl_contact_id = ? AND company_id = ?',
            [ghlContactId, companyId]
          );
          contactId = (contactRow?.id as string) ?? null;
        }

        const existing = queryOne(
          'SELECT id, content_hash FROM ghl_opportunities WHERE ghl_opportunity_id = ? AND company_id = ?',
          [ghlOppId, companyId]
        );

        if (existing) {
          if ((existing.content_hash as string) !== newHash) {
            execute(
              `UPDATE ghl_opportunities SET name=?, status=?, ghl_stage_id=?, stage_name=?, contact_id=?, ghl_contact_id=?,
               assigned_to=?, monetary_value=?, content_hash=?, synced_at=?, updated_at=? WHERE id=?`,
              [name, status, stageId, stageName, contactId, ghlContactId, assignedTo, monetaryValue, newHash, now, updatedAt, existing.id as string]
            );
            logChange('opportunity', existing.id as string, companyId, 'updated', existing.content_hash as string, newHash);
            counts.updated++;
          }
        } else {
          const id = randomUUID();
          execute(
            `INSERT INTO ghl_opportunities (id, ghl_opportunity_id, company_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id,
             stage_name, name, status, contact_id, ghl_contact_id, assigned_to, monetary_value, content_hash, synced_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, ghlOppId, companyId, locationId, pipelineId, stageId, stageName, name, status, contactId, ghlContactId, assignedTo, monetaryValue, newHash, now, createdAt, updatedAt]
          );
          logChange('opportunity', id, companyId, 'created', null, newHash);
          counts.created++;
        }
        counts.found++;
      }
    });

    if (opps.length < limit) break;
    page++;
    // Rate limiter handles pacing — no manual delay needed
  }

  return counts;
}

// ── Opportunity write operations (for pulse sync) ────────────────────

export async function createOpportunity(
  pit: string,
  params: {
    locationId: string;
    pipelineId: string;
    stageId: string;
    name: string;
    contactId?: string;
    status?: string;
    assignedTo?: string;
    monetaryValue?: number;
    customFields?: Array<{ id: string; field_value: unknown }>;
  }
): Promise<string> {
  const body: Record<string, unknown> = {
    pipelineId: params.pipelineId,
    pipelineStageId: params.stageId,
    locationId: params.locationId,
    name: params.name,
    status: params.status ?? 'open',
  };
  if (params.contactId) body.contactId = params.contactId;
  if (params.assignedTo) body.assignedTo = params.assignedTo;
  if (params.monetaryValue != null) body.monetaryValue = params.monetaryValue;
  if (params.customFields?.length) body.customFields = params.customFields;

  const result = (await ghlFetch('/opportunities/', pit, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { opportunity?: { id: string } };

  return result.opportunity?.id ?? '';
}

export async function updateOpportunity(
  pit: string,
  oppId: string,
  params: {
    pipelineId?: string;
    stageId?: string;
    name?: string;
    status?: string;
    assignedTo?: string;
    monetaryValue?: number;
    customFields?: Array<{ id: string; field_value: unknown }>;
  }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (params.pipelineId) body.pipelineId = params.pipelineId;
  if (params.stageId) body.pipelineStageId = params.stageId;
  if (params.name) body.name = params.name;
  if (params.status) body.status = params.status;
  if (params.assignedTo) body.assignedTo = params.assignedTo;
  if (params.monetaryValue != null) body.monetaryValue = params.monetaryValue;
  if (params.customFields?.length) body.customFields = params.customFields;

  await ghlFetch(`/opportunities/${encodeURIComponent(oppId)}`, pit, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ── SLA computation ───────────────────────────────────────────────────

export function computeContactSLA(days: number, hasOutbound: boolean, config: SLAConfig): SLAStatus {
  if (!hasOutbound) return 'violation';
  if (days > config.violationDays) return 'violation';
  if (days > config.warningDays) return 'warning';
  return 'ok';
}

export function updateContactSLA(contactId: string, status: SLAStatus): void {
  execute(`UPDATE contacts SET sla_status=?, updated_at=datetime('now') WHERE id=?`, [status, contactId]);
}

export function computeCompanySLA(companyId: string): { status: SLAStatus; daysSinceContact: number } {
  const contacts = queryAll(
    'SELECT days_since_outbound, last_outbound_at, sla_status, tags FROM contacts WHERE company_id = ?',
    [companyId]
  );
  const clientContacts = contacts.filter((c) => {
    const tags = c.tags as string | null;
    if (!tags) return false;
    try { return (JSON.parse(tags) as string[]).some((t) => t.toLowerCase().includes('client')); }
    catch { return false; }
  });

  if (clientContacts.length === 0) return { status: 'ok', daysSinceContact: 0 };

  let worstStatus: SLAStatus = 'ok';
  let maxDays = 0;
  for (const c of clientContacts) {
    const days = (c.days_since_outbound as number) ?? 9999;
    const status = c.sla_status as SLAStatus;
    if (days > maxDays) maxDays = days;
    if (status === 'violation') worstStatus = 'violation';
    else if (status === 'warning' && worstStatus !== 'violation') worstStatus = 'warning';
  }

  return { status: worstStatus, daysSinceContact: maxDays };
}

export function updateCompanySLA(companyId: string): void {
  const { status, daysSinceContact } = computeCompanySLA(companyId);
  execute(
    `UPDATE companies SET sla_status=?, sla_days_since_contact=?, updated_at=datetime('now') WHERE id=?`,
    [status, daysSinceContact, companyId]
  );
}
