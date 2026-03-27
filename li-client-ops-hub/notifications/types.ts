export type NotificationType =
  | 'sla_violation'
  | 'sla_warning'
  | 'budget_critical'
  | 'budget_warning'
  | 'sync_failed'
  | 'sync_stale'
  | 'pit_expired'
  | 'new_leads'
  | 'health_drop'
  | 'health_critical'
  | 'sync_complete'
  | 'meeting_soon';

export type NotificationChannel = 'desktop' | 'discord' | 'both' | 'none';

export interface NotificationEvent {
  type: NotificationType;
  title: string;
  body: string;
  urgency: 'critical' | 'warning' | 'info';
  companyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  actionUrl?: string;
  externalUrl?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface NotificationPreferences {
  id: string;
  type_channels: Record<string, NotificationChannel>;
  desktop_enabled: number;
  discord_enabled: number;
  discord_webhook_url: string | null;
  quiet_start: string;
  quiet_end: string;
  quiet_enabled: number;
  new_leads_threshold: number;
  health_drop_threshold: number;
  sla_notify_interval_hours: number;
  updated_at: string;
}

export const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannel> = {
  sla_violation: 'both',
  sla_warning: 'desktop',
  budget_critical: 'both',
  budget_warning: 'desktop',
  sync_failed: 'desktop',
  sync_stale: 'both',
  pit_expired: 'desktop',
  new_leads: 'desktop',
  health_drop: 'desktop',
  health_critical: 'both',
  sync_complete: 'none',
  meeting_soon: 'desktop',
};

export const NOTIFICATION_META: Record<NotificationType, { label: string; urgency: 'critical' | 'warning' | 'info' }> = {
  sla_violation: { label: 'SLA Violation (>7d)', urgency: 'critical' },
  sla_warning: { label: 'SLA Warning (5-7d)', urgency: 'warning' },
  budget_critical: { label: 'Budget Critical (>90%)', urgency: 'critical' },
  budget_warning: { label: 'Budget Warning (>75%)', urgency: 'warning' },
  sync_failed: { label: 'Sync Failed', urgency: 'warning' },
  sync_stale: { label: 'Sync Stale (12h+)', urgency: 'critical' },
  pit_expired: { label: 'PIT Expired', urgency: 'warning' },
  new_leads: { label: 'New Leads (5+/day)', urgency: 'info' },
  health_drop: { label: 'Health Score Drop (10+)', urgency: 'warning' },
  health_critical: { label: 'Health Critical (<35)', urgency: 'critical' },
  sync_complete: { label: 'Sync Complete', urgency: 'info' },
  meeting_soon: { label: 'Meeting in 15 min', urgency: 'info' },
};
