/**
 * Shared type definitions used by both the local Electron app
 * and the Cloudflare Worker cloud deployment.
 *
 * These types represent the core domain model — they are
 * database-agnostic and platform-agnostic.
 */

// ── SLA ──────────────────────────────────────────────────────────────

export type SLAStatus = 'ok' | 'warning' | 'violation';

export interface SLAConfig {
  warningDays: number;
  violationDays: number;
}

// ── Company ──────────────────────────────────────────────────────────

export interface CompanyCore {
  id: string;
  name: string;
  slug: string;
  status: string;
  ghl_location_id: string | null;
  sla_status: SLAStatus;
  sla_days_since_contact: number;
  contact_count: number;
  contacts_api_total: number | null;
  health_score: number | null;
  health_grade: string | null;
  health_trend: string | null;
  monthly_budget: number | null;
  budget_used: number;
  budget_percent: number;
  messages_synced_total: number;
  last_sync_at: string | null;
}

// ── Contact ──────────────────────────────────────────────────────────

export interface ContactCore {
  id: string;
  company_id: string;
  ghl_contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string | null;
  sla_status: SLAStatus;
  days_since_outbound: number;
  last_outbound_at: string | null;
}

// ── Message ──────────────────────────────────────────────────────────

export interface MessageCore {
  id: string;
  contact_id: string;
  company_id: string;
  direction: 'inbound' | 'outbound';
  type: string | null;
  body_preview: string | null;
  message_at: string;
}

// ── Meeting ──────────────────────────────────────────────────────────

export interface MeetingCore {
  id: string;
  company_id: string | null;
  title: string | null;
  meeting_date: string;
  duration_minutes: number | null;
  platform: string | null;
  participants_count: number;
  summary: string | null;
}

// ── Sync ──────────────────────────────────────────────────────────────

export interface SyncCounts {
  found: number;
  created: number;
  updated: number;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  counts?: SyncCounts;
}

export interface SyncProgress {
  companyId: string;
  overallStatus: string;
  overallPercent: number;
  contactsSynced: number;
  contactsTotal: number;
  messagesSynced: number;
}
