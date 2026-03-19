import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';

export function registerDBHandlers(): void {
  // ── Companies ─────────────────────────────────────────────────────
  ipcMain.handle('db:getCompanies', (_e, filters?: {
    sla_status?: string;
    status?: string;
    search?: string;
  }) => {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters?.sla_status) {
      conditions.push('sla_status = ?');
      params.push(filters.sla_status);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push('(name LIKE ? OR slug LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    return queryAll(
      `SELECT * FROM companies WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      params
    );
  });

  ipcMain.handle('db:getCompany', (_e, id: string) => {
    return queryOne('SELECT * FROM companies WHERE id = ?', [id]);
  });

  // ── Contacts ──────────────────────────────────────────────────────
  ipcMain.handle('db:getContacts', (_e, companyId: string) => {
    return queryAll(
      `SELECT * FROM contacts
       WHERE company_id = ?
       ORDER BY
         CASE sla_status WHEN 'violation' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         days_since_outbound DESC`,
      [companyId]
    );
  });

  // ── Messages ──────────────────────────────────────────────────────
  ipcMain.handle('db:getMessages', (_e, contactId: string) => {
    return queryAll(
      `SELECT * FROM messages
       WHERE contact_id = ?
       ORDER BY message_at DESC
       LIMIT 200`,
      [contactId]
    );
  });

  // ── Meetings ──────────────────────────────────────────────────────
  ipcMain.handle('db:getMeetings', (_e, companyId: string) => {
    return queryAll(
      `SELECT * FROM meetings
       WHERE company_id = ?
       ORDER BY meeting_date DESC`,
      [companyId]
    );
  });

  // ── Drive Files ───────────────────────────────────────────────────
  ipcMain.handle('db:getDriveFiles', (_e, companyId: string) => {
    return queryAll(
      `SELECT * FROM drive_files
       WHERE company_id = ?
       ORDER BY modified_at DESC`,
      [companyId]
    );
  });

  // ── Sync Logs ─────────────────────────────────────────────────────
  ipcMain.handle('db:getSyncLogs', (_e, _filters?: unknown) => {
    return queryAll(
      'SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100'
    );
  });

  // ── Alerts ────────────────────────────────────────────────────────
  ipcMain.handle('db:getAlerts', (_e, unackedOnly?: boolean) => {
    if (unackedOnly) {
      return queryAll(
        'SELECT * FROM sync_alerts WHERE acknowledged = 0 ORDER BY created_at DESC'
      );
    }
    return queryAll(
      'SELECT * FROM sync_alerts ORDER BY created_at DESC LIMIT 200'
    );
  });

  ipcMain.handle('db:acknowledgeAlert', (_e, id: string) => {
    const changes = execute(
      'UPDATE sync_alerts SET acknowledged = 1 WHERE id = ?',
      [id]
    );
    return { success: changes > 0 };
  });

  // ── Sync log summary per sub-account ────────────────────────────────
  ipcMain.handle('syncLogs:getSummary', (_e, filters?: { period?: string }) => {
    let periodClause = '';
    if (filters?.period) {
      const hours: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
      const h = hours[filters.period];
      if (h) {
        const cutoff = new Date(Date.now() - h * 3600000).toISOString();
        periodClause = `AND sr.started_at >= '${cutoff}'`;
      }
    }

    return queryAll(
      `SELECT
        c.id as company_id, c.name as company_name,
        c.contact_count, c.contacts_api_total, c.messages_synced_total,
        sr.id as run_id, sr.status, sr.trigger as run_trigger,
        sr.started_at, sr.finished_at,
        sr.items_fetched, sr.items_created, sr.items_updated,
        sr.error_message, sr.detail_json
       FROM companies c
       INNER JOIN sync_runs sr ON sr.company_id = c.id
       WHERE sr.id = (
         SELECT id FROM sync_runs WHERE company_id = c.id ${periodClause}
         ORDER BY started_at DESC LIMIT 1
       )
       ORDER BY sr.started_at DESC`
    );
  });

  ipcMain.handle('syncLogs:getCompanyHistory', (_e, companyId: string, limit?: number) => {
    return queryAll(
      'SELECT * FROM sync_runs WHERE company_id = ? ORDER BY started_at DESC LIMIT ?',
      [companyId, limit ?? 20]
    );
  });

  // ── Contact message sync status ─────────────────────────────────────
  ipcMain.handle('contacts:getMessageSyncStatus', (_e, companyId: string) => {
    return queryAll(
      `SELECT
        c.id,
        c.messages_synced_at,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as messages_stored
       FROM contacts c
       WHERE c.company_id = ?`,
      [companyId]
    );
  });

  // ── Custom fields for a company ─────────────────────────────────────
  ipcMain.handle('company:getCustomFields', (_e, companyId: string) => {
    return queryAll(
      `SELECT name, field_key, data_type
       FROM ghl_custom_fields
       WHERE company_id = ?
       ORDER BY position ASC, name ASC`,
      [companyId]
    );
  });

  // ── Meetings (expanded) ─────────────────────────────────────────────
  ipcMain.handle('meetings:getForCompany', (_e, companyId: string) => {
    return queryAll(
      'SELECT * FROM meetings WHERE company_id = ? ORDER BY start_time_ms DESC',
      [companyId]
    );
  });

  ipcMain.handle('meetings:getActionItems', (_e, meetingId: string) => {
    return queryAll(
      'SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at ASC',
      [meetingId]
    );
  });

  ipcMain.handle('meetings:getUnmatched', () => {
    return queryAll(
      'SELECT * FROM meetings WHERE company_id IS NULL ORDER BY start_time_ms DESC LIMIT 100'
    );
  });

  ipcMain.handle('meetings:linkToCompany', (_e, meetingId: string, companyId: string) => {
    execute(
      "UPDATE meetings SET company_id = ?, match_method = 'manual', updated_at = datetime('now') WHERE id = ?",
      [companyId, meetingId]
    );
    execute('UPDATE action_items SET company_id = ? WHERE meeting_id = ?', [companyId, meetingId]);
    return { success: true };
  });

  ipcMain.handle('meetings:addDomainMapping', (_e, domain: string, companyId: string) => {
    const { randomUUID } = require('crypto');
    execute(
      'INSERT OR IGNORE INTO company_domains (id, company_id, domain) VALUES (?, ?, ?)',
      [randomUUID(), companyId, domain]
    );
    return { success: true };
  });
}
