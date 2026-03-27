import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute, executeInTransaction } from '../../db/client';
import { nameSimilarity, normalize } from './autoMatch';
import { logger } from '../../lib/logger';

// ── Types ────────────────────────────────────────────────────────────

interface Signal {
  signal: string;
  score: number;
  detail: string;
}

interface Candidate {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType: string;
  signals: Signal[];
}

export interface SuggestionEngineResult {
  created: number;
  updated: number;
  byType: Record<string, number>;
}

const MIN_CONFIDENCE = 0.50;

// ── Helpers ──────────────────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, '');
  } catch { return null; }
}

function emailDomain(email: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

function aggregateScore(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  const max = Math.max(...signals.map(s => s.score));
  const bonus = 0.05 * (signals.length - 1);
  return Math.min(0.99, Math.round((max + bonus) * 100) / 100);
}

function safeParseArray(json: string | null): unknown[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

// ── Matchers ─────────────────────────────────────────────────────────

function matchCompanyContacts(
  companies: Array<Record<string, unknown>>,
  contacts: Array<Record<string, unknown>>,
  companyDomains: Map<string, string[]>,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const contact of contacts) {
    if (contact.company_id) continue; // already linked
    const contactEmail = (contact.email as string)?.toLowerCase() ?? null;
    const contactCompanyName = (contact.company_name as string) ?? null;
    const contactTags = safeParseArray(contact.tags as string) as string[];
    const contactDomain = emailDomain(contactEmail);

    for (const company of companies) {
      const signals: Signal[] = [];
      const companyName = company.name as string;
      const companyWebsite = company.website as string | null;
      const companySlug = (company.slug as string) ?? '';
      const companyDomain = extractDomain(companyWebsite);
      const domains = companyDomains.get(company.id as string) ?? [];
      if (companyDomain) domains.push(companyDomain);

      // Email domain match
      if (contactDomain && domains.some(d => d === contactDomain)) {
        signals.push({ signal: 'email_domain_exact', score: 0.95, detail: `${contactEmail} domain matches ${contactDomain}` });
      } else if (contactDomain && companyDomain && contactDomain === companyDomain) {
        signals.push({ signal: 'email_domain_website', score: 0.90, detail: `Email domain ${contactDomain} matches company website` });
      }

      // Company name match
      if (contactCompanyName) {
        const sim = nameSimilarity(contactCompanyName, companyName);
        if (sim >= 1.0) {
          signals.push({ signal: 'company_name_exact', score: 1.0, detail: `"${contactCompanyName}" exact match` });
        } else if (sim >= 0.6) {
          signals.push({ signal: 'company_name_fuzzy', score: Math.min(0.85, sim), detail: `"${contactCompanyName}" ~ "${companyName}" (${Math.round(sim * 100)}%)` });
        }
      }

      // Tag match
      for (const tag of contactTags) {
        if (typeof tag === 'string') {
          const tagLower = tag.toLowerCase();
          if (tagLower.includes(companySlug) || tagLower.includes(normalize(companyName))) {
            signals.push({ signal: 'tag_match', score: 0.80, detail: `Tag "${tag}" matches company` });
            break;
          }
        }
      }

      if (signals.length > 0) {
        candidates.push({
          sourceType: 'company', sourceId: company.id as string,
          targetType: 'contact', targetId: contact.id as string,
          linkType: 'company_contact', signals,
        });
      }
    }
  }

  return candidates;
}

function matchCompanyMeetings(
  companies: Array<Record<string, unknown>>,
  meetings: Array<Record<string, unknown>>,
  contactEmailToCompany: Map<string, string>,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const meeting of meetings) {
    if (meeting.company_id) continue; // already linked
    const participants = safeParseArray(meeting.participants_json as string) as Array<{ email?: string; name?: string }>;
    const title = ((meeting.title as string) ?? '').toLowerCase();

    for (const company of companies) {
      const signals: Signal[] = [];
      const companyName = company.name as string;
      const companyId = company.id as string;

      // Participant email matches a contact in this company
      for (const p of participants) {
        if (!p.email) continue;
        const email = p.email.toLowerCase();
        if (contactEmailToCompany.get(email) === companyId) {
          signals.push({ signal: 'participant_email', score: 0.95, detail: `${p.name || email} is a contact of ${companyName}` });
          break;
        }
      }

      // Company name in meeting title
      if (title.includes(normalize(companyName)) && normalize(companyName).length >= 4) {
        signals.push({ signal: 'title_contains_name', score: 0.60, detail: `Meeting title mentions "${companyName}"` });
      }

      if (signals.length > 0) {
        candidates.push({
          sourceType: 'company', sourceId: companyId,
          targetType: 'meeting', targetId: meeting.id as string,
          linkType: 'company_meeting', signals,
        });
      }
    }
  }

  return candidates;
}

