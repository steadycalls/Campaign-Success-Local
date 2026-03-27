import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute, executeInTransaction } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';
import { logger } from '../../lib/logger';
import { refreshGoogleToken } from './gdrive-auth';

const GMAIL_BASE = 'https://gmail.googleapis.com';

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.com',
]);

// ── Token management (reuses google_auth table) ─────────────────────

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

async function getValidAccessToken(accountId: string = 'default'): Promise<string> {
  const auth = queryOne(
    'SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?',
    [accountId]
  );
  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error('Google not authorized. Go to Settings > Integrations to authorize.');
  }

  const expiresAt = new Date(auth.expires_at as string).getTime();
  if (Date.now() >= expiresAt - 300_000) {
    const clientId = getEnvValue('GOOGLE_CLIENT_ID');
    const clientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');
    const refreshed = await refreshGoogleToken(clientId, clientSecret, auth.refresh_token as string);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    execute(
      `UPDATE google_auth SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [refreshed.access_token, newExpiresAt, accountId]
    );
    return refreshed.access_token;
  }

  return auth.access_token as string;
}

// ── Gmail API fetch ─────────────────────────────────────────────────

async function gmailFetch<T>(path: string, token: string): Promise<T> {
  const url = `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (res.status === 401) {
    throw new Error('Gmail token expired — re-authorize Google');
  }
  if (res.status === 429) {
    logger.warn('Gmail', 'Rate limited, waiting 5s');
    await delay(5000);
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!retry.ok) throw new Error(`Gmail ${retry.status}: ${await retry.text().catch(() => '')}`);
    return retry.json() as Promise<T>;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

// ── Message parsing ─────────────────────────────────────────────────

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseEmailAddress(raw: string): { email: string; name: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>/);
  if (match) return { name: match[1].replace(/"/g, '').trim(), email: match[2].toLowerCase() };
  return { name: '', email: raw.toLowerCase().trim() };
}

function parseEmailList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(e => parseEmailAddress(e.trim()).email).filter(Boolean);
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractBody(payload: Record<string, unknown>): string {
  // Direct body
  const body = payload.body as { data?: string; size?: number } | undefined;
  if (body?.data) return decodeBase64Url(body.data);

  // Multipart — traverse recursively
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return '';

  // Prefer text/plain
  for (const part of parts) {
    if ((part.mimeType as string) === 'text/plain') {
      const partBody = part.body as { data?: string } | undefined;
      if (partBody?.data) return decodeBase64Url(partBody.data);
    }
  }

  // Fall back to text/html (strip tags)
  for (const part of parts) {
    if ((part.mimeType as string) === 'text/html') {
      const partBody = part.body as { data?: string } | undefined;
      if (partBody?.data) {
        const html = decodeBase64Url(partBody.data);
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Recurse into multipart
  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }

  return '';
}

function extractAttachments(payload: Record<string, unknown>): Array<{ filename: string; mimeType: string; size: number }> {
  const attachments: Array<{ filename: string; mimeType: string; size: number }> = [];
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return attachments;

  for (const part of parts) {
    const filename = part.filename as string;
    if (filename) {
      const body = part.body as { size?: number } | undefined;
      attachments.push({
        filename,
        mimeType: (part.mimeType as string) ?? 'application/octet-stream',
        size: body?.size ?? 0,
      });
    }
    // Recurse into nested multipart
    attachments.push(...extractAttachments(part));
  }

  return attachments;
}

// ── Company matching ────────────────────────────────────────────────

function emailDomain(email: string): string | null {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1].toLowerCase();
}

function matchEmailToCompany(emails: string[]): { companyId: string | null; method: string | null } {
  const domains = new Set<string>();
  for (const email of emails) {
    const domain = emailDomain(email);
    if (domain && !GENERIC_DOMAINS.has(domain)) domains.add(domain);
  }

  for (const domain of domains) {
    // Check company_domains table
    const match = queryOne('SELECT company_id FROM company_domains WHERE domain = ?', [domain]);
    if (match) return { companyId: match.company_id as string, method: 'email_domain' };

    // Check company website
    const websiteMatch = queryOne(
      "SELECT id FROM companies WHERE website LIKE ? AND status = 'active' LIMIT 1",
      [`%${domain}%`]
    );
    if (websiteMatch) return { companyId: websiteMatch.id as string, method: 'website_domain' };
  }

  return { companyId: null, method: null };
}

// ── Main sync functions ─────────────────────────────────────────────

/**
 * Sync Gmail for the default OAuth account.
 * Fetches messages from the last N days.
 */
export async function syncGmail(sinceDays: number = 30, accountId: string = 'default'): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  const token = await getValidAccessToken(accountId);

  // Get account email for direction detection
  const authRow = queryOne('SELECT email FROM google_auth WHERE id = ?', [accountId]);
  const accountEmail = ((authRow?.email as string) ?? '').toLowerCase();

  // Build search query: messages from the last N days
  const cutoff = Math.floor((Date.now() - sinceDays * 86400000) / 1000);
  const query = encodeURIComponent(`after:${cutoff} -in:drafts -in:spam -in:trash`);

  let pageToken: string | null = null;

  while (true) {
    let url = `/gmail/v1/users/me/messages?q=${query}&maxResults=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const listData = await gmailFetch<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>(url, token);

    const messageIds = listData.messages ?? [];
    if (messageIds.length === 0) break;

    for (const msgRef of messageIds) {
      counts.found++;

      // Skip if already synced
      const existing = queryOne('SELECT id FROM gmail_messages WHERE id = ?', [msgRef.id]);
      if (existing) continue;

      try {
        const msg = await gmailFetch<Record<string, unknown>>(
          `/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
          token
        );

        const payload = msg.payload as Record<string, unknown>;
        const headers = (payload?.headers as Array<{ name: string; value: string }>) ?? [];

        const from = parseEmailAddress(getHeader(headers, 'From'));
        const toRaw = getHeader(headers, 'To');
        const ccRaw = getHeader(headers, 'Cc');
        const subject = getHeader(headers, 'Subject');
        const dateStr = getHeader(headers, 'Date');
        const snippet = (msg.snippet as string) ?? '';

        const toEmails = parseEmailList(toRaw);
        const ccEmails = parseEmailList(ccRaw);

        // Direction
        let direction: 'inbound' | 'outbound' | 'internal' = 'inbound';
        if (accountEmail && from.email === accountEmail) direction = 'outbound';
        else if (accountEmail && toEmails.includes(accountEmail)) direction = 'inbound';

        // Body
        const bodyText = extractBody(payload).slice(0, 50000); // cap at 50KB
        const bodyHash = bodyText ? require('crypto').createHash('md5').update(bodyText).digest('hex') : null;

        // Attachments
        const attachments = extractAttachments(payload);

        // Company matching
        const allEmails = [from.email, ...toEmails, ...ccEmails];
        const { companyId, method } = matchEmailToCompany(allEmails);

        // Parse date
        let parsedDate: string | null = null;
        try { parsedDate = new Date(dateStr).toISOString(); } catch { parsedDate = new Date().toISOString(); }

        execute(
          `INSERT OR IGNORE INTO gmail_messages
            (id, thread_id, subject, from_email, from_name, to_emails, cc_emails, date, snippet,
             body_text, body_hash, direction, has_attachments, attachment_meta,
             company_id, match_method, account_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            msgRef.id, msgRef.threadId, subject, from.email, from.name,
            JSON.stringify(toEmails), JSON.stringify(ccEmails),
            parsedDate, snippet, bodyText, bodyHash,
            direction, attachments.length > 0 ? 1 : 0,
            JSON.stringify(attachments), companyId, method, accountId,
          ]
        );

        // Create company link
        if (companyId) {
          execute(
            `INSERT OR IGNORE INTO email_company_links (id, email_id, company_id, match_field)
             VALUES (?, ?, ?, ?)`,
            [randomUUID(), msgRef.id, companyId, direction === 'inbound' ? 'from' : 'to']
          );
        }

        counts.created++;
      } catch (err: unknown) {
        logger.warn('Gmail', 'Failed to fetch message', { id: msgRef.id, error: err instanceof Error ? err.message : String(err) });
      }

      await delay(500); // Rate limit: 2 req/sec
    }

    pageToken = listData.nextPageToken ?? null;
    if (!pageToken) break;
  }

  logger.sync('Gmail sync complete', { found: counts.found, created: counts.created, account: accountId });
  return counts;
}

/**
 * Get Gmail stats for display.
 */
export function getGmailStats(): { total: number; matched: number; unmatched: number; inbound: number; outbound: number } {
  const total = queryOne('SELECT COUNT(*) as cnt FROM gmail_messages');
  const matched = queryOne('SELECT COUNT(*) as cnt FROM gmail_messages WHERE company_id IS NOT NULL');
  const inbound = queryOne("SELECT COUNT(*) as cnt FROM gmail_messages WHERE direction = 'inbound'");
  const outbound = queryOne("SELECT COUNT(*) as cnt FROM gmail_messages WHERE direction = 'outbound'");

  return {
    total: (total?.cnt as number) || 0,
    matched: (matched?.cnt as number) || 0,
    unmatched: ((total?.cnt as number) || 0) - ((matched?.cnt as number) || 0),
    inbound: (inbound?.cnt as number) || 0,
    outbound: (outbound?.cnt as number) || 0,
  };
}
