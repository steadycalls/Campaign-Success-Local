// ── Shared types ──────────────────────────────────────────────────────

export type SLAStatus = 'ok' | 'warning' | 'violation';

export interface Company {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  status: 'active' | 'paused' | 'churned';
  ghl_location_id: string | null;
  teamwork_project_id: string | null;
  drive_folder_id: string | null;
  sla_status: SLAStatus;
  sla_days_since_contact: number;
  monthly_budget: number | null;
  budget_used: number;
  budget_percent: number;
  contact_count: number;
  contacts_api_total: number | null;
  contacts_added_7d?: number;
  contacts_added_30d?: number;
  contacts_added_90d?: number;
  contacts_added_365d?: number;
  messages_synced_total?: number;
  open_task_count: number;
  last_sync_at: string | null;
  pit_status?: string;
  sync_enabled?: number;
  users_count?: number;
  workflows_count?: number;
  funnels_count?: number;
  sites_count?: number;
  email_templates_count?: number;
  custom_fields_count?: number;
  pipelines_count?: number;
  opportunities_count?: number;
  pulse_sync_enabled?: number;
  pulse_pipeline_id?: string | null;
  pulse_dry_run?: number;
  pulse_last_synced_at?: string | null;
  gsc_property?: string | null;
  seo_scan_enabled?: number;
  churn_risk_score?: number | null;
  churn_risk_grade?: string | null;
  churn_risk_reason?: string | null;
  churn_risk_computed_at?: string | null;
  monthly_revenue?: number | null;
  contract_value?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  service_type?: string | null;
  health_score?: number | null;
  health_grade?: string | null;
  health_status?: string | null;
  health_trend?: string | null;
  health_computed_at?: string | null;
  health_components_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubAccount {
  id: string;
  ghl_location_id: string | null;
  name: string;
  slug: string;
  status: string;
  pit_status: string;
  pit_last_tested_at: string | null;
  pit_last_error: string | null;
  sync_enabled: number;
  last_sync_at: string | null;
  contact_count: number;
  contacts_api_total: number | null;
  phone_numbers_count: number;
  users_count: number;
  workflows_count: number;
  funnels_count: number;
  sites_count: number;
  email_templates_count: number;
  custom_fields_count: number;
  pipelines_count?: number;
  opportunities_count?: number;
  sla_status: SLAStatus;
  sla_days_since_contact: number;
}

export interface Contact {
  id: string;
  company_id: string;
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string | null;
  company_name: string | null;
  assigned_to_name: string | null;
  temperature: string | null;
  qualification: string | null;
  priority_score: number | null;
  source: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  address: string | null;
  date_of_birth: string | null;
  custom_fields_json: string | null;
  bant_score: number | null;
  last_activity_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  days_since_outbound: number;
  sla_status: SLAStatus;
  messages_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  company_id: string;
  ghl_message_id: string | null;
  direction: 'inbound' | 'outbound';
  type: string | null;
  body_preview: string | null;
  body_full: string | null;
  subject: string | null;
  call_duration: number | null;
  call_status: string | null;
  call_recording_url: string | null;
  has_attachments: number;
  attachment_count: number;
  message_at: string;
  created_at: string;
}

export interface TeamworkProject {
  id: string;
  company_id: string;
  teamwork_id: string | null;
  name: string;
  status: string;
  budget_total: number | null;
  budget_used: number;
  budget_percent: number;
  task_count_total: number;
  task_count_open: number;
  task_count_completed: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  company_id: string | null;
  readai_meeting_id: string | null;
  title: string | null;
  meeting_date: string;
  start_time_ms: number | null;
  end_time_ms: number | null;
  duration_minutes: number | null;
  platform: string | null;
  platform_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  participants: string | null;
  participants_json: string | null;
  participants_count: number;
  attended_count: number;
  summary: string | null;
  topics_json: string | null;
  key_questions_json: string | null;
  chapter_summaries_json: string | null;
  read_score: number | null;
  sentiment: number | null;
  engagement: number | null;
  transcript_text: string | null;
  transcript_json: string | null;
  action_items_json: string | null;
  report_url: string | null;
  recording_url: string | null;
  recording_local_path: string | null;
  folders_json: string | null;
  matched_domains: string | null;
  match_method: string | null;
  live_enabled: number;
  expanded: number;
  raw_json: string | null;
  synced_at: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  company_id: string;
  text: string;
  assignee: string | null;
  status: 'open' | 'done';
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriveFile {
  id: string;
  company_id: string;
  drive_file_id: string | null;
  folder_id: string | null;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  web_view_url: string | null;
  raw_json: string | null;
  synced_at: string | null;
  created_at: string;
}

export interface DriveFolder {
  id: string;
  drive_folder_id: string;
  name: string;
  web_view_url: string | null;
  modified_at: string | null;
  created_at_drive: string | null;
  owner_email: string | null;
  shared: number;
  file_count: number;
  company_id: string | null;
  client_contact_id: string | null;
  suggested_company_id: string | null;
  suggested_company_name: string | null;
  suggestion_score: number | null;
  raw_json: string;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  linked_company_name?: string | null;
  linked_client_name?: string | null;
  linked_client_id?: string | null;
}

export interface GoogleAuthStatus {
  email: string | null;
  authorized_at: string | null;
  expires_at: string | null;
}

export interface SyncRun {
  id: string;
  trigger: 'scheduled' | 'manual';
  adapter: 'ghl' | 'teamwork' | 'readai' | 'gdrive' | 'all';
  status: 'running' | 'success' | 'error';
  company_id: string | null;
  company_name: string | null;
  items_fetched: number;
  items_created: number;
  items_updated: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface SyncPhase {
  id: string;
  run_id: string;
  company_id: string | null;
  phase_name: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  items_found: number;
  items_created: number;
  items_updated: number;
  items_skipped: number;
  items_failed: number;
  error_message: string | null;
  error_stack: string | null;
  api_calls_made: number;
}

export interface SyncAlert {
  id: string;
  company_id: string | null;
  type: 'stale_sync' | 'sync_failure' | 'sla_violation';
  severity: 'info' | 'warning' | 'error';
  message: string;
  acknowledged: number;
  created_at: string;
}

export interface Integration {
  id: string;
  name: string;
  display_name: string;
  env_keys: string | null;
  status: 'not_configured' | 'configured' | 'connected' | 'error';
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientAssociation {
  id: string;
  client_contact_id: string;
  ghl_contact_id: string;
  association_type: string;
  target_id: string;
  target_name: string | null;
  target_detail: string | null;
  created_at: string;
}

export interface ClientContact extends Contact {
  associations_summary: string | null;
}

export interface ClientWithAssociations {
  id: string;
  ghl_contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  sla_status: SLAStatus;
  days_since_outbound: number;
  last_outbound_at: string | null;
  company_id: string | null;
  company_name: string | null;
  ghl_company_name: string | null;
  ghl_location_id: string | null;
  message_count: number;
  associations: Record<string, { targetId: string; targetName: string; targetDetail?: string }>;
  readai_emails?: Array<{ email: string }>;
  readai_meeting_count?: number;
}

export interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  discord_server_id: string;
  server_name: string | null;
  name: string;
  type: string | null;
  topic: string | null;
  position: number;
  tag: string | null;
}

// ── Notification types ───────────────────────────────────────────────

export type NotificationTypeId =
  | 'sla_violation' | 'sla_warning'
  | 'budget_critical' | 'budget_warning'
  | 'sync_failed' | 'sync_stale' | 'pit_expired'
  | 'new_leads' | 'health_drop' | 'health_critical'
  | 'sync_complete' | 'meeting_soon';

export type NotificationChannelUI = 'desktop' | 'discord' | 'both' | 'none';

export interface NotificationPreferencesUI {
  id: string;
  type_channels: Record<string, NotificationChannelUI>;
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

export interface NotificationHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  urgency: string | null;
  company_id: string | null;
  company_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  sent_desktop: number;
  sent_discord: number;
  desktop_clicked: number;
  dedup_key: string | null;
  created_at: string;
}

export interface NotificationEventUI {
  type: string;
  title: string;
  body: string;
  urgency: 'critical' | 'warning' | 'info';
  companyId?: string;
  companyName?: string;
  actionUrl?: string;
  externalUrl?: string;
  timestamp: string;
}

// ── Health Score types ────────────────────────────────────────────────

export interface HealthComponent {
  name: string;
  weight: number;
  score: number;
  status: 'green' | 'yellow' | 'red' | 'gray';
  detail: string;
}

export interface HealthScoreData {
  score: number | null;
  grade: string | null;
  status: string | null;
  trend: string | null;
  computedAt: string | null;
  components: HealthComponent[];
}

export interface HealthHistoryEntry {
  health_score: number;
  health_grade: string;
  computed_at: string;
}

export interface HealthRanking {
  id: string;
  name: string;
  health_score: number;
  health_grade: string;
  health_status: string;
  health_trend: string;
}

export interface AtRiskCompany extends HealthRanking {
  health_components_json: string;
}

// ── Entity Links ────────────────────────────────────────────────────

export interface EntityLink {
  id: string;
  company_id: string;
  platform: string;
  platform_id: string;
  platform_name: string | null;
  match_type: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface UnlinkedSummary {
  totalCompanies: number;
  companiesWithTeamwork: number;
  companiesWithDrive: number;
  companiesWithDiscord: number;
  companiesWithKinsta: number;
  unlinkedTeamworkProjects: number;
  unlinkedDriveFolders: number;
  unlinkedKinstaSites: number;
}

// ── Read.ai Auth types ──────────────────────────────────────────────

export interface ReadAiAuthStatus {
  authorized: boolean;
  email: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  authorizedAt: string | null;
  lastRefreshed: string | null;
  hasRefreshToken: boolean;
}

export interface ReadAiSyncState {
  oldestMeetingSynced: string | null;
  newestMeetingSynced: string | null;
  totalMeetingsSynced: number;
  lastSyncAt: string | null;
  historicalSyncComplete: boolean;
  historicalSyncCursor: string | null;
  historicalSyncTarget: string | null;
}

export interface ReadAiOvernightStatus {
  range: string;
  sinceDate: string;
  scheduledAt: string;
}

export interface ReadAiSyncResult {
  success: boolean;
  scheduled?: boolean;
  message: string;
  fetched?: number;
  created?: number;
  updated?: number;
}

// ── Weekly Report types ──────────────────────────────────────────────

export interface WeeklyReportListItem {
  id: string;
  report_date: string;
  title: string;
  generated_at: string;
  auto_generated: number;
  export_path: string | null;
  action_items_json: string | null;
  highlights_json: string | null;
}

export interface WeeklyReportFull extends WeeklyReportListItem {
  period_start: string;
  period_end: string;
  portfolio_summary_json: string;
  sla_summary_json: string;
  budget_summary_json: string;
  health_summary_json: string;
  sync_summary_json: string;
  meetings_summary_json: string;
  activity_summary_json: string;
  html_content: string | null;
  created_at: string;
}

// ── Report Drill-Down types ──────────────────────────────────────────

export type ReportDrilldownMetric =
  | 'portfolio-active' | 'portfolio-contacts' | 'portfolio-outbound' | 'portfolio-inbound'
  | 'sla-ok' | 'sla-warning' | 'sla-violation'
  | 'health-ab' | 'health-c' | 'health-df'
  | 'budget-active' | 'budget-utilization' | 'budget-critical' | 'budget-warning';

export interface DrilldownColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'badge' | 'percent' | 'date';
}

export interface ReportDrilldownResult {
  metric: string;
  title: string;
  columns: DrilldownColumn[];
  rows: Array<Record<string, unknown>>;
  navigableColumn?: string;
}

// ── Gmail & Google Account types ─────────────────────────────────────

export interface GmailMessage {
  id: string;
  thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string | null;
  cc_emails: string | null;
  date: string | null;
  snippet: string | null;
  body_text: string | null;
  direction: 'inbound' | 'outbound' | 'internal';
  has_attachments: number;
  attachment_meta: string | null;
  company_id: string | null;
  match_method: string | null;
  account_id: string;
  synced_at: string;
}

export interface GoogleAccount {
  id: string;
  email: string;
  display_name: string | null;
  account_type: 'oauth' | 'service_account';
  is_active: number;
  added_at: string;
}

export interface TeamMailbox {
  email: string;
  name: string | null;
  is_active: number;
  last_gmail_sync: string | null;
  last_calendar_sync: string | null;
  synced_at: string;
}

export interface GmailStats {
  total: number;
  matched: number;
  unmatched: number;
  inbound: number;
  outbound: number;
}

// ── Churn Risk & Revenue types ───────────────────────────────────────

export interface SmartPriority {
  priority: number;
  action: string;
  reason: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  companyId?: string;
  companyName?: string;
  contactName?: string;
  ghlContactUrl?: string;
  category: string;
}

export interface ChurnRiskCompany {
  id: string;
  name: string;
  churn_risk_score: number;
  churn_risk_grade: 'low' | 'medium' | 'high' | 'critical';
  churn_risk_reason: string;
  monthly_revenue: number | null;
  contract_end: string | null;
  health_score: number | null;
  sla_days_since_contact: number | null;
}

// ── Suggestion Engine types ──────────────────────────────────────────

export interface SuggestedLink {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: string;
  confidence: number;
  signals_json: string | null;
  status: 'pending' | 'accepted' | 'dismissed' | 'pushed_to_ghl';
  accepted_at: string | null;
  dismissed_at: string | null;
  pushed_at: string | null;
  push_detail: string | null;
  created_at: string;
  updated_at: string;
  source_name?: string;
  target_name?: string;
}

export interface SuggestionCounts {
  total: number;
  pending: number;
  byType: Record<string, number>;
}

// ── SEO Agent types ──────────────────────────────────────────────────

export interface GapKeyword {
  id: string;
  company_id: string;
  keyword: string;
  current_position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  search_volume: number | null;
  cpc: number | null;
  opportunity_score: number;
  ranking_url: string | null;
  recommended_action: 'new_content' | 'optimize_existing' | 'build_links' | 'technical_fix';
  action_status: 'pending' | 'in_progress' | 'done' | 'skipped';
  content_id: string | null;
  top_competitor_url: string | null;
  top_competitor_domain: string | null;
  competitor_analysis_json: string | null;
  detected_at: string;
  last_checked_at: string | null;
  position_at_detection: number | null;
  position_after_action: number | null;
  resolved_at: string | null;
  snapshot_date: string | null;
  created_at: string;
}

export interface BrandProfile {
  id: string;
  company_id: string;
  company_name: string | null;
  industry: string | null;
  target_audience: string | null;
  value_proposition: string | null;
  tone_keywords: string | null;
  avoid_keywords: string | null;
  writing_style: string | null;
  example_phrases: string | null;
  competitors_to_beat: string | null;
  product_services: string | null;
  geographic_focus: string | null;
  interview_raw: string | null;
  status: 'draft' | 'complete';
  created_at: string;
  updated_at: string;
}

export interface CompetitorPage {
  id: string;
  company_id: string;
  gap_keyword_id: string;
  url: string;
  domain: string | null;
  serp_position: number | null;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  headings_json: string | null;
  word_count: number | null;
  topics_covered: string | null;
  content_summary: string | null;
  content_gaps: string | null;
  schema_types: string | null;
  internal_links: number;
  external_links: number;
  on_page_score: number | null;
  scraped_at: string;
  created_at: string;
}

export interface GeneratedContent {
  id: string;
  company_id: string;
  gap_keyword_id: string | null;
  title: string | null;
  slug: string | null;
  target_keyword: string | null;
  secondary_keywords: string | null;
  content_html: string | null;
  content_markdown: string | null;
  word_count: number;
  meta_title: string | null;
  meta_description: string | null;
  headings_json: string | null;
  internal_link_suggestions: string | null;
  schema_suggestion: string | null;
  brand_profile_id: string | null;
  competitor_urls_analyzed: string | null;
  model_used: string | null;
  tokens_used: number;
  status: 'draft' | 'review' | 'approved' | 'published';
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  gap_keyword?: string;
  current_position?: number;
  search_volume?: number;
  opportunity_score?: number;
}

export interface ContentPerformance {
  id: string;
  company_id: string;
  content_id: string | null;
  gap_keyword_id: string | null;
  keyword: string;
  position_before: number | null;
  position_current: number | null;
  position_best: number | null;
  clicks_before: number;
  clicks_current: number;
  impressions_before: number;
  impressions_current: number;
  check_count: number;
  first_check_at: string | null;
  last_check_at: string | null;
  trend: 'pending' | 'improving' | 'stable' | 'declining' | 'resolved';
  created_at: string;
  // Joined fields
  gap_keyword?: string;
  content_title?: string;
}

export interface SEOScheduleConfig {
  enabled: boolean;
  gapFrequencyDays: number;
  feedbackFrequencyDays: number;
  lastGapRunAt: string | null;
  lastFeedbackRunAt: string | null;
}

export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
}

// ── Pipeline & Opportunity types ──────────────────────────────────────

export interface Pipeline {
  id: string;
  ghl_pipeline_id: string;
  company_id: string;
  ghl_location_id: string;
  name: string;
  stages_count?: number;
  opportunities_count?: number;
  content_hash: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  ghl_stage_id: string;
  ghl_pipeline_id: string;
  company_id: string;
  name: string;
  position: number;
  content_hash: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  ghl_opportunity_id: string;
  company_id: string;
  ghl_location_id: string;
  ghl_pipeline_id: string;
  ghl_stage_id: string | null;
  stage_name: string | null;
  name: string;
  status: string;
  contact_id: string | null;
  ghl_contact_id: string | null;
  assigned_to: string | null;
  monetary_value: number | null;
  // Joined fields
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_name?: string | null;
  content_hash: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PulseConfig {
  pulse_sync_enabled: number;
  pulse_pipeline_id: string | null;
  pulse_dry_run: number;
  pulse_last_synced_at: string | null;
}

export interface PulseSyncLogEntry {
  id: string;
  source_opp_id: string;
  source_pipeline_id: string | null;
  company_id: string;
  pulse_opp_id: string | null;
  pulse_stage_name: string | null;
  reason: string | null;
  status: string;
  error: string | null;
  written_at: string | null;
  last_synced_at: string;
}

// ── IPC API shape (exposed via preload) ───────────────────────────────

export interface CompanyFilters {
  sla_status?: SLAStatus;
  status?: string;
  search?: string;
}

// ── A2P Compliance ────────────────────────────────────────────────────

export type A2PPageStatus = 'pending' | 'pass' | 'fail' | 'missing' | 'error';
export type A2POverallStatus = 'compliant' | 'non_compliant' | 'partial' | 'pending' | 'no_website';

export interface A2PComplianceRecord {
  id: string;
  company_id: string;
  ghl_location_id: string;
  business_name: string | null;
  domain: string | null;
  phone: string | null;
  contact_page_url: string | null;
  privacy_policy_url: string | null;
  terms_of_service_url: string | null;
  sms_policy_url: string | null;
  contact_page_status: A2PPageStatus;
  privacy_policy_status: A2PPageStatus;
  terms_of_service_status: A2PPageStatus;
  sms_policy_status: A2PPageStatus;
  overall_status: A2POverallStatus;
  issues_count: number;
  content_queue_status: string;
  last_scanned_at: string | null;
  last_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  company_name?: string;
  company_status?: string;
}

export interface A2PStats {
  total: number;
  compliant: number;
  partial: number;
  non_compliant: number;
  pending: number;
  no_website: number;
  missing_domain: number;
}

export interface A2PRequirementResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'unclear';
  evidence: string;
  suggestion?: string;
}

export interface A2PPageAnalysis {
  pageType: string;
  overallStatus: 'pass' | 'partial' | 'fail';
  score: number;
  requirements: A2PRequirementResult[];
  summary: string;
  suggestions: string[];
}

export interface A2PAnalysisRecord extends A2PComplianceRecord {
  contact_page_analysis: A2PPageAnalysis | null;
  privacy_policy_analysis: A2PPageAnalysis | null;
  terms_of_service_analysis: A2PPageAnalysis | null;
  sms_policy_analysis: A2PPageAnalysis | null;
}

export interface ElectronAPI {
  // Companies
  getCompanies: (filters?: CompanyFilters) => Promise<Company[]>;
  getCompany: (id: string) => Promise<Company | null>;
  createCompany: (data: { name: string; slug?: string; website?: string; ghl_location_id?: string; status?: string }) => Promise<Company>;

