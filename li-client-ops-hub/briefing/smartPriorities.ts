import Anthropic from '@anthropic-ai/sdk';
import { queryAll, queryOne, execute } from '../db/client';
import { logger } from '../lib/logger';

const RI_LOCATION_ID = process.env.RI_LOCATION_ID || 'g6zCuamu3IQlnY1ympGx';

export interface SmartPriority {
  priority: number;
  action: string;
  reason: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  companyId?: string;
  companyName?: string;
  contactName?: string;
  ghlContactUrl?: string;
  category: string;
}

interface CachedPriorities {
  priorities: SmartPriority[];
  generatedAt: string;
}

const CACHE_KEY = 'smart_priorities';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Get cached priorities or generate fresh ones.
 */
export async function getSmartPriorities(forceRefresh = false): Promise<SmartPriority[]> {
  if (!forceRefresh) {
    const cached = queryOne("SELECT value FROM app_state WHERE key = ?", [CACHE_KEY]);
    if (cached?.value) {
      try {
        const parsed = JSON.parse(cached.value as string) as CachedPriorities;
        const age = Date.now() - new Date(parsed.generatedAt).getTime();
        if (age < CACHE_TTL_MS) return parsed.priorities;
      } catch { /* regenerate */ }
    }
  }

  return generateSmartPriorities();
}

