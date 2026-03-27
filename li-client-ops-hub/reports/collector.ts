// ── Weekly Report: Data Collectors ──────────────────────────────────
//
// Each collector gathers a section of the weekly ops report from local SQLite.
// All data is frozen at generation time as JSON snapshots.

import { queryAll, queryOne } from '../db/client';

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

// ── Types ────────────────────────────────────────────────────────────

export interface PortfolioSummary {
  totalActive: number;
  syncEnabled: number;
  pitsValid: number;
  totalContactsSynced: number;
  totalContactsApi: number;
  totalMessages: number;
  newContactsThisWeek: number;
  newMessagesThisWeek: number;
  outboundThisWeek: number;
  inboundThisWeek: number;
}

export interface SLASummary {
  totalClients: number;
  ok: number;
  warning: number;
  violation: number;
  slaComplianceRate: number;
  violations: Array<{ first_name: string; last_name: string; days_since_outbound: number; last_outbound_at: string | null }>;
  warnings: Array<{ first_name: string; last_name: string; days_since_outbound: number }>;
}

export interface BudgetSummary {
  totalProjects: number;
  critical: Array<{ name: string; company_name: string | null; budget_percent: number; budget_total: number; budget_used: number }>;
  warning: Array<{ name: string; company_name: string | null; budget_percent: number }>;
  onTrack: number;
  avgUtilization: number;
}

export interface HealthSummary {
  distribution: { grade_a: number; grade_b: number; grade_c: number; grade_d: number; grade_f: number };
  avgScore: number;
  topClients: Array<{ name: string; health_score: number; health_grade: string; health_trend: string }>;
  bottomClients: Array<{ name: string; health_score: number; health_grade: string; health_trend: string; health_components_json: string | null }>;
  improvers: Array<{ name: string; health_score: number }>;
  decliners: Array<{ name: string; health_score: number }>;
}

export interface MeetingsSummary {
  totalMeetings: number;
  matchedToClients: number;
  clientMeetings: Array<{ company_name: string; meeting_count: number }>;
  clientsWithNoMeeting30d: Array<{ name: string }>;
}

export interface SyncSummary {
  totalRuns: number;
  successful: number;
  failed: number;
  failedCompanies: Array<{ company_name: string }>;
  ragChunksTotal: number;
  ragChunksEmbedded: number;
}

export interface ReportActionItem {
  priority: 'high' | 'medium' | 'low';
  category: string;
  action: string;
}

export interface ReportHighlight {
  category: string;
  text: string;
}

// ── Collectors ───────────────────────────────────────────────────────

export function collectPortfolioSummary(periodStart: string, periodEnd: string): PortfolioSummary {
  const companies = queryOne(`
    SELECT
      COUNT(*) as total_active,
      SUM(CASE WHEN sync_enabled = 1 THEN 1 ELSE 0 END) as sync_enabled,
      SUM(CASE WHEN pit_status = 'valid' THEN 1 ELSE 0 END) as pits_valid,
      SUM(contact_count) as total_contacts_synced,
      SUM(COALESCE(contacts_api_total, 0)) as total_contacts_api,
      SUM(COALESCE(messages_synced_total, 0)) as total_messages
    FROM companies WHERE status = 'active'
  `);

  const newContacts = queryOne(`
    SELECT COUNT(*) as cnt FROM contacts WHERE created_at >= ? AND created_at <= ?
  `, [periodStart, periodEnd]);

  const newMessages = queryOne(`
    SELECT COUNT(*) as cnt FROM messages WHERE message_at >= ? AND message_at <= ?
  `, [periodStart, periodEnd]);

  const outbound = queryOne(`
    SELECT COUNT(*) as cnt FROM messages
    WHERE direction = 'outbound' AND message_at >= ? AND message_at <= ?
  `, [periodStart, periodEnd]);

  const inbound = queryOne(`
    SELECT COUNT(*) as cnt FROM messages
    WHERE direction = 'inbound' AND message_at >= ? AND message_at <= ?
  `, [periodStart, periodEnd]);

  return {
    totalActive: (companies?.total_active as number) || 0,
    syncEnabled: (companies?.sync_enabled as number) || 0,
    pitsValid: (companies?.pits_valid as number) || 0,
    totalContactsSynced: (companies?.total_contacts_synced as number) || 0,
    totalContactsApi: (companies?.total_contacts_api as number) || 0,
    totalMessages: (companies?.total_messages as number) || 0,
    newContactsThisWeek: (newContacts?.cnt as number) || 0,
    newMessagesThisWeek: (newMessages?.cnt as number) || 0,
    outboundThisWeek: (outbound?.cnt as number) || 0,
    inboundThisWeek: (inbound?.cnt as number) || 0,
  };
}

