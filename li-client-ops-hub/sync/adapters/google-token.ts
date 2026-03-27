/**
 * Unified Google token provider.
 *
 * All sync adapters (Drive, Gmail, Calendar) call getGoogleToken() instead
 * of managing their own tokens. This module transparently handles both modes:
 *
 *   1. Service Account (preferred) — JWT signing via google-service-account.ts,
 *      supports user impersonation for domain-wide delegation.
 *   2. OAuth (fallback) — reads tokens from google_auth table, auto-refreshes
 *      using gdrive-auth.ts.
 */

import { queryOne, execute } from '../../db/client';
import { refreshGoogleToken } from './gdrive-auth';
import {
  isServiceAccountMode,
  getDriveTokenAs,
  getGmailTokenAs,
  getCalendarTokenAs,
} from './google-service-account';

type GoogleService = 'drive' | 'gmail' | 'calendar';

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

/**
 * Get a valid Google access token for the given service.
 *
 * @param service - Which Google API to authenticate for
 * @param userEmail - (Service Account mode only) Email of user to impersonate.
 *   In OAuth mode this is used as the account ID (defaults to 'default').
 */
export async function getGoogleToken(
  service: GoogleService,
  userEmail?: string
): Promise<string> {
  // ── Mode 1: Service Account (JWT, no per-user auth needed) ────────
  if (isServiceAccountMode()) {
    switch (service) {
      case 'drive':    return getDriveTokenAs(userEmail);
      case 'gmail':    return getGmailTokenAs(userEmail ?? getDefaultEmail());
      case 'calendar': return getCalendarTokenAs(userEmail ?? getDefaultEmail());
    }
  }

  // ── Mode 2: OAuth (per-user tokens in google_auth table) ──────────
  const accountId = userEmail || 'default';
  const auth = queryOne(
    'SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?',
    [accountId]
  );

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error(
      'Google not authorized. Go to Settings > Google to set up authentication.'
    );
  }

  // Auto-refresh if expired or within 5-minute buffer
  const expiresAt = new Date(auth.expires_at as string).getTime();
  if (Date.now() >= expiresAt - 300_000) {
    const clientId = getEnvValue('GOOGLE_CLIENT_ID');
    const clientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');
    const refreshed = await refreshGoogleToken(
      clientId,
      clientSecret,
      auth.refresh_token as string
    );
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    execute(
      `UPDATE google_auth SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [refreshed.access_token, newExpiresAt, accountId]
    );
    return refreshed.access_token;
  }

  return auth.access_token as string;
}

/**
 * Check if any Google auth mode is configured and ready.
 */
export function isGoogleAuthorized(): boolean {
  if (isServiceAccountMode()) return true;
  const auth = queryOne(
    "SELECT access_token FROM google_auth WHERE id = 'default'"
  );
  return !!auth?.access_token;
}

/** Get the email of the default OAuth account (for fallback in service account mode). */
function getDefaultEmail(): string {
  // In service account mode, we need an email to impersonate for Gmail/Calendar.
  // Use the service account admin email.
  const admin = queryOne("SELECT value FROM app_state WHERE key = 'service_account_admin_email'");
  if (admin?.value) return admin.value as string;

  // Fall back to OAuth default account email
  const auth = queryOne("SELECT email FROM google_auth WHERE id = 'default'");
  if (auth?.email) return auth.email as string;

  throw new Error('No Google account configured. Go to Settings > Google to set up authentication.');
}
