import { ipcMain, shell } from 'electron';
import { queryOne, execute } from '../../db/client';
import { logger } from '../../lib/logger';
import { logAlert } from '../../sync/utils/logger';

const TOKEN_ENDPOINT = 'https://authn.read.ai/oauth2/token';
const USERINFO_ENDPOINT = 'https://api.read.ai/oauth/userinfo';
const TEST_ENDPOINT = 'https://api.read.ai/oauth/test-token-with-scopes';
const OAUTH_UI_URL = 'https://api.read.ai/oauth/ui';
const REDIRECT_URI = 'https://api.read.ai/oauth/ui';
const SCOPES = 'openid email offline_access profile meeting:read mcp:execute';

// ── Curl parser ─────────────────────────────────────────────────────

function parseCurlCommand(curl: string): {
  endpoint: string | null;
  authHeader: string | null;
  code: string | null;
  codeVerifier: string | null;
  redirectUri: string | null;
} {
  // Normalize: collapse line continuations and extra whitespace
  const normalized = curl.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract URL (after POST or GET, or bare URL)
  const urlMatch = normalized.match(/(?:POST|GET|PUT)\s+(https?:\/\/\S+)/i)
    || normalized.match(/curl\s+(?:-\S+\s+)*(https?:\/\/\S+)/i);
  const endpoint = urlMatch?.[1]?.replace(/['"]/g, '') || null;

  // Extract Authorization header — handle both literal and $(echo ...) patterns
  let authHeader: string | null = null;
  const basicLiteralMatch = normalized.match(/-H\s+["']Authorization:\s*(Basic\s+\S+)["']/i);
  if (basicLiteralMatch) {
    authHeader = basicLiteralMatch[1];
  } else {
    // Handle: "Authorization: Basic $(echo -n 'id:secret' | base64)"
    const echoMatch = normalized.match(/echo\s+-n\s+["']([^"']+)["']\s*\|\s*base64/);
    if (echoMatch) {
      authHeader = 'Basic ' + Buffer.from(echoMatch[1]).toString('base64');
    }
  }

  // Extract -d parameters
  const dParams: Record<string, string> = {};
  const dRegex = /-d\s+["']([^"']+)["']/g;
  let match;
  while ((match = dRegex.exec(normalized)) !== null) {
    const [key, ...valueParts] = match[1].split('=');
    if (key && valueParts.length > 0) {
      dParams[key] = valueParts.join('=');
    }
  }

  return {
    endpoint,
    authHeader,
    code: dParams.code || null,
    codeVerifier: dParams.code_verifier || null,
    redirectUri: dParams.redirect_uri || null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.READAI_CLIENT_ID || '';
  const clientSecret = process.env.READAI_CLIENT_SECRET || '';
  return { clientId, clientSecret };
}

function getBasicAuthHeader(): string {
  const { clientId, clientSecret } = getClientCredentials();
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// ── Token refresh (shared logic) ─────────────────────────────────────

async function refreshReadAiTokenInternal(): Promise<{ success: boolean; message: string }> {
  const auth = queryOne('SELECT * FROM readai_auth WHERE id = ?', ['default']);
  if (!auth?.refresh_token) {
    return { success: false, message: 'No refresh token stored. Re-authorize.' };
  }

  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: auth.refresh_token as string,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      const errorMsg = `Refresh failed (${res.status}): ${errBody}`;
      logger.error('Auth', 'Read.ai token refresh failed', { status: res.status, error: errBody.slice(0, 200) });

      execute(
        `UPDATE integrations SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE name = 'readai_api'`,
        [errorMsg]
      );

      // Create a visible alert so it shows in the UI
      logAlert('readai_refresh_failed', 'warning', `Read.ai token refresh failed: ${errBody.slice(0, 200)}`);

      // If refresh token is revoked/invalid, clear tokens so user re-auths
      if (res.status === 400 || res.status === 401) {
        execute('DELETE FROM readai_auth WHERE id = ?', ['default']);
        execute(
          `UPDATE integrations SET status = 'not_configured', last_error = 'Refresh token expired — please re-authorize', updated_at = datetime('now') WHERE name = 'readai_api'`
        );
        return { success: false, message: 'Read.ai refresh token expired. Please re-authorize in Settings.' };
      }

      return { success: false, message: errorMsg };
    }

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 600) * 1000).toISOString();

    // CRITICAL: Use COALESCE — some providers don't return a new refresh_token on every refresh
    execute(
      `UPDATE readai_auth SET
        access_token = ?,
        refresh_token = COALESCE(?, readai_auth.refresh_token),
        expires_at = ?,
        last_refreshed = datetime('now'),
        updated_at = datetime('now')
       WHERE id = 'default'`,
      [tokens.access_token, tokens.refresh_token ?? null, expiresAt]
    );

    logger.auth('Read.ai token refreshed successfully');
    return { success: true, message: 'Token refreshed' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Auth', 'Read.ai token refresh error', { error: errorMsg });
    logAlert('readai_refresh_failed', 'error', `Read.ai token refresh error: ${errorMsg}`);
    return { success: false, message: `Refresh error: ${errorMsg}` };
  }
}

// ── Exported: get a valid access token (auto-refreshes) ──────────────

export async function getValidReadAiToken(): Promise<string> {
  const auth = queryOne('SELECT * FROM readai_auth WHERE id = ?', ['default']);

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error('Read.ai not authorized. Go to Settings > Integrations to authorize.');
  }

  // Check if token is expired or about to expire (5 min buffer)
  const expiresAt = new Date(auth.expires_at as string).getTime();
  const bufferMs = 5 * 60 * 1000;

  if (Date.now() >= expiresAt - bufferMs) {
    logger.auth('Read.ai access token expired or expiring soon, refreshing');
    const result = await refreshReadAiTokenInternal();
    if (!result.success) {
      throw new Error(`Token refresh failed: ${result.message}`);
    }
    // Re-read the updated token
    const updated = queryOne('SELECT access_token FROM readai_auth WHERE id = ?', ['default']);
    if (!updated?.access_token) {
      throw new Error('Read.ai token refresh succeeded but no token found in DB');
    }
    return updated.access_token as string;
  }

  return auth.access_token as string;
}

// ── Exported: test connection ────────────────────────────────────────

export async function testReadAiOAuthConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const accessToken = await getValidReadAiToken();

    const res = await fetch(TEST_ENDPOINT, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, message: `Test failed (${res.status}): ${errBody}` };
    }

    const data = await res.json() as Record<string, unknown>;

    // Try to get meeting count
    let meetingCount: number | null = null;
    try {
      const meetingsRes = await fetch('https://api.read.ai/v1/meetings?limit=1', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (meetingsRes.ok) {
        const meetingsData = await meetingsRes.json() as { total?: number; count?: number; has_more?: boolean };
        meetingCount = meetingsData.total ?? meetingsData.count ?? null;
      }
    } catch {
      // Non-fatal
    }

    const now = new Date().toISOString();
    execute(
      `UPDATE integrations SET status = 'connected', last_tested_at = ?, last_error = NULL, updated_at = ? WHERE name = 'readai_api'`,
      [now, now]
    );

    const message = meetingCount !== null
      ? `Connected. ${meetingCount} meetings accessible.`
      : 'Connected. Token valid with scopes: ' + JSON.stringify(data.scope ?? data);

    return { success: true, message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    execute(
      `UPDATE integrations SET status = 'error', last_tested_at = ?, last_error = ?, updated_at = ? WHERE name = 'readai_api'`,
      [now, message, now]
    );
    return { success: false, message };
  }
}

// ── Startup reconciliation ────────────────────────────────────────────
// Ensures integration status reflects the actual readai_auth state on app load.
// If tokens exist but are expired, attempt a silent refresh.

export async function reconcileReadAiAuthOnStartup(): Promise<void> {
  try {
    const auth = queryOne('SELECT access_token, refresh_token, expires_at FROM readai_auth WHERE id = ?', ['default']);

    if (!auth?.refresh_token) {
      // No tokens stored — nothing to reconcile
      // But if there's an access_token without refresh_token, warn about it
      if (auth?.access_token) {
        logger.warn('Auth', 'Read.ai has access_token but no refresh_token — token will expire and not auto-renew');
        execute(
          `UPDATE integrations SET status = 'error', last_error = 'No refresh token — re-authorize with offline_access scope', updated_at = datetime('now') WHERE name = 'readai_api'`
        );
      }
      return;
    }

    // Tokens exist — ensure integration status is at least 'configured'
    const integration = queryOne("SELECT status FROM integrations WHERE name = 'readai_api'");
    if (integration?.status === 'not_configured') {
      execute(
        `UPDATE integrations SET status = 'connected', updated_at = datetime('now') WHERE name = 'readai_api'`
      );
    }

    // If access token is expired, try a silent refresh
    const expiresAt = new Date(auth.expires_at as string).getTime();
    if (Date.now() >= expiresAt - 5 * 60 * 1000) {
      logger.auth('Read.ai access token expired on startup, refreshing');
      const result = await refreshReadAiTokenInternal();
      if (result.success) {
        logger.auth('Read.ai token refreshed successfully on startup');
        execute(
          `UPDATE integrations SET status = 'connected', last_error = NULL, updated_at = datetime('now') WHERE name = 'readai_api'`
        );
      } else {
        logger.warn('Auth', 'Read.ai startup refresh failed', { error: result.message });
        // refreshReadAiTokenInternal already creates sync alerts and updates integration status
      }
    } else {
      logger.auth('Read.ai token still valid on startup');
      execute(
        `UPDATE integrations SET status = 'connected', last_error = NULL, updated_at = datetime('now') WHERE name = 'readai_api'`
      );
    }
  } catch (err) {
    logger.warn('Auth', 'Read.ai startup reconciliation error', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────

export function registerReadAiAuthHandlers(): void {

  // Open Read.ai's OAuth UI page in the default browser.
  // The /oauth/ui page is a hosted form where the user enters their
  // client_id, client_secret, and redirect_uri, then clicks "Start OAuth Flow".
  // After authorizing, the page displays the authorization code to copy.
  ipcMain.handle('readai:openAuthPage', () => {
    const { clientId } = getClientCredentials();
    if (!clientId) {
      return { success: false, message: 'READAI_CLIENT_ID is not set. Save credentials first.' };
    }

    // Pass scope with offline_access to ensure refresh token is returned
    const url = new URL(OAUTH_UI_URL);
    url.searchParams.set('scope', SCOPES);
    shell.openExternal(url.toString());
    return { success: true };
  });

  // Exchange via full curl command from Read.ai OAuth UI page
  // Parses the curl command to extract endpoint, auth header, and all -d parameters
  ipcMain.handle('readai:exchangeCurl', async (_, curlCommand: string) => {
    try {
      const parsed = parseCurlCommand(curlCommand);

      logger.auth('Read.ai parsed curl', {
        endpoint: parsed.endpoint || '(none)',
        code: parsed.code ? parsed.code.slice(0, 20) + '...' : '(none)',
        has_verifier: parsed.codeVerifier ? true : false,
        redirect: parsed.redirectUri || '(none)',
        has_auth: parsed.authHeader ? true : false,
      });

      if (!parsed.code) {
        return { success: false, message: 'Could not find authorization code. Paste the code in the Authorization Code field and the curl command in the Curl Command field.' };
      }

      const body: Record<string, string> = {
        grant_type: 'authorization_code',
        code: parsed.code,
        redirect_uri: parsed.redirectUri || REDIRECT_URI,
      };
      if (parsed.codeVerifier) body.code_verifier = parsed.codeVerifier;

      const authHeader = parsed.authHeader || getBasicAuthHeader();
      const endpoint = parsed.endpoint || TOKEN_ENDPOINT;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { success: false, message: `Token exchange failed (${res.status}): ${errBody}` };
      }

      const tokens = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 600) * 1000).toISOString();

      if (!tokens.refresh_token) {
        logger.warn('Auth', 'Read.ai token exchange did not return refresh_token — offline_access scope may be missing');
      }

      let email: string | null = null;
      try {
        const userRes = await fetch(USERINFO_ENDPOINT, {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        });
        if (userRes.ok) {
          const userInfo = await userRes.json() as { email?: string };
          email = userInfo.email || null;
        }
      } catch { /* non-fatal */ }

      execute(
        `INSERT INTO readai_auth (id, access_token, refresh_token, expires_at, email, scope, authorized_at, last_refreshed, updated_at)
         VALUES ('default', ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = COALESCE(excluded.refresh_token, readai_auth.refresh_token),
           expires_at = excluded.expires_at,
           email = COALESCE(excluded.email, readai_auth.email),
           scope = excluded.scope,
           authorized_at = COALESCE(readai_auth.authorized_at, datetime('now')),
           last_refreshed = datetime('now'),
           updated_at = datetime('now')`,
        [tokens.access_token, tokens.refresh_token ?? null, expiresAt, email, tokens.scope || SCOPES]
      );

      const now = new Date().toISOString();
      execute(
        `UPDATE integrations SET status = 'connected', last_tested_at = ?, last_error = NULL, updated_at = ? WHERE name = 'readai_api'`,
        [now, now]
      );

      logger.auth('Read.ai authorized via curl exchange', { email: email || 'unknown', has_refresh: !!tokens.refresh_token });
      return { success: true, message: `Authorized${email ? ' as ' + email : ''}`, email };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Exchange authorization code for tokens
  // Accepts optional code_verifier for PKCE (required by Read.ai's OAuth UI flow)
  ipcMain.handle('readai:exchangeCode', async (_, code: string, codeVerifier?: string) => {
    try {
      const body: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      };
      if (codeVerifier) body.code_verifier = codeVerifier;

      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': getBasicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { success: false, message: `Token exchange failed (${res.status}): ${errBody}` };
      }

      const tokens = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 600) * 1000).toISOString();

      if (!tokens.refresh_token) {
        logger.warn('Auth', 'Read.ai code exchange did not return refresh_token — offline_access scope may be missing');
      }

      // Try to get user email from userinfo
      let email: string | null = null;
      try {
        const userRes = await fetch(USERINFO_ENDPOINT, {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        });
        if (userRes.ok) {
          const userInfo = await userRes.json() as { email?: string };
          email = userInfo.email || null;
        }
      } catch {
        // Non-fatal — email is nice-to-have
      }

      // Store tokens in DB — COALESCE keeps existing refresh_token if new one not provided
      execute(
        `INSERT INTO readai_auth (id, access_token, refresh_token, expires_at, email, scope, authorized_at, last_refreshed, updated_at)
         VALUES ('default', ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = COALESCE(excluded.refresh_token, readai_auth.refresh_token),
           expires_at = excluded.expires_at,
           email = COALESCE(excluded.email, readai_auth.email),
           scope = excluded.scope,
           authorized_at = COALESCE(readai_auth.authorized_at, datetime('now')),
           last_refreshed = datetime('now'),
           updated_at = datetime('now')`,
        [tokens.access_token, tokens.refresh_token ?? null, expiresAt, email, tokens.scope || SCOPES]
      );

      // Update integration status
      const now = new Date().toISOString();
      execute(
        `UPDATE integrations SET status = 'connected', last_tested_at = ?, last_error = NULL, updated_at = ? WHERE name = 'readai_api'`,
        [now, now]
      );

      logger.auth('Read.ai authorized via code exchange', { email: email || 'unknown', has_refresh: !!tokens.refresh_token });
      return { success: true, message: `Authorized${email ? ' as ' + email : ''}`, email };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Refresh token
  ipcMain.handle('readai:refreshToken', async () => {
    try {
      return await refreshReadAiTokenInternal();
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // Get auth status for the UI
  ipcMain.handle('readai:getAuthStatus', () => {
    const auth = queryOne(
      'SELECT email, expires_at, authorized_at, updated_at, last_refreshed, refresh_token FROM readai_auth WHERE id = ?',
      ['default']
    );

    if (!auth) {
      return { authorized: false, email: null, expiresAt: null, isExpired: false, authorizedAt: null, lastRefreshed: null, hasRefreshToken: false };
    }

    const expiresAt = new Date(auth.expires_at as string);
    const isExpired = expiresAt < new Date();

    return {
      authorized: true,
      email: auth.email as string | null,
      expiresAt: auth.expires_at as string,
      isExpired,
      authorizedAt: auth.authorized_at as string | null,
      lastRefreshed: (auth.last_refreshed as string) ?? null,
      hasRefreshToken: !!(auth.refresh_token),
    };
  });

  // Revoke — clear stored tokens
  ipcMain.handle('readai:revoke', () => {
    execute('DELETE FROM readai_auth WHERE id = ?', ['default']);
    execute(
      `UPDATE integrations SET status = 'not_configured', last_tested_at = NULL, last_error = NULL, updated_at = datetime('now') WHERE name = 'readai_api'`
    );
    return { success: true };
  });

  // Test connection
  ipcMain.handle('readai:testConnection', async () => {
    return testReadAiOAuthConnection();
  });
}