export function collectSLASummary(): SLASummary {
  const riCompany = queryOne(
    'SELECT id FROM companies WHERE ghl_location_id = ?',
    [RI_LOCATION_ID]
  );
  if (!riCompany) {
    return { totalClients: 0, ok: 0, warning: 0, violation: 0, slaComplianceRate: 0, violations: [], warnings: [] };
  }
  const companyId = riCompany.id as string;

  const summary = queryOne(`
    SELECT
      COUNT(*) as total_clients,
      SUM(CASE WHEN sla_status = 'ok' THEN 1 ELSE 0 END) as ok,
      SUM(CASE WHEN sla_status = 'warning' THEN 1 ELSE 0 END) as warning,
      SUM(CASE WHEN sla_status = 'violation' THEN 1 ELSE 0 END) as violation
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%'
  `, [companyId]);

  const violations = queryAll(`
    SELECT first_name, last_name, days_since_outbound, last_outbound_at
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%' AND sla_status = 'violation'
    ORDER BY days_since_outbound DESC
  `, [companyId]);

  const warnings = queryAll(`
    SELECT first_name, last_name, days_since_outbound
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%' AND sla_status = 'warning'
    ORDER BY days_since_outbound DESC
  `, [companyId]);

  const total = (summary?.total_clients as number) || 0;
  const ok = (summary?.ok as number) || 0;
  const slaRate = total > 0 ? Math.round((ok / total) * 100) : 0;

  return {
    totalClients: total,
    ok,
    warning: (summary?.warning as number) || 0,
    violation: (summary?.violation as number) || 0,
    slaComplianceRate: slaRate,
    violations: violations as SLASummary['violations'],
    warnings: warnings as SLASummary['warnings'],
  };
}

export function collectBudgetSummary(): BudgetSummary {
  const projects = queryAll(`
    SELECT tp.name, tp.budget_percent, tp.budget_total, tp.budget_used,
      co.name as company_name
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.status = 'active' AND tp.budget_total > 0
    ORDER BY tp.budget_percent DESC
  `);

  const critical = projects.filter(p => (p.budget_percent as number) >= 90);
  const warning = projects.filter(p => {
    const pct = p.budget_percent as number;
    return pct >= 75 && pct < 90;
  });
  const onTrack = projects.filter(p => (p.budget_percent as number) < 75);

  const avgUtilization = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (p.budget_percent as number || 0), 0) / projects.length)
    : 0;

  return {
    totalProjects: projects.length,
    critical: critical as BudgetSummary['critical'],
    warning: warning as BudgetSummary['warning'],
    onTrack: onTrack.length,
    avgUtilization,
  };
}

