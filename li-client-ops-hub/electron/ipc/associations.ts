import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncDiscordChannels, testDiscordConnection } from '../../sync/adapters/discord';
import { syncTeamworkProjects } from '../../sync/adapters/teamwork';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';
import { runAutoMatch } from '../../sync/matching/autoMatch';

// ── Helper: update has_* flags on the company linked to a client ──────

function updateCompanyAssociationFlags(clientContactId: string): void {
  const subAcct = queryOne(
    "SELECT target_id FROM client_associations WHERE client_contact_id = ? AND association_type = 'sub_account'",
    [clientContactId]
  );
  if (!subAcct) return;
  const companyId = subAcct.target_id as string;

  const hasTW = queryOne(
    "SELECT 1 FROM client_associations WHERE client_contact_id = ? AND association_type = 'teamwork_project'",
    [clientContactId]
  );
  const hasDC = queryOne(
    "SELECT 1 FROM client_associations WHERE client_contact_id = ? AND association_type = 'discord_channel'",
    [clientContactId]
  );
  const hasRA = queryOne(
    "SELECT 1 FROM client_associations WHERE client_contact_id = ? AND association_type = 'readai_email'",
    [clientContactId]
  );

  execute(
    `UPDATE companies SET has_teamwork = ?, has_discord = ?, has_readai = ?, updated_at = datetime('now') WHERE id = ?`,
    [hasTW ? 1 : 0, hasDC ? 1 : 0, hasRA ? 1 : 0, companyId]
  );
}

function readEnvVar(key: string): string | undefined {
  return process.env[key] || undefined;
}

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'logicinbound.com',
]);

function matchMeetingsForEmails(
  clientContactId: string,
  emails: string[]
): { success: boolean; matched: number; total: number } {
  let matched = 0;

  const subAcct = queryOne(
    "SELECT target_id FROM client_associations WHERE client_contact_id = ? AND association_type = 'sub_account'",
    [clientContactId]
  );
  const companyId = subAcct?.target_id as string | undefined;

  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) continue;

    const meetings = queryAll(
      'SELECT id, participants_json, company_id FROM meetings WHERE participants_json LIKE ?',
      [`%${normalized}%`]
    );

    for (const m of meetings) {
      try {
        const participants = JSON.parse((m.participants_json as string) || '[]');
        const hasEmail = participants.some(
          (p: { email?: string }) => p.email?.toLowerCase() === normalized
        );

        if (hasEmail) {
          if (companyId && !m.company_id) {
            execute(
              "UPDATE meetings SET company_id = ?, match_method = 'auto_email', updated_at = datetime('now') WHERE id = ?",
              [companyId, m.id as string]
            );
          }
          matched++;
        }
      } catch { /* skip malformed JSON */ }
    }

    // Add non-generic domains to company_domains for future auto-matching
    if (companyId) {
      const domain = normalized.split('@')[1];
      if (domain && !GENERIC_DOMAINS.has(domain)) {
        const existing = queryOne(
          'SELECT id FROM company_domains WHERE company_id = ? AND domain = ?',
          [companyId, domain]
        );
        if (!existing) {
          execute(
            "INSERT INTO company_domains (id, company_id, domain, created_at) VALUES (?, ?, ?, datetime('now'))",
            [randomUUID(), companyId, domain]
          );
        }
      }
    }
  }

  return { success: true, matched, total: matched };
}

