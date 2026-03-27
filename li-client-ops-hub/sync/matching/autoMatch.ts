import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { logger } from '../../lib/logger';

// ── Types ──────────────────────────────────────────────────────────────

export interface MatchResult {
  matched: number;
  skipped: number;
  platforms: Record<string, { matched: number; unmatched: number }>;
}

// ── Name similarity ────────────────────────────────────────────────────

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(project|llc|inc|corp|co|the|and)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Token overlap (Jaccard)
  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? overlap / union : 0;

  return jaccard >= 0.5 ? jaccard : 0;
}

// ── Core: upsert link (skip manual overrides) ─────────────────────────

function upsertAutoLink(
  companyId: string,
  platform: string,
  platformId: string,
  platformName: string,
  confidence: number,
): boolean {
  // Never overwrite manual links
  const existing = queryOne(
    'SELECT id, match_type FROM entity_links WHERE company_id = ? AND platform = ? AND platform_id = ?',
    [companyId, platform, platformId]
  );
  if (existing) {
    if ((existing.match_type as string) === 'manual') return false; // preserve manual
    // Update confidence if auto
    execute(
      `UPDATE entity_links SET confidence = ?, platform_name = ?, updated_at = datetime('now') WHERE id = ?`,
      [confidence, platformName, existing.id as string]
    );
    return false; // already linked
  }

  // Check if this platform_id is already linked to another company manually
  const otherManual = queryOne(
    "SELECT id FROM entity_links WHERE platform = ? AND platform_id = ? AND match_type = 'manual'",
    [platform, platformId]
  );
  if (otherManual) return false; // someone else has it manually linked

  execute(
    `INSERT INTO entity_links (id, company_id, platform, platform_id, platform_name, match_type, confidence)
     VALUES (?, ?, ?, ?, ?, 'auto_name', ?)
     ON CONFLICT(company_id, platform, platform_id) DO UPDATE SET
       platform_name = excluded.platform_name,
       confidence = excluded.confidence,
       updated_at = datetime('now')`,
    [randomUUID(), companyId, platform, platformId, platformName, confidence]
  );
  return true;
}

// ── Platform matchers ──────────────────────────────────────────────────

function matchTeamworkProjects(
  companies: Array<{ id: string; name: string }>,
  result: MatchResult,
): void {
  const projects = queryAll(
    "SELECT id, name, company_id FROM teamwork_projects WHERE status = 'active'"
  );

  let matched = 0;
  let unmatched = 0;

  for (const proj of projects) {
    // Skip if already has a direct company_id (was linked via the old system)
    if (proj.company_id) {
      upsertAutoLink(
        proj.company_id as string, 'teamwork', proj.id as string,
        proj.name as string, 1.0,
      );
      matched++;
      continue;
    }

    let best = { companyId: '', score: 0 };
    for (const c of companies) {
      const score = nameSimilarity(proj.name as string, c.name);
      if (score > best.score) {
        best = { companyId: c.id, score };
      }
    }

    if (best.score >= 0.5) {
      const didLink = upsertAutoLink(
        best.companyId, 'teamwork', proj.id as string,
        proj.name as string, best.score,
      );
      if (didLink) result.matched++;
      matched++;
    } else {
      unmatched++;
    }
  }

  result.platforms.teamwork = { matched, unmatched };
}

function matchDriveFolders(
  companies: Array<{ id: string; name: string }>,
  result: MatchResult,
): void {
  // Drive folders already have their own suggestion system.
  // Promote linked folders into entity_links for unified access.
  const linkedFolders = queryAll(
    'SELECT id, drive_folder_id, name, company_id FROM drive_folders WHERE company_id IS NOT NULL'
  );

  let matched = 0;
  for (const f of linkedFolders) {
    upsertAutoLink(
      f.company_id as string, 'gdrive', f.drive_folder_id as string,
      f.name as string, 1.0,
    );
    matched++;
  }

  // Also try to auto-match unlinked folders
  const unlinkedFolders = queryAll(
    'SELECT id, drive_folder_id, name FROM drive_folders WHERE company_id IS NULL'
  );
  let unmatched = 0;

  for (const f of unlinkedFolders) {
    let best = { companyId: '', score: 0 };
    for (const c of companies) {
      const score = nameSimilarity(f.name as string, c.name);
      if (score > best.score) best = { companyId: c.id, score };
    }
    if (best.score >= 0.5) {
      const didLink = upsertAutoLink(
        best.companyId, 'gdrive', f.drive_folder_id as string,
        f.name as string, best.score,
      );
      if (didLink) result.matched++;
      matched++;
    } else {
      unmatched++;
    }
  }

  result.platforms.gdrive = { matched, unmatched };
}