function matchContactMeetings(
  contacts: Array<Record<string, unknown>>,
  meetings: Array<Record<string, unknown>>,
): Candidate[] {
  const candidates: Candidate[] = [];
  const contactEmails = new Map<string, string>();
  for (const c of contacts) {
    if (c.email) contactEmails.set((c.email as string).toLowerCase(), c.id as string);
  }

  for (const meeting of meetings) {
    const participants = safeParseArray(meeting.participants_json as string) as Array<{ email?: string; name?: string }>;
    for (const p of participants) {
      if (!p.email) continue;
      const contactId = contactEmails.get(p.email.toLowerCase());
      if (contactId) {
        candidates.push({
          sourceType: 'contact', sourceId: contactId,
          targetType: 'meeting', targetId: meeting.id as string,
          linkType: 'contact_meeting',
          signals: [{ signal: 'participant_email', score: 0.95, detail: `${p.name || p.email} matches contact email` }],
        });
      }
    }
  }

  return candidates;
}

function matchCompanyPlatform(
  companies: Array<Record<string, unknown>>,
  entities: Array<Record<string, unknown>>,
  targetType: string,
  linkType: string,
  nameField: string,
  domainField?: string,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const entity of entities) {
    if (entity.company_id) continue; // already linked
    const entityName = (entity[nameField] as string) ?? '';

    for (const company of companies) {
      const signals: Signal[] = [];
      const companyName = company.name as string;

      // Name similarity
      const sim = nameSimilarity(entityName, companyName);
      if (sim >= 0.5) {
        signals.push({
          signal: 'name_similarity', score: sim,
          detail: `"${entityName}" ~ "${companyName}" (${Math.round(sim * 100)}%)`,
        });
      }

      // Domain match (for Kinsta)
      if (domainField && entity[domainField] && company.website) {
        const entityDomain = extractDomain(entity[domainField] as string);
        const companyDomain = extractDomain(company.website as string);
        if (entityDomain && companyDomain && (entityDomain.includes(companyDomain) || companyDomain.includes(entityDomain))) {
          signals.push({ signal: 'domain_match', score: 0.85, detail: `${entityDomain} matches ${companyDomain}` });
        }
      }

      if (signals.length > 0) {
        candidates.push({
          sourceType: 'company', sourceId: company.id as string,
          targetType, targetId: entity.id as string, linkType, signals,
        });
      }
    }
  }

  return candidates;
}

// ── Orchestrator ─────────────────────────────────────────────────────

