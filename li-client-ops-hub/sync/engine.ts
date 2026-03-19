import { queryAll, queryOne, execute } from '../db/client';
import { delay } from './utils/rateLimit';
import { logSyncStart, logSyncEnd, logAlert, type SyncCounts } from './utils/logger';
import {
  syncLocations,
  syncContacts,
  syncMessages,
  syncUsers,
  syncWorkflows,
  syncFunnels,
  syncSites,
  syncEmailTemplates,
  syncCustomFields,
  computeContactSLA,
  updateContactSLA,
  updateCompanySLA,
} from './adapters/ghl';
import { syncMeetingsList, expandMeetingDetails } from './adapters/readai';

// ── Types ─────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  error?: string;
  counts?: SyncCounts;
}

export interface SyncProgressData {
  companyId?: string;
  companyName?: string;
  phase: string;
  progress: number;
  found: number;
  message: string;
  companyIndex?: number;
  companyTotal?: number;
  startedAt?: string;
  estimatedEndAt?: string;
}

type ProgressCallback = (data: SyncProgressData) => void;

// ── Helpers ───────────────────────────────────────────────────────────

function getSLAConfig(): { warningDays: number; violationDays: number } {
  const w = queryOne("SELECT value FROM app_state WHERE key = 'sla_warning_days'");
  const v = queryOne("SELECT value FROM app_state WHERE key = 'sla_violation_days'");
  return {
    warningDays: w ? parseInt(w.value as string, 10) || 5 : 5,
    violationDays: v ? parseInt(v.value as string, 10) || 7 : 7,
  };
}

function getClientTaggedContacts(companyId: string) {
  const all = queryAll(
    'SELECT id, ghl_contact_id, days_since_outbound, last_outbound_at, tags FROM contacts WHERE company_id = ?',
    [companyId]
  );
  return all.filter((c) => {
    try { return ((JSON.parse((c.tags as string) ?? '[]')) as string[]).some((t) => t.toLowerCase().includes('client')); }
    catch { return false; }
  });
}

function readEnvVar(key: string): string | undefined {
  return process.env[key] || undefined;
}

function updateContactVelocity(companyId: string): void {
  const periods = [
    { col: 'contacts_added_7d', days: 7 },
    { col: 'contacts_added_30d', days: 30 },
    { col: 'contacts_added_90d', days: 90 },
    { col: 'contacts_added_365d', days: 365 },
  ];
  for (const p of periods) {
    const cutoff = new Date(Date.now() - p.days * 86400000).toISOString();
    const row = queryOne('SELECT COUNT(*) as cnt FROM contacts WHERE company_id = ? AND created_at >= ?', [companyId, cutoff]);
    execute(`UPDATE companies SET ${p.col} = ?, updated_at = datetime('now') WHERE id = ?`, [(row?.cnt as number) ?? 0, companyId]);
  }
}

function computeETA(startedAt: number, completed: number, total: number): string | undefined {
  if (completed === 0 || total === 0) return undefined;
  const elapsed = Date.now() - startedAt;
  const avgPerItem = elapsed / completed;
  const remaining = avgPerItem * (total - completed);
  return new Date(Date.now() + remaining).toISOString();
}

// ── Per-company sync (uses sub-account PIT) ───────────────────────────

