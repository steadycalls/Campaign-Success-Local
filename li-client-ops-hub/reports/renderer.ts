// ── Weekly Report: HTML Renderer ─────────────────────────────────────
//
// Produces a self-contained, print-friendly HTML document from report data.

import type {
  PortfolioSummary, SLASummary, BudgetSummary, HealthSummary,
  MeetingsSummary, SyncSummary, ReportActionItem, ReportHighlight,
} from './collector';

export interface WeeklyReportData {
  title: string;
  periodLabel: string;
  generatedAt: string;
  portfolioSummary: PortfolioSummary;
  slaSummary: SLASummary;
  budgetSummary: BudgetSummary;
  healthSummary: HealthSummary;
  meetingsSummary: MeetingsSummary;
  syncSummary: SyncSummary;
  actionItems: ReportActionItem[];
  highlights: ReportHighlight[];
}

function trendArrow(trend: string): string {
  return trend === 'improving' ? '&uarr; Improving'
    : trend === 'declining' ? '&darr; Declining'
    : trend === 'stable' ? '&rarr; Stable'
    : '&mdash;';
}

function esc(s: unknown): string {
  const str = String(s ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderReportHTML(report: WeeklyReportData): string {
  const portfolio = report.portfolioSummary;
  const sla = report.slaSummary;
  const budgets = report.budgetSummary;
  const health = report.healthSummary;
  const meetings = report.meetingsSummary;
  const sync = report.syncSummary;
  const actions = report.actionItems;
  const highlights = report.highlights;

  const generatedStr = new Date(report.generatedAt).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Weekly Operations Report — ${esc(report.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 600; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
    h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-green { color: #059669; }
    .stat-amber { color: #d97706; }
    .stat-red { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .action-item { padding: 8px 12px; margin: 4px 0; border-radius: 6px; font-size: 13px; }
    .action-high { background: #fee2e2; border-left: 3px solid #dc2626; }
    .action-medium { background: #fef3c7; border-left: 3px solid #d97706; }
    .action-low { background: #f0fdf4; border-left: 3px solid #059669; }
    .highlight { padding: 6px 12px; margin: 4px 0; background: #f0fdf4; border-left: 3px solid #059669; border-radius: 6px; font-size: 13px; }
    .section { margin-bottom: 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-align: center; }
    @media print { body { padding: 0; } .stat-grid { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Weekly Operations Report</h1>
  <div class="subtitle">${esc(report.periodLabel)} &mdash; Generated ${esc(generatedStr)}</div>

  ${actions.length > 0 ? `
  <h2>Action Items (${actions.length})</h2>
  <div class="section">
    ${actions.map(a => `
      <div class="action-item action-${a.priority}">
        <strong>${esc(a.category)}:</strong> ${esc(a.action)}
      </div>
    `).join('')}
  </div>` : ''}

  ${highlights.length > 0 ? `
  <h2>Highlights</h2>
  <div class="section">
    ${highlights.map(h => `
      <div class="highlight">
        <strong>${esc(h.category)}:</strong> ${esc(h.text)}
      </div>
    `).join('')}
  </div>` : ''}

  <h2>Portfolio Overview</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${portfolio.totalActive}</div><div class="stat-label">Active Clients</div></div>
    <div class="stat-card"><div class="stat-value stat-green">+${portfolio.newContactsThisWeek.toLocaleString()}</div><div class="stat-label">New Contacts</div></div>
    <div class="stat-card"><div class="stat-value">${portfolio.outboundThisWeek.toLocaleString()}</div><div class="stat-label">Outbound Msgs</div></div>
    <div class="stat-card"><div class="stat-value">${portfolio.inboundThisWeek.toLocaleString()}</div><div class="stat-label">Inbound Msgs</div></div>
  </div>

  <h2>Communication SLA</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${sla.slaComplianceRate}%</div><div class="stat-label">Compliance Rate</div></div>
    <div class="stat-card"><div class="stat-value stat-green">${sla.ok}</div><div class="stat-label">On Track</div></div>
    <div class="stat-card"><div class="stat-value stat-amber">${sla.warning}</div><div class="stat-label">Warning</div></div>
    <div class="stat-card"><div class="stat-value stat-red">${sla.violation}</div><div class="stat-label">Overdue</div></div>
  </div>
  ${sla.violations.length > 0 ? `
  <h3>Overdue Clients</h3>
  <table>
    <tr><th>Client</th><th>Days Overdue</th></tr>
    ${sla.violations.map(v => {
      const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || 'Unknown';
      return `<tr><td>${esc(name)}</td><td><span class="badge badge-red">${v.days_since_outbound}d</span></td></tr>`;
    }).join('')}
  </table>` : ''}

  <h2>Client Health Scores</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${health.avgScore}</div><div class="stat-label">Avg Score</div></div>
    <div class="stat-card"><div class="stat-value stat-green">${health.distribution.grade_a + health.distribution.grade_b}</div><div class="stat-label">A + B</div></div>
    <div class="stat-card"><div class="stat-value stat-amber">${health.distribution.grade_c}</div><div class="stat-label">C</div></div>
    <div class="stat-card"><div class="stat-value stat-red">${health.distribution.grade_d + health.distribution.grade_f}</div><div class="stat-label">D + F</div></div>
  </div>
  ${health.topClients.length > 0 ? `
  <h3>Top 5 Clients</h3>
  <table>
    <tr><th>Client</th><th>Score</th><th>Grade</th><th>Trend</th></tr>
    ${health.topClients.map(c => `
    <tr><td>${esc(c.name)}</td><td>${c.health_score}</td><td><span class="badge badge-green">${c.health_grade}</span></td><td>${trendArrow(c.health_trend)}</td></tr>
    `).join('')}
  </table>` : ''}
  ${health.bottomClients.length > 0 ? `
  <h3>Bottom 5 Clients (Need Attention)</h3>
  <table>
    <tr><th>Client</th><th>Score</th><th>Grade</th><th>Trend</th></tr>
    ${health.bottomClients.map(c => `
    <tr><td>${esc(c.name)}</td><td>${c.health_score}</td><td><span class="badge ${c.health_score < 35 ? 'badge-red' : 'badge-amber'}">${c.health_grade}</span></td><td>${trendArrow(c.health_trend)}</td></tr>
    `).join('')}
  </table>` : ''}

  <h2>Teamwork Budgets</h2>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-value">${budgets.totalProjects}</div><div class="stat-label">Active Projects</div></div>
    <div class="stat-card"><div class="stat-value">${budgets.avgUtilization}%</div><div class="stat-label">Avg Utilization</div></div>
    <div class="stat-card"><div class="stat-value stat-red">${budgets.critical.length}</div><div class="stat-label">Critical (&gt;90%)</div></div>
    <div class="stat-card"><div class="stat-value stat-amber">${budgets.warning.length}</div><div class="stat-label">Warning (&gt;75%)</div></div>
  </div>
  ${budgets.critical.length > 0 ? `
  <h3>Critical Budgets</h3>
  <table>
    <tr><th>Project</th><th>Client</th><th>Used</th></tr>
    ${budgets.critical.map(b => `
    <tr><td>${esc(b.name)}</td><td>${esc(b.company_name || '—')}</td><td><span class="badge badge-red">${Math.round(b.budget_percent)}%</span></td></tr>
    `).join('')}
  </table>` : ''}

  <h2>Meetings</h2>
  <p style="font-size:13px;">${meetings.totalMeetings} meetings this week (${meetings.matchedToClients} matched to clients)</p>
  ${meetings.clientsWithNoMeeting30d.length > 0 ? `
  <h3>Clients With No Meeting in 30+ Days (${meetings.clientsWithNoMeeting30d.length})</h3>
  <p style="font-size:13px;color:#64748b;">${meetings.clientsWithNoMeeting30d.map(c => esc(c.name)).join(', ')}</p>` : ''}

  <h2>Sync &amp; Data</h2>
  <p style="font-size:13px;">
    Sync runs this week: ${sync.totalRuns} (${sync.successful} successful, ${sync.failed} failed)<br>
    RAG pipeline: ${sync.ragChunksEmbedded.toLocaleString()} / ${sync.ragChunksTotal.toLocaleString()} chunks embedded
    ${sync.failedCompanies.length > 0 ? `<br>Failed syncs: ${sync.failedCompanies.map(f => esc(f.company_name)).join(', ')}` : ''}
  </p>

  <div class="footer">
    Client Ops Hub &mdash; Logic Inbound &mdash; Auto-generated report
  </div>
</body>
</html>`;
}
