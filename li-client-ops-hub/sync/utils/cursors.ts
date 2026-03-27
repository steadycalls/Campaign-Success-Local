import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../../db/client';

export interface SyncCursor {
  id: string;
  company_id: string;
  entity_type: string;
  last_synced_at: string;
  last_cursor: string | null;
  last_count: number;
  full_sync_at: string | null;
}

const FULL_SYNC_INTERVAL_DAYS = 7;

export function getSyncCursor(companyId: string, entityType: string): SyncCursor | null {
  const row = queryOne(
    'SELECT * FROM sync_cursors WHERE company_id = ? AND entity_type = ?',
    [companyId, entityType]
  );
  if (!row) return null;
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    entity_type: row.entity_type as string,
    last_synced_at: row.last_synced_at as string,
    last_cursor: (row.last_cursor as string) ?? null,
    last_count: (row.last_count as number) ?? 0,
    full_sync_at: (row.full_sync_at as string) ?? null,
  };
}

export function updateSyncCursor(
  companyId: string,
  entityType: string,
  timestamp: string,
  count: number,
  cursor?: string | null,
): void {
  execute(
    `INSERT INTO sync_cursors (id, company_id, entity_type, last_synced_at, last_cursor, last_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(company_id, entity_type) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       last_cursor = excluded.last_cursor,
       last_count = excluded.last_count,
       updated_at = datetime('now')`,
    [randomUUID(), companyId, entityType, timestamp, cursor ?? null, count]
  );
}

export function markFullSync(companyId: string, entityType: string): void {
  execute(
    `UPDATE sync_cursors SET full_sync_at = datetime('now'), updated_at = datetime('now')
     WHERE company_id = ? AND entity_type = ?`,
    [companyId, entityType]
  );
}

export function shouldFullSync(companyId: string, entityType: string): boolean {
  const cursor = getSyncCursor(companyId, entityType);
  if (!cursor) return true; // never synced

  if (!cursor.full_sync_at) return true; // never done a full sync

  const fullSyncMs = new Date(cursor.full_sync_at).getTime();
  const daysSince = (Date.now() - fullSyncMs) / 86400000;
  return daysSince > FULL_SYNC_INTERVAL_DAYS;
}

export function resetSyncCursors(companyId: string): void {
  execute('DELETE FROM sync_cursors WHERE company_id = ?', [companyId]);
}

/**
 * Compute a short content hash from contact fields.
 * Used to skip DB writes when nothing changed.
 */
export function contactContentHash(contact: Record<string, unknown>): string {
  const fields = [
    contact.firstName ?? '',
    contact.lastName ?? '',
    contact.email ?? '',
    contact.phone ?? '',
    JSON.stringify(contact.tags ?? []),
    contact.companyName ?? '',
    contact.assignedTo ?? '',
    contact.source ?? '',
    contact.city ?? '',
    contact.state ?? '',
    contact.website ?? '',
    contact.dateOfBirth ?? '',
    contact.address1 ?? '',
    contact.postalCode ?? '',
    contact.country ?? '',
  ];
  return djb2Hash(fields.join('|'));
}

/**
 * Generic entity content hash from arbitrary fields.
 * Used for users, workflows, funnels, sites, templates, custom fields.
 */
export function entityContentHash(data: Record<string, unknown>, fields: string[]): string {
  const values = fields.map(f => String(data[f] ?? ''));
  return djb2Hash(values.join('|'));
}

/** Fast DJB2 hash → short base36 string */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

// ── Change log ─────────────────────────────────────────────────────────

export function logChange(
  entityType: string,
  entityId: string,
  companyId: string | null,
  changeType: 'created' | 'updated',
  oldHash: string | null,
  newHash: string,
  syncRunId?: string,
): void {
  try {
    execute(
      `INSERT INTO change_log (id, entity_type, entity_id, company_id, change_type, old_hash, new_hash, sync_run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [randomUUID(), entityType, entityId, companyId, changeType, oldHash, newHash, syncRunId ?? null]
    );
  } catch { /* change_log table may not exist yet */ }
}

export function getRecentChanges(companyId: string, limit: number = 50): Array<Record<string, unknown>> {
  try {
    return queryAll(
      `SELECT entity_type, change_type, COUNT(*) as cnt
       FROM change_log
       WHERE company_id = ? AND created_at >= datetime('now', '-24 hours')
       GROUP BY entity_type, change_type
       ORDER BY cnt DESC`,
      [companyId]
    );
  } catch { return []; }
}

export function getCompaniesWithRecentChanges(): Array<{ company_id: string; total_changes: number }> {
  try {
    return queryAll(
      `SELECT company_id, COUNT(*) as total_changes
       FROM change_log
       WHERE created_at >= datetime('now', '-24 hours') AND company_id IS NOT NULL
       GROUP BY company_id
       HAVING total_changes > 0`,
      []
    ) as Array<{ company_id: string; total_changes: number }>;
  } catch { return []; }
}

export function cleanupOldChangeLogs(): number {
  try {
    const row = queryOne("SELECT COUNT(*) as cnt FROM change_log WHERE created_at < datetime('now', '-30 days')");
    const count = (row?.cnt as number) || 0;
    if (count > 0) {
      execute("DELETE FROM change_log WHERE created_at < datetime('now', '-30 days')");
    }
    return count;
  } catch { return 0; }
}

// ── Cursor resume helpers ──────────────────────────────────────────────

/** Save cursor mid-sync for resume capability */
export function saveCursorMidSync(companyId: string, entityType: string, cursor: string, page: number): void {
  execute(
    `INSERT INTO sync_cursors (id, company_id, entity_type, last_synced_at, last_cursor, last_count, updated_at)
     VALUES (?, ?, ?, datetime('now'), ?, ?, datetime('now'))
     ON CONFLICT(company_id, entity_type) DO UPDATE SET
       last_cursor = ?,
       last_count = ?,
       updated_at = datetime('now')`,
    [randomUUID(), companyId, entityType, cursor, page, cursor, page]
  );
}

/** Get saved cursor for resume (only valid if sync was interrupted, not completed) */
export function getResumeCursor(companyId: string, entityType: string): string | null {
  const cursor = getSyncCursor(companyId, entityType);
  if (!cursor?.last_cursor) return null;
  // Only resume if the cursor was saved but no full_sync_at was updated since
  // (meaning the sync was interrupted before completion)
  if (cursor.full_sync_at && new Date(cursor.full_sync_at) >= new Date(cursor.last_synced_at)) {
    return null; // last sync completed normally
  }
  return cursor.last_cursor;
}
