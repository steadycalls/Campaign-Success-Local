import { queryAll, queryOne, execute } from '../../db/client';
import { getDirectoryToken, getServiceAccountAdminEmail } from './google-service-account';
import { delay } from '../utils/rateLimit';
import { logger } from '../../lib/logger';

const DIRECTORY_BASE = 'https://admin.googleapis.com';

/**
 * Discover all user mailboxes in the Google Workspace org.
 * Requires service account with admin.directory.user.readonly scope.
 */
export async function discoverTeamMailboxes(): Promise<{ discovered: number }> {
  const adminEmail = getServiceAccountAdminEmail();
  if (!adminEmail) throw new Error('Service account admin email not configured');

  const domain = adminEmail.split('@')[1];
  if (!domain) throw new Error('Cannot extract domain from admin email');

  const token = await getDirectoryToken();
  let discovered = 0;
  let pageToken: string | null = null;

  while (true) {
    let url = `${DIRECTORY_BASE}/admin/directory/v1/users?domain=${encodeURIComponent(domain)}&projection=basic&maxResults=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Directory API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json() as {
      users?: Array<{ primaryEmail: string; name?: { fullName?: string } }>;
      nextPageToken?: string;
    };

    for (const user of data.users ?? []) {
      if (!user.primaryEmail) continue;

      const existing = queryOne('SELECT email FROM team_mailboxes WHERE email = ?', [user.primaryEmail]);
      if (existing) {
        execute(
          "UPDATE team_mailboxes SET name = ?, synced_at = datetime('now') WHERE email = ?",
          [user.name?.fullName ?? null, user.primaryEmail]
        );
      } else {
        execute(
          "INSERT INTO team_mailboxes (email, name, is_active, synced_at) VALUES (?, ?, 1, datetime('now'))",
          [user.primaryEmail, user.name?.fullName ?? null]
        );
      }
      discovered++;
    }

    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
    await delay(200);
  }

  logger.sync('Team mailboxes discovered', { discovered, domain });
  return { discovered };
}

/**
 * Check if team discovery is stale (>24h since last run).
 */
export function isTeamDiscoveryStale(): boolean {
  const row = queryOne("SELECT value FROM app_state WHERE key = 'team_discovery_last_run'");
  if (!row?.value) return true;
  const lastRun = new Date(row.value as string).getTime();
  return Date.now() - lastRun > 24 * 60 * 60 * 1000;
}

export function markTeamDiscoveryRun(): void {
  execute(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('team_discovery_last_run', datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')`,
    []
  );
}