export function runSuggestionEngine(): SuggestionEngineResult {
  const result: SuggestionEngineResult = { created: 0, updated: 0, byType: {} };

  const companies = queryAll("SELECT id, name, slug, website FROM companies WHERE status = 'active'");
  const contacts = queryAll('SELECT id, company_id, email, company_name, tags FROM contacts');
  const meetings = queryAll('SELECT id, company_id, title, participants_json FROM meetings');

  // Build lookup maps
  const contactEmailToCompany = new Map<string, string>();
  for (const c of contacts) {
    if (c.email && c.company_id) contactEmailToCompany.set((c.email as string).toLowerCase(), c.company_id as string);
  }

  const companyDomains = new Map<string, string[]>();
  const domainRows = queryAll('SELECT company_id, domain FROM company_domains');
  for (const d of domainRows) {
    const list = companyDomains.get(d.company_id as string) ?? [];
    list.push((d.domain as string).toLowerCase());
    companyDomains.set(d.company_id as string, list);
  }

  // Existing links to skip
  const existingLinks = new Set<string>();
  for (const el of queryAll('SELECT company_id, platform, platform_id FROM entity_links')) {
    existingLinks.add(`company|${el.company_id}|${el.platform}|${el.platform_id}`);
  }
  for (const ca of queryAll('SELECT client_contact_id, association_type, target_id FROM client_associations')) {
    existingLinks.add(`contact|${ca.client_contact_id}|${ca.association_type}|${ca.target_id}`);
  }

  // Dismissed suggestions to skip
  const dismissed = new Set<string>();
  for (const d of queryAll("SELECT source_type, source_id, target_type, target_id, link_type FROM suggested_links WHERE status = 'dismissed'")) {
    dismissed.add(`${d.source_type}|${d.source_id}|${d.target_type}|${d.target_id}|${d.link_type}`);
  }

  // Run all matchers
  const allCandidates: Candidate[] = [];

  allCandidates.push(...matchCompanyContacts(companies, contacts, companyDomains));
  allCandidates.push(...matchCompanyMeetings(companies, meetings, contactEmailToCompany));
  allCandidates.push(...matchContactMeetings(contacts, meetings));

  // Platform matchers
  const teamwork = queryAll('SELECT id, name, company_id FROM teamwork_projects');
  if (teamwork.length > 0) allCandidates.push(...matchCompanyPlatform(companies, teamwork, 'teamwork', 'company_teamwork', 'name'));

  const kinsta = queryAll('SELECT id, display_name, domain, company_id FROM kinsta_sites');
  if (kinsta.length > 0) allCandidates.push(...matchCompanyPlatform(companies, kinsta, 'kinsta', 'company_kinsta', 'display_name', 'domain'));

  try {
    const gdrive = queryAll('SELECT id, name, company_id FROM drive_folders');
    if (gdrive.length > 0) allCandidates.push(...matchCompanyPlatform(companies, gdrive, 'gdrive', 'company_gdrive', 'name'));
  } catch { /* drive_folders may not exist */ }

  try {
    const discord = queryAll('SELECT id, name FROM discord_channels');
    if (discord.length > 0) allCandidates.push(...matchCompanyPlatform(companies, discord, 'discord', 'company_discord', 'name'));
  } catch { /* discord_channels may not exist */ }

  // Filter, score, and upsert
  executeInTransaction(() => {
    for (const c of allCandidates) {
      const confidence = aggregateScore(c.signals);
      if (confidence < MIN_CONFIDENCE) continue;

      // Skip existing real links
      const skipKey = `${c.sourceType}|${c.sourceId}|${c.targetType}|${c.targetId}`;
      if (existingLinks.has(skipKey)) continue;

      // Skip dismissed
      const dismissKey = `${c.sourceType}|${c.sourceId}|${c.targetType}|${c.targetId}|${c.linkType}`;
      if (dismissed.has(dismissKey)) continue;

      const existing = queryOne(
        'SELECT id, confidence FROM suggested_links WHERE source_type=? AND source_id=? AND target_type=? AND target_id=? AND link_type=?',
        [c.sourceType, c.sourceId, c.targetType, c.targetId, c.linkType]
      );

      if (existing) {
        if (Math.abs((existing.confidence as number) - confidence) > 0.01) {
          execute(
            "UPDATE suggested_links SET confidence=?, signals_json=?, updated_at=datetime('now') WHERE id=?",
            [confidence, JSON.stringify(c.signals), existing.id as string]
          );
          result.updated++;
        }
      } else {
        execute(
          `INSERT INTO suggested_links (id, source_type, source_id, target_type, target_id, link_type, confidence, signals_json, status)
           VALUES (?,?,?,?,?,?,?,?,'pending')`,
          [randomUUID(), c.sourceType, c.sourceId, c.targetType, c.targetId, c.linkType, confidence, JSON.stringify(c.signals)]
        );
        result.created++;
        result.byType[c.linkType] = (result.byType[c.linkType] ?? 0) + 1;
      }
    }
  });

  logger.sync('Suggestion engine complete', { created: result.created, updated: result.updated, types: JSON.stringify(result.byType) });
  return result;
}
