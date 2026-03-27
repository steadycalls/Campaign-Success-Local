import { queryAll, queryOne, execute } from '../db/client';
import { delay } from './utils/rateLimit';
import { logSyncStart, logSyncEnd, logAlert, logPhaseStart, logPhaseEnd, failOrphanedPhases, type SyncCounts } from './utils/logger';
import { updateSyncCursor, markFullSync } from './utils/cursors';
import { runAutoMatch } from './matching/autoMatch';
import { runSuggestionEngine } from './matching/suggestionEngine';
import { bootstrapA2PRecords } from '../a2p/bootstrap';
import {
  syncLocations,
  syncContacts,
  syncContactsByTag,
  syncMessages,
  syncUsers,
  syncWorkflows,
  syncFunnels,
  syncSites,
  syncEmailTemplates,
  syncCustomFields,
  syncPipelines,
  syncOpportunities,
  computeContactSLA,
  updateContactSLA,
  updateCompanySLA,
  setCurrentCompanyContext,
} from './adapters/ghl';
import { syncPulse } from './pulse/sync';
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

  // Set company context for per-company rate limiting
  setCurrentCompanyContext(companyId);

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
    const RI_GHL_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';
    const isRiSubaccount = locationId === RI_GHL_ID;
    const msgCounts: SyncCounts = { found: 0, created: 0, updated: 0 };
    const prioritySyncedIds = new Set<string>();

    if (isRiSubaccount) {
      // ── RI subaccount: client-tagged contacts first ──────────────
      // 1a. Search GHL for contacts with "client" tag, import them first
      const riContactsPhaseId = logPhaseStart(runId, companyId, 'contacts_tagged');
      emit('contacts', 2, 'Client contacts: searching...');
      try {
        const clientResult = await syncContactsByTag(locationId, companyId, pit, 'client');
        totalCounts.found += clientResult.counts.found;
        totalCounts.created += clientResult.counts.created;
        totalCounts.updated += clientResult.counts.updated;
        logPhaseEnd(riContactsPhaseId, 'completed', { found: clientResult.counts.found, created: clientResult.counts.created, updated: clientResult.counts.updated });
        emit('contacts', 8, `Client contacts: ${clientResult.contactIds.length} found`);

        // 1b. Sync messages for client-tagged contacts immediately
        const riMsgPhaseId = logPhaseStart(runId, companyId, 'messages_tagged');
        const totalPriority = clientResult.contactIds.length;
        emit('messages', 8, `Client messages: 0/${totalPriority} contacts`);
        try {
          for (let i = 0; i < clientResult.contactIds.length; i++) {
            const c = clientResult.contactIds[i];
            const mc = await syncMessages(c.id, c.ghl_contact_id, companyId, pit);
            msgCounts.found += mc.found; msgCounts.created += mc.created; msgCounts.updated += mc.updated;
            totalCounts.found += mc.found; totalCounts.created += mc.created;

            const updated = queryOne('SELECT days_since_outbound, last_outbound_at FROM contacts WHERE id = ?', [c.id]);
            updateContactSLA(c.id, computeContactSLA((updated?.days_since_outbound as number) ?? 9999, !!(updated?.last_outbound_at), slaConfig));

            prioritySyncedIds.add(c.id);
            // Rate limiter handles API pacing
            emit('messages', totalPriority > 0 ? 8 + Math.round(((i + 1) / totalPriority) * 10) : 18, `Client messages: ${i + 1}/${totalPriority} contacts`);
          }
          logPhaseEnd(riMsgPhaseId, 'completed', { found: msgCounts.found, created: msgCounts.created });
        } catch (err: unknown) {
          logPhaseEnd(riMsgPhaseId, 'failed', { found: msgCounts.found, created: msgCounts.created }, err instanceof Error ? err : null);
        }

        // 1c. Now sync ALL remaining contacts (full pagination — already-synced clients get updated)
        const riAllPhaseId = logPhaseStart(runId, companyId, 'contacts_all');
        emit('contacts', 18, 'Remaining contacts: syncing...');
        try {
          const cc = await syncContacts(locationId, companyId, pit);
          entityCounts.contacts = {
            found: cc.found + clientResult.counts.found,
            created: cc.created + clientResult.counts.created,
            updated: cc.updated + clientResult.counts.updated,
          };
          totalCounts.found += cc.found; totalCounts.created += cc.created; totalCounts.updated += cc.updated;
          logPhaseEnd(riAllPhaseId, 'completed', { found: cc.found, created: cc.created, updated: cc.updated });
          emit('contacts', 25, `Contacts: ${cc.found + clientResult.counts.found} total`);
        } catch (err: unknown) {
          logPhaseEnd(riAllPhaseId, 'failed', {}, err instanceof Error ? err : null);
          throw err;
        }
      } catch (err: unknown) {
        if (!entityCounts.contacts) {
          logPhaseEnd(riContactsPhaseId, 'failed', {}, err instanceof Error ? err : null);
        }
        throw err;
      }

    } else {
      // ── Standard subaccount: all contacts then messages ──────────
      const contactsPhaseId = logPhaseStart(runId, companyId, 'contacts');
      emit('contacts', 5, 'Contacts: syncing...');
      try {
        const cc = await syncContacts(locationId, companyId, pit);
        entityCounts.contacts = cc;
        totalCounts.found += cc.found; totalCounts.created += cc.created; totalCounts.updated += cc.updated;
        updateSyncCursor(companyId, 'contacts', new Date().toISOString(), cc.found);
        markFullSync(companyId, 'contacts');
        logPhaseEnd(contactsPhaseId, 'completed', { found: cc.found, created: cc.created, updated: cc.updated });
        emit('contacts', 20, `Contacts: ${cc.found} found`);
      } catch (err: unknown) {
        logPhaseEnd(contactsPhaseId, 'failed', {}, err instanceof Error ? err : null);
        throw err;
      }
    }

    // 2. Messages for all client-tagged contacts (standard path, or remaining for RI)
    const clientContacts = getClientTaggedContacts(companyId);
    // For RI, skip contacts whose messages we already synced above
    const remainingClients = clientContacts.filter(c => !prioritySyncedIds.has(c.id as string));
    const totalClients = remainingClients.length;

    if (totalClients > 0) {
      const messagesPhaseId = logPhaseStart(runId, companyId, 'messages');
      emit('messages', 25, `Messages: 0/${totalClients} contacts`);
      try {
        for (let i = 0; i < remainingClients.length; i++) {
          const c = remainingClients[i];
          const mc = await syncMessages(c.id as string, c.ghl_contact_id as string, companyId, pit);
          msgCounts.found += mc.found; msgCounts.created += mc.created; msgCounts.updated += mc.updated;
          totalCounts.found += mc.found; totalCounts.created += mc.created;

          const updated = queryOne('SELECT days_since_outbound, last_outbound_at FROM contacts WHERE id = ?', [c.id as string]);
          updateContactSLA(c.id as string, computeContactSLA((updated?.days_since_outbound as number) ?? 9999, !!(updated?.last_outbound_at), slaConfig));

          await delay(50);
          emit('messages', totalClients > 0 ? 25 + Math.round(((i + 1) / totalClients) * 25) : 50, `Messages: ${i + 1}/${totalClients} contacts`);
        }
        logPhaseEnd(messagesPhaseId, 'completed', { found: msgCounts.found, created: msgCounts.created, updated: msgCounts.updated });
      } catch (err: unknown) {
        logPhaseEnd(messagesPhaseId, 'failed', { found: msgCounts.found, created: msgCounts.created }, err instanceof Error ? err : null);
        // Don't throw — continue to metadata phases
      }
    }
    entityCounts.messages = msgCounts;

    // 3-10. Metadata + Pipelines + Opportunities
    const metaPhases: Array<[string, string, () => Promise<SyncCounts>]> = [
      ['pipelines', 'Pipelines', () => syncPipelines(locationId, companyId, pit)],
      ['opportunities', 'Opportunities', async () => {
        const pipelines = queryAll('SELECT ghl_pipeline_id FROM ghl_pipelines WHERE company_id = ?', [companyId]);
        const oppCounts: SyncCounts = { found: 0, created: 0, updated: 0 };
        for (const p of pipelines) {
          const c = await syncOpportunities(locationId, companyId, pit, p.ghl_pipeline_id as string);
          oppCounts.found += c.found; oppCounts.created += c.created; oppCounts.updated += c.updated;
        }
        return oppCounts;
      }],
      ['users', 'Users', () => syncUsers(locationId, companyId, pit)],
      ['workflows', 'Workflows', () => syncWorkflows(locationId, companyId, pit)],
      ['funnels', 'Funnels', () => syncFunnels(locationId, companyId, pit)],
      ['sites', 'Sites', () => syncSites(locationId, companyId, pit)],
      ['templates', 'Email templates', () => syncEmailTemplates(locationId, companyId, pit)],
      ['fields', 'Custom fields', () => syncCustomFields(locationId, companyId, pit)],
    ];

    for (let i = 0; i < metaPhases.length; i++) {
      const [phase, label, fn] = metaPhases[i];
      const phaseId = logPhaseStart(runId, companyId, phase);
      emit(phase, 55 + Math.round((i / metaPhases.length) * 35), `${label}: syncing...`);
      try {
        const result = await fn();
        entityCounts[phase] = result;
        totalCounts.found += result.found;
        updateSyncCursor(companyId, phase, new Date().toISOString(), result.found);
        logPhaseEnd(phaseId, 'completed', { found: result.found, created: result.created, updated: result.updated });
      } catch (err: unknown) {
        logPhaseEnd(phaseId, 'failed', {}, err instanceof Error ? err : null);
        // Continue to next phase — don't let one entity failure stop the rest
      }
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
        pipelines_count = (SELECT COUNT(*) FROM ghl_pipelines WHERE company_id = ?),
        opportunities_count = (SELECT COUNT(*) FROM ghl_opportunities WHERE company_id = ?),
        last_sync_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId]
    );

    // Contact velocity
    updateContactVelocity(companyId);

    // 10. SLA
    updateCompanySLA(companyId);

    // 11. Pulse sync (if enabled for this company)
    const pulseConfig = queryOne(
      'SELECT pulse_sync_enabled, pulse_dry_run, pulse_pipeline_id FROM companies WHERE id = ?',
      [companyId]
    );
    if (pulseConfig?.pulse_sync_enabled && pulseConfig.pulse_pipeline_id) {
      const pulsePhaseId = logPhaseStart(runId, companyId, 'pulse');
      emit('pulse', 95, 'Pulse: syncing...');
      try {
        const pulseCounts = await syncPulse(companyId, pit, !!(pulseConfig.pulse_dry_run));
        entityCounts.pulse = pulseCounts;
        totalCounts.found += pulseCounts.found;
        totalCounts.created += pulseCounts.created;
        totalCounts.updated += pulseCounts.updated;
        logPhaseEnd(pulsePhaseId, 'completed', { found: pulseCounts.found, created: pulseCounts.created, updated: pulseCounts.updated });
      } catch (err: unknown) {
        logPhaseEnd(pulsePhaseId, 'failed', {}, err instanceof Error ? err : null);
      }
    }

    // Store detail_json
    execute('UPDATE sync_runs SET detail_json = ? WHERE id = ?', [JSON.stringify(entityCounts), runId]);
    failOrphanedPhases(runId); // clean up any phases that didn't get an end call

    emit('complete', 100, `Sync complete for ${companyName}`);
    logSyncEnd(runId, 'success', totalCounts);
    setCurrentCompanyContext(null);
    return { success: true, counts: totalCounts };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.slice(0, 2000) : undefined;
    execute('UPDATE sync_runs SET detail_json = ? WHERE id = ?', [JSON.stringify(entityCounts), runId]);
    failOrphanedPhases(runId); // mark any in-progress phases as failed
    logSyncEnd(runId, 'error', totalCounts, stack ? `${message}\n${stack}` : message);
    emit('complete', 100, `Sync failed: ${message}`);
    setCurrentCompanyContext(null);
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
  // Prioritize the RI subaccount (g6zCuamu3IQlnY1ympGx) first every sync
  const RI_GHL_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';
  const companies = queryAll(
    `SELECT id, name, ghl_location_id FROM companies
     WHERE sync_enabled = 1 AND pit_status = 'valid' AND status = 'active'
     ORDER BY CASE WHEN ghl_location_id = ? THEN 0 ELSE 1 END, name`,
    [RI_GHL_ID]
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
  const readaiAuth = queryOne('SELECT id FROM readai_auth WHERE id = ?', ['default']);
  if (readaiAuth) {
    onProgress?.({ phase: 'readai', progress: 92, found: 0, message: 'Read.ai: syncing meetings...', startedAt: batchStartedAt });
    try {
      await syncMeetingsList(30);
      onProgress?.({ phase: 'readai_expand', progress: 96, found: 0, message: 'Read.ai: expanding meeting details...', startedAt: batchStartedAt });
      await expandMeetingDetails(20);
    } catch (err: unknown) {
      logAlert('sync_failure', 'warning', `Read.ai sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Auto-match cross-platform entities ─────────────────────────────
  try {
    runAutoMatch();
  } catch (err: unknown) {
    logAlert('auto_match_failed', 'warning', `Auto-match failed: ${err instanceof Error ? err.message : err}`);
  }

  // ── Suggestion engine: propose cross-entity correlations ──────────
  try {
    runSuggestionEngine();
  } catch (err: unknown) {
    logAlert('suggestion_engine_failed', 'warning', `Suggestion engine failed: ${err instanceof Error ? err.message : err}`);
  }

  // ── A2P: ensure every active company has an a2p_compliance row ────
  try {
    bootstrapA2PRecords();
  } catch {
    // non-critical — don't block sync completion
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