  // Contacts & Messages
  getContacts: (companyId: string) => Promise<Contact[]>;
  createContact: (data: { company_id: string; first_name?: string; last_name?: string; email?: string; phone?: string; ghl_contact_id?: string; company_name?: string }) => Promise<Contact>;
  getContactsByEmails: (emails: string[]) => Promise<Array<{
    email: string; ghl_contact_id: string | null; first_name: string | null;
    last_name: string | null; company_id: string; ghl_location_id: string | null;
  }>>;
  getMessages: (contactId: string) => Promise<Message[]>;
  getContactMessageSyncStatus: (companyId: string) => Promise<Array<{ id: string; messages_synced_at: string | null; messages_stored: number }>>;
  getCompanyCustomFields: (companyId: string) => Promise<Array<{ ghl_field_id: string; name: string; field_key: string; data_type: string; placeholder: string | null; position: number | null; model: string | null; synced_at: string | null }>>;
  getAllCustomFields: () => Promise<Array<{ ghl_field_id: string; name: string; field_key: string; data_type: string; placeholder: string | null; position: number | null; model: string | null; synced_at: string | null; company_name: string; ghl_location_id: string }>>;

  // Meetings
  getMeetings: (companyId: string) => Promise<Meeting[]>;
  getMeetingsForCompany: (companyId: string) => Promise<Meeting[]>;
  getMeetingActionItems: (meetingId: string) => Promise<ActionItem[]>;
  getUnmatchedMeetings: () => Promise<Meeting[]>;
  linkMeetingToCompany: (meetingId: string, companyId: string) => Promise<{ success: boolean }>;
  addDomainMapping: (domain: string, companyId: string) => Promise<{ success: boolean }>;

