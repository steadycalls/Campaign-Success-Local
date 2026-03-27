// ── Churn Risk Score: Predicts which clients are likely to churn ──────
//
// Composite 0-100 score (higher = MORE risk of churning).
// Inverts the health score logic: bad signals increase the score.

import { queryAll, queryOne, execute } from '../../db/client';
import type { QueryResult } from '../../db/client';

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

export interface ChurnRiskComponent {
  name: string;
  weight: number;
  score: number;       // 0-100 (higher = more risk)
  detail: string;
}

export interface ChurnRiskScore {
  total: number;        // 0-100 composite
  grade: 'low' | 'medium' | 'high' | 'critical';
  reason: string;       // top risk factor
  components: ChurnRiskComponent[];
  computedAt: string;
}

// ── Individual Risk Components ───────────────────────────────────────

function riskSLA(company: QueryResult): ChurnRiskComponent {
  const days = (company.sla_days_since_contact as number) ?? 999;

  if (days <= 3) return { name: 'Communication Gap', weight: 0.25, score: 0, detail: `Contacted ${days}d ago` };
  if (days <= 5) return { name: 'Communication Gap', weight: 0.25, score: 20, detail: `${days}d since contact — on track` };
  if (days <= 7) return { name: 'Communication Gap', weight: 0.25, score: 50, detail: `${days}d since contact — approaching SLA` };
  if (days <= 14) return { name: 'Communication Gap', weight: 0.25, score: 80, detail: `${days}d since contact — overdue` };
  return { name: 'Communication Gap', weight: 0.25, score: 100, detail: `${days}d since contact — critically overdue` };
}

function riskMeetings(company: QueryResult): ChurnRiskComponent {
  const meetings30d = (company.meetings_last_30d as number) ?? 0;

  if (meetings30d >= 4) return { name: 'Meeting Cadence', weight: 0.20, score: 0, detail: `${meetings30d} meetings in 30d` };
  if (meetings30d >= 2) return { name: 'Meeting Cadence', weight: 0.20, score: 20, detail: `${meetings30d} meetings in 30d — biweekly` };
  if (meetings30d >= 1) return { name: 'Meeting Cadence', weight: 0.20, score: 50, detail: `1 meeting in 30d — infrequent` };
  return { name: 'Meeting Cadence', weight: 0.20, score: 100, detail: 'No meetings in 30 days' };
}

function riskMessages(company: QueryResult): ChurnRiskComponent {
  const msgs7d = (company.messages_last_7d as number) ?? 0;
  const msgs30d = (company.messages_last_30d as number) ?? 0;

  if (msgs30d === 0 && msgs7d === 0) {
    return { name: 'Message Activity', weight: 0.20, score: 100, detail: 'No messages — zero engagement' };
  }

  const weeklyAvg = msgs30d / 4;
  if (weeklyAvg === 0) {
    return { name: 'Message Activity', weight: 0.20, score: msgs7d > 0 ? 30 : 100, detail: msgs7d > 0 ? 'New activity this week' : 'Silent' };
  }

  const ratio = msgs7d / weeklyAvg;
  if (ratio >= 1.0) return { name: 'Message Activity', weight: 0.20, score: 0, detail: `${msgs7d} msgs this week — stable/rising` };
  if (ratio >= 0.5) return { name: 'Message Activity', weight: 0.20, score: 40, detail: `${msgs7d} msgs — declining` };
  return { name: 'Message Activity', weight: 0.20, score: 80, detail: `${msgs7d} msgs — significant decline` };
}

function riskContactVelocity(company: QueryResult): ChurnRiskComponent {
  const new30d = (company.contacts_added_30d as number) ?? 0;

  if (new30d >= 10) return { name: 'Lead Flow', weight: 0.15, score: 0, detail: `+${new30d} contacts in 30d` };
  if (new30d >= 5) return { name: 'Lead Flow', weight: 0.15, score: 20, detail: `+${new30d} contacts in 30d` };
  if (new30d >= 1) return { name: 'Lead Flow', weight: 0.15, score: 50, detail: `+${new30d} contacts in 30d — low` };
  return { name: 'Lead Flow', weight: 0.15, score: 90, detail: 'No new contacts in 30 days' };
}

