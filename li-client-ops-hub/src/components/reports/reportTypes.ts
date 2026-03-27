// Re-export collector types for the renderer.
// These mirror the shapes from reports/collector.ts (backend)
// and are used to parse the JSON columns stored in weekly_reports.

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

export interface ReportActionItem {
  priority: 'high' | 'medium' | 'low';
  category: string;
  action: string;
}

export interface ReportHighlight {
  category: string;
  text: string;
}
