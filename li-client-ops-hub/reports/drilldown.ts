// ── Weekly Report: Drill-Down Queries ────────────────────────────────
//
// Each function queries live SQLite data for a specific report metric.
// Called via the reports:drilldown IPC handler.

import { queryAll, queryOne } from '../db/client';

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

export interface DrilldownColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'badge' | 'percent' | 'date';
}

export interface DrilldownResult {
  metric: string;
  title: string;
  columns: DrilldownColumn[];
  rows: Array<Record<string, unknown>>;
  navigableColumn?: string;
}

// ── Portfolio ────────────────────────────────────────────────────────

function portfolioActive(): DrilldownResult {
  const rows = queryAll(`
    SELECT id, name, health_grade, health_score, sla_status, contact_count,
      health_trend, last_sync_at
    FROM companies WHERE status = 'active'
    ORDER BY name
  `);
  return {
    metric: 'portfolio-active',
    title: 'Active Clients',
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'health_grade', label: 'Health', type: 'badge' },
      { key: 'health_score', label: 'Score', type: 'number' },
      { key: 'health_trend', label: 'Trend', type: 'text' },
      { key: 'sla_status', label: 'SLA', type: 'badge' },
      { key: 'contact_count', label: 'Contacts', type: 'number' },
    ],
    rows,
    navigableColumn: 'id',
  };
}

function portfolioContacts(periodStart: string, periodEnd: string): DrilldownResult {
  const rows = queryAll(`
    SELECT co.id, co.name, COUNT(c.id) as new_contacts
    FROM contacts c
    JOIN companies co ON co.id = c.company_id
    WHERE c.created_at >= ? AND c.created_at <= ?
    GROUP BY c.company_id
    ORDER BY new_contacts DESC
  `, [periodStart, periodEnd]);
  return {
    metric: 'portfolio-contacts',
    title: 'New Contacts This Week — By Client',
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'new_contacts', label: 'New Contacts', type: 'number' },
    ],
    rows,
    navigableColumn: 'id',
  };
}

function portfolioOutbound(periodStart: string, periodEnd: string): DrilldownResult {
  const rows = queryAll(`
    SELECT co.id, co.name, COUNT(m.id) as outbound_count
    FROM messages m
    JOIN companies co ON co.id = m.company_id
    WHERE m.direction = 'outbound' AND m.message_at >= ? AND m.message_at <= ?
    GROUP BY co.id
    ORDER BY outbound_count DESC
  `, [periodStart, periodEnd]);
  return {
    metric: 'portfolio-outbound',
    title: 'Outbound Messages This Week — By Client',
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'outbound_count', label: 'Outbound Messages', type: 'number' },
    ],
    rows,
    navigableColumn: 'id',
  };
}

function portfolioInbound(periodStart: string, periodEnd: string): DrilldownResult {
  const rows = queryAll(`
    SELECT co.id, co.name, COUNT(m.id) as inbound_count
    FROM messages m
    JOIN companies co ON co.id = m.company_id
    WHERE m.direction = 'inbound' AND m.message_at >= ? AND m.message_at <= ?
    GROUP BY co.id
    ORDER BY inbound_count DESC
  `, [periodStart, periodEnd]);
  return {
    metric: 'portfolio-inbound',
    title: 'Inbound Messages This Week — By Client',
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'inbound_count', label: 'Inbound Messages', type: 'number' },
    ],
    rows,
    navigableColumn: 'id',
  };
}

// ── Communication SLA ────────────────────────────────────────────────

function getRiCompanyId(): string | null {
  const riCompany = queryOne(
    'SELECT id FROM companies WHERE ghl_location_id = ?',
    [RI_LOCATION_ID]
  );
  return riCompany ? (riCompany.id as string) : null;
}

