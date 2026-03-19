import os from 'os';
import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';

// ── Constants ─────────────────────────────────────────────────────────

const MAX_CONCURRENT_PITS = 5;
const CONTACT_BATCH_SIZE = 100;
const MS_BETWEEN_REQUESTS = 1000;
const POLL_INTERVAL_MS = 2000;
const RAM_LIMIT_PERCENT = 0.10;
const MIN_RAM_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB floor

let isRunning = false;
let shouldStop = false;
let mainWindowRef: { webContents: { send: (ch: string, data: unknown) => void } } | null = null;

// ── Public API ────────────────────────────────────────────────────────

export function setMainWindow(win: typeof mainWindowRef): void {
  mainWindowRef = win;
}

export function startQueueManager(): void {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;
  console.log('[QueueManager] Started');
  processLoop();
}

export function stopQueueManager(): void {
  shouldStop = true;
  console.log('[QueueManager] Stopping...');
}

export function isQueueRunning(): boolean {
  return isRunning;
}

export function getMemoryStats(): { used: number; limit: number; total: number; percent: number } {
  const total = os.totalmem();
  const limit = Math.max(total * RAM_LIMIT_PERCENT, MIN_RAM_BYTES);
  const usage = process.memoryUsage();
  const used = usage.heapUsed + usage.external;
  return { used, limit, total, percent: (used / limit) * 100 };
}

export function getQueueStats(): Record<string, number> {
  const row = queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM sync_queue WHERE created_at >= datetime('now', '-24 hours')
  `);
  return {
    total: (row?.total as number) ?? 0,
    pending: (row?.pending as number) ?? 0,
    running: (row?.running as number) ?? 0,
    completed: (row?.completed as number) ?? 0,
    failed: (row?.failed as number) ?? 0,
  };
}

// ── Enqueue helpers ───────────────────────────────────────────────────

export function enqueueTask(task: {
  company_id: string;
  company_name: string | null;
  ghl_location_id: string;
  task_type: string;
  params_json: string;
  priority?: number;
}): void {
  execute(
    `INSERT INTO sync_queue (id, company_id, company_name, ghl_location_id, task_type, params_json, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [randomUUID(), task.company_id, task.company_name, task.ghl_location_id, task.task_type, task.params_json, task.priority ?? 50]
  );
}

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

export function enqueueFullCompanySync(company: {
  id: string;
  name: string;
  ghl_location_id: string;
}, priority: number = 50): void {

  if (company.ghl_location_id === RI_LOCATION_ID) {
    // ── Restoration Inbound: two-phase sync ──────────────────────────
    // Phase 1: Client-tagged contacts FIRST (higher priority)
    enqueueTask({
      company_id: company.id,
      company_name: company.name,
      ghl_location_id: company.ghl_location_id,
      task_type: 'contact_batch_tagged',
      params_json: JSON.stringify({ tag: 'client', startAfterId: null, batchNumber: 1 }),
      priority: priority + 20,
    });

    // Phase 2: All contacts (normal priority, runs after Phase 1 due to lower priority)
    enqueueTask({
      company_id: company.id,
      company_name: company.name,
      ghl_location_id: company.ghl_location_id,
      task_type: 'contact_batch',
      params_json: JSON.stringify({ startAfterId: null, batchNumber: 1 }),
      priority,
    });
  } else {
    // ── Standard single-phase sync ───────────────────────────────────
    enqueueTask({
      company_id: company.id,
      company_name: company.name,
      ghl_location_id: company.ghl_location_id,
      task_type: 'contact_batch',
      params_json: JSON.stringify({ startAfterId: null, batchNumber: 1 }),
      priority,
    });
  }

  // Entity syncs (same for all sub-accounts)
  for (const entityType of ['users', 'workflows', 'funnels', 'sites', 'templates', 'fields']) {
    enqueueTask({
      company_id: company.id,
      company_name: company.name,
      ghl_location_id: company.ghl_location_id,
      task_type: 'entity_sync',
      params_json: JSON.stringify({ entityType }),
      priority: priority - 10,
    });
  }

  // Initialize progress
  execute(
    `INSERT OR REPLACE INTO sync_progress (id, company_id, company_name, overall_status, updated_at)
     VALUES (?, ?, ?, 'syncing_contacts', datetime('now'))`,
    [company.id, company.id, company.name]
  );
}

