import { ipcMain } from 'electron';
import { queryAll, queryOne } from '../../db/client';

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

export function registerBriefingHandlers(): void {

  // ── SLA Violations & Warnings ──────────────────────────────────────

  ipcMain.handle('briefing:getSlaViolations', () => {
    // Client-tagged contacts in RI with SLA violations
    const riCompany = queryOne(
      'SELECT id FROM companies WHERE ghl_location_id = ?',
      [RI_LOCATION_ID]
    );
    if (!riCompany) return { violations: [], warnings: [] };
    const companyId = riCompany.id as string;

    const violations = queryAll(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
        c.days_since_outbound, c.last_outbound_at, c.sla_status,
        c.ghl_contact_id, c.company_id,
        co.ghl_location_id
      FROM contacts c
      JOIN companies co ON co.id = c.company_id
      WHERE c.company_id = ?
        AND c.tags LIKE '%client%'
        AND c.sla_status = 'violation'
      ORDER BY c.days_since_outbound DESC
    `, [companyId]);

    const warnings = queryAll(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
        c.days_since_outbound, c.last_outbound_at, c.sla_status,
        c.ghl_contact_id, c.company_id,
        co.ghl_location_id
      FROM contacts c
      JOIN companies co ON co.id = c.company_id
      WHERE c.company_id = ?
        AND c.tags LIKE '%client%'
        AND c.sla_status = 'warning'
      ORDER BY c.days_since_outbound DESC
    `, [companyId]);

    return { violations, warnings };
  });

  // ── Budget Alerts ──────────────────────────────────────────────────

  ipcMain.handle('briefing:getBudgetAlerts', () => {
    const critical = queryAll(`
      SELECT tp.name as project_name, tp.budget_percent,
        tp.budget_total, tp.budget_used,
        co.name as company_name, co.id as company_id
      FROM teamwork_projects tp
      LEFT JOIN companies co ON co.id = tp.company_id
      WHERE tp.budget_percent >= 90
        AND tp.status = 'active'
      ORDER BY tp.budget_percent DESC
    `);

    const warning = queryAll(`
      SELECT tp.name as project_name, tp.budget_percent,
        tp.budget_total, tp.budget_used,
        co.name as company_name, co.id as company_id
      FROM teamwork_projects tp
      LEFT JOIN companies co ON co.id = tp.company_id
      WHERE tp.budget_percent >= 75 AND tp.budget_percent < 90
        AND tp.status = 'active'
      ORDER BY tp.budget_percent DESC
    `);

    return { critical, warning };
  });

  // ── Sync Alerts (unacknowledged) ───────────────────────────────────

  ipcMain.handle('briefing:getSyncAlerts', () => {
    return queryAll(`
      SELECT * FROM sync_alerts
      WHERE acknowledged = 0
      ORDER BY
        CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT 10
    `);
  });

  // ── Unassociated Clients ───────────────────────────────────────────

  ipcMain.handle('briefing:getUnassociatedClients', () => {
    const riCompany = queryOne(
      'SELECT id FROM companies WHERE ghl_location_id = ?',
      [RI_LOCATION_ID]
    );
    if (!riCompany) return [];

    return queryAll(`
      SELECT c.id, c.first_name, c.last_name, c.email
      FROM contacts c
      WHERE c.company_id = ?
        AND c.tags LIKE '%client%'
        AND NOT EXISTS (
          SELECT 1 FROM client_associations ca
          WHERE ca.client_contact_id = c.id AND ca.association_type = 'sub_account'
        )
      ORDER BY c.first_name ASC
    `, [riCompany.id as string]);
  });

  // ── Portfolio Pulse ────────────────────────────────────────────────

  ipcMain.handle('briefing:getPortfolioPulse', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const companies = queryOne(`
      SELECT
        COUNT(*) as total_active,
        SUM(CASE WHEN sla_status = 'ok' THEN 1 ELSE 0 END) as sla_ok,
        SUM(CASE WHEN sla_status = 'warning' THEN 1 ELSE 0 END) as sla_warning,
        SUM(CASE WHEN sla_status = 'violation' THEN 1 ELSE 0 END) as sla_violation,
        SUM(contact_count) as total_contacts_synced
      FROM companies
      WHERE status = 'active'
    `);

    const outboundMessages7d = queryOne(`
      SELECT COUNT(*) as count FROM messages
      WHERE direction = 'outbound' AND message_at >= ?
    `, [sevenDaysAgo]);

    const newContacts7d = queryOne(`
      SELECT COUNT(*) as count FROM contacts
      WHERE created_at >= ?
    `, [sevenDaysAgo]);

    const syncStatus = queryOne(`
      SELECT
        COUNT(CASE WHEN sync_enabled = 1 AND pit_status = 'valid' THEN 1 END) as synced,
        COUNT(CASE WHEN sync_enabled = 1 THEN 1 END) as enabled
      FROM companies WHERE status = 'active'
    `);

    const queueStats = queryOne(`
      SELECT
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM sync_queue
      WHERE created_at >= datetime('now', '-24 hours')
    `);

    return {
      companies,
      newContacts7d: (newContacts7d?.count as number) || 0,
      outboundMessages7d: (outboundMessages7d?.count as number) || 0,
      syncStatus,
      queueStats,
    };
  });

  // ── Today's Meetings ───────────────────────────────────────────────

  ipcMain.handle('briefing:getTodaysMeetings', () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Google Calendar events (primary source)
    let calEvents: unknown[] = [];
    try {
      calEvents = queryAll(`
        SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.all_day,
          ce.location, ce.hangout_link, ce.conference_url,
          ce.attendees_count, ce.accepted_count,
          ce.company_id, ce.calendar_name, ce.status,
          co.name as company_name
        FROM calendar_events ce
        LEFT JOIN companies co ON co.id = ce.company_id
        WHERE ce.start_time >= ? AND ce.start_time <= ?
          AND ce.status != 'cancelled'
        ORDER BY ce.all_day DESC, ce.start_time ASC
      `, [todayStart.toISOString(), todayEnd.toISOString()]);
    } catch { /* calendar_events table may not exist yet */ }

    // Read.ai meetings for today
    const readaiMeetings = queryAll(`
      SELECT m.id, m.title, m.meeting_date, m.start_time_ms, m.end_time_ms,
        m.duration_minutes, m.platform, m.participants_count,
        m.report_url, m.company_id, co.name as company_name
      FROM meetings m
      LEFT JOIN companies co ON co.id = m.company_id
      WHERE m.meeting_date >= ? AND m.meeting_date <= ?
      ORDER BY m.start_time_ms ASC
    `, [todayStart.toISOString(), todayEnd.toISOString()]);

    // Week count
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    let weekTotal = 0;
    try {
      const wk = queryOne(`
        SELECT COUNT(*) as cnt FROM calendar_events
        WHERE start_time >= ? AND start_time < ? AND status != 'cancelled'
      `, [weekStart.toISOString(), weekEnd.toISOString()]);
      weekTotal = (wk?.cnt as number) || 0;
    } catch { /* table may not exist */ }

    return {
      today: calEvents,
      readaiToday: readaiMeetings,
      meetings: calEvents.length > 0 ? calEvents : readaiMeetings, // backward compat
      weekTotal,
    };
  });

  // ── Recent Activity ────────────────────────────────────────────────

  ipcMain.handle('briefing:getRecentActivity', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentSyncs = queryAll(`
      SELECT company_name, status, items_created, items_updated,
        finished_at as timestamp, 'sync' as activity_type
      FROM sync_runs
      WHERE finished_at >= ? AND company_id IS NOT NULL
      ORDER BY finished_at DESC LIMIT 10
    `, [oneDayAgo]);

    const recentAlerts = queryAll(`
      SELECT type as title, message, severity, created_at as timestamp,
        'alert' as activity_type
      FROM sync_alerts
      WHERE created_at >= ?
      ORDER BY created_at DESC LIMIT 5
    `, [oneDayAgo]);

    const activities = [...recentSyncs, ...recentAlerts];
    activities.sort((a, b) =>
      new Date((b.timestamp as string) || '').getTime() - new Date((a.timestamp as string) || '').getTime()
    );

    return activities.slice(0, 15);
  });
}