function slaOk(): DrilldownResult {
  const companyId = getRiCompanyId();
  if (!companyId) return { metric: 'sla-ok', title: 'On-Track Clients (SLA)', columns: [], rows: [] };

  const rows = queryAll(`
    SELECT first_name, last_name, email, days_since_outbound, last_outbound_at
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%' AND sla_status = 'ok'
    ORDER BY first_name
  `, [companyId]);
  return {
    metric: 'sla-ok',
    title: 'On-Track Clients (SLA)',
    columns: [
      { key: 'first_name', label: 'First Name', type: 'text' },
      { key: 'last_name', label: 'Last Name', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'days_since_outbound', label: 'Days Since Outbound', type: 'number' },
      { key: 'last_outbound_at', label: 'Last Outbound', type: 'date' },
    ],
    rows,
  };
}

function slaWarning(): DrilldownResult {
  const companyId = getRiCompanyId();
  if (!companyId) return { metric: 'sla-warning', title: 'Warning Clients (SLA)', columns: [], rows: [] };

  const rows = queryAll(`
    SELECT first_name, last_name, email, days_since_outbound, last_outbound_at
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%' AND sla_status = 'warning'
    ORDER BY days_since_outbound DESC
  `, [companyId]);
  return {
    metric: 'sla-warning',
    title: 'Warning Clients (SLA)',
    columns: [
      { key: 'first_name', label: 'First Name', type: 'text' },
      { key: 'last_name', label: 'Last Name', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'days_since_outbound', label: 'Days Since Outbound', type: 'number' },
      { key: 'last_outbound_at', label: 'Last Outbound', type: 'date' },
    ],
    rows,
  };
}

function slaViolation(): DrilldownResult {
  const companyId = getRiCompanyId();
  if (!companyId) return { metric: 'sla-violation', title: 'Overdue Clients (SLA)', columns: [], rows: [] };

  const rows = queryAll(`
    SELECT first_name, last_name, email, days_since_outbound, last_outbound_at
    FROM contacts
    WHERE company_id = ? AND tags LIKE '%client%' AND sla_status = 'violation'
    ORDER BY days_since_outbound DESC
  `, [companyId]);
  return {
    metric: 'sla-violation',
    title: 'Overdue Clients (SLA)',
    columns: [
      { key: 'first_name', label: 'First Name', type: 'text' },
      { key: 'last_name', label: 'Last Name', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'days_since_outbound', label: 'Days Overdue', type: 'number' },
      { key: 'last_outbound_at', label: 'Last Outbound', type: 'date' },
    ],
    rows,
  };
}

// ── Client Health Scores ─────────────────────────────────────────────

function healthByGrades(grades: string[], metricKey: string, title: string): DrilldownResult {
  const placeholders = grades.map(() => '?').join(',');
  const rows = queryAll(`
    SELECT id, name, health_score, health_grade, health_trend, health_components_json
    FROM companies
    WHERE status = 'active' AND health_grade IN (${placeholders})
    ORDER BY health_score DESC
  `, grades);
  return {
    metric: metricKey,
    title,
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'health_score', label: 'Score', type: 'number' },
      { key: 'health_grade', label: 'Grade', type: 'badge' },
      { key: 'health_trend', label: 'Trend', type: 'text' },
    ],
    rows,
    navigableColumn: 'id',
  };
}

// ── Teamwork Budgets ─────────────────────────────────────────────────

function budgetActive(): DrilldownResult {
  const rows = queryAll(`
    SELECT tp.id, tp.name, co.name as company_name, co.id as company_id,
      tp.budget_total, tp.budget_used, tp.budget_percent, tp.status,
      tp.task_count_open, tp.task_count_completed
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.status = 'active'
    ORDER BY tp.name
  `);
  return {
    metric: 'budget-active',
    title: 'Active Teamwork Projects',
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'company_name', label: 'Client', type: 'text' },
      { key: 'budget_percent', label: 'Utilization', type: 'percent' },
      { key: 'budget_used', label: 'Used', type: 'number' },
      { key: 'budget_total', label: 'Budget', type: 'number' },
      { key: 'task_count_open', label: 'Open Tasks', type: 'number' },
    ],
    rows,
    navigableColumn: 'company_id',
  };
}

