import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute, executeInTransaction } from '../db/client';
import { queryAllKeywords } from './gsc-client';
import { getKeywordVolumes } from './dataforseo-client';
import { logger } from '../lib/logger';

export interface GapConfig {
  positionMin: number;
  positionMax: number;
  minImpressions: number;
  minSearchVolume: number;
  maxResults: number;
}

const DEFAULT_CONFIG: GapConfig = {
  positionMin: 5,
  positionMax: 20,
  minImpressions: 100,
  minSearchVolume: 50,
  maxResults: 50,
};

/**
 * CTR curve: expected CTR at a given position (Google organic).
 * Based on industry benchmarks.
 */
function expectedCtr(position: number): number {
  if (position <= 1) return 0.30;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.10;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.03;
  return 0.01;
}

function computeOpportunityScore(
  impressions: number,
  position: number,
  currentCtr: number,
  searchVolume: number | null
): number {
  const volume = searchVolume ?? impressions;
  const positionFactor = 1 / position;
  const ctrGap = Math.max(expectedCtr(3) - currentCtr, 0.01);
  return Math.round(volume * positionFactor * ctrGap * 1000) / 10;
}

function determineAction(rankingUrl: string | null, position: number, companyDomain: string | null): string {
  if (!rankingUrl || (companyDomain && !rankingUrl.includes(companyDomain))) return 'new_content';
  if (position <= 10) return 'build_links';
  return 'optimize_existing';
}

export async function detectGapsForCompany(
  companyId: string,
  config: GapConfig = DEFAULT_CONFIG
): Promise<{ found: number; updated: number }> {
  const company = queryOne('SELECT gsc_property, website FROM companies WHERE id = ?', [companyId]);
  if (!company?.gsc_property) {
    throw new Error('No GSC property linked. Connect Google Search Console first.');
  }

  const gscProperty = company.gsc_property as string;
  const domain = (company.website as string) ?? null;

  // 1. Pull last 28 days from GSC
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

  logger.sync(`Detecting gap keywords for ${gscProperty} (${startDate} to ${endDate})`);

  const gscData = await queryAllKeywords(gscProperty, startDate, endDate);

  // 2. Filter to gap zone
  const gapCandidates = gscData.filter(kw =>
    kw.position >= config.positionMin &&
    kw.position <= config.positionMax &&
    kw.impressions >= config.minImpressions
  );

  logger.sync(`Found ${gapCandidates.length} gap zone candidates from ${gscData.length} total keywords`);

  // 3. Enrich with search volume from DataForSEO (batch)
  let volumeMap = new Map<string, { searchVolume: number | null; cpc: number | null }>();
  try {
    const volumes = await getKeywordVolumes(gapCandidates.map(kw => kw.query));
    volumeMap = new Map(volumes.map(v => [v.keyword, { searchVolume: v.searchVolume, cpc: v.cpc }]));
  } catch {
    logger.warn('SEO', 'DataForSEO volume lookup failed, using impressions as proxy');
  }

  // 4. Score and filter
  const scored = gapCandidates
    .map(kw => {
      const vol = volumeMap.get(kw.query);
      const searchVolume = vol?.searchVolume ?? kw.impressions;
      return {
        ...kw,
        searchVolume,
        cpc: vol?.cpc ?? null,
        opportunityScore: computeOpportunityScore(kw.impressions, kw.position, kw.ctr, searchVolume),
      };
    })
    .filter(kw => (kw.searchVolume ?? 0) >= config.minSearchVolume)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, config.maxResults);

  // 5. Upsert into gap_keywords
  const now = new Date().toISOString();
  const snapshotDate = now.split('T')[0];
  let found = 0;
  let updated = 0;

  executeInTransaction(() => {
    for (const kw of scored) {
      const existing = queryOne(
        'SELECT id FROM gap_keywords WHERE company_id = ? AND keyword = ?',
        [companyId, kw.query]
      );

      if (existing) {
        execute(
          `UPDATE gap_keywords SET
            current_position=?, impressions=?, clicks=?, ctr=?,
            search_volume=?, cpc=?, opportunity_score=?, ranking_url=?,
            last_checked_at=?, snapshot_date=?
          WHERE id=?`,
          [kw.position, kw.impressions, kw.clicks, kw.ctr,
           kw.searchVolume, kw.cpc, kw.opportunityScore, kw.page,
           now, snapshotDate, existing.id as string]
        );
        updated++;
      } else {
        const action = determineAction(kw.page, kw.position, domain);
        execute(
          `INSERT INTO gap_keywords
            (id, company_id, keyword, current_position, impressions, clicks, ctr,
             search_volume, cpc, opportunity_score, ranking_url, recommended_action,
             detected_at, last_checked_at, position_at_detection, snapshot_date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(), companyId, kw.query, kw.position, kw.impressions, kw.clicks, kw.ctr,
           kw.searchVolume, kw.cpc, kw.opportunityScore, kw.page, action,
           now, now, kw.position, snapshotDate]
        );
        found++;
      }
    }
  });

  logger.sync(`Gap detection complete: ${found} new, ${updated} updated`);
  return { found, updated };
}

export async function detectGapsAll(): Promise<{ scanned: number; totalGaps: number; errors: number }> {
  const companies = queryAll(
    "SELECT id, name FROM companies WHERE gsc_property IS NOT NULL AND seo_scan_enabled = 1 AND status = 'active'"
  );

  let scanned = 0;
  let totalGaps = 0;
  let errors = 0;

  for (const c of companies) {
    try {
      const result = await detectGapsForCompany(c.id as string);
      totalGaps += result.found + result.updated;
      scanned++;
    } catch (err: unknown) {
      logger.error('SEO', `Gap detection failed for ${c.name}`, { error: err instanceof Error ? err.message : String(err) });
      errors++;
    }
  }

  return { scanned, totalGaps, errors };
}