function matchDiscordChannels(
  companies: Array<{ id: string; name: string }>,
  result: MatchResult,
): void {
  const channels = queryAll(
    "SELECT id, channel_id, name, tag FROM discord_channels WHERE type = 0" // type 0 = text channel
  );

  let matched = 0;
  let unmatched = 0;

  for (const ch of channels) {
    // Use the tag if set (manual priority marker)
    const channelName = (ch.name as string).replace(/-/g, ' ');

    let best = { companyId: '', score: 0 };
    for (const c of companies) {
      const score = nameSimilarity(channelName, c.name);
      if (score > best.score) best = { companyId: c.id, score };
    }

    if (best.score >= 0.5) {
      const didLink = upsertAutoLink(
        best.companyId, 'discord', ch.channel_id as string,
        ch.name as string, best.score,
      );
      if (didLink) result.matched++;
      matched++;
    } else {
      unmatched++;
    }
  }

  result.platforms.discord = { matched, unmatched };
}

function matchKinstaSites(
  companies: Array<{ id: string; name: string }>,
  result: MatchResult,
): void {
  // Kinsta has its own suggestion system. Promote linked sites to entity_links.
  const linkedSites = queryAll(
    'SELECT id, kinsta_site_id, display_name, company_id FROM kinsta_sites WHERE company_id IS NOT NULL'
  );

  let matched = 0;
  for (const s of linkedSites) {
    upsertAutoLink(
      s.company_id as string, 'kinsta', s.kinsta_site_id as string,
      s.display_name as string, 1.0,
    );
    matched++;
  }

  const unlinkedSites = queryAll(
    'SELECT id, kinsta_site_id, display_name, name, domain FROM kinsta_sites WHERE company_id IS NULL'
  );
  let unmatched = 0;

  for (const s of unlinkedSites) {
    let best = { companyId: '', score: 0 };
    for (const c of companies) {
      const nameScore = nameSimilarity(s.display_name as string, c.name);
      const domainScore = s.domain
        ? nameSimilarity(
            (s.domain as string).replace(/\.(com|net|org|co)$/, '').replace('www.', ''),
            c.name,
          )
        : 0;
      const topScore = Math.max(nameScore, domainScore);
      if (topScore > best.score) best = { companyId: c.id, score: topScore };
    }

    if (best.score >= 0.5) {
      const didLink = upsertAutoLink(
        best.companyId, 'kinsta', s.kinsta_site_id as string,
        s.display_name as string, best.score,
      );
      if (didLink) result.matched++;
      matched++;
    } else {
      unmatched++;
    }
  }

  result.platforms.kinsta = { matched, unmatched };
}

// ── Public API ─────────────────────────────────────────────────────────

export function runAutoMatch(): MatchResult {
  const result: MatchResult = { matched: 0, skipped: 0, platforms: {} };

  const companies = queryAll(
    "SELECT id, name FROM companies WHERE status = 'active'"
  ).map(c => ({ id: c.id as string, name: c.name as string }));

  if (companies.length === 0) return result;

  matchTeamworkProjects(companies, result);
  matchDriveFolders(companies, result);
  matchDiscordChannels(companies, result);
  matchKinstaSites(companies, result);

  logger.sync('Auto-match complete', {
    matched: result.matched,
    teamwork: `${result.platforms.teamwork?.matched ?? 0}/${(result.platforms.teamwork?.matched ?? 0) + (result.platforms.teamwork?.unmatched ?? 0)}`,
    gdrive: `${result.platforms.gdrive?.matched ?? 0}/${(result.platforms.gdrive?.matched ?? 0) + (result.platforms.gdrive?.unmatched ?? 0)}`,
    discord: `${result.platforms.discord?.matched ?? 0}/${(result.platforms.discord?.matched ?? 0) + (result.platforms.discord?.unmatched ?? 0)}`,
    kinsta: `${result.platforms.kinsta?.matched ?? 0}/${(result.platforms.kinsta?.matched ?? 0) + (result.platforms.kinsta?.unmatched ?? 0)}`,
  });

  return result;
}
