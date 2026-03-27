import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { getRecentChanges, getCompaniesWithRecentChanges } from '../../sync/utils/cursors';

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

  // ── Create company manually ────────────────────────────────────────
  ipcMain.handle('db:createCompany', (_e, data: {
    name: string;
    slug?: string;
    website?: string;
    ghl_location_id?: string;
    status?: string;
  }) => {
    const id = require('crypto').randomUUID();
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    execute(
      `INSERT INTO companies (id, name, slug, website, ghl_location_id, status, sla_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ok', datetime('now'), datetime('now'))`,
      [id, data.name, slug, data.website || null, data.ghl_location_id || null, data.status || 'active']
    );
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

  // ── Create contact manually ─────────────────────────────────────────
  ipcMain.handle('db:createContact', (_e, data: {
    company_id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    ghl_contact_id?: string;
    company_name?: string;
  }) => {
    const id = require('crypto').randomUUID();
    execute(
      `INSERT INTO contacts (id, company_id, ghl_contact_id, first_name, last_name, email, phone,
        company_name, sla_status, days_since_outbound, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', 0, datetime('now'), datetime('now'))`,
      [
        id, data.company_id, data.ghl_contact_id || null,
        data.first_name || null, data.last_name || null,
        data.email || null, data.phone || null,
        data.company_name || null,
      ]
    );
    return queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
  });

  // ── Contact lookup by emails (for meeting attendee linking) ──────
  ipcMain.handle('db:getContactsByEmails', (_e, emails: string[]) => {
    if (!emails.length) return [];
    const placeholders = emails.map(() => '?').join(',');
    return queryAll(
      `SELECT c.email, c.ghl_contact_id, c.first_name, c.last_name, c.company_id,
              co.ghl_location_id
       FROM contacts c
       LEFT JOIN companies co ON c.company_id = co.id
       WHERE c.email IN (${placeholders})`,
      emails
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

  // ── Sync phases for a run ─────────────────────────────────────────
  ipcMain.handle('syncLogs:getPhases', (_e, runId: string) => {
    return queryAll(
      'SELECT * FROM sync_phases WHERE run_id = ? ORDER BY started_at ASC',
      [runId]
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
      `SELECT ghl_field_id, name, field_key, data_type, placeholder, position, model, synced_at
       FROM ghl_custom_fields
       WHERE company_id = ?
       ORDER BY position ASC, name ASC`,
      [companyId]
    );
  });

  // ── Custom fields export (all companies) ────────────────────────────
  ipcMain.handle('company:getAllCustomFields', () => {
    return queryAll(
      `SELECT cf.ghl_field_id, cf.name, cf.field_key, cf.data_type, cf.placeholder, cf.position, cf.model,
              cf.synced_at, c.name as company_name, c.ghl_location_id
       FROM ghl_custom_fields cf
       JOIN companies c ON c.id = cf.company_id
       ORDER BY c.name ASC, cf.position ASC, cf.name ASC`
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

  // ── Change log ──────────────────────────────────────────────────────
  ipcMain.handle('changeLog:getRecent', (_e, companyId: string) => {
    return getRecentChanges(companyId);
  });

  ipcMain.handle('changeLog:getChangedCompanies', () => {
    return getCompaniesWithRecentChanges();
  });

  // ── Revenue & Contract ─────────────────────────────────────────────
  // ── Client contact linked to a company (via sub_account association) ─
  ipcMain.handle('db:getLinkedClient', (_e, companyId: string) => {
    return queryOne(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.ghl_contact_id,
        co.ghl_location_id
      FROM client_associations ca
      JOIN contacts c ON c.id = ca.client_contact_id
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE ca.target_id = ? AND ca.association_type = 'sub_account'
      LIMIT 1
    `, [companyId]);
  });

  // ── Search contacts for linking ──────────────────────────────────────
  ipcMain.handle('db:searchClients', (_e, search: string) => {
    const q = `%${search}%`;
    return queryAll(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.ghl_contact_id,
        c.company_id, c.company_name as contact_company_name, c.website as contact_website,
        co.ghl_location_id, co.website as company_website
      FROM contacts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE c.tags LIKE '%client%'
        AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?
             OR (c.first_name || ' ' || c.last_name) LIKE ?
             OR c.company_name LIKE ?)
      ORDER BY c.first_name ASC
      LIMIT 20
    `, [q, q, q, q, q]);
  });

  // ── Link a client contact to a company ───────────────────────────────
  ipcMain.handle('db:linkClientToCompany', (_e, clientContactId: string, companyId: string) => {
    const existing = queryOne(
      "SELECT id FROM client_associations WHERE target_id = ? AND association_type = 'sub_account'",
      [companyId]
    );
    if (existing) {
      execute(
        "UPDATE client_associations SET client_contact_id = ?, updated_at = datetime('now') WHERE id = ?",
        [clientContactId, existing.id as string]
      );
    } else {
      const { randomUUID } = require('crypto');
      execute(
        `INSERT INTO client_associations (id, client_contact_id, association_type, target_id, created_at, updated_at)
         VALUES (?, ?, 'sub_account', ?, datetime('now'), datetime('now'))`,
        [randomUUID(), clientContactId, companyId]
      );
    }
    return { success: true };
  });

  ipcMain.handle('db:updateCompanyRevenue', (_e, companyId: string, data: {
    monthly_revenue?: number; contract_value?: number; contract_start?: string; contract_end?: string; service_type?: string;
  }) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (data.monthly_revenue !== undefined) { sets.push('monthly_revenue = ?'); params.push(data.monthly_revenue); }
    if (data.contract_value !== undefined) { sets.push('contract_value = ?'); params.push(data.contract_value); }
    if (data.contract_start !== undefined) { sets.push('contract_start = ?'); params.push(data.contract_start); }
    if (data.contract_end !== undefined) { sets.push('contract_end = ?'); params.push(data.contract_end); }
    if (data.service_type !== undefined) { sets.push('service_type = ?'); params.push(data.service_type); }
    if (sets.length === 0) return { success: false };
    sets.push("updated_at = datetime('now')");
    params.push(companyId);
    execute(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, params);
    return { success: true };
  });

  // ── Pipelines ───────────────────────────────────────────────────────
  ipcMain.handle('db:getPipelines', (_e, companyId: string) => {
    return queryAll(
      `SELECT p.*,
        (SELECT COUNT(*) FROM ghl_pipeline_stages WHERE ghl_pipeline_id = p.ghl_pipeline_id AND company_id = p.company_id) as stages_count,
        (SELECT COUNT(*) FROM ghl_opportunities WHERE ghl_pipeline_id = p.ghl_pipeline_id AND company_id = p.company_id) as opportunities_count
       FROM ghl_pipelines p WHERE p.company_id = ? ORDER BY p.name ASC`,
      [companyId]
    );
  });

  ipcMain.handle('db:getPipelineStages', (_e, pipelineId: string, companyId: string) => {
    return queryAll(
      'SELECT * FROM ghl_pipeline_stages WHERE ghl_pipeline_id = ? AND company_id = ? ORDER BY position ASC',
      [pipelineId, companyId]
    );
  });

  // ── Opportunities ──────────────────────────────────────────────────
  ipcMain.handle('db:getOpportunities', (_e, companyId: string, pipelineId?: string) => {
    if (pipelineId) {
      return queryAll(
        `SELECT o.*, c.first_name, c.last_name, c.email, c.phone
         FROM ghl_opportunities o
         LEFT JOIN contacts c ON o.contact_id = c.id
         WHERE o.company_id = ? AND o.ghl_pipeline_id = ?
         ORDER BY o.updated_at DESC`,
        [companyId, pipelineId]
      );
    }
    return queryAll(
      `SELECT o.*, c.first_name, c.last_name, c.email, c.phone
       FROM ghl_opportunities o
       LEFT JOIN contacts c ON o.contact_id = c.id
       WHERE o.company_id = ? ORDER BY o.updated_at DESC`,
      [companyId]
    );
  });

  ipcMain.handle('db:getOpportunity', (_e, id: string) => {
    return queryOne(
      `SELECT o.*, c.first_name, c.last_name, c.email, c.phone, c.tags,
       p.name as pipeline_name
       FROM ghl_opportunities o
       LEFT JOIN contacts c ON o.contact_id = c.id
       LEFT JOIN ghl_pipelines p ON o.ghl_pipeline_id = p.ghl_pipeline_id AND o.company_id = p.company_id
       WHERE o.id = ?`,
      [id]
    );
  });

  // ── Pulse config ──────────────────────────────────────────────────
  ipcMain.handle('db:getPulseConfig', (_e, companyId: string) => {
    return queryOne(
      'SELECT pulse_sync_enabled, pulse_pipeline_id, pulse_dry_run, pulse_last_synced_at FROM companies WHERE id = ?',
      [companyId]
    );
  });

  ipcMain.handle('db:setPulseConfig', (_e, companyId: string, config: { enabled?: boolean; pipelineId?: string; dryRun?: boolean }) => {
    if (config.enabled !== undefined) execute('UPDATE companies SET pulse_sync_enabled = ?, updated_at = datetime(\'now\') WHERE id = ?', [config.enabled ? 1 : 0, companyId]);
    if (config.pipelineId !== undefined) execute('UPDATE companies SET pulse_pipeline_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [config.pipelineId, companyId]);
    if (config.dryRun !== undefined) execute('UPDATE companies SET pulse_dry_run = ?, updated_at = datetime(\'now\') WHERE id = ?', [config.dryRun ? 1 : 0, companyId]);
    return { success: true };
  });

  ipcMain.handle('db:getPulseSyncLog', (_e, companyId: string) => {
    return queryAll(
      'SELECT * FROM pulse_sync_log WHERE company_id = ? ORDER BY last_synced_at DESC LIMIT 200',
      [companyId]
    );
  });
}
