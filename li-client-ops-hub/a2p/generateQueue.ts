import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../db/client';
import { generateA2PContent, type GenerationContext } from './generator';

const PAGE_TYPES = ['contact', 'privacy_policy', 'terms_of_service', 'sms_policy'] as const;

/**
 * Generate content for all missing/failing/partial pages of one company.
 */
export async function queueContentGeneration(companyId: string): Promise<number> {
  const a2p = queryOne('SELECT * FROM a2p_compliance WHERE company_id = ?', [companyId]) as Record<string, unknown> | null;
  if (!a2p) throw new Error('No A2P record');

  const a2pId = a2p.id as string;
  let queued = 0;

  for (const pageType of PAGE_TYPES) {
    const status = a2p[`${pageType}_status`] as string;

    if (status === 'missing' || status === 'fail' || status === 'partial') {
      const analysisRaw = a2p[`${pageType}_analysis`] as string | null;
      const analysis = analysisRaw ? safeParseJson(analysisRaw) : null;

      const context: GenerationContext = {
        businessName: (a2p.business_name as string) || '',
        domain: (a2p.domain as string) || '',
        phone: (a2p.phone as string) || null,
        pageType,
        existingAnalysis: analysis as GenerationContext['existingAnalysis'],
      };

      try {
        const content = await generateA2PContent(context);

        execute(
          `INSERT INTO a2p_generated_content (id, a2p_id, company_id, page_type, content_md, content_status, generated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))
           ON CONFLICT(a2p_id, page_type) DO UPDATE SET
             content_md = excluded.content_md,
             content_status = 'draft',
             generated_at = datetime('now'),
             updated_at = datetime('now')`,
          [randomUUID(), a2pId, companyId, pageType, content]
        );

        queued++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[A2P] Content generation failed for ${a2p.business_name} ${pageType}: ${msg}`);
      }

      await delay(2000);
    }
  }

  execute(
    `UPDATE a2p_compliance SET
      content_queue_status = ?,
      content_generated_at = CASE WHEN ? > 0 THEN datetime('now') ELSE content_generated_at END,
      updated_at = datetime('now')
    WHERE id = ?`,
    [queued > 0 ? 'complete' : 'none', queued, a2pId]
  );

  return queued;
}

/**
 * Generate content for all non-compliant companies.
 */
export async function generateAllA2P(
  onProgress?: (name: string, index: number, total: number) => void
): Promise<{ generated: number; errors: number }> {
  const companies = queryAll(`
    SELECT a.company_id, c.name
    FROM a2p_compliance a
    JOIN companies c ON c.id = a.company_id
    WHERE a.overall_status IN ('non_compliant', 'partial')
    ORDER BY c.name
  `) as Array<{ company_id: string; name: string }>;

  let generated = 0;
  let errors = 0;

  for (let i = 0; i < companies.length; i++) {
    onProgress?.(companies[i].name, i + 1, companies.length);
    try {
      const count = await queueContentGeneration(companies[i].company_id);
      generated += count;
    } catch {
      errors++;
    }
  }

  return { generated, errors };
}

function safeParseJson(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