  // Drive Files
  getDriveFiles: (companyId: string) => Promise<DriveFile[]>;

  // Google Drive
  authorizeGoogleDrive: () => Promise<{ success: boolean; email?: string; message?: string }>;
  getGdriveAuthStatus: () => Promise<GoogleAuthStatus | null>;
  syncGdriveFolders: () => Promise<{ success: boolean; found?: number; created?: number; updated?: number; message?: string }>;
  syncGdriveFolderFiles: (folderId: string) => Promise<{ success: boolean; found?: number; created?: number; updated?: number; message?: string }>;
  getGdriveFolders: () => Promise<DriveFolder[]>;
  getGdriveFolderFiles: (folderId: string) => Promise<DriveFile[]>;
  acceptGdriveSuggestion: (folderId: string) => Promise<{ success: boolean }>;
  linkGdriveFolder: (folderId: string, companyId: string) => Promise<{ success: boolean }>;

  // Background queue
  queueSyncCompany: (companyId: string) => Promise<{ success: boolean; message?: string }>;
  queueSyncAll: () => Promise<{ success: boolean; message?: string }>;
  getQueueProgressAll: () => Promise<unknown[]>;
  getQueueProgressForCompany: (companyId: string) => Promise<unknown>;
  getQueueStats: () => Promise<{ total: number; pending: number; running: number; completed: number; failed: number }>;
  getMemoryStats: () => Promise<{ used: number; limit: number; total: number; percent: number }>;
  getQueueStatsForCompany: (companyId: string) => Promise<{ pending: number; running: number; completed: number; failed: number } | null>;
  getCompanyMessageStats: (companyId: string) => Promise<{ total: number; byType: Array<{ type: string; cnt: number }> }>;
  isQueueRunning: () => Promise<boolean>;
  pauseQueue: () => Promise<{ success: boolean }>;
  resumeQueue: () => Promise<{ success: boolean }>;
  getActiveTasks: () => Promise<unknown[]>;

