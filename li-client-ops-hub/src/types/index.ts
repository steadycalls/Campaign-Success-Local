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

// ── IPC API shape (exposed via preload) ───────────────────────────────

export interface CompanyFilters {
  sla_status?: SLAStatus;
  status?: string;
  search?: string;
}

export interface ElectronAPI {
  // Companies
  getCompanies: (filters?: CompanyFilters) => Promise<Company[]>;
  getCompany: (id: string) => Promise<Company | null>;

  // Contacts & Messages
  getContacts: (companyId: string) => Promise<Contact[]>;
  getMessages: (contactId: string) => Promise<Message[]>;
  getContactMessageSyncStatus: (companyId: string) => Promise<Array<{ id: string; messages_synced_at: string | null; messages_stored: number }>>;
  getCompanyCustomFields: (companyId: string) => Promise<Array<{ name: string; field_key: string; data_type: string }>>;

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

  // Sync Logs & Alerts
  getSyncLogs: (filters?: unknown) => Promise<SyncRun[]>;
  getAlerts: (unackedOnly?: boolean) => Promise<SyncAlert[]>;
  acknowledgeAlert: (id: string) => Promise<{ success: boolean }>;
  getSyncSummary: (filters?: unknown) => Promise<unknown[]>;
  getCompanySyncHistory: (companyId: string, limit?: number) => Promise<SyncRun[]>;

  // Sync triggers
  syncCompany: (companyId: string) => Promise<{ success: boolean; error?: string }>;
  syncAll: () => Promise<{ success: boolean; error?: string }>;
  onSyncProgress: (cb: (...args: unknown[]) => void) => void;
  offSyncProgress: (cb: (...args: unknown[]) => void) => void;
  onClientContactsReady: (cb: (...args: unknown[]) => void) => void;
  offClientContactsReady: (cb: (...args: unknown[]) => void) => void;

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

  // Read.ai multi-email
  setReadaiEmails: (params: { clientContactId: string; ghlContactId: string; emails: string[] }) => Promise<{ success: boolean; emailCount: number; meetingsMatched: number }>;
  getReadaiEmails: (clientContactId: string) => Promise<Array<{ email: string }>>;
  previewReadaiMatch: (emails: string[]) => Promise<{ matchCount: number }>;
  getClientMeetingCounts: () => Promise<Record<string, number>>;

  // Read.ai enhanced
  downloadRecording: (meetingId: string) => Promise<{ success: boolean; filepath?: string; size?: number; message?: string }>;
  getMeetingFullDetail: (meetingId: string) => Promise<{ meeting: Meeting | null; actionItems: ActionItem[] }>;
  getReadaiRagStats: () => Promise<{ total_meetings: number; expanded: number; with_transcript: number; with_summary: number; with_recording: number; downloaded_recordings: number } | null>;

  // Discord
  getDiscordChannels: () => Promise<DiscordChannel[]>;
  syncDiscordChannels: () => Promise<{ success: boolean; found?: number; message?: string }>;
  setDiscordChannelTag: (channelId: string, tag: string | null) => Promise<{ success: boolean }>;

  // Settings sub-page data
  getTeamworkWithAssociations: () => Promise<unknown[]>;
  getReadaiWithAssociations: (filters?: unknown) => Promise<Meeting[]>;

  // RAG Pipeline
  getRagStats: () => Promise<{ sources: unknown[]; totals: Record<string, unknown> }>;
  ragProcessNow: () => Promise<unknown>;
  ragSearch: (query: string, filters?: unknown) => Promise<Array<{ id: string; content: string; score: number; sourceType: string; companyName: string | null; metadata: unknown }>>;
  ragClearAll: () => Promise<{ success: boolean }>;
  getRagStorageStats: () => Promise<{ dbTotalBytes: number; vectorBytes: number; contentBytes: number }>;

  // Morning Briefing
  getSlaViolations: () => Promise<{ violations: unknown[]; warnings: unknown[] }>;
  getBudgetAlerts: () => Promise<{ critical: unknown[]; warning: unknown[] }>;
  getSyncAlerts: () => Promise<unknown[]>;
  getUnassociatedClients: () => Promise<unknown[]>;
  getPortfolioPulse: () => Promise<{ companies: Record<string, unknown> | null; newContacts7d: number; outboundMessages7d: number; syncStatus: Record<string, unknown> | null; queueStats: Record<string, unknown> | null }>;
  getTodaysMeetings: () => Promise<{ meetings: unknown[] }>;
  getRecentActivity: () => Promise<unknown[]>;

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
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
