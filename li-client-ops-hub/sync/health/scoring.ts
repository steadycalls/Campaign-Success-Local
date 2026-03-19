// ── Health Score: Component Scoring Functions ────────────────────────
//
// Each function produces a 0-100 score for one dimension of client health.
// Components without data (no Teamwork, no Discord) score 50 (neutral).

import { queryAll, queryOne, type QueryResult } from '../../db/client';

export interface HealthComponent {
  name: string;
  weight: number;
  score: number;       // 0-100
  status: 'green' | 'yellow' | 'red' | 'gray';
  detail: string;
}

export interface HealthScore {
  total: number;        // 0-100 composite
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'healthy' | 'watch' | 'at_risk' | 'critical';
  components: HealthComponent[];
  computedAt: string;
  trend: 'improving' | 'stable' | 'declining' | 'new';
}

// ── Individual Component Scoring ────────────────────────────────────

export function scoreSLA(company: QueryResult): HealthComponent {
  const daysSince = company.sla_days_since_contact as number | null;

  let score: number;
  let status: HealthComponent['status'];
  let detail: string;

  if (daysSince === null || daysSince === undefined) {
    score = 0;
    status = 'red';
    detail = 'No outbound contact recorded';
  } else if (daysSince <= 3) {
    score = 100;
    status = 'green';
    detail = `Contacted ${daysSince}d ago — excellent`;
  } else if (daysSince <= 5) {
    score = 80;
    status = 'green';
    detail = `Contacted ${daysSince}d ago — on track`;
  } else if (daysSince <= 7) {
    score = 50;
    status = 'yellow';
    detail = `Contacted ${daysSince}d ago — approaching deadline`;
  } else if (daysSince <= 14) {
    score = 20;
    status = 'red';
    detail = `Contacted ${daysSince}d ago — overdue`;
  } else {
    score = 0;
    status = 'red';
    detail = `Contacted ${daysSince}d ago — critically overdue`;
  }

  return { name: 'Communication SLA', weight: 0.25, score, status, detail };
}

export function scoreContactVelocity(company: QueryResult): HealthComponent {
  const newContacts30d = (company.contacts_added_30d as number) || 0;

  let score: number;
  let status: HealthComponent['status'];
  let detail: string;

  if (newContacts30d >= 20) {
    score = 100;
    status = 'green';
    detail = `+${newContacts30d} new contacts in 30d — strong lead flow`;
  } else if (newContacts30d >= 10) {
    score = 80;
    status = 'green';
    detail = `+${newContacts30d} new contacts in 30d — healthy`;
  } else if (newContacts30d >= 5) {
    score = 60;
    status = 'yellow';
    detail = `+${newContacts30d} new contacts in 30d — moderate`;
  } else if (newContacts30d >= 1) {
    score = 35;
    status = 'yellow';
    detail = `+${newContacts30d} new contacts in 30d — low`;
  } else {
    score = 10;
    status = 'red';
    detail = 'No new contacts in 30 days — zero lead flow';
  }

  return { name: 'Contact Velocity', weight: 0.15, score, status, detail };
}

export function scoreBudget(company: QueryResult): HealthComponent {
  const pct = company.tw_budget_used_pct as number | null;

  if (pct === null || pct === undefined) {
    return {
      name: 'Teamwork Budget',
      weight: 0.15,
      score: 50,
      status: 'gray',
      detail: 'No Teamwork project linked',
    };
  }

  let score: number;
  let status: HealthComponent['status'];
  let detail: string;

  if (pct >= 50 && pct <= 80) {
    score = 100;
    status = 'green';
    detail = `${pct}% budget used — on track`;
  } else if (pct >= 30 && pct < 50) {
    score = 75;
    status = 'green';
    detail = `${pct}% budget used — underutilized but okay`;
  } else if (pct > 80 && pct <= 90) {
    score = 60;
    status = 'yellow';
    detail = `${pct}% budget used — approaching limit`;
  } else if (pct > 90 && pct <= 100) {
    score = 30;
    status = 'red';
    detail = `${pct}% budget used — near overrun`;
  } else if (pct > 100) {
    score = 10;
    status = 'red';
    detail = `${pct}% budget used — OVER BUDGET`;
  } else if (pct < 30 && pct > 0) {
    score = 50;
    status = 'yellow';
    detail = `${pct}% budget used — significantly underutilized`;
  } else {
    score = 40;
    status = 'yellow';
    detail = '0% budget used — no work logged';
  }

  return { name: 'Teamwork Budget', weight: 0.15, score, status, detail };
}