export function collectHealthSummary(): HealthSummary {
  const distribution = queryOne(`
    SELECT
      SUM(CASE WHEN health_grade = 'A' THEN 1 ELSE 0 END) as grade_a,
      SUM(CASE WHEN health_grade = 'B' THEN 1 ELSE 0 END) as grade_b,
      SUM(CASE WHEN health_grade = 'C' THEN 1 ELSE 0 END) as grade_c,
      SUM(CASE WHEN health_grade = 'D' THEN 1 ELSE 0 END) as grade_d,
      SUM(CASE WHEN health_grade = 'F' THEN 1 ELSE 0 END) as grade_f,
      AVG(health_score) as avg_score
    FROM companies WHERE status = 'active' AND health_score IS NOT NULL
  `);

  const topClients = queryAll(`
    SELECT name, health_score, health_grade, health_trend
    FROM companies WHERE status = 'active' AND health_score IS NOT NULL
    ORDER BY health_score DESC LIMIT 5
  `);

  const bottomClients = queryAll(`
    SELECT name, health_score, health_grade, health_trend, health_components_json
    FROM companies WHERE status = 'active' AND health_score IS NOT NULL
    ORDER BY health_score ASC LIMIT 5
  `);

  const improvers = queryAll(`
    SELECT name, health_score
    FROM companies WHERE status = 'active' AND health_trend = 'improving'
    ORDER BY health_score ASC LIMIT 5
  `);

  const decliners = queryAll(`
    SELECT name, health_score
    FROM companies WHERE status = 'active' AND health_trend = 'declining'
    ORDER BY health_score ASC LIMIT 5
  `);

  return {
    distribution: {
      grade_a: (distribution?.grade_a as number) || 0,
      grade_b: (distribution?.grade_b as number) || 0,
      grade_c: (distribution?.grade_c as number) || 0,
      grade_d: (distribution?.grade_d as number) || 0,
      grade_f: (distribution?.grade_f as number) || 0,
    },
    avgScore: Math.round((distribution?.avg_score as number) || 0),
    topClients: topClients as HealthSummary['topClients'],
    bottomClients: bottomClients as HealthSummary['bottomClients'],
    improvers: improvers as HealthSummary['improvers'],
    decliners: decliners as HealthSummary['decliners'],
  };
}

export function collectMeetingsSummary(periodStart: string, periodEnd: string): MeetingsSummary {
  // Try calendar_events first (may not exist yet)
  let totalMeetings = 0;
  let matchedToClients = 0;
  let clientMeetings: MeetingsSummary['clientMeetings'] = [];
  let clientsWithNoMeeting30d: MeetingsSummary['clientsWithNoMeeting30d'] = [];

  try {
    const calTotal = queryOne(`
      SELECT COUNT(*) as cnt FROM calendar_events
      WHERE start_time >= ? AND start_time <= ? AND status != 'cancelled'
    `, [periodStart, periodEnd]);
    totalMeetings = (calTotal?.cnt as number) || 0;

    const calMatched = queryOne(`
      SELECT COUNT(*) as cnt FROM calendar_events
      WHERE start_time >= ? AND start_time <= ? AND company_id IS NOT NULL AND status != 'cancelled'
    `, [periodStart, periodEnd]);
    matchedToClients = (calMatched?.cnt as number) || 0;

    clientMeetings = queryAll(`
      SELECT c.name as company_name, COUNT(*) as meeting_count
      FROM calendar_events ce
      JOIN companies c ON c.id = ce.company_id
      WHERE ce.start_time >= ? AND ce.start_time <= ? AND ce.status != 'cancelled'
      GROUP BY ce.company_id
      ORDER BY meeting_count DESC LIMIT 10
    `, [periodStart, periodEnd]) as MeetingsSummary['clientMeetings'];

    clientsWithNoMeeting30d = queryAll(`
      SELECT c.name FROM companies c
      WHERE c.status = 'active' AND c.sync_enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM calendar_events ce
          WHERE ce.company_id = c.id AND ce.start_time >= datetime('now', '-30 days')
            AND ce.status != 'cancelled'
        )
      ORDER BY c.name
    `) as MeetingsSummary['clientsWithNoMeeting30d'];
  } catch {
    // calendar_events table may not exist — fall back to Read.ai meetings
    const readaiTotal = queryOne(`
      SELECT COUNT(*) as cnt FROM meetings
      WHERE meeting_date >= ? AND meeting_date <= ?
    `, [periodStart, periodEnd]);
    totalMeetings = (readaiTotal?.cnt as number) || 0;

    const readaiMatched = queryOne(`
      SELECT COUNT(*) as cnt FROM meetings
      WHERE meeting_date >= ? AND meeting_date <= ? AND company_id IS NOT NULL
    `, [periodStart, periodEnd]);
    matchedToClients = (readaiMatched?.cnt as number) || 0;
  }

  return { totalMeetings, matchedToClients, clientMeetings, clientsWithNoMeeting30d };
}

