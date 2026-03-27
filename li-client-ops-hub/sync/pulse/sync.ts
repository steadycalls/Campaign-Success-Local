import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { logger } from '../../lib/logger';
import { mapToPulseStage, type PulseStage, type PulseMappingThresholds } from './mapper';
import { createOpportunity, updateOpportunity } from '../adapters/ghl';
import type { SyncCounts } from '../utils/logger';

// ── Types ────────────────────────────────────────────────────────────

interface PulseSyncLogRow {
  source_opp_id: string;
  pulse_opp_id: string | null;
  pulse_stage_name: string;
  status: string;
}

interface OppRow {
  id: string;
  ghl_opportunity_id: string;
  ghl_pipeline_id: string;
  ghl_stage_id: string | null;
  stage_name: string;
  name: string;
  status: string;
  contact_id: string | null;
  ghl_contact_id: string | null;
  assigned_to: string | null;
  monetary_value: number | null;
  updated_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveOppName(opp: OppRow, contact: Record<string, unknown> | null): string {
  const parts = [
    contact?.first_name as string | null,
    contact?.last_name as string | null,
  ].filter(Boolean);
  const name = parts.length > 0 ? parts.join(' ') : null;
  const phone = (contact?.phone as string) ?? null;
  const email = (contact?.email as string) ?? null;
  const displayParts = [name, phone, email].filter(Boolean);
  return displayParts.length > 0 ? displayParts.join(' - ') : opp.name || 'Unnamed Opportunity';
}

// ── Main pulse sync function ─────────────────────────────────────────

export async function syncPulse(
  companyId: string,
  pit: string,
  dryRun: boolean = true
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  // Read pulse config from company
  const company = queryOne(
    'SELECT pulse_pipeline_id, pulse_dry_run, ghl_location_id FROM companies WHERE id = ?',
    [companyId]
  );
  if (!company) {
    logger.warn('PULSE', 'Company not found', { company_id: companyId });
    return counts;
  }

  const pulsePipelineId = company.pulse_pipeline_id as string | null;
  const locationId = company.ghl_location_id as string;

  if (!pulsePipelineId) {
    logger.warn('PULSE', 'No pulse_pipeline_id configured', { company_id: companyId });
    return counts;
  }

  // Override dryRun with company setting if not explicitly set
  const effectiveDryRun = dryRun || !!(company.pulse_dry_run);

  logger.sync(`Pulse sync starting for ${companyId} (dry_run=${effectiveDryRun})`);

  // ── Load Pulse pipeline stage IDs ──
  const pulseStages = queryAll(
    'SELECT ghl_stage_id, name FROM ghl_pipeline_stages WHERE ghl_pipeline_id = ? AND company_id = ?',
    [pulsePipelineId, companyId]
  );

  if (pulseStages.length === 0) {
    logger.warn('PULSE', 'No stages found for pulse pipeline — sync pipelines first', { pipeline_id: pulsePipelineId });
    return counts;
  }

  const pulseStageMap = new Map<string, string>(); // stage name → GHL stage id
  for (const s of pulseStages) {
    pulseStageMap.set(s.name as string, s.ghl_stage_id as string);
  }

  // ── Load existing Pulse pipeline opps to prevent duplicates ──
  const existingPulseOpps = new Map<string, string>(); // ghl_contact_id → ghl_opportunity_id
  const existingPulseRows = queryAll(
    'SELECT ghl_opportunity_id, ghl_contact_id FROM ghl_opportunities WHERE ghl_pipeline_id = ? AND company_id = ?',
    [pulsePipelineId, companyId]
  );
  for (const row of existingPulseRows) {
    if (row.ghl_contact_id) {
      existingPulseOpps.set(row.ghl_contact_id as string, row.ghl_opportunity_id as string);
    }
  }

  // ── Mapping thresholds (defaults) ──
  const thresholds: PulseMappingThresholds = {
    hotMax: 7,
    warmMax: 30,
    coldMax: 90,
  };

  // ── Get all source pipelines (everything except the pulse pipeline) ──
  const sourcePipelines = queryAll(
    'SELECT ghl_pipeline_id FROM ghl_pipelines WHERE company_id = ? AND ghl_pipeline_id != ?',
    [companyId, pulsePipelineId]
  );

  for (const pipeline of sourcePipelines) {
    const sourcePipelineId = pipeline.ghl_pipeline_id as string;

    // Stage name lookup for this source pipeline
    const sourceStages = queryAll(
      'SELECT ghl_stage_id, name FROM ghl_pipeline_stages WHERE ghl_pipeline_id = ? AND company_id = ?',
      [sourcePipelineId, companyId]
    );
    const sourceStageMap = new Map(sourceStages.map(s => [s.ghl_stage_id as string, s.name as string]));

    // Read opportunities from local DB
    const opps = queryAll(
      `SELECT id, ghl_opportunity_id, ghl_pipeline_id, ghl_stage_id, stage_name, name, status,
              contact_id, ghl_contact_id, assigned_to, monetary_value, updated_at
       FROM ghl_opportunities WHERE ghl_pipeline_id = ? AND company_id = ?`,
      [sourcePipelineId, companyId]
    ) as unknown as OppRow[];

    for (const opp of opps) {
      counts.found++;

      // Look up contact details
      let contact: Record<string, unknown> | null = null;
      let lastContactedAt: string | null = null;
      let hasConversationHistory = false;
      let bantScore: number | null = null;
      let isDnd = false;

      if (opp.contact_id) {
        contact = queryOne(
          'SELECT first_name, last_name, email, phone, last_outbound_at, bant_score FROM contacts WHERE id = ?',
          [opp.contact_id]
        );
        lastContactedAt = (contact?.last_outbound_at as string) ?? null;
        bantScore = (contact?.bant_score as number) ?? null;

        const msgCount = queryOne(
          'SELECT COUNT(*) as c FROM messages WHERE contact_id = ?',
          [opp.contact_id]
        );
        hasConversationHistory = ((msgCount?.c as number) ?? 0) > 0;

        // Check for DND opt-out
        if (hasConversationHistory) {
          const latestMsg = queryOne(
            "SELECT body_preview FROM messages WHERE contact_id = ? ORDER BY message_at DESC LIMIT 1",
            [opp.contact_id]
          );
          if (latestMsg?.body_preview && (latestMsg.body_preview as string).toLowerCase().includes('dnd enabled by customer')) {
            isDnd = true;
          }
        }
      }

      // ── Apply mapping ──
      const stageName = opp.stage_name || (opp.ghl_stage_id ? sourceStageMap.get(opp.ghl_stage_id) : null) || 'Unknown';
      const mapping = isDnd
        ? { stage: 'Opted Out' as PulseStage, reason: 'Latest message: DND enabled by customer' }
        : mapToPulseStage(
            { status: opp.status, stageName, updatedAt: opp.updated_at, lastContactedAt, hasConversationHistory, bantScore },
            thresholds
          );

      const pulseStageId = pulseStageMap.get(mapping.stage);
      if (!pulseStageId) {
        logger.warn('PULSE', `Stage "${mapping.stage}" not found in pulse pipeline`, {
          available: Array.from(pulseStageMap.keys()).join(', '),
        });
        continue;
      }

      // ── Check if already synced ──
      const existing = queryOne(
        'SELECT source_opp_id, pulse_opp_id, pulse_stage_name, status FROM pulse_sync_log WHERE source_opp_id = ? AND company_id = ?',
        [opp.id, companyId]
      ) as unknown as PulseSyncLogRow | null;

      if (existing?.pulse_opp_id && existing.pulse_stage_name === mapping.stage) {
        continue; // Already synced and stage unchanged
      }

      const displayName = resolveOppName(opp, contact);
      const logId = randomUUID();

      if (existing?.pulse_opp_id) {
        // Stage changed → update
        if (!effectiveDryRun) {
          try {
            await updateOpportunity(pit, existing.pulse_opp_id, { stageId: pulseStageId, name: displayName });
            execute(
              `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_opp_id, pulse_stage_name, reason, status, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'))
               ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
                 pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='synced', last_synced_at=datetime('now')`,
              [logId, opp.id, sourcePipelineId, companyId, existing.pulse_opp_id, mapping.stage, mapping.reason]
            );
            counts.updated++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('PULSE', `Failed to update ${displayName}`, { error: msg });
            execute(
              `UPDATE pulse_sync_log SET status='error', error=?, last_synced_at=datetime('now') WHERE source_opp_id=? AND company_id=?`,
              [msg, opp.id, companyId]
            );
          }
        } else {
          execute(
            `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_opp_id, pulse_stage_name, reason, status, last_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'dry_run', datetime('now'))
             ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
               pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='dry_run', last_synced_at=datetime('now')`,
            [logId, opp.id, sourcePipelineId, companyId, existing.pulse_opp_id, mapping.stage, mapping.reason]
          );
          counts.updated++;
        }
      } else {
        // Check if contact already has an opp in pulse pipeline
        const existingPulseOppId = opp.ghl_contact_id ? existingPulseOpps.get(opp.ghl_contact_id) : null;

        if (existingPulseOppId) {
          // Update existing pulse opp
          if (!effectiveDryRun) {
            try {
              await updateOpportunity(pit, existingPulseOppId, { stageId: pulseStageId, name: displayName });
              execute(
                `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_opp_id, pulse_stage_name, reason, status, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'))
                 ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
                   pulse_opp_id=excluded.pulse_opp_id, pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='synced', last_synced_at=datetime('now')`,
                [logId, opp.id, sourcePipelineId, companyId, existingPulseOppId, mapping.stage, mapping.reason]
              );
              counts.updated++;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.error('PULSE', `Failed to update existing pulse opp`, { error: msg });
              execute(
                `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_stage_name, reason, status, error, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'error', ?, datetime('now'))
                 ON CONFLICT(source_opp_id, company_id) DO UPDATE SET status='error', error=excluded.error, last_synced_at=datetime('now')`,
                [logId, opp.id, sourcePipelineId, companyId, mapping.stage, mapping.reason, msg]
              );
            }
          } else {
            execute(
              `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_opp_id, pulse_stage_name, reason, status, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'dry_run', datetime('now'))
               ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
                 pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='dry_run', last_synced_at=datetime('now')`,
              [logId, opp.id, sourcePipelineId, companyId, existingPulseOppId, mapping.stage, mapping.reason]
            );
            counts.updated++;
          }
        } else {
          // Create new opportunity in pulse pipeline
          if (!effectiveDryRun) {
            try {
              const ghlOppId = await createOpportunity(pit, {
                locationId,
                pipelineId: pulsePipelineId,
                stageId: pulseStageId,
                name: displayName,
                contactId: opp.ghl_contact_id ?? undefined,
                status: opp.status === 'won' ? 'won' : opp.status === 'lost' ? 'lost' : 'open',
                assignedTo: opp.assigned_to ?? undefined,
                monetaryValue: opp.monetary_value ?? undefined,
              });
              if (opp.ghl_contact_id) existingPulseOpps.set(opp.ghl_contact_id, ghlOppId);
              execute(
                `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_opp_id, pulse_stage_name, reason, status, written_at, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'), datetime('now'))
                 ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
                   pulse_opp_id=excluded.pulse_opp_id, pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='synced',
                   written_at=datetime('now'), last_synced_at=datetime('now')`,
                [logId, opp.id, sourcePipelineId, companyId, ghlOppId, mapping.stage, mapping.reason]
              );
              counts.created++;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.error('PULSE', `Failed to create ${displayName}`, { error: msg });
              execute(
                `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_stage_name, reason, status, error, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'error', ?, datetime('now'))
                 ON CONFLICT(source_opp_id, company_id) DO UPDATE SET status='error', error=excluded.error, last_synced_at=datetime('now')`,
                [logId, opp.id, sourcePipelineId, companyId, mapping.stage, mapping.reason, msg]
              );
            }
          } else {
            execute(
              `INSERT INTO pulse_sync_log (id, source_opp_id, source_pipeline_id, company_id, pulse_stage_name, reason, status, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, 'dry_run', datetime('now'))
               ON CONFLICT(source_opp_id, company_id) DO UPDATE SET
                 pulse_stage_name=excluded.pulse_stage_name, reason=excluded.reason, status='dry_run', last_synced_at=datetime('now')`,
              [logId, opp.id, sourcePipelineId, companyId, mapping.stage, mapping.reason]
            );
            counts.created++;
          }
        }
      }

      await delay(effectiveDryRun ? 10 : 200);
    }
  }

  // Update company pulse timestamp
  execute(
    "UPDATE companies SET pulse_last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [companyId]
  );

  logger.sync(`Pulse sync complete for ${companyId}: ${counts.found} found, ${counts.created} created, ${counts.updated} updated (dry_run=${effectiveDryRun})`);

  return counts;
}