  // Debug
  debugGetQueueState: () => Promise<{ pending: unknown[]; running: unknown[]; recentCompleted: unknown[]; recentFailed: unknown[]; isQueueRunning: boolean }>;

  // Sync Logs & Alerts
  getSyncLogs: (filters?: unknown) => Promise<SyncRun[]>;
  getAlerts: (unackedOnly?: boolean) => Promise<SyncAlert[]>;
  acknowledgeAlert: (id: string) => Promise<{ success: boolean }>;
  getSyncSummary: (filters?: unknown) => Promise<unknown[]>;
  getCompanySyncHistory: (companyId: string, limit?: number) => Promise<SyncRun[]>;
  getSyncPhases: (runId: string) => Promise<SyncPhase[]>;
  getRecentChanges: (companyId: string) => Promise<Array<{ entity_type: string; change_type: string; cnt: number }>>;
  getChangedCompanies: () => Promise<Array<{ company_id: string; total_changes: number }>>;

  // Gmail
  gmailSync: (sinceDays?: number, accountId?: string) => Promise<{ success: boolean; found?: number; created?: number; error?: string }>;
  gmailGetForCompany: (companyId: string) => Promise<GmailMessage[]>;
  gmailGetThread: (threadId: string) => Promise<GmailMessage[]>;
  gmailGetUnmatched: (limit?: number) => Promise<GmailMessage[]>;
  gmailLinkToCompany: (emailId: string, companyId: string) => Promise<{ success: boolean }>;
  gmailGetStats: () => Promise<GmailStats>;

