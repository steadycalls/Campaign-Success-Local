import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // ── DB: Companies ───────────────────────────────────────────────────
  getCompanies: (filters?: unknown) =>
    ipcRenderer.invoke('db:getCompanies', filters),
  getCompany: (id: string) => ipcRenderer.invoke('db:getCompany', id),

  // ── DB: Contacts & Messages ─────────────────────────────────────────
  getContacts: (companyId: string) =>
    ipcRenderer.invoke('db:getContacts', companyId),
  getMessages: (contactId: string) =>
    ipcRenderer.invoke('db:getMessages', contactId),
  getContactMessageSyncStatus: (companyId: string) =>
    ipcRenderer.invoke('contacts:getMessageSyncStatus', companyId),
  getCompanyCustomFields: (companyId: string) =>
    ipcRenderer.invoke('company:getCustomFields', companyId),

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

  // ── Sync triggers (legacy — still works, also available via queue) ──
  syncCompany: (companyId: string) =>
    ipcRenderer.invoke('sync:company', companyId),
  syncAll: () => ipcRenderer.invoke('sync:all'),
  onSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('sync:progress', cb),
  offSyncProgress: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('sync:progress', cb),

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

  // ── Discord ─────────────────────────────────────────────────────────
  getDiscordChannels: () => ipcRenderer.invoke('discord:getChannels'),
  syncDiscordChannels: () => ipcRenderer.invoke('discord:syncChannels'),
  setDiscordChannelTag: (channelId: string, tag: string | null) =>
    ipcRenderer.invoke('discord:setChannelTag', channelId, tag),

  // ── Read.ai enhanced ───────────────────────────────────────────────
  downloadRecording: (meetingId: string) =>
    ipcRenderer.invoke('readai:downloadRecording', meetingId),
  getMeetingFullDetail: (meetingId: string) =>
    ipcRenderer.invoke('meetings:getFullDetail', meetingId),
  getReadaiRagStats: () =>
    ipcRenderer.invoke('readai:getRagStats'),

  // ── Settings sub-page data ──────────────────────────────────────────
  getTeamworkWithAssociations: () => ipcRenderer.invoke('teamwork:getWithAssociations'),
  getReadaiWithAssociations: (filters?: unknown) => ipcRenderer.invoke('readai:getMeetingsWithAssociations', filters),

  // ── Client contacts ready event (RI Phase 1 complete) ──────────────
  onClientContactsReady: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.on('sync:clientContactsReady', cb),
  offClientContactsReady: (cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener('sync:clientContactsReady', cb),

  // ── RAG Pipeline ──────────────────────────────────────────────────────
  getRagStats: () => ipcRenderer.invoke('rag:getStats'),
  ragProcessNow: () => ipcRenderer.invoke('rag:processNow'),
  ragSearch: (query: string, filters?: unknown) => ipcRenderer.invoke('rag:search', query, filters),
  ragClearAll: () => ipcRenderer.invoke('rag:clearAll'),
  getRagStorageStats: () => ipcRenderer.invoke('rag:getStorageStats'),
});
