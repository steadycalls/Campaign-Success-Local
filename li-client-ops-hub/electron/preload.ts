import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // ── DB: Companies ───────────────────────────────────────────────────
  getCompanies: (filters?: unknown) =>
    ipcRenderer.invoke('db:getCompanies', filters),
  getCompany: (id: string) => ipcRenderer.invoke('db:getCompany', id),
  createCompany: (data: { name: string; slug?: string; website?: string; ghl_location_id?: string; status?: string }) =>
    ipcRenderer.invoke('db:createCompany', data),

  // ── DB: Contacts & Messages ─────────────────────────────────────────
  getContacts: (companyId: string) =>
    ipcRenderer.invoke('db:getContacts', companyId),
  createContact: (data: { company_id: string; first_name?: string; last_name?: string; email?: string; phone?: string; ghl_contact_id?: string; company_name?: string }) =>
    ipcRenderer.invoke('db:createContact', data),
  getContactsByEmails: (emails: string[]) =>
    ipcRenderer.invoke('db:getContactsByEmails', emails),
  getMessages: (contactId: string) =>
    ipcRenderer.invoke('db:getMessages', contactId),
  getContactMessageSyncStatus: (companyId: string) =>
    ipcRenderer.invoke('contacts:getMessageSyncStatus', companyId),
  getCompanyCustomFields: (companyId: string) =>
    ipcRenderer.invoke('company:getCustomFields', companyId),
  getAllCustomFields: () =>
    ipcRenderer.invoke('company:getAllCustomFields'),

  // ── DB: Meetings ────────────────────────────────────────────────────
  getMeetings: (companyId: string) =>
    ipcRenderer.invoke('db:getMeetings', companyId),
  getMeetingsForCompany: (companyId: string) =>
    ipcRenderer.invoke('meetings:getForCompany', companyId),
  getMeetingActionItems: (meetingId: string) =>
    ipcRenderer.invoke('meetings:getActionItems', meetingId),
  getUnmatchedMeetings: () =>
    ipcRenderer.invoke('meetings:getUnmatched'),
  linkMeetingToCompany: (meetingId: string, companyId: string) =>
    ipcRenderer.invoke('meetings:linkToCompany', meetingId, companyId),
  addDomainMapping: (domain: string, companyId: string) =>
    ipcRenderer.invoke('meetings:addDomainMapping', domain, companyId),

  // ── DB: Drive Files ─────────────────────────────────────────────────
  getDriveFiles: (companyId: string) =>
    ipcRenderer.invoke('db:getDriveFiles', companyId),

  // ── DB: Sync Logs & Alerts ──────────────────────────────────────────
  getSyncLogs: (filters?: unknown) =>
    ipcRenderer.invoke('db:getSyncLogs', filters),
  getAlerts: (unackedOnly?: boolean) =>
    ipcRenderer.invoke('db:getAlerts', unackedOnly),
  acknowledgeAlert: (id: string) =>
    ipcRenderer.invoke('db:acknowledgeAlert', id),
  getSyncSummary: (filters?: unknown) =>
    ipcRenderer.invoke('syncLogs:getSummary', filters),
  getCompanySyncHistory: (companyId: string, limit?: number) =>
    ipcRenderer.invoke('syncLogs:getCompanyHistory', companyId, limit),
  getSyncPhases: (runId: string) =>
    ipcRenderer.invoke('syncLogs:getPhases', runId),
  getRecentChanges: (companyId: string) =>
    ipcRenderer.invoke('changeLog:getRecent', companyId),
  getChangedCompanies: () =>
    ipcRenderer.invoke('changeLog:getChangedCompanies'),

  // ── Pipelines & Opportunities ────────────────────────────────────────
  getPipelines: (companyId: string) =>
    ipcRenderer.invoke('db:getPipelines', companyId),
  getPipelineStages: (pipelineId: string, companyId: string) =>
    ipcRenderer.invoke('db:getPipelineStages', pipelineId, companyId),
  getOpportunities: (companyId: string, pipelineId?: string) =>
    ipcRenderer.invoke('db:getOpportunities', companyId, pipelineId),
  getOpportunity: (id: string) =>
    ipcRenderer.invoke('db:getOpportunity', id),

  // ── Pulse ──────────────────────────────────────────────────────────
  getPulseConfig: (companyId: string) =>
    ipcRenderer.invoke('db:getPulseConfig', companyId),
  setPulseConfig: (companyId: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('db:setPulseConfig', companyId, config),
  getPulseSyncLog: (companyId: string) =>
    ipcRenderer.invoke('db:getPulseSyncLog', companyId),

  // ── SEO Agent ──────────────────────────────────────────────────────
  seoGetGapKeywords: (companyId: string, filters?: unknown) =>
    ipcRenderer.invoke('seo:getGapKeywords', companyId, filters),
  seoGetGapStats: (companyId: string) =>
    ipcRenderer.invoke('seo:getGapStats', companyId),
  seoDetectGaps: (companyId: string, config?: unknown) =>
    ipcRenderer.invoke('seo:detectGaps', companyId, config),
  seoDetectGapsAll: () => ipcRenderer.invoke('seo:detectGapsAll'),
  seoUpdateGapStatus: (gapId: string, status: string) =>
    ipcRenderer.invoke('seo:updateGapStatus', gapId, status),
  seoDismissGap: (gapId: string) =>
    ipcRenderer.invoke('seo:dismissGap', gapId),
  seoAnalyzeCompetitors: (gapKeywordId: string) =>
    ipcRenderer.invoke('seo:analyzeCompetitors', gapKeywordId),
  seoGetCompetitorPages: (gapKeywordId: string) =>
    ipcRenderer.invoke('seo:getCompetitorPages', gapKeywordId),
  seoGetBrandProfile: (companyId: string) =>
    ipcRenderer.invoke('seo:getBrandProfile', companyId),
  seoGetBrandQuestions: () =>
    ipcRenderer.invoke('seo:getBrandQuestions'),
  seoSaveBrandInterview: (companyId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke('seo:saveBrandInterview', companyId, answers),
  seoUpdateBrandProfile: (companyId: string, fields: Record<string, unknown>) =>
    ipcRenderer.invoke('seo:updateBrandProfile', companyId, fields),
  seoGenerateContent: (gapKeywordId: string, companyId: string, options?: unknown) =>
    ipcRenderer.invoke('seo:generateContent', gapKeywordId, companyId, options),
  seoGetGeneratedContent: (companyId: string, filters?: unknown) =>
    ipcRenderer.invoke('seo:getGeneratedContent', companyId, filters),
  seoGetContentDetail: (contentId: string) =>
    ipcRenderer.invoke('seo:getContentDetail', contentId),
  seoUpdateContentStatus: (contentId: string, status: string) =>
    ipcRenderer.invoke('seo:updateContentStatus', contentId, status),
  seoPublishContent: (contentId: string, publishedUrl: string) =>
    ipcRenderer.invoke('seo:publishContent', contentId, publishedUrl),
  seoTrackPerformance: (companyId: string) =>
    ipcRenderer.invoke('seo:trackPerformance', companyId),
  seoGetPerformanceData: (companyId: string) =>
    ipcRenderer.invoke('seo:getPerformanceData', companyId),
  seoGetPerformanceSummary: (companyId: string) =>
    ipcRenderer.invoke('seo:getPerformanceSummary', companyId),
  seoGetCompanySeoConfig: (companyId: string) =>
    ipcRenderer.invoke('seo:getCompanySeoConfig', companyId),
  seoSetGscProperty: (companyId: string, property: string) =>
    ipcRenderer.invoke('seo:setGscProperty', companyId, property),
  seoToggleSeoScan: (companyId: string, enabled: boolean) =>
    ipcRenderer.invoke('seo:toggleSeoScan', companyId, enabled),
  seoListGscProperties: () =>
    ipcRenderer.invoke('seo:listGscProperties'),
  seoGetScheduleConfig: () =>
    ipcRenderer.invoke('seo:getScheduleConfig'),
  seoSetScheduleConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke('seo:setScheduleConfig', config),
  onSeoGapProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('seo:gapProgress', cb),
  offSeoGapProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('seo:gapProgress', cb),
  onSeoCompetitorProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('seo:competitorProgress', cb),
  offSeoCompetitorProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('seo:competitorProgress', cb),
  onSeoGenerateProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('seo:generateProgress', cb),
  offSeoGenerateProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('seo:generateProgress', cb),

  // ── Gmail ──────────────────────────────────────────────────────────
  gmailSync: (sinceDays?: number, accountId?: string) =>
    ipcRenderer.invoke('gmail:sync', sinceDays, accountId),
  gmailGetForCompany: (companyId: string) =>
    ipcRenderer.invoke('gmail:getForCompany', companyId),
  gmailGetThread: (threadId: string) =>
    ipcRenderer.invoke('gmail:getThread', threadId),
  gmailGetUnmatched: (limit?: number) =>
    ipcRenderer.invoke('gmail:getUnmatched', limit),
  gmailLinkToCompany: (emailId: string, companyId: string) =>
    ipcRenderer.invoke('gmail:linkToCompany', emailId, companyId),
  gmailGetStats: () =>
    ipcRenderer.invoke('gmail:getStats'),

  // ── Google Accounts ───────────────────────────────────────────────
  googleListAccounts: () =>
    ipcRenderer.invoke('google:listAccounts'),
  googleIsServiceAccountMode: () =>
    ipcRenderer.invoke('google:isServiceAccountMode'),
  googleSetServiceAccount: (json: string, adminEmail: string) =>
    ipcRenderer.invoke('google:setServiceAccount', json, adminEmail),
  googleTestServiceAccount: () =>
    ipcRenderer.invoke('google:testServiceAccount'),
  googleDiscoverTeamMailboxes: () =>
    ipcRenderer.invoke('google:discoverTeamMailboxes'),
  googleGetTeamMailboxes: () =>
    ipcRenderer.invoke('google:getTeamMailboxes'),
  googleToggleTeamMailbox: (email: string, active: boolean) =>
    ipcRenderer.invoke('google:toggleTeamMailbox', email, active),

  // ── Suggestions ─────────────────────────────────────────────────────
  getSuggestions: (filters?: unknown) =>
    ipcRenderer.invoke('suggestions:getAll', filters),
  getSuggestionsForCompany: (companyId: string) =>
    ipcRenderer.invoke('suggestions:getForCompany', companyId),
  getSuggestionsForContact: (contactId: string) =>
    ipcRenderer.invoke('suggestions:getForContact', contactId),
  getSuggestionCounts: () =>
    ipcRenderer.invoke('suggestions:getCounts'),
  acceptSuggestion: (id: string) =>
    ipcRenderer.invoke('suggestions:accept', id),
  dismissSuggestion: (id: string) =>
    ipcRenderer.invoke('suggestions:dismiss', id),
  pushSuggestionToGHL: (id: string) =>
    ipcRenderer.invoke('suggestions:pushToGHL', id),
  acceptSuggestionsBulk: (ids: string[]) =>
    ipcRenderer.invoke('suggestions:acceptBulk', ids),
  dismissSuggestionsBulk: (ids: string[]) =>
    ipcRenderer.invoke('suggestions:dismissBulk', ids),
  runSuggestionEngine: () =>
    ipcRenderer.invoke('suggestions:runEngine'),

  // ── Sync triggers (legacy — still works, also available via queue) ──
  syncCompany: (companyId: string) =>
    ipcRenderer.invoke('sync:company', companyId),
  syncAll: () => ipcRenderer.invoke('sync:all'),
  forceFullSync: (companyId: string) =>
    ipcRenderer.invoke('sync:forceFullSync', companyId),
  onSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('sync:progress', cb),
  offSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('sync:progress', cb),
  syncContactsAll: () => ipcRenderer.invoke('sync:contactsAll'),
  syncMessagesOnly: () => ipcRenderer.invoke('sync:messagesOnly'),
  onContactsSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('sync:contactsProgress', cb),
  offContactsSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('sync:contactsProgress', cb),

  // ── Background queue ──────────────────────────────────────────────
  queueSyncCompany: (companyId: string) =>
    ipcRenderer.invoke('queue:syncCompany', companyId),
  queueSyncAll: () =>
    ipcRenderer.invoke('queue:syncAll'),
  getQueueProgressAll: () =>
    ipcRenderer.invoke('queue:getProgressAll'),
  getQueueProgressForCompany: (companyId: string) =>
    ipcRenderer.invoke('queue:getProgressForCompany', companyId),
  getQueueStats: () =>
    ipcRenderer.invoke('queue:getStats'),
  getMemoryStats: () =>
    ipcRenderer.invoke('queue:getMemory'),
  isQueueRunning: () =>
    ipcRenderer.invoke('queue:isRunning'),
  pauseQueue: () =>
    ipcRenderer.invoke('queue:pause'),
  resumeQueue: () =>
    ipcRenderer.invoke('queue:resume'),
  getActiveTasks: () =>
    ipcRenderer.invoke('queue:getActiveTasks'),
  getQueueStatsForCompany: (companyId: string) =>
    ipcRenderer.invoke('queue:getQueueStatsForCompany', companyId),
  getCompanyMessageStats: (companyId: string) =>
    ipcRenderer.invoke('syncLogs:getCompanyMessageStats', companyId),

  // ── Debug ──────────────────────────────────────────────────────────
  debugGetQueueState: () => ipcRenderer.invoke('debug:getQueueState'),

  // ── Settings ────────────────────────────────────────────────────────
  getIntegrations: () => ipcRenderer.invoke('settings:getIntegrations'),
  getEnvValue: (key: string) =>
    ipcRenderer.invoke('settings:getEnvValue', key),
  saveEnvValue: (key: string, value: string) =>
    ipcRenderer.invoke('settings:setEnvValue', key, value),
  testIntegration: (name: string) =>
    ipcRenderer.invoke('settings:testIntegration', name),

  // ── App state ───────────────────────────────────────────────────────
  getAppState: (key: string) =>
    ipcRenderer.invoke('settings:getAppState', key),
  setAppState: (key: string, value: string) =>
    ipcRenderer.invoke('settings:setAppState', key, value),

  // ── App info ────────────────────────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke('settings:getAppInfo'),
  openDataFolder: () => ipcRenderer.invoke('settings:openDataFolder'),
  openInChrome: (url: string) => ipcRenderer.invoke('settings:openInChrome', url),
  resetDatabase: () => ipcRenderer.invoke('settings:resetDatabase'),

  // ── Sub-account management ──────────────────────────────────────────
  getSubAccounts: (filters?: unknown) =>
    ipcRenderer.invoke('subaccount:getAll', filters),
  hasPit: (companyId: string) =>
    ipcRenderer.invoke('subaccount:hasPit', companyId),
  savePit: (companyId: string, pit: string) =>
    ipcRenderer.invoke('subaccount:savePit', companyId, pit),
  testPit: (companyId: string) =>
    ipcRenderer.invoke('subaccount:testPit', companyId),
  toggleSubAccountSync: (companyId: string, enabled: boolean) =>
    ipcRenderer.invoke('subaccount:toggleSync', companyId, enabled),
  syncSubAccount: (companyId: string) =>
    ipcRenderer.invoke('subaccount:sync', companyId),
  refreshSubAccountList: () =>
    ipcRenderer.invoke('subaccount:refreshList'),

  // ── CSV bulk upload ─────────────────────────────────────────────────
  matchLocationIds: (ids: string[]) =>
    ipcRenderer.invoke('subaccount:matchLocationIds', ids),
  bulkSavePits: (entries: Array<{ companyId: string; token: string }>) =>
    ipcRenderer.invoke('subaccount:bulkSavePits', entries),
  bulkTestPits: (companyIds: string[]) =>
    ipcRenderer.invoke('subaccount:bulkTestPits', companyIds),
  generatePitTemplate: () =>
    ipcRenderer.invoke('subaccount:generateTemplate'),

  // ── Clients & Associations ──────────────────────────────────────────
  getClients: () => ipcRenderer.invoke('clients:getAll'),
  getAssociationsForClient: (id: string) => ipcRenderer.invoke('associations:getForClient', id),
  getAssociationsForTarget: (type: string, targetId: string) => ipcRenderer.invoke('associations:getForTarget', type, targetId),
  setAssociation: (params: Record<string, string>) => ipcRenderer.invoke('associations:set', params),
  removeAssociation: (id: string) => ipcRenderer.invoke('associations:remove', id),
  autoMatchReadai: (clientId: string, email: string) => ipcRenderer.invoke('associations:autoMatchReadai', clientId, email),
  getAssociationMap: () => ipcRenderer.invoke('associations:getMap'),

  // ── Read.ai multi-email ───────────────────────────────────────────
  setReadaiEmails: (params: { clientContactId: string; ghlContactId: string; emails: string[] }) =>
    ipcRenderer.invoke('associations:setReadaiEmails', params),
  getReadaiEmails: (clientContactId: string) =>
    ipcRenderer.invoke('associations:getReadaiEmails', clientContactId),
  previewReadaiMatch: (emails: string[]) =>
    ipcRenderer.invoke('associations:previewReadaiMatch', emails),
  getClientMeetingCounts: () =>
    ipcRenderer.invoke('clients:getMeetingCounts'),

  // ── Entity Links (company-level cross-platform) ───────────────────
  getEntityLinks: (companyId: string) =>
    ipcRenderer.invoke('entityLinks:getForCompany', companyId),
  setEntityLink: (params: { companyId: string; platform: string; platformId: string; platformName: string }) =>
    ipcRenderer.invoke('entityLinks:set', params),
  removeEntityLink: (linkId: string) =>
    ipcRenderer.invoke('entityLinks:remove', linkId),
  runAutoMatch: () =>
    ipcRenderer.invoke('entityLinks:runAutoMatch'),
  getUnlinkedSummary: () =>
    ipcRenderer.invoke('entityLinks:getUnlinkedSummary'),

  // ── Discord ─────────────────────────────────────────────────────────
  getDiscordChannels: () => ipcRenderer.invoke('discord:getChannels'),
  syncDiscordChannels: () => ipcRenderer.invoke('discord:syncChannels'),
  setDiscordChannelTag: (channelId: string, tag: string | null) =>
    ipcRenderer.invoke('discord:setChannelTag', channelId, tag),

  // ── Read.ai OAuth ──────────────────────────────────────────────────
  readaiOpenAuthPage: () => ipcRenderer.invoke('readai:openAuthPage'),
  readaiExchangeCode: (code: string, codeVerifier?: string) => ipcRenderer.invoke('readai:exchangeCode', code, codeVerifier),
  readaiExchangeCurl: (curlCommand: string) => ipcRenderer.invoke('readai:exchangeCurl', curlCommand),
  readaiRefreshToken: () => ipcRenderer.invoke('readai:refreshToken'),
  readaiGetAuthStatus: () => ipcRenderer.invoke('readai:getAuthStatus'),
  readaiRevoke: () => ipcRenderer.invoke('readai:revoke'),
  readaiTestConnection: () => ipcRenderer.invoke('readai:testConnection'),

  // ── Read.ai enhanced ───────────────────────────────────────────────
  downloadRecording: (meetingId: string) =>
    ipcRenderer.invoke('readai:downloadRecording', meetingId),
  getMeetingFullDetail: (meetingId: string) =>
    ipcRenderer.invoke('meetings:getFullDetail', meetingId),
  getReadaiRagStats: () =>
    ipcRenderer.invoke('readai:getRagStats'),

  // ── Google Drive ────────────────────────────────────────────────────
  authorizeGoogleDrive: () => ipcRenderer.invoke('gdrive:authorize'),
  getGdriveAuthStatus: () => ipcRenderer.invoke('gdrive:getAuthStatus'),
  syncGdriveFolders: () => ipcRenderer.invoke('gdrive:syncFolders'),
  syncGdriveFolderFiles: (folderId: string) =>
    ipcRenderer.invoke('gdrive:syncFolderFiles', folderId),
  getGdriveFolders: () => ipcRenderer.invoke('gdrive:getFolders'),
  getGdriveFolderFiles: (folderId: string) =>
    ipcRenderer.invoke('gdrive:getFolderFiles', folderId),
  acceptGdriveSuggestion: (folderId: string) =>
    ipcRenderer.invoke('gdrive:acceptSuggestion', folderId),
  linkGdriveFolder: (folderId: string, companyId: string) =>
    ipcRenderer.invoke('gdrive:linkFolder', folderId, companyId),

  // ── Settings sub-page data ──────────────────────────────────────────
  getTeamworkWithAssociations: () => ipcRenderer.invoke('teamwork:getWithAssociations'),
  syncTeamwork: () => ipcRenderer.invoke('teamwork:sync'),
  getReadaiWithAssociations: (filters?: unknown) => ipcRenderer.invoke('readai:getMeetingsWithAssociations', filters),

  // ── Client contacts ready event (RI Phase 1 complete) ──────────────
  onClientContactsReady: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('sync:clientContactsReady', cb),
  offClientContactsReady: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('sync:clientContactsReady', cb),

  // ── Batched IPC events (high-frequency channels) ──────────────────
  onBatch: (channel: string, cb: (...args: unknown[]) => void) =>
    ipcRenderer.on(`${channel}:batch`, cb),
  offBatch: (channel: string, cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener(`${channel}:batch`, cb),

  // ── RAG Pipeline ──────────────────────────────────────────────────────
  getRagStats: () => ipcRenderer.invoke('rag:getStats'),
  ragProcessNow: () => ipcRenderer.invoke('rag:processNow'),
  ragSearch: (query: string, filters?: unknown) => ipcRenderer.invoke('rag:search', query, filters),
  ragClearAll: () => ipcRenderer.invoke('rag:clearAll'),
  getRagStorageStats: () => ipcRenderer.invoke('rag:getStorageStats'),

  // ── Google Calendar ─────────────────────────────────────────────────
  getCalendars: () => ipcRenderer.invoke('calendar:getCalendars'),
  toggleCalendarSync: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('calendar:toggleSync', id, enabled),
  getUnmatchedCalendarEvents: () => ipcRenderer.invoke('calendar:getUnmatched'),
  syncCalendar: () => ipcRenderer.invoke('calendar:sync'),
  getCalendarForCompany: (companyId: string) =>
    ipcRenderer.invoke('calendar:getForCompany', companyId),
  linkCalendarEvent: (eventId: string, companyId: string) =>
    ipcRenderer.invoke('calendar:linkEvent', eventId, companyId),
  checkGoogleScopes: () => ipcRenderer.invoke('google:checkScopes'),
  getCalendarStats: () => ipcRenderer.invoke('calendar:getStats'),

  // ── Morning Briefing ──────────────────────────────────────────────────
  getSlaViolations: () => ipcRenderer.invoke('briefing:getSlaViolations'),
  getBudgetAlerts: () => ipcRenderer.invoke('briefing:getBudgetAlerts'),
  getSyncAlerts: () => ipcRenderer.invoke('briefing:getSyncAlerts'),
  getUnassociatedClients: () => ipcRenderer.invoke('briefing:getUnassociatedClients'),
  getPortfolioPulse: () => ipcRenderer.invoke('briefing:getPortfolioPulse'),
  getTodaysMeetings: () => ipcRenderer.invoke('briefing:getTodaysMeetings'),
  getRecentActivity: () => ipcRenderer.invoke('briefing:getRecentActivity'),
  getLinkingGaps: () => ipcRenderer.invoke('briefing:getLinkingGaps'),
  getSmartPriorities: (forceRefresh?: boolean) => ipcRenderer.invoke('briefing:getSmartPriorities', forceRefresh),
  getChurnRisks: () => ipcRenderer.invoke('briefing:getChurnRisks'),
  updateCompanyRevenue: (companyId: string, data: Record<string, unknown>) => ipcRenderer.invoke('db:updateCompanyRevenue', companyId, data),
  getLinkedClient: (companyId: string) => ipcRenderer.invoke('db:getLinkedClient', companyId),
  searchClients: (search: string) => ipcRenderer.invoke('db:searchClients', search),
  linkClientToCompany: (clientContactId: string, companyId: string) => ipcRenderer.invoke('db:linkClientToCompany', clientContactId, companyId),

  // ── Cloud Sync ──────────────────────────────────────────────────────
  cloudSyncNow: (fullResync?: boolean) => ipcRenderer.invoke('cloud:syncNow', fullResync),
  getCloudSyncStatus: () => ipcRenderer.invoke('cloud:getStatus'),

  // ── Reports ────────────────────────────────────────────────────────────
  generateReport: (options?: { periodEnd?: string }) =>
    ipcRenderer.invoke('reports:generate', options),
  listReports: () => ipcRenderer.invoke('reports:list'),
  getReport: (id: string) => ipcRenderer.invoke('reports:get', id),
  getLatestReport: () => ipcRenderer.invoke('reports:getLatest'),
  openReportInBrowser: (id: string) =>
    ipcRenderer.invoke('reports:openInBrowser', id),
  deleteReport: (id: string) => ipcRenderer.invoke('reports:delete', id),
  getReportDrilldown: (reportId: string, metric: string) =>
    ipcRenderer.invoke('reports:drilldown', reportId, metric),

  // ── Kinsta ─────────────────────────────────────────────────────────
  getKinstaSites: () => ipcRenderer.invoke('kinsta:getSites'),
  getKinstaPlugins: (siteId: string) => ipcRenderer.invoke('kinsta:getPlugins', siteId),
  getKinstaThemes: (siteId: string) => ipcRenderer.invoke('kinsta:getThemes', siteId),
  syncKinsta: () => ipcRenderer.invoke('kinsta:sync'),
  linkKinstaSite: (siteId: string, companyId: string) => ipcRenderer.invoke('kinsta:linkSite', siteId, companyId),
  acceptKinstaSuggestion: (siteId: string) => ipcRenderer.invoke('kinsta:acceptSuggestion', siteId),
  getKinstaStats: () => ipcRenderer.invoke('kinsta:getStats'),
  onKinstaSyncProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.on('kinsta:syncProgress', cb),
  offKinstaSyncProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.removeListener('kinsta:syncProgress', cb),
  setKinstaClients: (siteId: string, clientIds: string[]) =>
    ipcRenderer.invoke('kinsta:setClients', siteId, clientIds),
  getKinstaAlerts: () => ipcRenderer.invoke('briefing:getKinstaAlerts'),

  // ── A2P Compliance ─────────────────────────────────────────────────
  a2pGetAll: (filters?: unknown) => ipcRenderer.invoke('a2p:getAll', filters),
  a2pGetStats: () => ipcRenderer.invoke('a2p:getStats'),
  a2pGet: (id: string) => ipcRenderer.invoke('a2p:get', id),
  a2pUpdateDomain: (id: string, domain: string) => ipcRenderer.invoke('a2p:updateDomain', id, domain),
  a2pUpdatePhone: (id: string, phone: string) => ipcRenderer.invoke('a2p:updatePhone', id, phone),
  a2pUpdatePageUrl: (id: string, pageType: string, url: string) => ipcRenderer.invoke('a2p:updatePageUrl', id, pageType, url),
  a2pUpdatePageStatus: (id: string, pageType: string, status: string) => ipcRenderer.invoke('a2p:updatePageStatus', id, pageType, status),
  a2pBootstrap: () => ipcRenderer.invoke('a2p:bootstrap'),
  a2pGetGeneratedContent: (a2pId: string) => ipcRenderer.invoke('a2p:getGeneratedContent', a2pId),
  a2pScanOne: (companyId: string) => ipcRenderer.invoke('a2p:scanOne', companyId),
  a2pScanAll: () => ipcRenderer.invoke('a2p:scanAll'),
  onA2PScanProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.on('a2p:scanProgress', cb),
  offA2PScanProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.removeListener('a2p:scanProgress', cb),
  a2pAnalyzeOne: (companyId: string) => ipcRenderer.invoke('a2p:analyzeOne', companyId),
  a2pAnalyzeAll: () => ipcRenderer.invoke('a2p:analyzeAll'),
  a2pGetAnalysis: (companyId: string) => ipcRenderer.invoke('a2p:getAnalysis', companyId),
  onA2PAnalyzeProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.on('a2p:analyzeProgress', cb),
  offA2PAnalyzeProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.removeListener('a2p:analyzeProgress', cb),
  a2pGenerateContent: (companyId: string) => ipcRenderer.invoke('a2p:generateContent', companyId),
  a2pGenerateAll: () => ipcRenderer.invoke('a2p:generateAll'),
  a2pUpdateContent: (contentId: string, md: string) => ipcRenderer.invoke('a2p:updateContent', contentId, md),
  onA2PGenerateProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.on('a2p:generateProgress', cb),
  offA2PGenerateProgress: (cb: (...args: unknown[]) => void) => ipcRenderer.removeListener('a2p:generateProgress', cb),
  a2pExportToDrive: (contentId: string) => ipcRenderer.invoke('a2p:exportToDrive', contentId),
  a2pExportAllToDrive: (companyId: string) => ipcRenderer.invoke('a2p:exportAllToDrive', companyId),
  a2pCheckDriveFolder: (companyId: string) => ipcRenderer.invoke('a2p:checkDriveFolder', companyId),
  a2pGetSchedule: () => ipcRenderer.invoke('a2p:getSchedule'),
  a2pSetSchedule: (enabled: boolean, frequencyDays: number) => ipcRenderer.invoke('a2p:setSchedule', enabled, frequencyDays),

  // ── Read.ai Sync ────────────────────────────────────────────────────
  readaiSyncRange: (range: string) => ipcRenderer.invoke('readai:syncRange', range),
  readaiGetSyncState: () => ipcRenderer.invoke('readai:getSyncState'),
  readaiGetOvernightStatus: () => ipcRenderer.invoke('readai:getOvernightStatus'),
  readaiCancelOvernight: () => ipcRenderer.invoke('readai:cancelOvernight'),
  readaiSyncHistoricalNow: (range: string) => ipcRenderer.invoke('readai:syncHistoricalNow', range),
  readaiGetMeetingsList: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('readai:getMeetingsList', limit, offset),
  readaiGetTranscript: (meetingId: string) => ipcRenderer.invoke('readai:getTranscript', meetingId),
  readaiGetMeetingsCount: () => ipcRenderer.invoke('readai:getMeetingsCount'),
  readaiExpandRange: (range: string) => ipcRenderer.invoke('readai:expandRange', range),
  readaiExpandAll: () => ipcRenderer.invoke('readai:expandAll'),

  // ── Health Score ──────────────────────────────────────────────────────
  getHealthScore: (companyId: string) => ipcRenderer.invoke('health:getForCompany', companyId),
  getHealthHistory: (companyId: string) => ipcRenderer.invoke('health:getHistory', companyId),
  getHealthRanking: () => ipcRenderer.invoke('health:getRanking'),
  getAtRiskCompanies: () => ipcRenderer.invoke('health:getAtRisk'),
  recomputeHealthScores: () => ipcRenderer.invoke('health:recompute'),

  // ── Notifications ──────────────────────────────────────────────────
  getNotificationPreferences: () =>
    ipcRenderer.invoke('notifications:getPreferences'),
  saveNotificationPreferences: (prefs: Record<string, unknown>) =>
    ipcRenderer.invoke('notifications:savePreferences', prefs),
  testDiscordWebhook: (url: string) =>
    ipcRenderer.invoke('notifications:testDiscord', url),
  getNotificationHistory: (limit?: number) =>
    ipcRenderer.invoke('notifications:getHistory', limit),
  clearNotificationHistory: () =>
    ipcRenderer.invoke('notifications:clearHistory'),
  getUnreadNotificationCount: () =>
    ipcRenderer.invoke('notifications:getUnreadCount'),
  onNotification: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('notification:new', cb),
  offNotification: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('notification:new', cb),
  onNotificationNavigate: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('notification:navigate', cb),
  offNotificationNavigate: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('notification:navigate', cb),
});