  // Google Accounts
  googleListAccounts: () => Promise<GoogleAccount[]>;
  googleIsServiceAccountMode: () => Promise<boolean>;
  googleSetServiceAccount: (json: string, adminEmail: string) => Promise<{ success: boolean; error?: string }>;
  googleTestServiceAccount: () => Promise<{ drive: boolean; gmail: boolean; calendar: boolean; directory: boolean; errors: string[] }>;
  googleDiscoverTeamMailboxes: () => Promise<{ success: boolean; discovered?: number; error?: string }>;
  googleGetTeamMailboxes: () => Promise<TeamMailbox[]>;
  googleToggleTeamMailbox: (email: string, active: boolean) => Promise<{ success: boolean }>;

  // Client linking
  getLinkedClient: (companyId: string) => Promise<{ id: string; first_name: string; last_name: string; email: string; phone: string; ghl_contact_id: string; ghl_location_id: string } | null>;
  searchClients: (search: string) => Promise<Array<{ id: string; first_name: string; last_name: string; email: string; phone: string; ghl_contact_id: string; company_id: string; ghl_location_id: string }>>;
  linkClientToCompany: (clientContactId: string, companyId: string) => Promise<{ success: boolean }>;

  // Smart Priorities & Churn Risk
  getSmartPriorities: (forceRefresh?: boolean) => Promise<SmartPriority[]>;
  getChurnRisks: () => Promise<ChurnRiskCompany[]>;
  updateCompanyRevenue: (companyId: string, data: Record<string, unknown>) => Promise<{ success: boolean }>;

  // Suggestions
  getSuggestions: (filters?: { status?: string; linkType?: string; companyId?: string; minConfidence?: number; limit?: number }) => Promise<SuggestedLink[]>;
  getSuggestionsForCompany: (companyId: string) => Promise<SuggestedLink[]>;
  getSuggestionsForContact: (contactId: string) => Promise<SuggestedLink[]>;
  getSuggestionCounts: () => Promise<SuggestionCounts>;
  acceptSuggestion: (id: string) => Promise<{ success: boolean }>;
  dismissSuggestion: (id: string) => Promise<{ success: boolean }>;
  pushSuggestionToGHL: (id: string) => Promise<{ success: boolean; writeResult?: unknown }>;
  acceptSuggestionsBulk: (ids: string[]) => Promise<{ accepted: number; errors: number }>;
  dismissSuggestionsBulk: (ids: string[]) => Promise<{ dismissed: number }>;
  runSuggestionEngine: () => Promise<{ created: number; updated: number; byType: Record<string, number> }>;

