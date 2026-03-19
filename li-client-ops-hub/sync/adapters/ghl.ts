import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts, logAlert } from '../utils/logger';

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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function ghlFetch(path: string, token: string, options?: RequestInit): Promise<unknown> {
  const url = `${GHL_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
    console.log(`[ghl] Rate limited, waiting ${retryAfter}s`);
    await delay(retryAfter * 1000);
    const retry = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    });
    if (!retry.ok) {
      const text = await retry.text().catch(() => '');
      throw new GHLAPIError(`GHL ${retry.status}: ${text.slice(0, 200)}`, retry.status);
    }
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GHLAPIError(`GHL ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  return res.json();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
    await delay(100);
  }

  console.log(`[ghl] Synced ${count} locations`);
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

export async function syncContacts(
  locationId: string,
  companyId: string,
  pit: string
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  let startAfterId: string | undefined;
  const MAX_CONTACTS = 500;
  let apiTotalCaptured = false;

  while (counts.found < MAX_CONTACTS) {
    let path = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`;
    if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;

    const data = (await ghlFetch(path, pit)) as {
      contacts?: Array<Record<string, unknown>>;
      meta?: { startAfterId?: string; total?: number };
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

    for (const c of contacts) {
      const ghlId = c.id as string;
      const firstName = (c.firstName as string) ?? null;
      const lastName = (c.lastName as string) ?? null;
      const email = (c.email as string) ?? null;
      const phone = (c.phone as string) ?? null;
      const tags = c.tags ? JSON.stringify(c.tags) : null;

      const existing = queryOne(
        'SELECT id FROM contacts WHERE ghl_contact_id = ? AND company_id = ?',
        [ghlId, companyId]
      );

      if (existing) {
        execute(
          `UPDATE contacts SET first_name=?, last_name=?, email=?, phone=?, tags=?, updated_at=datetime('now') WHERE id=?`,
          [firstName, lastName, email, phone, tags, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone, tags, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [randomUUID(), companyId, ghlId, firstName, lastName, email, phone, tags]
        );
        counts.created++;
      }
      counts.found++;
    }

    startAfterId = data.meta?.startAfterId ?? undefined;
    if (!startAfterId || contacts.length < 100) break;
    await delay(100);
  }

  if (counts.found >= MAX_CONTACTS) {
    logAlert('sync_warning', 'warning', `Contact sync hit ${MAX_CONTACTS} limit for ${companyId}`, companyId);
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

    const messages = data.messages ?? [];
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
    await delay(100);
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
      const existing = queryOne(
        'SELECT id FROM ghl_users WHERE ghl_user_id = ? AND company_id = ?',
        [ghlUserId, companyId]
      );
      const name = (u.name as string) ?? (u.firstName as string) ?? null;
      const email = (u.email as string) ?? null;
      const phone = (u.phone as string) ?? null;
      const role = (u.role as string) ?? (u.type as string) ?? null;
      const permissions = u.permissions ? JSON.stringify(u.permissions) : null;

      if (existing) {
        execute(
          `UPDATE ghl_users SET name=?, email=?, phone=?, role=?, permissions=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, email, phone, role, permissions, now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_users (id, ghl_user_id, company_id, ghl_location_id, name, email, phone, role, permissions, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlUserId, companyId, locationId, name, email, phone, role, permissions, now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Users sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
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
      const existing = queryOne(
        'SELECT id FROM ghl_workflows WHERE ghl_workflow_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (w.name as string) ?? 'Unnamed';
      const status = (w.status as string) ?? null;
      const version = (w.version as number) ?? null;

      if (existing) {
        execute(
          `UPDATE ghl_workflows SET name=?, status=?, version=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, version, now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_workflows (id, ghl_workflow_id, company_id, ghl_location_id, name, status, version, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlId, companyId, locationId, name, status, version, now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Workflows sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
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
      const existing = queryOne(
        'SELECT id FROM ghl_funnels WHERE ghl_funnel_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (f.name as string) ?? 'Unnamed';
      const status = (f.status as string) ?? null;
      const stepsCount = (f.steps as unknown[])?.length ?? 0;
      const url = (f.url as string) ?? null;

      if (existing) {
        execute(
          `UPDATE ghl_funnels SET name=?, status=?, steps_count=?, url=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, stepsCount, url, now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_funnels (id, ghl_funnel_id, company_id, ghl_location_id, name, status, steps_count, url, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlId, companyId, locationId, name, status, stepsCount, url, now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Funnels sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
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
      const existing = queryOne(
        'SELECT id FROM ghl_sites WHERE ghl_site_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (s.name as string) ?? 'Unnamed';
      const status = (s.status as string) ?? null;
      const url = (s.url as string) ?? null;

      if (existing) {
        execute(
          `UPDATE ghl_sites SET name=?, status=?, url=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, status, url, now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_sites (id, ghl_site_id, company_id, ghl_location_id, name, status, url, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlId, companyId, locationId, name, status, url, now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Sites sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
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
      const existing = queryOne(
        'SELECT id FROM ghl_email_templates WHERE ghl_template_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (t.name as string) ?? 'Unnamed';
      const subject = (t.subject as string) ?? null;
      const status = (t.status as string) ?? null;
      const body = (t.body as string) ?? (t.html as string) ?? '';

      if (existing) {
        execute(
          `UPDATE ghl_email_templates SET name=?, subject=?, status=?, body_preview=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, subject, status, body.slice(0, 500), now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_email_templates (id, ghl_template_id, company_id, ghl_location_id, name, subject, status, body_preview, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlId, companyId, locationId, name, subject, status, body.slice(0, 500), now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Email templates sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
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
      const existing = queryOne(
        'SELECT id FROM ghl_custom_fields WHERE ghl_field_id = ? AND company_id = ?',
        [ghlId, companyId]
      );
      const name = (f.name as string) ?? 'Unnamed';
      const fieldKey = (f.fieldKey as string) ?? null;
      const dataType = (f.dataType as string) ?? null;
      const placeholder = (f.placeholder as string) ?? null;
      const position = (f.position as number) ?? null;
      const model = (f.model as string) ?? null;

      if (existing) {
        execute(
          `UPDATE ghl_custom_fields SET name=?, field_key=?, data_type=?, placeholder=?, position=?, model=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [name, fieldKey, dataType, placeholder, position, model, now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO ghl_custom_fields (id, ghl_field_id, company_id, ghl_location_id, name, field_key, data_type, placeholder, position, model, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), ghlId, companyId, locationId, name, fieldKey, dataType, placeholder, position, model, now]
        );
        counts.created++;
      }
      counts.found++;
    }
  } catch (err: unknown) {
    console.log(`[ghl] Custom fields sync skipped for ${companyId}: ${err instanceof Error ? err.message : err}`);
  }

  return counts;
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