function budgetUtilization(): DrilldownResult {
  const rows = queryAll(`
    SELECT tp.id, tp.name, co.name as company_name, co.id as company_id,
      tp.budget_total, tp.budget_used, tp.budget_percent
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.status = 'active' AND tp.budget_total > 0
    ORDER BY tp.budget_percent DESC
  `);
  return {
    metric: 'budget-utilization',
    title: 'All Projects — Budget Utilization',
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'company_name', label: 'Client', type: 'text' },
      { key: 'budget_percent', label: 'Utilization', type: 'percent' },
      { key: 'budget_used', label: 'Used', type: 'number' },
      { key: 'budget_total', label: 'Budget', type: 'number' },
    ],
    rows,
    navigableColumn: 'company_id',
  };
}

function budgetCritical(): DrilldownResult {
  const rows = queryAll(`
    SELECT tp.id, tp.name, co.name as company_name, co.id as company_id,
      tp.budget_total, tp.budget_used, tp.budget_percent
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.status = 'active' AND tp.budget_total > 0 AND tp.budget_percent >= 90
    ORDER BY tp.budget_percent DESC
  `);
  return {
    metric: 'budget-critical',
    title: 'Critical Budget Projects (≥90% Used)',
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'company_name', label: 'Client', type: 'text' },
      { key: 'budget_percent', label: 'Utilization', type: 'percent' },
      { key: 'budget_used', label: 'Used', type: 'number' },
      { key: 'budget_total', label: 'Budget', type: 'number' },
    ],
    rows,
    navigableColumn: 'company_id',
  };
}

function budgetWarning(): DrilldownResult {
  const rows = queryAll(`
    SELECT tp.id, tp.name, co.name as company_name, co.id as company_id,
      tp.budget_total, tp.budget_used, tp.budget_percent
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.status = 'active' AND tp.budget_total > 0
      AND tp.budget_percent >= 75 AND tp.budget_percent < 90
    ORDER BY tp.budget_percent DESC
  `);
  return {
    metric: 'budget-warning',
    title: 'Warning Budget Projects (75–90% Used)',
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'company_name', label: 'Client', type: 'text' },
      { key: 'budget_percent', label: 'Utilization', type: 'percent' },
      { key: 'budget_used', label: 'Used', type: 'number' },
      { key: 'budget_total', label: 'Budget', type: 'number' },
    ],
    rows,
    navigableColumn: 'company_id',
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────

export function getDrilldownData(
  metric: string,
  periodStart: string,
  periodEnd: string,
): DrilldownResult {
  switch (metric) {
    case 'portfolio-active':    return portfolioActive();
    case 'portfolio-contacts':  return portfolioContacts(periodStart, periodEnd);
    case 'portfolio-outbound':  return portfolioOutbound(periodStart, periodEnd);
    case 'portfolio-inbound':   return portfolioInbound(periodStart, periodEnd);
    case 'sla-ok':              return slaOk();
    case 'sla-warning':         return slaWarning();
    case 'sla-violation':       return slaViolation();
    case 'health-ab':           return healthByGrades(['A', 'B'], 'health-ab', 'Clients Graded A or B');
    case 'health-c':            return healthByGrades(['C'], 'health-c', 'Clients Graded C');
    case 'health-df':           return healthByGrades(['D', 'F'], 'health-df', 'Clients Graded D or F');
    case 'budget-active':       return budgetActive();
    case 'budget-utilization':  return budgetUtilization();
    case 'budget-critical':     return budgetCritical();
    case 'budget-warning':      return budgetWarning();
    default:
      return { metric, title: 'Unknown Metric', columns: [], rows: [] };
  }
}