export async function syncCompany(
  companyId: string,
  trigger: 'manual' | 'scheduled',
  onProgress?: ProgressCallback,
  batchInfo?: { index: number; total: number; startedAt: string; batchStartMs: number }
): Promise<SyncResult> {
  const company = queryOne('SELECT * FROM companies WHERE id = ?', [companyId]);
  const companyName = (company?.name as string) ?? companyId;
  const runId = logSyncStart('ghl', trigger, companyId, companyName);

  if (!company) {
    logSyncEnd(runId, 'error', {}, 'Company not found');
    return { success: false, error: 'Company not found' };
  }

  const pit = company.pit_token as string | null;
  const locationId = company.ghl_location_id as string | null;

  if (!pit || !locationId) {
    logSyncEnd(runId, 'error', {}, 'No PIT or location ID');
    return { success: false, error: 'Sub-account PIT not configured' };
  }

  const slaConfig = getSLAConfig();
  const totalCounts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const entityCounts: Record<string, SyncCounts> = {};
  const companyStartedAt = new Date().toISOString();

  const emit = (phase: string, progress: number, message: string) => {
    onProgress?.({
      companyId, companyName, phase, progress, found: totalCounts.found, message,
      companyIndex: batchInfo?.index, companyTotal: batchInfo?.total,
      startedAt: batchInfo?.startedAt ?? companyStartedAt,
      estimatedEndAt: batchInfo ? computeETA(batchInfo.batchStartMs, batchInfo.index, batchInfo.total) : undefined,
    });
  };

  try {
    // 1. Contacts
    emit('contacts', 5, 'Contacts: syncing...');
    const cc = await syncContacts(locationId, companyId, pit);
    entityCounts.contacts = cc;
    totalCounts.found += cc.found; totalCounts.created += cc.created; totalCounts.updated += cc.updated;
    emit('contacts', 20, `Contacts: ${cc.found} found`);

    // 2. Messages
    const clientContacts = getClientTaggedContacts(companyId);
    const totalClients = clientContacts.length;
    const msgCounts: SyncCounts = { found: 0, created: 0, updated: 0 };
    emit('messages', 20, `Messages: 0/${totalClients} contacts`);

    for (let i = 0; i < clientContacts.length; i++) {
      const c = clientContacts[i];
      const mc = await syncMessages(c.id as string, c.ghl_contact_id as string, companyId, pit);
      msgCounts.found += mc.found; msgCounts.created += mc.created; msgCounts.updated += mc.updated;
      totalCounts.found += mc.found; totalCounts.created += mc.created;

      const updated = queryOne('SELECT days_since_outbound, last_outbound_at FROM contacts WHERE id = ?', [c.id as string]);
      updateContactSLA(c.id as string, computeContactSLA((updated?.days_since_outbound as number) ?? 9999, !!(updated?.last_outbound_at), slaConfig));

      await delay(50);
      emit('messages', totalClients > 0 ? 20 + Math.round(((i + 1) / totalClients) * 30) : 50, `Messages: ${i + 1}/${totalClients} contacts`);
    }
    entityCounts.messages = msgCounts;

    // 3-8. Metadata
    const metaPhases: Array<[string, string, () => Promise<SyncCounts>]> = [
      ['users', 'Users', () => syncUsers(locationId, companyId, pit)],
      ['workflows', 'Workflows', () => syncWorkflows(locationId, companyId, pit)],
      ['funnels', 'Funnels', () => syncFunnels(locationId, companyId, pit)],
      ['sites', 'Sites', () => syncSites(locationId, companyId, pit)],
      ['templates', 'Email templates', () => syncEmailTemplates(locationId, companyId, pit)],
      ['fields', 'Custom fields', () => syncCustomFields(locationId, companyId, pit)],
    ];

    for (let i = 0; i < metaPhases.length; i++) {
      const [phase, label, fn] = metaPhases[i];
      emit(phase, 55 + Math.round((i / metaPhases.length) * 35), `${label}: syncing...`);
      const result = await fn();
      entityCounts[phase] = result;
      totalCounts.found += result.found;
    }

    // 9. Rollup counts + velocity + messages total
    execute(
      `UPDATE companies SET
        users_count = (SELECT COUNT(*) FROM ghl_users WHERE company_id = ?),
        workflows_count = (SELECT COUNT(*) FROM ghl_workflows WHERE company_id = ?),
        funnels_count = (SELECT COUNT(*) FROM ghl_funnels WHERE company_id = ?),
        sites_count = (SELECT COUNT(*) FROM ghl_sites WHERE company_id = ?),
        email_templates_count = (SELECT COUNT(*) FROM ghl_email_templates WHERE company_id = ?),
        custom_fields_count = (SELECT COUNT(*) FROM ghl_custom_fields WHERE company_id = ?),
        messages_synced_total = (SELECT COUNT(*) FROM messages WHERE company_id = ?),
        last_sync_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId]
    );

    // Contact velocity
    updateContactVelocity(companyId);

    // 10. SLA
    updateCompanySLA(companyId);

    // Store detail_json
    execute('UPDATE sync_runs SET detail_json = ? WHERE id = ?', [JSON.stringify(entityCounts), runId]);

    emit('complete', 100, `Sync complete for ${companyName}`);
    logSyncEnd(runId, 'success', totalCounts);
    return { success: true, counts: totalCounts };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    execute('UPDATE sync_runs SET detail_json = ? WHERE id = ?', [JSON.stringify(entityCounts), runId]);
    logSyncEnd(runId, 'error', totalCounts, message);
    emit('complete', 100, `Sync failed: ${message}`);
    return { success: false, error: message, counts: totalCounts };
  }
}

// ── Full sync (all enabled sub-accounts) ──────────────────────────────

export async function syncAllCompanies(
  trigger: 'manual' | 'scheduled',
  onProgress?: ProgressCallback
): Promise<void> {
  const agencyPit = readEnvVar('GHL_AGENCY_PIT');
  const ghlCompanyId = readEnvVar('GHL_COMPANY_ID');
  const batchStartedAt = new Date().toISOString();
  const batchStartMs = Date.now();

  // Refresh location list if agency PIT is configured
  if (agencyPit && ghlCompanyId) {
    onProgress?.({ phase: 'locations', progress: 0, found: 0, message: 'Refreshing sub-account list...', startedAt: batchStartedAt });
    try {
      await syncLocations(agencyPit, ghlCompanyId);
    } catch (err: unknown) {
      logAlert('sync_failure', 'error', `Location sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Sync each enabled sub-account with valid PIT
  const companies = queryAll(
    "SELECT id, name FROM companies WHERE sync_enabled = 1 AND pit_status = 'valid' AND status = 'active' ORDER BY name"
  );

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      await syncCompany(c.id as string, trigger, onProgress, {
        index: i + 1,
        total: companies.length,
        startedAt: batchStartedAt,
        batchStartMs,
      });
    } catch (err: unknown) {
      logAlert('sync_failure', 'warning', `Sync failed for ${c.name}: ${err instanceof Error ? err.message : err}`, c.id as string);
    }
    if (i < companies.length - 1) await delay(500);
  }

  // ── Read.ai sync (global, not per-company) ─────────────────────────
  const readaiKey = readEnvVar('READAI_API_KEY');
  if (readaiKey) {
    onProgress?.({ phase: 'readai', progress: 92, found: 0, message: 'Read.ai: syncing meetings...', startedAt: batchStartedAt });
    try {
      await syncMeetingsList(readaiKey, 30);
      onProgress?.({ phase: 'readai_expand', progress: 96, found: 0, message: 'Read.ai: expanding meeting details...', startedAt: batchStartedAt });
      await expandMeetingDetails(readaiKey, 20);
    } catch (err: unknown) {
      logAlert('sync_failure', 'warning', `Read.ai sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  onProgress?.({
    phase: 'complete',
    progress: 100,
    found: 0,
    message: `Sync complete for ${companies.length} sub-accounts`,
    companyIndex: companies.length,
    companyTotal: companies.length,
    startedAt: batchStartedAt,
  });
}