export function scoreMeetingFrequency(company: QueryResult): HealthComponent {
  const meetings30d = (company.meetings_last_30d as number) || 0;

  let score: number;
  let status: HealthComponent['status'];
  let detail: string;

  if (meetings30d >= 4) {
    score = 100;
    status = 'green';
    detail = `${meetings30d} meetings in 30d — weekly cadence`;
  } else if (meetings30d >= 2) {
    score = 80;
    status = 'green';
    detail = `${meetings30d} meetings in 30d — biweekly`;
  } else if (meetings30d >= 1) {
    score = 55;
    status = 'yellow';
    detail = `${meetings30d} meeting in 30d — monthly`;
  } else {
    score = 15;
    status = 'red';
    detail = 'No meetings in 30 days';
  }

  return { name: 'Meeting Frequency', weight: 0.10, score, status, detail };
}

export function scoreMessageTrend(company: QueryResult): HealthComponent {
  const msgs7d = (company.messages_last_7d as number) || 0;
  const msgs30d = (company.messages_last_30d as number) || 0;

  const weeklyRate = msgs7d;
  const monthlyWeeklyAvg = msgs30d / 4;

  let score: number;
  let status: HealthComponent['status'];
  let detail: string;

  if (msgs30d === 0 && msgs7d === 0) {
    score = 0;
    status = 'red';
    detail = 'No messages synced';
  } else if (monthlyWeeklyAvg === 0) {
    score = msgs7d > 0 ? 70 : 0;
    status = msgs7d > 0 ? 'green' : 'red';
    detail = msgs7d > 0 ? `${msgs7d} messages this week (new activity)` : 'No activity';
  } else {
    const ratio = weeklyRate / monthlyWeeklyAvg;

    if (ratio >= 1.2) {
      score = 100;
      status = 'green';
      detail = `${msgs7d} msgs this week — trending UP (${Math.round((ratio - 1) * 100)}% above avg)`;
    } else if (ratio >= 0.8) {
      score = 75;
      status = 'green';
      detail = `${msgs7d} msgs this week — stable`;
    } else if (ratio >= 0.5) {
      score = 45;
      status = 'yellow';
      detail = `${msgs7d} msgs this week — declining (${Math.round((1 - ratio) * 100)}% below avg)`;
    } else {
      score = 20;
      status = 'red';
      detail = `${msgs7d} msgs this week — significant decline`;
    }
  }

  return { name: 'Message Trend', weight: 0.10, score, status, detail };
}

export function scoreDriveActivity(company: QueryResult): HealthComponent {
  if (!company.has_drive || !company.drive_folder_id) {
    return { name: 'Drive Activity', weight: 0.05, score: 50, status: 'gray', detail: 'No Drive folder linked' };
  }

  const recentFile = queryOne(`
    SELECT modified_at FROM drive_files
    WHERE company_id = ?
    ORDER BY modified_at DESC LIMIT 1
  `, [company.id as string]);

  if (!recentFile?.modified_at) {
    return { name: 'Drive Activity', weight: 0.05, score: 30, status: 'yellow', detail: 'Drive folder empty or not synced' };
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(recentFile.modified_at as string).getTime()) / 86400000
  );

  let score: number;
  let status: HealthComponent['status'];

  if (daysSince <= 7) { score = 100; status = 'green'; }
  else if (daysSince <= 14) { score = 80; status = 'green'; }
  else if (daysSince <= 30) { score = 55; status = 'yellow'; }
  else if (daysSince <= 60) { score = 30; status = 'yellow'; }
  else { score = 10; status = 'red'; }

  return { name: 'Drive Activity', weight: 0.05, score, status, detail: `Last file modified ${daysSince}d ago` };
}