export function registerAssociationHandlers(): void {
  // ── Client contacts (tagged "client" in any synced sub-account) ─────
  ipcMain.handle('clients:getAll', () => {
    return queryAll(
      `SELECT c.*,
        (SELECT GROUP_CONCAT(ca.association_type || ':' || COALESCE(ca.target_name, ''), '|')
         FROM client_associations ca WHERE ca.client_contact_id = c.id) as associations_summary,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.message_at >= datetime('now', '-7 days')) as msgs_7d,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.message_at >= datetime('now', '-30 days')) as msgs_30d,
        co.name as ghl_company_name
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       WHERE c.tags LIKE '%client%'
       ORDER BY c.first_name ASC, c.last_name ASC`
    );
  });

  // ── Association CRUD ────────────────────────────────────────────────

  ipcMain.handle('associations:getForClient', (_e, clientContactId: string) => {
    return queryAll(
      'SELECT * FROM client_associations WHERE client_contact_id = ? ORDER BY association_type',
      [clientContactId]
    );
  });

  ipcMain.handle('associations:getForTarget', (_e, type: string, targetId: string) => {
    return queryAll(
      'SELECT * FROM client_associations WHERE association_type = ? AND target_id = ?',
      [type, targetId]
    );
  });

  ipcMain.handle('associations:set', (_e, params: {
    clientContactId: string;
    ghlContactId: string;
    associationType: string;
    targetId: string;
    targetName: string;
    targetDetail?: string;
  }) => {
    const now = new Date().toISOString();

    // Upsert: one association per type per client
    const existing = queryOne(
      'SELECT id FROM client_associations WHERE client_contact_id = ? AND association_type = ?',
      [params.clientContactId, params.associationType]
    );

    if (existing) {
      execute(
        'UPDATE client_associations SET target_id = ?, target_name = ?, target_detail = ?, ghl_contact_id = ?, updated_at = ? WHERE id = ?',
        [params.targetId, params.targetName, params.targetDetail ?? null, params.ghlContactId, now, existing.id as string]
      );
    } else {
      execute(
        `INSERT INTO client_associations (id, client_contact_id, ghl_contact_id, association_type, target_id, target_name, target_detail, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), params.clientContactId, params.ghlContactId, params.associationType, params.targetId, params.targetName, params.targetDetail ?? null, now, now]
      );
    }

    // Update company flags if sub_account link
    if (params.associationType === 'sub_account') {
      execute(
        "UPDATE companies SET client_contact_id = ?, client_contact_name = ?, updated_at = datetime('now') WHERE id = ?",
        [params.clientContactId, params.targetName, params.targetId]
      );
    }

    updateCompanyAssociationFlags(params.clientContactId);
    return { success: true };
  });

  ipcMain.handle('associations:remove', (_e, associationId: string) => {
    const assoc = queryOne('SELECT * FROM client_associations WHERE id = ?', [associationId]);
    execute('DELETE FROM client_associations WHERE id = ?', [associationId]);
    if (assoc) updateCompanyAssociationFlags(assoc.client_contact_id as string);
    return { success: true };
  });

  // ── Read.ai auto-match by email (legacy single-email) ──────────────

  ipcMain.handle('associations:autoMatchReadai', (_e, clientContactId: string, email: string) => {
    return matchMeetingsForEmails(clientContactId, [email]);
  });

  // ── Read.ai multi-email: set all emails for a client ──────────────

  ipcMain.handle('associations:setReadaiEmails', (_e, params: {
    clientContactId: string;
    ghlContactId: string;
    emails: string[];
  }) => {
    const { clientContactId, ghlContactId, emails } = params;

    // Remove all existing readai_email associations for this client
    execute(
      "DELETE FROM client_associations WHERE client_contact_id = ? AND association_type = 'readai_email'",
      [clientContactId]
    );

    // Insert new ones
    const validEmails = emails.filter(e => e.trim().length > 0);
    const now = new Date().toISOString();

    for (const email of validEmails) {
      const normalized = email.trim().toLowerCase();
      execute(
        `INSERT INTO client_associations
          (id, client_contact_id, ghl_contact_id, association_type, target_id, target_name, created_at, updated_at)
         VALUES (?, ?, ?, 'readai_email', ?, ?, ?, ?)`,
        [randomUUID(), clientContactId, ghlContactId, normalized, normalized, now, now]
      );
    }

    // Update company has_readai flag
    updateCompanyAssociationFlags(clientContactId);

    // Auto-match meetings with these emails
    const matchResult = matchMeetingsForEmails(clientContactId, validEmails);

    return {
      success: true,
      emailCount: validEmails.length,
      meetingsMatched: matchResult.matched,
    };
  });

  // ── Read.ai multi-email: get all emails for a client ──────────────

  ipcMain.handle('associations:getReadaiEmails', (_e, clientContactId: string) => {
    return queryAll(
      "SELECT target_id as email FROM client_associations WHERE client_contact_id = ? AND association_type = 'readai_email' ORDER BY created_at ASC",
      [clientContactId]
    );
  });

  // ── Read.ai: preview match count without saving ───────────────────

  ipcMain.handle('associations:previewReadaiMatch', (_e, emails: string[]) => {
    let totalMatches = 0;

    for (const email of emails) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) continue;

      const meetings = queryAll(
        'SELECT participants_json FROM meetings WHERE participants_json LIKE ?',
        [`%${normalized}%`]
      );

      for (const m of meetings) {
        try {
          const participants = JSON.parse((m.participants_json as string) || '[]');
          if (participants.some((p: { email?: string }) => p.email?.toLowerCase() === normalized)) {
            totalMatches++;
          }
        } catch { /* skip malformed */ }
      }
    }

    return { matchCount: totalMatches };
  });

  // ── Client meeting counts (per client, by readai_email match) ─────

  ipcMain.handle('clients:getMeetingCounts', () => {
    // Get all readai_email associations
    const assocs = queryAll(
      "SELECT client_contact_id, target_id as email FROM client_associations WHERE association_type = 'readai_email'"
    );

    const countMap: Record<string, number> = {};

    for (const a of assocs) {
      const email = (a.email as string).toLowerCase();
      const clientId = a.client_contact_id as string;

      const meetings = queryAll(
        'SELECT participants_json FROM meetings WHERE participants_json LIKE ?',
        [`%${email}%`]
      );

      let count = 0;
      for (const m of meetings) {
        try {
          const participants = JSON.parse((m.participants_json as string) || '[]');
          if (participants.some((p: { email?: string }) => p.email?.toLowerCase() === email)) {
            count++;
          }
        } catch { /* skip */ }
      }

      countMap[clientId] = (countMap[clientId] || 0) + count;
    }

    return countMap;
  });

  // ── Discord ─────────────────────────────────────────────────────────

  ipcMain.handle('discord:getChannels', () => {
    return queryAll('SELECT * FROM discord_channels ORDER BY server_name, position ASC');
  });

  ipcMain.handle('discord:setChannelTag', (_e, channelId: string, tag: string | null) => {
    execute(
      "UPDATE discord_channels SET tag = ?, updated_at = datetime('now') WHERE id = ?",
      [tag, channelId]
    );
    return { success: true };
  });

  ipcMain.handle('discord:getServers', () => {
    return queryAll('SELECT * FROM discord_servers ORDER BY name ASC');
  });

  ipcMain.handle('discord:syncChannels', async () => {
    const token = readEnvVar('DISCORD_BOT_TOKEN');
    const guildId = readEnvVar('DISCORD_GUILD_ID');
    if (!token) return { success: false, message: 'DISCORD_BOT_TOKEN not set' };
    try {
      const counts = await syncDiscordChannels(token, guildId || undefined);
      return { success: true, ...counts };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Teamwork with associations ──────────────────────────────────────

  ipcMain.handle('teamwork:getWithAssociations', () => {
    return queryAll(
      `SELECT tp.*,
        ca.target_name as linked_client_name,
        ca.client_contact_id as linked_client_id
       FROM teamwork_projects tp
       LEFT JOIN client_associations ca ON ca.target_id = tp.id AND ca.association_type = 'teamwork_project'
       ORDER BY tp.name ASC`
    );
  });

  ipcMain.handle('teamwork:sync', async () => {
    const runId = logSyncStart('teamwork', 'manual');
    try {
      const counts = await syncTeamworkProjects();
      logSyncEnd(runId, 'success', counts);
      return { success: true, ...counts };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      return { success: false, message };
    }
  });

  // ── Read.ai with associations ───────────────────────────────────────

  ipcMain.handle('readai:getMeetingsWithAssociations', (_e, filters?: { days?: number }) => {
    const daysAgo = filters?.days ?? 30;
    const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString();
    return queryAll(
      `SELECT m.*
       FROM meetings m
       WHERE m.meeting_date >= ?
       ORDER BY m.start_time_ms DESC`,
      [cutoff]
    );
  });

  // ── Association map (all clients with all links) ────────────────────

  ipcMain.handle('associations:getMap', () => {
    const clients = queryAll(
      `SELECT c.id, c.ghl_contact_id, c.first_name, c.last_name, c.email, c.phone,
              c.sla_status, c.days_since_outbound, c.last_outbound_at,
              c.company_id, c.company_name as ghl_company_name,
              co.name as company_name, co.ghl_location_id,
              (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id) as message_count
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       WHERE c.tags LIKE '%client%'
       ORDER BY c.first_name ASC`
    );

    // Pre-fetch meeting counts for all clients with readai_email associations
    const allReadaiAssocs = queryAll(
      "SELECT client_contact_id, target_id as email FROM client_associations WHERE association_type = 'readai_email'"
    );
    const meetingCountMap: Record<string, number> = {};
    for (const a of allReadaiAssocs) {
      const email = (a.email as string).toLowerCase();
      const clientId = a.client_contact_id as string;
      const meetings = queryAll(
        'SELECT participants_json FROM meetings WHERE participants_json LIKE ?',
        [`%${email}%`]
      );
      let count = 0;
      for (const m of meetings) {
        try {
          const participants = JSON.parse((m.participants_json as string) || '[]');
          if (participants.some((p: { email?: string }) => p.email?.toLowerCase() === email)) {
            count++;
          }
        } catch { /* skip */ }
      }
      meetingCountMap[clientId] = (meetingCountMap[clientId] || 0) + count;
    }

    return clients.map((c) => {
      const assocs = queryAll(
        'SELECT association_type, target_id, target_name, target_detail FROM client_associations WHERE client_contact_id = ?',
        [c.id as string]
      );

      // Standard associations (one per type, excluding readai_email)
      const map: Record<string, { targetId: string; targetName: string; targetDetail?: string }> = {};
      const readaiEmails: Array<{ email: string }> = [];

      for (const a of assocs) {
        const aType = a.association_type as string;
        if (aType === 'readai_email') {
          readaiEmails.push({ email: a.target_id as string });
        } else {
          map[aType] = {
            targetId: a.target_id as string,
            targetName: (a.target_name as string) ?? '',
            targetDetail: (a.target_detail as string) ?? undefined,
          };
        }
      }

      return {
        ...c,
        associations: map,
        readai_emails: readaiEmails,
        readai_meeting_count: meetingCountMap[c.id as string] || 0,
      };
    });
  });

  // ── Entity Links (company-level cross-platform) ─────────────────────

  ipcMain.handle('entityLinks:getForCompany', (_e, companyId: string) => {
    return queryAll(
      'SELECT * FROM entity_links WHERE company_id = ? ORDER BY platform ASC',
      [companyId]
    );
  });

  ipcMain.handle('entityLinks:set', (_e, params: {
    companyId: string;
    platform: string;
    platformId: string;
    platformName: string;
  }) => {
    const existing = queryOne(
      'SELECT id FROM entity_links WHERE company_id = ? AND platform = ? AND platform_id = ?',
      [params.companyId, params.platform, params.platformId]
    );
    if (existing) {
      execute(
        `UPDATE entity_links SET platform_name = ?, match_type = 'manual', confidence = 1.0, updated_at = datetime('now') WHERE id = ?`,
        [params.platformName, existing.id as string]
      );
    } else {
      execute(
        `INSERT INTO entity_links (id, company_id, platform, platform_id, platform_name, match_type, confidence)
         VALUES (?, ?, ?, ?, ?, 'manual', 1.0)`,
        [randomUUID(), params.companyId, params.platform, params.platformId, params.platformName]
      );
    }
    return { success: true };
  });

  ipcMain.handle('entityLinks:remove', (_e, linkId: string) => {
    execute('DELETE FROM entity_links WHERE id = ?', [linkId]);
    return { success: true };
  });

  ipcMain.handle('entityLinks:runAutoMatch', () => {
    const result = runAutoMatch();
    return { success: true, ...result };
  });

  ipcMain.handle('entityLinks:getUnlinkedSummary', () => {
    const totalCompanies = queryOne("SELECT COUNT(*) as cnt FROM companies WHERE status = 'active'");
    const total = (totalCompanies?.cnt as number) || 0;

    const withTeamwork = queryOne("SELECT COUNT(DISTINCT company_id) as cnt FROM entity_links WHERE platform = 'teamwork'");
    const withDrive = queryOne("SELECT COUNT(DISTINCT company_id) as cnt FROM entity_links WHERE platform = 'gdrive'");
    const withDiscord = queryOne("SELECT COUNT(DISTINCT company_id) as cnt FROM entity_links WHERE platform = 'discord'");
    const withKinsta = queryOne("SELECT COUNT(DISTINCT company_id) as cnt FROM entity_links WHERE platform = 'kinsta'");

    const unlinkedTeamwork = queryOne(
      "SELECT COUNT(*) as cnt FROM teamwork_projects WHERE status = 'active' AND id NOT IN (SELECT platform_id FROM entity_links WHERE platform = 'teamwork')"
    );
    const unlinkedDrive = queryOne(
      "SELECT COUNT(*) as cnt FROM drive_folders WHERE company_id IS NULL"
    );
    const unlinkedKinsta = queryOne(
      "SELECT COUNT(*) as cnt FROM kinsta_sites WHERE company_id IS NULL"
    );

    return {
      totalCompanies: total,
      companiesWithTeamwork: (withTeamwork?.cnt as number) || 0,
      companiesWithDrive: (withDrive?.cnt as number) || 0,
      companiesWithDiscord: (withDiscord?.cnt as number) || 0,
      companiesWithKinsta: (withKinsta?.cnt as number) || 0,
      unlinkedTeamworkProjects: (unlinkedTeamwork?.cnt as number) || 0,
      unlinkedDriveFolders: (unlinkedDrive?.cnt as number) || 0,
      unlinkedKinstaSites: (unlinkedKinsta?.cnt as number) || 0,
    };
  });
}