async function generateSmartPriorities(): Promise<SmartPriority[]> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return [];

  // Gather all the data Claude needs
  const churnRisks = queryAll(`
    SELECT name, churn_risk_score, churn_risk_grade, churn_risk_reason, id
    FROM companies
    WHERE status = 'active' AND sync_enabled = 1
      AND churn_risk_grade IN ('high', 'critical')
      AND ghl_location_id != ?
    ORDER BY churn_risk_score DESC LIMIT 10
  `, [RI_LOCATION_ID]);

  const slaViolations = queryAll(`
    SELECT c.first_name, c.last_name, c.days_since_outbound, co.name as company_name, co.id as company_id
    FROM contacts c
    JOIN companies co ON co.id = c.company_id
    WHERE c.sla_status = 'violation' AND c.tags LIKE '%client%'
      AND co.ghl_location_id != ?
    ORDER BY c.days_since_outbound DESC LIMIT 10
  `, [RI_LOCATION_ID]);

  const budgetAlerts = queryAll(`
    SELECT tp.name as project_name, tp.budget_percent, co.name as company_name, co.id as company_id
    FROM teamwork_projects tp
    LEFT JOIN companies co ON co.id = tp.company_id
    WHERE tp.budget_percent >= 85 AND tp.status = 'active'
      AND co.ghl_location_id != ?
    ORDER BY tp.budget_percent DESC LIMIT 5
  `, [RI_LOCATION_ID]);

  const contractsExpiring = queryAll(`
    SELECT name, contract_end, monthly_revenue, id
    FROM companies
    WHERE status = 'active' AND contract_end IS NOT NULL
      AND contract_end <= datetime('now', '+30 days')
      AND contract_end >= datetime('now')
      AND ghl_location_id != ?
    ORDER BY contract_end ASC LIMIT 5
  `, [RI_LOCATION_ID]);

  const noMeetings = queryAll(`
    SELECT c.name, c.id, c.monthly_revenue
    FROM companies c
    WHERE c.status = 'active' AND c.sync_enabled = 1
      AND c.ghl_location_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.company_id = c.id AND m.meeting_date >= datetime('now', '-30 days')
      )
    ORDER BY c.monthly_revenue DESC NULLS LAST LIMIT 5
  `, [RI_LOCATION_ID]);

  // Build context for Claude
  const sections: string[] = [];

  if (churnRisks.length > 0) {
    sections.push('CHURN RISK (clients likely to leave):\n' +
      churnRisks.map(c => `- ${c.name}: risk score ${c.churn_risk_score}/100 (${c.churn_risk_grade}) — ${c.churn_risk_reason}`).join('\n'));
  }

  if (slaViolations.length > 0) {
    sections.push('SLA VIOLATIONS (overdue client contacts):\n' +
      slaViolations.map(c => {
        const days = (c.days_since_outbound as number) >= 9999 ? 'never contacted' : `${c.days_since_outbound} days since last outbound`;
        return `- ${c.first_name} ${c.last_name} (${c.company_name}): ${days}`;
      }).join('\n'));
  }

  if (budgetAlerts.length > 0) {
    sections.push('BUDGET ALERTS:\n' +
      budgetAlerts.map(b => `- ${b.project_name} (${b.company_name}): ${Math.round(b.budget_percent as number)}% budget used`).join('\n'));
  }

  if (contractsExpiring.length > 0) {
    sections.push('CONTRACTS EXPIRING WITHIN 30 DAYS:\n' +
      contractsExpiring.map(c => {
        const daysLeft = Math.round((new Date(c.contract_end as string).getTime() - Date.now()) / 86400000);
        return `- ${c.name}: expires in ${daysLeft} days${c.monthly_revenue ? ` ($${c.monthly_revenue}/mo)` : ''}`;
      }).join('\n'));
  }

  if (noMeetings.length > 0) {
    sections.push('NO MEETINGS IN 30 DAYS:\n' +
      noMeetings.map(c => `- ${c.name}${c.monthly_revenue ? ` ($${c.monthly_revenue}/mo)` : ''}`).join('\n'));
  }

  if (sections.length === 0) {
    const result: SmartPriority[] = [{
      priority: 1, action: 'All clear — no urgent issues today',
      reason: 'No churn risks, SLA violations, budget alerts, or expiring contracts.',
      urgency: 'low', category: 'general',
    }];
    cacheResult(result);
    return result;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `You are a strategic advisor for a COO running an SEO and Google Ads agency with ${churnRisks.length + slaViolations.length + budgetAlerts.length} active issues.

Given client account data, generate exactly 5-7 prioritized actions for today. Each must be specific and actionable — name the client, what to do, and why.

Focus on: revenue protection (churn risk), client communication (SLA), contract renewals, growth opportunities.

Return ONLY a valid JSON array: [{"priority":1,"action":"...","reason":"...","urgency":"critical|high|medium|low","companyName":"...","category":"churn_risk|sla|budget|contract|opportunity|meeting"}]`,
      messages: [{ role: 'user', content: `Today's data:\n\n${sections.join('\n\n')}` }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    const priorities = JSON.parse(text.replace(/```json|```/g, '').trim()) as SmartPriority[];

    // Resolve company IDs and GHL contact links from names
    for (const p of priorities) {
      if (p.companyName) {
        const company = queryOne('SELECT id, ghl_location_id FROM companies WHERE name = ?', [p.companyName]);
        if (company) {
          p.companyId = company.id as string;

          // Find the client contact for this company:
          // 1. Try client_associations (explicit link)
          // 2. Fall back to any client-tagged contact in this company
          // 3. Fall back to any contact in this company
          let contact = queryOne(`
            SELECT c.first_name, c.last_name, c.ghl_contact_id, co.ghl_location_id
            FROM client_associations ca
            JOIN contacts c ON c.id = ca.client_contact_id
            LEFT JOIN companies co ON co.id = c.company_id
            WHERE ca.target_id = ? AND ca.association_type = 'sub_account'
            LIMIT 1
          `, [company.id as string]);

          if (!contact?.ghl_contact_id) {
            contact = queryOne(`
              SELECT first_name, last_name, ghl_contact_id
              FROM contacts
              WHERE company_id = ? AND tags LIKE '%client%' AND ghl_contact_id IS NOT NULL
              ORDER BY last_outbound_at DESC NULLS LAST LIMIT 1
            `, [company.id as string]);
          }

          if (!contact?.ghl_contact_id) {
            contact = queryOne(`
              SELECT first_name, last_name, ghl_contact_id
              FROM contacts
              WHERE company_id = ? AND ghl_contact_id IS NOT NULL
              ORDER BY last_outbound_at DESC NULLS LAST LIMIT 1
            `, [company.id as string]);
          }

          if (contact?.ghl_contact_id) {
            const locId = ((contact as Record<string,unknown>).ghl_location_id || company.ghl_location_id) as string;
            p.contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') as string || undefined;
            if (locId) {
              p.ghlContactUrl = `https://app.gohighlevel.com/v2/location/${locId}/contacts/detail/${contact.ghl_contact_id}`;
            }
          }
        }
      }
    }

    cacheResult(priorities);
    return priorities;
  } catch (err: unknown) {
    logger.error('Briefing', 'Smart priorities generation failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function cacheResult(priorities: SmartPriority[]): void {
  const payload: CachedPriorities = { priorities, generatedAt: new Date().toISOString() };
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [CACHE_KEY, JSON.stringify(payload)]
  );
}