// ── Core loop ─────────────────────────────────────────────────────────

async function processLoop(): Promise<void> {
  while (!shouldStop) {
    if (isMemoryExceeded()) {
      console.log('[QueueManager] Memory limit, pausing 30s');
      await delay(30000);
      continue;
    }

    const tasks = getNextTasks(MAX_CONCURRENT_PITS);
    if (tasks.length === 0) {
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    await Promise.all(tasks.map((t) => processTask(t)));
    await delay(500);
  }

  isRunning = false;
  console.log('[QueueManager] Stopped');
}

function isMemoryExceeded(): boolean {
  const stats = getMemoryStats();
  return stats.percent > 100;
}

interface QueueTask {
  id: string;
  company_id: string;
  company_name: string;
  ghl_location_id: string;
  task_type: string;
  params_json: string;
  status: string;
  priority: number;
  attempt: number;
  max_attempts: number;
  pit_token: string;
}

function getNextTasks(max: number): QueueTask[] {
  return queryAll(
    `SELECT sq.*, c.pit_token
     FROM sync_queue sq
     JOIN companies c ON c.id = sq.company_id
     WHERE sq.status IN ('pending', 'running')
       AND c.pit_token IS NOT NULL AND c.pit_status = 'valid'
       AND (sq.next_run_at IS NULL OR sq.next_run_at <= datetime('now'))
       AND sq.attempt < sq.max_attempts
     GROUP BY sq.company_id
     ORDER BY
       CASE sq.status WHEN 'running' THEN 0 ELSE 1 END,
       sq.priority DESC, sq.created_at ASC
     LIMIT ?`,
    [max]
  ) as unknown as QueueTask[];
}

// ── Task dispatcher ───────────────────────────────────────────────────

async function processTask(task: QueueTask): Promise<void> {
  execute(
    "UPDATE sync_queue SET status = 'running', started_at = datetime('now'), attempt = attempt + 1 WHERE id = ?",
    [task.id]
  );

  try {
    switch (task.task_type) {
      case 'contact_batch':
        await processContactBatch(task);
        break;
      case 'contact_batch_tagged':
        await processContactBatchTagged(task);
        break;
      case 'contact_messages':
        await processContactMessages(task);
        break;
      case 'entity_sync':
        await processEntitySync(task);
        break;
      default:
        throw new Error(`Unknown task: ${task.task_type}`);
    }
    execute("UPDATE sync_queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [task.id]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');

    if (isRateLimit) {
      execute(
        "UPDATE sync_queue SET status = 'pending', next_run_at = datetime('now', '+60 seconds'), error = ? WHERE id = ?",
        [`Rate limited, retry in 60s`, task.id]
      );
    } else {
      const finalStatus = task.attempt >= task.max_attempts ? 'failed' : 'pending';
      execute(
        "UPDATE sync_queue SET status = ?, error = ?, completed_at = datetime('now') WHERE id = ?",
        [finalStatus, msg, task.id]
      );
    }
  }

  updateSyncProgress(task.company_id);
  emitProgress(task.company_id);
}

// ── Contact batch ─────────────────────────────────────────────────────

async function processContactBatch(task: QueueTask): Promise<void> {
  const params = JSON.parse(task.params_json || '{}');
  const startAfterId = params.startAfterId || null;
  const batchNumber = params.batchNumber || 1;

  let url = `/contacts/?locationId=${encodeURIComponent(task.ghl_location_id)}&limit=${CONTACT_BATCH_SIZE}`;
  if (startAfterId) url += `&startAfterId=${encodeURIComponent(startAfterId)}`;

  const data = await ghlFetch(url, task.pit_token);
  await delay(MS_BETWEEN_REQUESTS);

  const contacts = (data as { contacts?: Array<Record<string, unknown>>; meta?: { total?: number; startAfterId?: string } }).contacts ?? [];
  const meta = (data as { meta?: { total?: number; startAfterId?: string } }).meta;

  // Store API total
  if (meta?.total != null) {
    execute('UPDATE companies SET contacts_api_total = ?, updated_at = datetime(\'now\') WHERE id = ?', [meta.total, task.company_id]);
  }

  // Upsert contacts
  let created = 0;
  for (const c of contacts) {
    const ghlId = c.id as string;
    const existing = queryOne('SELECT id, messages_sync_status FROM contacts WHERE ghl_contact_id = ? AND company_id = ?', [ghlId, task.company_id]);

    if (existing) {
      execute(
        `UPDATE contacts SET first_name=?, last_name=?, email=?, phone=?, tags=?, updated_at=datetime('now') WHERE id=?`,
        [(c.firstName as string) ?? null, (c.lastName as string) ?? null, (c.email as string) ?? null, (c.phone as string) ?? null, c.tags ? JSON.stringify(c.tags) : null, existing.id as string]
      );
      // Queue messages for contacts without messages synced
      if ((existing.messages_sync_status as string) === 'pending') {
        queueContactMessages(task, c);
      }
    } else {
      const id = randomUUID();
      execute(
        `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone, tags, messages_sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
        [id, task.company_id, ghlId, (c.firstName as string) ?? null, (c.lastName as string) ?? null, (c.email as string) ?? null, (c.phone as string) ?? null, c.tags ? JSON.stringify(c.tags) : null]
      );
      created++;
      queueContactMessages(task, c);
    }
  }

  execute('UPDATE sync_queue SET items_found = ?, items_processed = ? WHERE id = ?', [contacts.length, contacts.length, task.id]);

  // Update company contact count
  execute(
    `UPDATE companies SET contact_count = (SELECT COUNT(*) FROM contacts WHERE company_id = ?), updated_at = datetime('now') WHERE id = ?`,
    [task.company_id, task.company_id]
  );

  // Chain next batch if more
  if (contacts.length === CONTACT_BATCH_SIZE) {
    const lastId = contacts[contacts.length - 1].id as string;
    enqueueTask({
      company_id: task.company_id,
      company_name: task.company_name,
      ghl_location_id: task.ghl_location_id,
      task_type: 'contact_batch',
      params_json: JSON.stringify({ startAfterId: lastId, batchNumber: batchNumber + 1 }),
      priority: task.priority,
    });
  } else {
    // Contacts done
    execute(
      "UPDATE sync_progress SET contacts_sync_status = 'completed', contacts_sync_percent = 100, updated_at = datetime('now') WHERE company_id = ?",
      [task.company_id]
    );
  }
}

function queueContactMessages(task: QueueTask, contact: Record<string, unknown>, priority: number = 30): void {
  const ghlId = contact.id as string;
  const existing = queryOne(
    "SELECT id FROM sync_queue WHERE company_id = ? AND task_type = 'contact_messages' AND params_json LIKE ? AND status IN ('pending', 'running')",
    [task.company_id, `%"ghlContactId":"${ghlId}"%`]
  );
  if (existing) return;

  enqueueTask({
    company_id: task.company_id,
    company_name: task.company_name,
    ghl_location_id: task.ghl_location_id,
    task_type: 'contact_messages',
    params_json: JSON.stringify({ ghlContactId: ghlId }),
    priority,
  });

  execute(
    "UPDATE contacts SET messages_sync_status = 'queued' WHERE ghl_contact_id = ? AND company_id = ?",
    [ghlId, task.company_id]
  );
}

// ── Tagged contact batch (RI client-priority Phase 1) ─────────────────

async function processContactBatchTagged(task: QueueTask): Promise<void> {
  const params = JSON.parse(task.params_json || '{}');
  const tag = params.tag || 'client';
  const startAfterId = params.startAfterId || null;
  const batchNumber = params.batchNumber || 1;

  // Try GHL tag filter
  let url = `/contacts/?locationId=${encodeURIComponent(task.ghl_location_id)}&limit=${CONTACT_BATCH_SIZE}`;
  url += `&query=${encodeURIComponent(tag)}`;
  if (startAfterId) url += `&startAfterId=${encodeURIComponent(startAfterId)}`;

  const data = await ghlFetch(url, task.pit_token);
  await delay(MS_BETWEEN_REQUESTS);

  let contacts = ((data as { contacts?: Array<Record<string, unknown>> }).contacts ?? []);

  // Client-side filter to ensure only truly tagged contacts
  contacts = contacts.filter((c) => {
    const tags = (c.tags as string[]) ?? [];
    return tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()));
  });

  const meta = (data as { meta?: { total?: number } }).meta;
  if (meta?.total != null && batchNumber === 1) {
    execute('UPDATE companies SET contacts_api_total = ?, updated_at = datetime(\'now\') WHERE id = ?', [meta.total, task.company_id]);
  }

  // Upsert contacts
  let processed = 0;
  for (const c of contacts) {
    const ghlId = c.id as string;
    const existing = queryOne('SELECT id FROM contacts WHERE ghl_contact_id = ? AND company_id = ?', [ghlId, task.company_id]);

    if (existing) {
      execute(
        `UPDATE contacts SET first_name=?, last_name=?, email=?, phone=?, tags=?, updated_at=datetime('now') WHERE id=?`,
        [(c.firstName as string) ?? null, (c.lastName as string) ?? null, (c.email as string) ?? null, (c.phone as string) ?? null, c.tags ? JSON.stringify(c.tags) : null, existing.id as string]
      );
    } else {
      execute(
        `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone, tags, messages_sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
        [randomUUID(), task.company_id, ghlId, (c.firstName as string) ?? null, (c.lastName as string) ?? null, (c.email as string) ?? null, (c.phone as string) ?? null, c.tags ? JSON.stringify(c.tags) : null]
      );
    }
    processed++;

    // Queue messages at HIGH priority (90) for client contacts
    queueContactMessages(task, c, 90);
  }

  execute('UPDATE sync_queue SET items_found = ?, items_processed = ? WHERE id = ?', [contacts.length, processed, task.id]);

  // Update company contact count
  execute(
    'UPDATE companies SET contact_count = (SELECT COUNT(*) FROM contacts WHERE company_id = ?), updated_at = datetime(\'now\') WHERE id = ?',
    [task.company_id, task.company_id]
  );

  // Chain next batch if full page
  const rawContacts = ((data as { contacts?: unknown[] }).contacts ?? []);
  if (rawContacts.length === CONTACT_BATCH_SIZE) {
    const lastId = (rawContacts[rawContacts.length - 1] as Record<string, unknown>).id as string;
    enqueueTask({
      company_id: task.company_id,
      company_name: task.company_name,
      ghl_location_id: task.ghl_location_id,
      task_type: 'contact_batch_tagged',
      params_json: JSON.stringify({ tag, startAfterId: lastId, batchNumber: batchNumber + 1 }),
      priority: task.priority,
    });
  } else {
    // Phase 1 complete
    console.log(`[RI Sync] Phase 1 complete: ${processed} client-tagged contacts synced`);
    if (mainWindowRef) {
      try {
        mainWindowRef.webContents.send('sync:clientContactsReady', {
          companyId: task.company_id,
          clientContactCount: processed,
        });
      } catch { /* window destroyed */ }
    }
  }
}

// ── Message content extraction ───────────────────────────────────────

function normalizeMessageType(type: string): string {
  const map: Record<string, string> = {
    'TYPE_SMS': 'sms', 'sms': 'sms', 'SMS': 'sms',
    'TYPE_EMAIL': 'email', 'email': 'email', 'Email': 'email',
    'TYPE_CALL': 'call', 'call': 'call', 'Call': 'call',
    'TYPE_FACEBOOK': 'facebook', 'fb': 'facebook',
    'TYPE_INSTAGRAM': 'instagram', 'ig': 'instagram',
    'TYPE_GMB': 'gmb', 'gmb': 'gmb',
    'TYPE_WHATSAPP': 'whatsapp', 'wa': 'whatsapp',
    'TYPE_LIVE_CHAT': 'live_chat', 'live_chat': 'live_chat',
    'TYPE_ACTIVITY': 'activity', 'activity': 'activity',
  };
  return map[type] || type.toLowerCase().replace('type_', '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMessageContent(msg: Record<string, unknown>): {
  body_preview: string;
  body_full: string;
  direction: 'inbound' | 'outbound';
  type: string;
  subject: string | null;
  call_duration: number | null;
  call_status: string | null;
  call_recording_url: string | null;
  has_attachments: number;
  attachment_count: number;
} {
  const rawType = (msg.messageType as string) ?? (msg.type as string) ?? 'unknown';
  const type = normalizeMessageType(rawType);
  const direction = classifyDirection(msg);

  let bodyFull = '';
  let subject: string | null = null;
  let callDuration: number | null = null;
  let callStatus: string | null = null;
  let callRecordingUrl: string | null = null;

  switch (type) {
    case 'email':
      subject = (msg.subject as string) ?? null;
      bodyFull = stripHtml((msg.body as string) ?? (msg.html as string) ?? (msg.text as string) ?? '');
      break;
    case 'call':
      callDuration = (msg.duration as number) ?? (msg.callDuration as number) ?? null;
      callStatus = (msg.callStatus as string) ?? (msg.status as string) ?? null;
      callRecordingUrl = (msg.recordingUrl as string) ?? (msg.recording as string) ?? null;
      if (msg.transcript) {
        bodyFull = `Call transcript: ${msg.transcript}`;
      } else if (msg.body) {
        bodyFull = msg.body as string;
      } else {
        bodyFull = `Phone call - ${callStatus || 'completed'} - ${callDuration ? callDuration + 's' : 'unknown duration'}`;
      }
      break;
    default:
      bodyFull = (msg.body as string) ?? (msg.text as string) ?? (msg.message as string) ?? '';
      break;
  }

  const attachments = (msg.attachments as unknown[]) ?? [];

  return {
    body_preview: bodyFull.substring(0, 500),
    body_full: bodyFull,
    direction,
    type,
    subject,
    call_duration: callDuration,
    call_status: callStatus,
    call_recording_url: callRecordingUrl,
    has_attachments: attachments.length > 0 ? 1 : 0,
    attachment_count: attachments.length,
  };
}

// ── Contact messages ──────────────────────────────────────────────────

async function processContactMessages(task: QueueTask): Promise<void> {
  const params = JSON.parse(task.params_json || '{}');
  const ghlContactId = params.ghlContactId;

  const contact = queryOne(
    'SELECT id FROM contacts WHERE ghl_contact_id = ? AND company_id = ?',
    [ghlContactId, task.company_id]
  );
  if (!contact) return;
  const contactDbId = contact.id as string;

  // Find conversation
  let conversationId: string | null = null;
  try {
    const searchData = await ghlFetch(`/conversations/search?contactId=${encodeURIComponent(ghlContactId)}`, task.pit_token);
    await delay(MS_BETWEEN_REQUESTS);
    conversationId = ((searchData as { conversations?: Array<{ id: string }> }).conversations ?? [])[0]?.id ?? null;
  } catch { /* no conversation */ }

  if (!conversationId) {
    execute("UPDATE contacts SET messages_sync_status = 'synced', messages_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [contactDbId]);
    return;
  }

  // Fetch messages
  let totalMessages = 0;
  let lastMessageId: string | undefined;

  while (true) {
    let url = `/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`;
    if (lastMessageId) url += `&lastMessageId=${encodeURIComponent(lastMessageId)}`;

    let msgData: { messages?: Array<Record<string, unknown>>; lastMessageId?: string };
    try {
      msgData = (await ghlFetch(url, task.pit_token)) as typeof msgData;
      await delay(MS_BETWEEN_REQUESTS);
    } catch { break; }

    const messages = msgData.messages ?? [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      const ghlMsgId = msg.id as string;
      const existing = queryOne('SELECT id FROM messages WHERE ghl_message_id = ?', [ghlMsgId]);
      if (!existing) {
        const content = extractMessageContent(msg);
        const messageAt = (msg.dateAdded as string) ?? (msg.createdAt as string) ?? new Date().toISOString();
        execute(
          `INSERT INTO messages (id, contact_id, company_id, ghl_message_id, direction, type, body_preview, body_full, subject,
           call_duration, call_status, call_recording_url, has_attachments, attachment_count, message_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [randomUUID(), contactDbId, task.company_id, ghlMsgId,
           content.direction, content.type, content.body_preview, content.body_full, content.subject,
           content.call_duration, content.call_status, content.call_recording_url,
           content.has_attachments, content.attachment_count, messageAt]
        );
        totalMessages++;
      }
    }

    lastMessageId = msgData.lastMessageId ?? undefined;
    if (!lastMessageId || messages.length < 50) break;
    if (isMemoryExceeded()) break;
  }

  // Update contact stats
  const outbound = queryOne("SELECT MAX(message_at) as ts FROM messages WHERE contact_id = ? AND direction = 'outbound'", [contactDbId]);
  const inbound = queryOne("SELECT MAX(message_at) as ts FROM messages WHERE contact_id = ? AND direction = 'inbound'", [contactDbId]);
  const lastOut = (outbound?.ts as string) ?? null;
  const daysSince = lastOut ? Math.floor((Date.now() - new Date(lastOut).getTime()) / 86400000) : 9999;

  execute(
    `UPDATE contacts SET messages_sync_status = 'synced', messages_synced_at = datetime('now'),
     last_outbound_at = ?, last_inbound_at = ?, days_since_outbound = ?, updated_at = datetime('now') WHERE id = ?`,
    [lastOut, (inbound?.ts as string) ?? null, daysSince, contactDbId]
  );

  execute('UPDATE sync_queue SET items_found = ?, items_processed = ? WHERE id = ?', [totalMessages, totalMessages, task.id]);
}

function classifyDirection(msg: Record<string, unknown>): 'inbound' | 'outbound' {
  if (msg.direction === 'inbound' || msg.direction === 'incoming') return 'inbound';
  if (msg.direction === 'outbound' || msg.direction === 'outgoing') return 'outbound';
  const source = msg.source as string | undefined;
  if (source === 'workflow' || source === 'automation' || source === 'bulk_action') return 'outbound';
  return msg.direction === 1 ? 'outbound' : 'inbound';
}

// ── Entity sync (reuses existing adapters) ────────────────────────────

async function processEntitySync(task: QueueTask): Promise<void> {
  const params = JSON.parse(task.params_json || '{}');
  const entityType = params.entityType;
  const { syncUsers, syncWorkflows, syncFunnels, syncSites, syncEmailTemplates, syncCustomFields } = require('../adapters/ghl');

  const fns: Record<string, (loc: string, cid: string, pit: string) => Promise<{ found: number }>> = {
    users: syncUsers, workflows: syncWorkflows, funnels: syncFunnels,
    sites: syncSites, templates: syncEmailTemplates, fields: syncCustomFields,
  };

  const fn = fns[entityType];
  if (!fn) return;

  const result = await fn(task.ghl_location_id, task.company_id, task.pit_token);
  execute('UPDATE sync_queue SET items_found = ?, items_processed = ? WHERE id = ?', [result.found, result.found, task.id]);
}

// ── Progress tracking ─────────────────────────────────────────────────

function updateSyncProgress(companyId: string): void {
  const contactCount = queryOne('SELECT COUNT(*) as cnt FROM contacts WHERE company_id = ?', [companyId]);
  const apiTotal = queryOne('SELECT contacts_api_total FROM companies WHERE id = ?', [companyId]);
  const msgStatus = queryOne(`
    SELECT
      SUM(CASE WHEN messages_sync_status = 'synced' THEN 1 ELSE 0 END) as with_messages,
      COUNT(*) as total
    FROM contacts WHERE company_id = ?`, [companyId]);
  const msgCount = queryOne('SELECT COUNT(*) as cnt FROM messages WHERE company_id = ?', [companyId]);

  const synced = (contactCount?.cnt as number) ?? 0;
  const total = (apiTotal?.contacts_api_total as number) ?? synced;
  const contactsPct = total > 0 ? (synced / total) * 100 : 0;
  const withMsg = (msgStatus?.with_messages as number) ?? 0;
  const msgPct = synced > 0 ? (withMsg / synced) * 100 : 0;

  let contactsStatus = 'not_started';
  if (synced >= total && total > 0) contactsStatus = 'completed';
  else if (synced > 0) contactsStatus = 'in_progress';

  let msgsStatus = 'not_started';
  if (withMsg >= synced && synced > 0) msgsStatus = 'completed';
  else if (withMsg > 0) msgsStatus = 'in_progress';

  const qStats = getQueueStats();
  let overall = 'idle';
  if (qStats.running > 0 || qStats.pending > 0) overall = contactsStatus === 'completed' ? 'syncing_messages' : 'syncing_contacts';
  if (contactsStatus === 'completed' && msgsStatus === 'completed') overall = 'completed';

  execute(
    `INSERT OR REPLACE INTO sync_progress (id, company_id, company_name,
      contacts_api_total, contacts_synced, contacts_sync_percent, contacts_sync_status,
      contacts_with_messages, messages_synced_total, messages_sync_status, messages_sync_percent,
      overall_status, overall_percent, updated_at)
     VALUES (?, ?, (SELECT name FROM companies WHERE id = ?),
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [companyId, companyId, companyId,
     total, synced, contactsPct, contactsStatus,
     withMsg, (msgCount?.cnt as number) ?? 0, msgsStatus, msgPct,
     overall, (contactsPct * 0.5) + (msgPct * 0.5)]
  );

  execute('UPDATE companies SET messages_synced_total = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [(msgCount?.cnt as number) ?? 0, companyId]);

  // For RI: also track client contacts separately
  const companyRow = queryOne('SELECT ghl_location_id FROM companies WHERE id = ?', [companyId]);
  if ((companyRow?.ghl_location_id as string) === RI_LOCATION_ID) {
    const clientStats = queryOne(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN messages_sync_status = 'synced' THEN 1 ELSE 0 END) as with_messages
      FROM contacts WHERE company_id = ? AND tags LIKE '%client%'`, [companyId]);

    const clientTotal = (clientStats?.total as number) ?? 0;
    const clientWithMsg = (clientStats?.with_messages as number) ?? 0;
    const clientStatus = clientTotal > 0 && clientWithMsg >= clientTotal ? 'completed' : clientTotal > 0 ? 'in_progress' : 'not_started';

    execute(
      `UPDATE sync_progress SET client_contacts_total = ?, client_contacts_synced = ?, client_contacts_with_messages = ?, client_contacts_sync_status = ?, updated_at = datetime('now') WHERE company_id = ?`,
      [clientTotal, clientTotal, clientWithMsg, clientStatus, companyId]
    );
  }
}

function emitProgress(companyId: string): void {
  if (!mainWindowRef) return;
  const progress = queryOne('SELECT * FROM sync_progress WHERE company_id = ?', [companyId]);
  const mem = getMemoryStats();
  const queue = getQueueStats();
  try {
    mainWindowRef.webContents.send('sync:progress', { companyId, progress, memory: mem, queue, phase: queue.pending === 0 && queue.running === 0 ? 'complete' : 'syncing' });
  } catch { /* window may be destroyed */ }
}

// ── GHL fetch (local to queue, doesn't depend on adapter imports) ─────

async function ghlFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('GHL 429 rate limit');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GHL ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
