import crypto from 'crypto';
import { queryOne, execute } from '../../db/client';
import { logger } from '../../lib/logger';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
  subject: string | null;
}

const tokenCache = new Map<string, TokenCache>();

// ── JWT Generation ──────────────────────────────────────────────────

function createJWT(serviceAccount: ServiceAccountKey, scopes: string[], subject?: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims: Record<string, unknown> = {
    iss: serviceAccount.client_email,
    scope: scopes.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  if (subject) claims.sub = subject;

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const claimsB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const unsigned = `${headerB64}.${claimsB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  return `${unsigned}.${signature}`;
}

// ── Token Exchange ──────────────────────────────────────────────────

async function getAccessToken(serviceAccount: ServiceAccountKey, scopes: string[], subject?: string): Promise<string> {
  const cacheKey = `${serviceAccount.client_email}|${subject ?? ''}|${scopes.join(',')}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300_000) return cached.token;

  const jwt = createJWT(serviceAccount, scopes, subject);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Service account token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    subject: subject ?? null,
  });

  return data.access_token;
}

// ── Public API ──────────────────────────────────────────────────────

const SCOPES_DRIVE = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];
const SCOPES_GMAIL = ['https://www.googleapis.com/auth/gmail.readonly'];
const SCOPES_CALENDAR = ['https://www.googleapis.com/auth/calendar.readonly'];
const SCOPES_DIRECTORY = ['https://www.googleapis.com/auth/admin.directory.user.readonly'];

export function getServiceAccountKey(): ServiceAccountKey | null {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'service_account_key_json'");
  if (!row?.value) return null;
  try { return JSON.parse(row.value as string); } catch { return null; }
}

export function getServiceAccountAdminEmail(): string | null {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'service_account_admin_email'");
  return (row?.value as string) ?? null;
}

export function isServiceAccountMode(): boolean {
  return !!getServiceAccountKey();
}

export function setServiceAccountKey(json: string): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('service_account_key_json', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [json]
  );
}

export function setServiceAccountAdminEmail(email: string): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('service_account_admin_email', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [email]
  );
}

export async function getDriveTokenAs(userEmail?: string): Promise<string> {
  const key = getServiceAccountKey();
  if (!key) throw new Error('Service account not configured');
  return getAccessToken(key, SCOPES_DRIVE, userEmail);
}

export async function getGmailTokenAs(userEmail: string): Promise<string> {
  const key = getServiceAccountKey();
  if (!key) throw new Error('Service account not configured');
  return getAccessToken(key, SCOPES_GMAIL, userEmail);
}

export async function getCalendarTokenAs(userEmail: string): Promise<string> {
  const key = getServiceAccountKey();
  if (!key) throw new Error('Service account not configured');
  return getAccessToken(key, SCOPES_CALENDAR, userEmail);
}

export async function getDirectoryToken(): Promise<string> {
  const key = getServiceAccountKey();
  const admin = getServiceAccountAdminEmail();
  if (!key || !admin) throw new Error('Service account or admin email not configured');
  return getAccessToken(key, SCOPES_DIRECTORY, admin);
}

export async function testServiceAccountAccess(): Promise<{ drive: boolean; gmail: boolean; calendar: boolean; directory: boolean; errors: string[] }> {
  const result = { drive: false, gmail: false, calendar: false, directory: false, errors: [] as string[] };
  const admin = getServiceAccountAdminEmail();

  try { await getDriveTokenAs(admin ?? undefined); result.drive = true; }
  catch (e: unknown) { result.errors.push(`Drive: ${e instanceof Error ? e.message : String(e)}`); }

  if (admin) {
    try { await getGmailTokenAs(admin); result.gmail = true; }
    catch (e: unknown) { result.errors.push(`Gmail: ${e instanceof Error ? e.message : String(e)}`); }

    try { await getCalendarTokenAs(admin); result.calendar = true; }
    catch (e: unknown) { result.errors.push(`Calendar: ${e instanceof Error ? e.message : String(e)}`); }

    try { await getDirectoryToken(); result.directory = true; }
    catch (e: unknown) { result.errors.push(`Directory: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return result;
}