function riskBudget(company: QueryResult): ChurnRiskComponent {
  const pct = (company.tw_budget_used_pct as number) ?? null;

  if (pct === null) return { name: 'Budget Health', weight: 0.10, score: 30, detail: 'No budget tracked' };
  if (pct >= 50 && pct <= 80) return { name: 'Budget Health', weight: 0.10, score: 0, detail: `${pct}% used — on track` };
  if (pct > 100) return { name: 'Budget Health', weight: 0.10, score: 90, detail: `${pct}% — OVER BUDGET` };
  if (pct > 90) return { name: 'Budget Health', weight: 0.10, score: 60, detail: `${pct}% — near limit` };
  if (pct < 30) return { name: 'Budget Health', weight: 0.10, score: 50, detail: `${pct}% — underutilized (disengaged?)` };
  return { name: 'Budget Health', weight: 0.10, score: 20, detail: `${pct}% used` };
}

function riskHealthTrend(company: QueryResult): ChurnRiskComponent {
  const trend = (company.health_trend as string) ?? 'new';

  if (trend === 'improving') return { name: 'Health Trend', weight: 0.10, score: 0, detail: 'Health improving' };
  if (trend === 'stable') return { name: 'Health Trend', weight: 0.10, score: 20, detail: 'Health stable' };
  if (trend === 'declining') return { name: 'Health Trend', weight: 0.10, score: 80, detail: 'Health declining' };
  return { name: 'Health Trend', weight: 0.10, score: 40, detail: 'New — not enough data' };
}

// ── Composite Score ──────────────────────────────────────────────────

export function computeChurnRisk(company: QueryResult): ChurnRiskScore {
  const components = [
    riskSLA(company),
    riskMeetings(company),
    riskMessages(company),
    riskContactVelocity(company),
    riskBudget(company),
    riskHealthTrend(company),
  ];

  const total = Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  const grade: ChurnRiskScore['grade'] =
    total >= 76 ? 'critical' :
    total >= 51 ? 'high' :
    total >= 26 ? 'medium' : 'low';

  // Top risk factor = highest weighted score
  const topRisk = components.reduce((a, b) => (a.score * a.weight > b.score * b.weight ? a : b));

  return {
    total,
    grade,
    reason: topRisk.detail,
    components,
    computedAt: new Date().toISOString(),
  };
}

// ── Batch Compute ────────────────────────────────────────────────────

export function computeAllChurnRisks(): { computed: number; atRisk: number } {
  const companies = queryAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM contacts WHERE company_id = c.id AND created_at >= datetime('now', '-30 days')) as contacts_added_30d,
      (SELECT COUNT(*) FROM messages WHERE company_id = c.id AND message_at >= datetime('now', '-7 days')) as messages_last_7d,
      (SELECT COUNT(*) FROM messages WHERE company_id = c.id AND message_at >= datetime('now', '-30 days')) as messages_last_30d,
      (SELECT COUNT(*) FROM meetings WHERE company_id = c.id AND meeting_date >= datetime('now', '-30 days')) as meetings_last_30d,
      (SELECT budget_percent FROM teamwork_projects WHERE company_id = c.id AND status = 'active' ORDER BY updated_at DESC LIMIT 1) as tw_budget_used_pct
    FROM companies c
    WHERE c.status = 'active' AND c.sync_enabled = 1
      AND c.ghl_location_id != ?
  `, [RI_LOCATION_ID]);

  let computed = 0;
  let atRisk = 0;

  for (const company of companies) {
    const risk = computeChurnRisk(company);

    execute(`
      UPDATE companies SET
        churn_risk_score = ?,
        churn_risk_grade = ?,
        churn_risk_reason = ?,
        churn_risk_computed_at = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [risk.total, risk.grade, risk.reason, risk.computedAt, company.id as string]);

    computed++;
    if (risk.grade === 'high' || risk.grade === 'critical') atRisk++;
  }

  return { computed, atRisk };
}