export function collectSyncSummary(periodStart: string, periodEnd: string): SyncSummary {
  const syncRuns = queryOne(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed
    FROM sync_runs WHERE started_at >= ? AND started_at <= ?
  `, [periodStart, periodEnd]);

  const failedCompanies = queryAll(`
    SELECT DISTINCT company_name FROM sync_queue
    WHERE status = 'failed' AND created_at >= ? AND created_at <= ?
  `, [periodStart, periodEnd]);

  let ragChunksTotal = 0;
  let ragChunksEmbedded = 0;
  try {
    const ragStats = queryOne(`
      SELECT
        COUNT(*) as total_chunks,
        SUM(CASE WHEN embedding_status = 'success' THEN 1 ELSE 0 END) as embedded
      FROM rag_chunks
    `);
    ragChunksTotal = (ragStats?.total_chunks as number) || 0;
    ragChunksEmbedded = (ragStats?.embedded as number) || 0;
  } catch { /* rag_chunks may not exist */ }

  return {
    totalRuns: (syncRuns?.total_runs as number) || 0,
    successful: (syncRuns?.successful as number) || 0,
    failed: (syncRuns?.failed as number) || 0,
    failedCompanies: failedCompanies as SyncSummary['failedCompanies'],
    ragChunksTotal,
    ragChunksEmbedded,
  };
}

export function collectActionItems(periodStart: string, periodEnd: string): ReportActionItem[] {
  const items: ReportActionItem[] = [];

  // SLA violations
  const sla = collectSLASummary();
  for (const v of sla.violations) {
    const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || 'Unknown';
    items.push({
      priority: 'high',
      category: 'SLA',
      action: `Contact ${name} — ${v.days_since_outbound} days overdue`,
    });
  }

  // Budget critical
  const budgets = collectBudgetSummary();
  for (const b of budgets.critical) {
    items.push({
      priority: 'high',
      category: 'Budget',
      action: `Review ${b.company_name || b.name} budget — ${Math.round(b.budget_percent)}% utilized`,
    });
  }

  // Health critical
  const health = collectHealthSummary();
  for (const c of health.bottomClients) {
    if (c.health_score < 35) {
      items.push({
        priority: 'high',
        category: 'Health',
        action: `Investigate ${c.name} — health score ${c.health_score}/100 (${c.health_grade})`,
      });
    }
  }

  // Stale meetings
  const meetings = collectMeetingsSummary(periodStart, periodEnd);
  for (const c of meetings.clientsWithNoMeeting30d.slice(0, 5)) {
    items.push({
      priority: 'medium',
      category: 'Meeting',
      action: `Schedule meeting with ${c.name} — no meeting in 30+ days`,
    });
  }

  return items;
}

export function collectHighlights(periodStart: string, periodEnd: string): ReportHighlight[] {
  const highlights: ReportHighlight[] = [];

  // Top new contact generators
  const topNewContacts = queryAll(`
    SELECT co.name, COUNT(c.id) as new_count
    FROM contacts c
    JOIN companies co ON co.id = c.company_id
    WHERE c.created_at >= ? AND c.created_at <= ?
    GROUP BY c.company_id
    ORDER BY new_count DESC LIMIT 3
  `, [periodStart, periodEnd]);

  for (const c of topNewContacts) {
    if ((c.new_count as number) >= 5) {
      highlights.push({
        category: 'Leads',
        text: `${c.name} added ${c.new_count} new contacts this week`,
      });
    }
  }

  // Health score improvements
  const improved = queryAll(`
    SELECT name, health_score
    FROM companies WHERE health_trend = 'improving' AND status = 'active'
    ORDER BY health_score DESC LIMIT 3
  `);

  for (const c of improved) {
    highlights.push({
      category: 'Health',
      text: `${c.name} health score is improving (now ${c.health_score})`,
    });
  }

  // SLA compliance
  const sla = collectSLASummary();
  if (sla.slaComplianceRate >= 90) {
    highlights.push({
      category: 'SLA',
      text: `${sla.slaComplianceRate}% SLA compliance rate — excellent`,
    });
  }

  // Fully synced sub-accounts
  try {
    const fullySynced = queryOne(`
      SELECT COUNT(*) as cnt FROM sync_progress
      WHERE overall_status = 'completed'
    `);
    if ((fullySynced?.cnt as number) > 0) {
      highlights.push({
        category: 'Sync',
        text: `${fullySynced?.cnt} sub-accounts fully synced (contacts + messages)`,
      });
    }
  } catch { /* table may not exist */ }

  return highlights;
}