  // SEO Agent
  seoGetGapKeywords: (companyId: string, filters?: { action?: string; status?: string }) => Promise<GapKeyword[]>;
  seoGetGapStats: (companyId: string) => Promise<Record<string, unknown>>;
  seoDetectGaps: (companyId: string, config?: unknown) => Promise<{ success: boolean; found?: number; updated?: number; error?: string }>;
  seoDetectGapsAll: () => Promise<{ scanned: number; totalGaps: number; errors: number }>;
  seoUpdateGapStatus: (gapId: string, status: string) => Promise<{ success: boolean }>;
  seoDismissGap: (gapId: string) => Promise<{ success: boolean }>;
  seoAnalyzeCompetitors: (gapKeywordId: string) => Promise<{ success: boolean; analyzed?: number; error?: string }>;
  seoGetCompetitorPages: (gapKeywordId: string) => Promise<CompetitorPage[]>;
  seoGetBrandProfile: (companyId: string) => Promise<BrandProfile | null>;
  seoGetBrandQuestions: () => Promise<Array<{ id: string; question: string; placeholder: string }>>;
  seoSaveBrandInterview: (companyId: string, answers: Record<string, string>) => Promise<{ success: boolean; profile?: unknown; error?: string }>;
  seoUpdateBrandProfile: (companyId: string, fields: Record<string, unknown>) => Promise<{ success: boolean }>;
  seoGenerateContent: (gapKeywordId: string, companyId: string, options?: unknown) => Promise<{ success: boolean; contentId?: string; error?: string }>;
  seoGetGeneratedContent: (companyId: string, filters?: { status?: string }) => Promise<GeneratedContent[]>;
  seoGetContentDetail: (contentId: string) => Promise<GeneratedContent | null>;
  seoUpdateContentStatus: (contentId: string, status: string) => Promise<{ success: boolean }>;
  seoPublishContent: (contentId: string, publishedUrl: string) => Promise<{ success: boolean }>;
  seoTrackPerformance: (companyId: string) => Promise<{ success: boolean; checked?: number; improved?: number; declined?: number; error?: string }>;
  seoGetPerformanceData: (companyId: string) => Promise<ContentPerformance[]>;
  seoGetPerformanceSummary: (companyId: string) => Promise<Record<string, unknown>>;
  seoGetCompanySeoConfig: (companyId: string) => Promise<{ gsc_property: string | null; seo_scan_enabled: number }>;
  seoSetGscProperty: (companyId: string, property: string) => Promise<{ success: boolean }>;
  seoToggleSeoScan: (companyId: string, enabled: boolean) => Promise<{ success: boolean }>;
  seoListGscProperties: () => Promise<{ success: boolean; properties?: GscProperty[]; error?: string }>;
  seoGetScheduleConfig: () => Promise<SEOScheduleConfig>;
  seoSetScheduleConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
  onSeoGapProgress: (cb: (...args: unknown[]) => void) => void;
  offSeoGapProgress: (cb: (...args: unknown[]) => void) => void;
  onSeoCompetitorProgress: (cb: (...args: unknown[]) => void) => void;
  offSeoCompetitorProgress: (cb: (...args: unknown[]) => void) => void;
  onSeoGenerateProgress: (cb: (...args: unknown[]) => void) => void;
  offSeoGenerateProgress: (cb: (...args: unknown[]) => void) => void;

  // Pipelines & Opportunities
  getPipelines: (companyId: string) => Promise<Pipeline[]>;
  getPipelineStages: (pipelineId: string, companyId: string) => Promise<PipelineStage[]>;
  getOpportunities: (companyId: string, pipelineId?: string) => Promise<Opportunity[]>;
  getOpportunity: (id: string) => Promise<Opportunity | null>;

  // Pulse
  getPulseConfig: (companyId: string) => Promise<PulseConfig | null>;
  setPulseConfig: (companyId: string, config: Record<string, unknown>) => Promise<{ success: boolean }>;
  getPulseSyncLog: (companyId: string) => Promise<PulseSyncLogEntry[]>;

  // Sync triggers
  syncCompany: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  syncAll: () => Promise<{ success: boolean; error?: string }>;
  forceFullSync: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  onSyncProgress: (cb: (...args: unknown[]) => void) => void;
  offSyncProgress: (cb: (...args: unknown[]) => void) => void;
  syncContactsAll: () => Promise<{ success: boolean; found?: number; created?: number; updated?: number; companies?: number; message?: string }>;
  syncMessagesOnly: () => Promise<{ success: boolean; contacts?: number; messages?: number; message?: string }>;
  onContactsSyncProgress: (cb: (...args: unknown[]) => void) => void;
  offContactsSyncProgress: (cb: (...args: unknown[]) => void) => void;
  onClientContactsReady: (cb: (...args: unknown[]) => void) => void;
  offClientContactsReady: (cb: (...args: unknown[]) => void) => void;

  // Batched IPC events
  onBatch: (channel: string, cb: (...args: unknown[]) => void) => void;
  offBatch: (channel: string, cb: (...args: unknown[]) => void) => void;

  // Settings
  getIntegrations: () => Promise<Integration[]>;
  getEnvValue: (key: string) => Promise<{ key: string; value: string; hasValue: boolean }>;
  saveEnvValue: (key: string, value: string) => Promise<{ success: boolean }>;
  testIntegration: (name: string) => Promise<{ success: boolean; message?: string; error?: string }>;

  // App state (key-value)
  getAppState: (key: string) => Promise<string | null>;
  setAppState: (key: string, value: string) => Promise<{ success: boolean }>;

  // App info
  getAppInfo: () => Promise<{ version: string; dbPath: string; userData: string }>;
  openDataFolder: () => Promise<void>;
  openInChrome: (url: string) => Promise<void>;
  resetDatabase: () => Promise<{ success: boolean }>;

  // Sub-account management
  getSubAccounts: (filters?: { search?: string; status?: string }) => Promise<SubAccount[]>;
  hasPit: (companyId: string) => Promise<{ hasPit: boolean }>;
  savePit: (companyId: string, pit: string) => Promise<{ success: boolean }>;
  testPit: (companyId: string) => Promise<{ success: boolean; message: string }>;
  toggleSubAccountSync: (companyId: string, enabled: boolean) => Promise<{ success: boolean }>;
  syncSubAccount: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  refreshSubAccountList: () => Promise<{ success: boolean; count?: number; message?: string }>;

  // CSV bulk upload
  matchLocationIds: (ids: string[]) => Promise<Record<string, { companyId: string; name: string; currentPitStatus: string } | null>>;
  bulkSavePits: (entries: Array<{ companyId: string; token: string }>) => Promise<{ saved: number; failed: number; errors: string[] }>;
  bulkTestPits: (companyIds: string[]) => Promise<Record<string, { success: boolean; message: string }>>;
  generatePitTemplate: () => Promise<string>;

  // Clients & Associations
  getClients: () => Promise<ClientContact[]>;
  getAssociationsForClient: (id: string) => Promise<ClientAssociation[]>;
  getAssociationsForTarget: (type: string, targetId: string) => Promise<ClientAssociation[]>;
  setAssociation: (params: Record<string, string>) => Promise<{ success: boolean }>;
  removeAssociation: (id: string) => Promise<{ success: boolean }>;
  autoMatchReadai: (clientId: string, email: string) => Promise<{ success: boolean; matched: number; total: number }>;
  getAssociationMap: () => Promise<ClientWithAssociations[]>;

