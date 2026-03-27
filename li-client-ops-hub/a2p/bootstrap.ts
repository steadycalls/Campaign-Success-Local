import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute, executeInTransaction } from '../db/client';

/**
 * Create a2p_compliance rows for all active companies that don't have one yet.
 * Pulls domain/phone from GHL raw_json and falls back to ghl_sites.
 */
export function bootstrapA2PRecords(): number {
  const companies = queryAll(`
    SELECT id, ghl_location_id, name, raw_json
    FROM companies
    WHERE status = 'active'
  `) as Array<{ id: string; ghl_location_id: string; name: string; raw_json: string | null }>;

  let created = 0;

  executeInTransaction(() => {
    for (const company of companies) {
      const existing = queryOne(
        'SELECT id FROM a2p_compliance WHERE company_id = ?',
        [company.id]
      );
      if (existing) continue;

      const raw = company.raw_json ? JSON.parse(company.raw_json) : {};
      let domain = extractDomain(raw);
      const phone = raw.phone || raw.business?.phone || null;
      const businessName = raw.business?.name || raw.name || company.name;

      // Fall back to ghl_sites if no domain in company raw_json
      if (!domain) {
        const site = queryOne(`
          SELECT url FROM ghl_sites
          WHERE company_id = ? AND status = 'published'
          ORDER BY updated_at DESC LIMIT 1
        `, [company.id]) as { url: string } | null;

        if (site?.url) {
          domain = extractDomain({ website: site.url });
        }
      }

      execute(`
        INSERT INTO a2p_compliance (id, company_id, ghl_location_id, business_name, domain, phone)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        randomUUID(),
        company.id,
        company.ghl_location_id || '',
        businessName,
        domain,
        phone,
      ]);
      created++;
    }
  });

  return created;
}

function extractDomain(raw: Record<string, unknown>): string | null {
  const biz = raw.business as Record<string, unknown> | undefined;
  const settings = raw.settings as Record<string, unknown> | undefined;
  const url = (raw.website || biz?.website || settings?.website || null) as string | null;
  if (!url) return null;

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}