export function scoreDiscordActivity(company: QueryResult): HealthComponent {
  if (!company.has_discord) {
    return { name: 'Discord Activity', weight: 0.05, score: 50, status: 'gray', detail: 'No Discord channel linked' };
  }

  // Find the discord channel linked to this company via client associations
  const assoc = queryOne(`
    SELECT ca2.target_id FROM client_associations ca1
    JOIN client_associations ca2
      ON ca2.client_contact_id = ca1.client_contact_id
      AND ca2.association_type = 'discord_channel'
    WHERE ca1.association_type = 'sub_account'
      AND ca1.target_id = ?
    LIMIT 1
  `, [company.id as string]);

  if (!assoc) {
    return { name: 'Discord Activity', weight: 0.05, score: 50, status: 'gray', detail: 'No Discord channel linked' };
  }

  // Count messages in the last 7 days — discord_channels doesn't have messages_7d,
  // so we check the most recent message activity via the channel
  // For now, score based on whether the channel association exists
  // (Discord message counts aren't stored per-channel in this schema)
  return { name: 'Discord Activity', weight: 0.05, score: 60, status: 'yellow', detail: 'Discord channel linked' };
}

export function scoreDataCompleteness(company: QueryResult): HealthComponent {
  let points = 0;
  let maxPoints = 0;
  const missing: string[] = [];

  // PIT configured and valid?
  maxPoints += 20;
  if (company.pit_status === 'valid') { points += 20; }
  else { missing.push('PIT not configured'); }

  // Contacts synced?
  maxPoints += 20;
  if ((company.contact_count as number || 0) > 0) { points += 20; }
  else { missing.push('No contacts synced'); }

  // Messages synced?
  maxPoints += 20;
  if ((company.messages_synced_total as number || 0) > 0) { points += 20; }
  else { missing.push('No messages synced'); }

  // Has a client contact association?
  maxPoints += 15;
  if (company.client_contact_id) { points += 15; }
  else { missing.push('No client contact linked'); }

  // Has Teamwork project?
  maxPoints += 10;
  if (company.has_teamwork) { points += 10; }
  else { missing.push('No Teamwork project linked'); }

  // Has Discord channel?
  maxPoints += 5;
  if (company.has_discord) { points += 5; }
  else { missing.push('No Discord channel linked'); }

  // Has Drive folder?
  maxPoints += 5;
  if (company.has_drive) { points += 5; }
  else { missing.push('No Drive folder linked'); }

  // Has Read.ai emails configured?
  maxPoints += 5;
  if (company.has_readai) { points += 5; }
  else { missing.push('No Read.ai email configured'); }

  const score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
  const status: HealthComponent['status'] = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';

  return {
    name: 'Data Completeness',
    weight: 0.15,
    score,
    status,
    detail: missing.length === 0
      ? 'All systems connected'
      : `Missing: ${missing.join(', ')}`,
  };
}

// ── Composite Score ─────────────────────────────────────────────────

export function computeHealthScore(company: QueryResult): HealthScore {
  const components = [
    scoreSLA(company),
    scoreContactVelocity(company),
    scoreBudget(company),
    scoreMeetingFrequency(company),
    scoreMessageTrend(company),
    scoreDriveActivity(company),
    scoreDiscordActivity(company),
    scoreDataCompleteness(company),
  ];

  const total = Math.round(
    components.reduce((sum, c) => sum + (c.score * c.weight), 0)
  );

  const grade: HealthScore['grade'] =
    total >= 90 ? 'A' :
    total >= 75 ? 'B' :
    total >= 55 ? 'C' :
    total >= 35 ? 'D' : 'F';

  const status: HealthScore['status'] =
    total >= 75 ? 'healthy' :
    total >= 55 ? 'watch' :
    total >= 35 ? 'at_risk' : 'critical';

  // Trend: compare to last stored score
  const lastScore = queryOne(
    'SELECT health_score FROM health_score_history WHERE company_id = ? ORDER BY computed_at DESC LIMIT 1',
    [company.id as string]
  );

  let trend: HealthScore['trend'] = 'new';
  if (lastScore) {
    const diff = total - (lastScore.health_score as number);
    if (diff > 3) trend = 'improving';
    else if (diff < -3) trend = 'declining';
    else trend = 'stable';
  }

  return {
    total,
    grade,
    status,
    components,
    computedAt: new Date().toISOString(),
    trend,
  };
}