  // Entity Links (company-level)
  getEntityLinks: (companyId: string) => Promise<EntityLink[]>;
  setEntityLink: (params: { companyId: string; platform: string; platformId: string; platformName: string }) => Promise<{ success: boolean }>;
  removeEntityLink: (linkId: string) => Promise<{ success: boolean }>;
  runAutoMatch: () => Promise<{ success: boolean; matched: number }>;
  getUnlinkedSummary: () => Promise<UnlinkedSummary>;

  // Read.ai multi-email
  setReadaiEmails: (params: { clientContactId: string; ghlContactId: string; emails: string[] }) => Promise<{ success: boolean; emailCount: number; meetingsMatched: number }>;
  getReadaiEmails: (clientContactId: string) => Promise<Array<{ email: string }>>;
  previewReadaiMatch: (emails: string[]) => Promise<{ matchCount: number }>;
  getClientMeetingCounts: () => Promise<Record<string, number>>;

  // Read.ai enhanced
  // Read.ai OAuth
  readaiOpenAuthPage: () => Promise<{ success: boolean; message?: string }>;
  readaiExchangeCode: (code: string, codeVerifier?: string) => Promise<{ success: boolean; message: string; email?: string }>;
  readaiExchangeCurl: (curlCommand: string) => Promise<{ success: boolean; message: string; email?: string }>;
  readaiRefreshToken: () => Promise<{ success: boolean; message: string }>;
  readaiGetAuthStatus: () => Promise<ReadAiAuthStatus>;
  readaiRevoke: () => Promise<{ success: boolean }>;
  readaiTestConnection: () => Promise<{ success: boolean; message: string }>;

  downloadRecording: (meetingId: string) => Promise<{ success: boolean; filepath?: string; size?: number; message?: string }>;
  getMeetingFullDetail: (meetingId: string) => Promise<{ meeting: Meeting | null; actionItems: ActionItem[] }>;
  getReadaiRagStats: () => Promise<{ total_meetings: number; expanded: number; with_transcript: number; with_summary: number; with_recording: number; downloaded_recordings: number } | null>;

  // Discord
  getDiscordChannels: () => Promise<DiscordChannel[]>;
  syncDiscordChannels: () => Promise<{ success: boolean; found?: number; message?: string }>;
  setDiscordChannelTag: (channelId: string, tag: string | null) => Promise<{ success: boolean }>;

  // Settings sub-page data
  getTeamworkWithAssociations: () => Promise<unknown[]>;
  syncTeamwork: () => Promise<{ success: boolean; found?: number; created?: number; updated?: number; message?: string }>;
  getReadaiWithAssociations: (filters?: unknown) => Promise<Meeting[]>;

  // RAG Pipeline
  getRagStats: () => Promise<{ sources: unknown[]; totals: Record<string, unknown> }>;
  ragProcessNow: () => Promise<unknown>;
  ragSearch: (query: string, filters?: unknown) => Promise<Array<{ id: string; content: string; score: number; sourceType: string; companyName: string | null; metadata: unknown }>>;
  ragClearAll: () => Promise<{ success: boolean }>;
  getRagStorageStats: () => Promise<{ dbTotalBytes: number; vectorBytes: number; contentBytes: number }>;

  // Read.ai Sync
  readaiSyncRange: (range: string) => Promise<ReadAiSyncResult>;
  readaiGetSyncState: () => Promise<ReadAiSyncState>;
  readaiGetOvernightStatus: () => Promise<ReadAiOvernightStatus | null>;
  readaiCancelOvernight: () => Promise<{ success: boolean }>;
  readaiSyncHistoricalNow: (range: string) => Promise<ReadAiSyncResult>;
  readaiGetMeetingsList: (limit?: number, offset?: number) => Promise<Meeting[]>;
  readaiGetTranscript: (meetingId: string) => Promise<string | null>;
  readaiGetMeetingsCount: () => Promise<number>;
  readaiExpandRange: (range: string) => Promise<{ success: boolean; expanded?: number; message?: string }>;
  readaiExpandAll: () => Promise<{ success: boolean; expanded?: number; message?: string }>;

  // Morning Briefing
  getSlaViolations: () => Promise<{ violations: unknown[]; warnings: unknown[] }>;
  getBudgetAlerts: () => Promise<{ critical: unknown[]; warning: unknown[] }>;
  getSyncAlerts: () => Promise<unknown[]>;
  getUnassociatedClients: () => Promise<unknown[]>;
  getPortfolioPulse: () => Promise<{ companies: Record<string, unknown> | null; newContacts7d: number; outboundMessages7d: number; syncStatus: Record<string, unknown> | null; queueStats: Record<string, unknown> | null }>;
  getTodaysMeetings: () => Promise<{ meetings: unknown[] }>;
  getRecentActivity: () => Promise<unknown[]>;
  getLinkingGaps: () => Promise<{ total: number; noTeamwork: Array<{ id: string; name: string }>; noDrive: Array<{ id: string; name: string }> }>;

  // Cloud Sync
  cloudSyncNow: (fullResync?: boolean) => Promise<{ success: boolean; rowsPushed: number; error?: string }>;
  getCloudSyncStatus: () => Promise<{ enabled: boolean; lastSyncAt: string | null; lastError: string | null; isSyncing: boolean }>;

