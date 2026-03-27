import { queryOne, queryAll, execute } from '../db/client';
import { analyzePage, type AnalysisResult } from './analyzer';

const PAGE_TYPES = ['contact', 'privacy_policy', 'terms_of_service', 'sms_policy'] as const;

/**
 * Analyze all cached pages for one company using Claude API.
 */
export async function analyzeCompanyA2P(companyId: string): Promise<void> {
  const a2p = queryOne('SELECT * FROM a2p_compliance WHERE company_id = ?', [companyId]) as Record<string, unknown> | null;
  if (!a2p) throw new Error('No A2P record');

  const a2pId = a2p.id as string;

  for (const pageType of PAGE_TYPES) {
    const statusCol = `${pageType}_status`;
    const analysisCol = `${pageType}_analysis`;

    // Get cached HTML
    const cache = queryOne(
      'SELECT html, url FROM a2p_page_cache WHERE a2p_id = ? AND page_type = ?',
      [a2pId, pageType]
    ) as { html: string; url: string } | null;

    if (!cache?.html) {
      // Page wasn't found during crawl
      execute(
        `UPDATE a2p_compliance SET ${statusCol} = 'missing', updated_at = datetime('now') WHERE id = ?`,
        [a2pId]
      );
      continue;
    }

    try {
      const result: AnalysisResult = await analyzePage(
        cache.html,
        pageType,
        (a2p.business_name as string) || '',
        (a2p.domain as string) || '',
      );

      execute(
        `UPDATE a2p_compliance SET ${statusCol} = ?, ${analysisCol} = ?, updated_at = datetime('now') WHERE id = ?`,
        [result.overallStatus, JSON.stringify(result), a2pId]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      execute(
        `UPDATE a2p_compliance SET ${statusCol} = 'error', ${analysisCol} = ?, updated_at = datetime('now') WHERE id = ?`,
        [JSON.stringify({ error: msg }), a2pId]
      );
    }

    // Rate limit Claude API calls
    await delay(1000);
  }

  // Compute overall status
  updateOverallA2PStatus(a2pId);
}

/**
 * Analyze all companies that have been scanned. Emits progress via callback.
 */
export async function analyzeAllA2P(
  onProgress?: (name: string, index: number, total: number) => void
): Promise<{ analyzed: number; errors: number }> {
  const companies = queryAll(`
    SELECT a.company_id, c.name as company_name
    FROM a2p_compliance a
    JOIN companies c ON c.id = a.company_id
    WHERE a.domain IS NOT NULL
      AND a.last_scanned_at IS NOT NULL
    ORDER BY c.name
  `) as Array<{ company_id: string; company_name: string }>;

  let analyzed = 0;
  let errors = 0;

  for (let i = 0; i < companies.length; i++) {
    onProgress?.(companies[i].company_name, i + 1, companies.length);
    try {
      await analyzeCompanyA2P(companies[i].company_id);
      analyzed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[A2P] Analysis failed for ${companies[i].company_name}: ${msg}`);
      errors++;
    }
  }

  return { analyzed, errors };
}

function updateOverallA2PStatus(a2pId: string): void {
  const row = queryOne('SELECT * FROM a2p_compliance WHERE id = ?', [a2pId]) as Record<string, unknown> | null;
  if (!row) return;

  const statuses = [
    row.contact_page_status as string,
    row.privacy_policy_status as string,
    row.terms_of_service_status as string,
    row.sms_policy_status as string,
  ];

  const issues = statuses.filter(s => s === 'fail' || s === 'missing').length;
  const partials = statuses.filter(s => s === 'partial').length;

  let overall: string;
  if (statuses.every(s => s === 'pass')) overall = 'compliant';
  else if (issues === 0 && partials > 0) overall = 'partial';
  else overall = 'non_compliant';

  execute(
    `UPDATE a2p_compliance SET
      overall_status = ?,
      issues_count = ?,
      last_analyzed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?`,
    [overall, issues + partials, a2pId]
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
