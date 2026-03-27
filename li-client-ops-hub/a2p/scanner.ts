import { randomUUID } from 'crypto';
import { queryOne, execute } from '../db/client';
import { crawlDomainForA2P, type CrawlResult } from './crawler';

export interface ScanResult {
  status: string;
  pages: CrawlResult[];
}

/**
 * Scan one company's domain for A2P required pages.
 * Updates a2p_compliance with discovered URLs and caches HTML for analysis.
 */
export async function scanCompanyA2P(companyId: string): Promise<ScanResult> {
  const a2p = queryOne('SELECT * FROM a2p_compliance WHERE company_id = ?', [companyId]) as Record<string, unknown> | null;
  if (!a2p) throw new Error('No A2P record for this company');
  if (!a2p.domain) return { status: 'no_website', pages: [] };

  const a2pId = a2p.id as string;

  // Mark as scanning
  execute(
    "UPDATE a2p_compliance SET overall_status = 'scanning', updated_at = datetime('now') WHERE id = ?",
    [a2pId]
  );

  try {
    const crawlResults = await crawlDomainForA2P(a2p.domain as string);

    for (const result of crawlResults) {
      const urlCol = `${result.pageType}_url`;
      const statusCol = `${result.pageType}_status`;

      if (result.url) {
        execute(
          `UPDATE a2p_compliance SET ${urlCol} = ?, ${statusCol} = 'found', updated_at = datetime('now') WHERE id = ?`,
          [result.url, a2pId]
        );

        // Cache HTML for analysis
        if (result.html) {
          execute(
            `INSERT INTO a2p_page_cache (id, a2p_id, page_type, url, html, fetched_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(a2p_id, page_type) DO UPDATE SET
               url = excluded.url, html = excluded.html, fetched_at = datetime('now')`,
            [randomUUID(), a2pId, result.pageType, result.url, result.html]
          );
        }
      } else {
        execute(
          `UPDATE a2p_compliance SET ${urlCol} = NULL, ${statusCol} = 'missing', updated_at = datetime('now') WHERE id = ?`,
          [a2pId]
        );
      }
    }

    // Update scan timestamp and recalc overall
    execute(
      "UPDATE a2p_compliance SET last_scanned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [a2pId]
    );
    recalcOverallAfterScan(a2pId);

    return { status: 'scanned', pages: crawlResults };
  } catch (err: unknown) {
    execute(
      "UPDATE a2p_compliance SET overall_status = 'error', updated_at = datetime('now') WHERE id = ?",
      [a2pId]
    );
    throw err;
  }
}

/**
 * Scan all companies that have a domain. Emits progress via callback.
 */
export async function scanAllA2P(
  onProgress?: (companyName: string, index: number, total: number) => void
): Promise<{ scanned: number; errors: number }> {
  // Use inline SQL via queryAll since we need a join
  const { queryAll } = await import('../db/client');
  const companies = queryAll(`
    SELECT a.company_id, a.domain, c.name as company_name
    FROM a2p_compliance a
    JOIN companies c ON c.id = a.company_id
    WHERE a.domain IS NOT NULL AND a.domain != ''
    ORDER BY c.name
  `) as Array<{ company_id: string; domain: string; company_name: string }>;

  let scanned = 0;
  let errors = 0;

  for (let i = 0; i < companies.length; i++) {
    onProgress?.(companies[i].company_name, i + 1, companies.length);
    try {
      await scanCompanyA2P(companies[i].company_id);
      scanned++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[A2P] Scan failed for ${companies[i].company_name}: ${msg}`);
      errors++;
    }
    // Rate limit: 2 seconds between domains
    await delay(2000);
  }

  return { scanned, errors };
}

function recalcOverallAfterScan(a2pId: string): void {
  const row = queryOne(
    `SELECT contact_page_status, privacy_policy_status, terms_of_service_status, sms_policy_status, domain
     FROM a2p_compliance WHERE id = ?`,
    [a2pId]
  );
  if (!row) return;

  if (!row.domain) {
    execute(`UPDATE a2p_compliance SET overall_status = 'no_website', updated_at = datetime('now') WHERE id = ?`, [a2pId]);
    return;
  }

  const statuses = [
    row.contact_page_status as string,
    row.privacy_policy_status as string,
    row.terms_of_service_status as string,
    row.sms_policy_status as string,
  ];

  const allFound = statuses.every(s => s === 'found' || s === 'pass');
  const anyMissing = statuses.some(s => s === 'missing');
  const anyFound = statuses.some(s => s === 'found' || s === 'pass');
  const issuesCount = statuses.filter(s => s === 'missing' || s === 'error').length;

  // After scan (before analysis), use found/missing to set preliminary status
  let overall = 'pending';
  if (allFound) overall = 'pending'; // all found, needs analysis
  else if (anyMissing && anyFound) overall = 'partial';
  else if (anyMissing && !anyFound) overall = 'non_compliant';

  execute(
    `UPDATE a2p_compliance SET overall_status = ?, issues_count = ?, updated_at = datetime('now') WHERE id = ?`,
    [overall, issuesCount, a2pId]
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