  // Google Calendar
  getCalendars: () => Promise<unknown[]>;
  toggleCalendarSync: (id: string, enabled: boolean) => Promise<{ success: boolean }>;
  getUnmatchedCalendarEvents: () => Promise<unknown[]>;
  syncCalendar: () => Promise<{ success: boolean; found?: number; created?: number; updated?: number; message?: string }>;
  getCalendarForCompany: (companyId: string) => Promise<{ upcoming: unknown[]; recent: unknown[] }>;
  linkCalendarEvent: (eventId: string, companyId: string) => Promise<{ success: boolean }>;
  checkGoogleScopes: () => Promise<{ authorized: boolean; email?: string; hasCalendar: boolean; needsReauth: boolean }>;
  getCalendarStats: () => Promise<{ totalEvents: number; matchedEvents: number; unmatchedEvents: number; selectedCalendars: number }>;

  // Health Score
  getHealthScore: (companyId: string) => Promise<HealthScoreData | null>;
  getHealthHistory: (companyId: string) => Promise<HealthHistoryEntry[]>;
  getHealthRanking: () => Promise<HealthRanking[]>;
  getAtRiskCompanies: () => Promise<AtRiskCompany[]>;
  recomputeHealthScores: () => Promise<{ computed: number; changed: number }>;

  // Reports
  generateReport: (options?: { periodEnd?: string }) => Promise<{ success: boolean; reportId?: string; error?: string }>;
  listReports: () => Promise<WeeklyReportListItem[]>;
  getReport: (id: string) => Promise<WeeklyReportFull | null>;
  getLatestReport: () => Promise<WeeklyReportFull | null>;
  openReportInBrowser: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteReport: (id: string) => Promise<{ success: boolean }>;
  getReportDrilldown: (reportId: string, metric: string) => Promise<ReportDrilldownResult>;

  // Kinsta
  getKinstaSites: () => Promise<unknown[]>;
  getKinstaPlugins: (siteId: string) => Promise<unknown[]>;
  getKinstaThemes: (siteId: string) => Promise<unknown[]>;
  syncKinsta: () => Promise<{ success: boolean; found?: number; created?: number; updated?: number; message?: string }>;
  linkKinstaSite: (siteId: string, companyId: string) => Promise<{ success: boolean }>;
  acceptKinstaSuggestion: (siteId: string) => Promise<{ success: boolean }>;
  getKinstaStats: () => Promise<{ total: number; healthy: number; withUpdates: number; critical: number; unlinked: number }>;
  onKinstaSyncProgress: (cb: (...args: unknown[]) => void) => void;
  offKinstaSyncProgress: (cb: (...args: unknown[]) => void) => void;
  setKinstaClients: (siteId: string, clientIds: string[]) => Promise<{ success: boolean }>;
  getKinstaAlerts: () => Promise<{ critical: unknown[]; warning: unknown[]; oldPhp: unknown[] }>;

  // A2P Compliance
  a2pGetAll: (filters?: { status?: string; search?: string }) => Promise<A2PComplianceRecord[]>;
  a2pGetStats: () => Promise<A2PStats>;
  a2pGet: (id: string) => Promise<A2PComplianceRecord | null>;
  a2pUpdateDomain: (id: string, domain: string) => Promise<{ success: boolean }>;
  a2pUpdatePhone: (id: string, phone: string) => Promise<{ success: boolean }>;
  a2pUpdatePageUrl: (id: string, pageType: string, url: string) => Promise<{ success: boolean }>;
  a2pUpdatePageStatus: (id: string, pageType: string, status: string) => Promise<{ success: boolean }>;
  a2pBootstrap: () => Promise<{ success: boolean; created: number }>;
  a2pGetGeneratedContent: (a2pId: string) => Promise<unknown[]>;
  a2pScanOne: (companyId: string) => Promise<{ success: boolean; status?: string; error?: string }>;
  a2pScanAll: () => Promise<{ scanned: number; errors: number }>;
  onA2PScanProgress: (cb: (...args: unknown[]) => void) => void;
  offA2PScanProgress: (cb: (...args: unknown[]) => void) => void;
  a2pAnalyzeOne: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  a2pAnalyzeAll: () => Promise<{ analyzed: number; errors: number }>;
  a2pGetAnalysis: (companyId: string) => Promise<A2PAnalysisRecord | null>;
  onA2PAnalyzeProgress: (cb: (...args: unknown[]) => void) => void;
  offA2PAnalyzeProgress: (cb: (...args: unknown[]) => void) => void;
  a2pGenerateContent: (companyId: string) => Promise<{ success: boolean; generated?: number; error?: string }>;
  a2pGenerateAll: () => Promise<{ generated: number; errors: number }>;
  a2pUpdateContent: (contentId: string, md: string) => Promise<{ success: boolean }>;
  onA2PGenerateProgress: (cb: (...args: unknown[]) => void) => void;
  offA2PGenerateProgress: (cb: (...args: unknown[]) => void) => void;
  a2pExportToDrive: (contentId: string) => Promise<{ success: boolean; fileId?: string; url?: string; error?: string }>;
  a2pExportAllToDrive: (companyId: string) => Promise<{ success: boolean; exported?: number; errors?: string[]; error?: string }>;
  a2pCheckDriveFolder: (companyId: string) => Promise<{ linked: boolean; folderId?: string; folderName?: string }>;
  a2pGetSchedule: () => Promise<{ enabled: boolean; frequencyDays: number; lastRunAt: string | null; nextRunAt: string | null }>;
  a2pSetSchedule: (enabled: boolean, frequencyDays: number) => Promise<{ success: boolean }>;

  // Notifications
  getNotificationPreferences: () => Promise<NotificationPreferencesUI>;
  saveNotificationPreferences: (prefs: Record<string, unknown>) => Promise<{ success: boolean }>;
  testDiscordWebhook: (url: string) => Promise<{ success: boolean; status?: number; message?: string }>;
  getNotificationHistory: (limit?: number) => Promise<NotificationHistoryItem[]>;
  clearNotificationHistory: () => Promise<{ success: boolean }>;
  getUnreadNotificationCount: () => Promise<number>;
  onNotification: (cb: (...args: unknown[]) => void) => void;
  offNotification: (cb: (...args: unknown[]) => void) => void;
  onNotificationNavigate: (cb: (...args: unknown[]) => void) => void;
  offNotificationNavigate: (cb: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
