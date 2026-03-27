import { queryOne, execute } from '../db/client';
import { refreshGoogleToken } from '../sync/adapters/gdrive-auth';
import { delay } from '../sync/utils/rateLimit';
import { logger } from '../lib/logger';

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

// ── Token management (reuses google_auth table from Drive/Calendar) ──

export async function getValidAccessToken(): Promise<string> {
  const auth = queryOne(
    'SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?',
    ['default']
  );

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error('Google not authorized. Go to Settings > Integrations to authorize.');
  }

  const expiresAt = new Date(auth.expires_at as string).getTime();
  if (Date.now() >= expiresAt - 300_000) {
    const clientId = process.env['GOOGLE_CLIENT_ID'] || '';
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';
    const refreshed = await refreshGoogleToken(clientId, clientSecret, auth.refresh_token as string);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    execute(
      `UPDATE google_auth SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = 'default'`,
      [refreshed.access_token, newExpiresAt]
    );
    return refreshed.access_token;
  }

  return auth.access_token as string;
}

// ── GSC API helpers ──────────────────────────────────────────────────

async function gscFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getValidAccessToken();
  const url = `${GSC_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 429) {
    logger.warn('GSC', 'Rate limited, retrying in 5s', { path });
    await delay(5000);
    return gscFetch(path, options);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '[unreadable]');
    throw new Error(`GSC API ${res.status} at ${path}: ${text.slice(0, 500)}`);
  }

  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────

export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
}

export async function getGscProperties(): Promise<GscProperty[]> {
  const data = await gscFetch<{ siteEntry?: GscProperty[] }>('/sites');
  return data.siteEntry ?? [];
}

export interface GscRow {
  keys: string[];       // [query] or [query, page] depending on dimensions
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsOptions {
  startDate: string;    // YYYY-MM-DD
  endDate: string;      // YYYY-MM-DD
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
}

export async function getSearchAnalytics(
  siteUrl: string,
  options: SearchAnalyticsOptions
): Promise<GscRow[]> {
  const body = {
    startDate: options.startDate,
    endDate: options.endDate,
    dimensions: options.dimensions ?? ['query', 'page'],
    rowLimit: options.rowLimit ?? 5000,
    startRow: options.startRow ?? 0,
  };

  const encodedSite = encodeURIComponent(siteUrl);
  const data = await gscFetch<{ rows?: GscRow[] }>(
    `/sites/${encodedSite}/searchAnalytics/query`,
    { method: 'POST', body: JSON.stringify(body) }
  );

  return data.rows ?? [];
}

/**
 * Fetch all keywords from GSC for a given date range.
 * Paginates automatically if more than 5000 rows.
 */
export async function queryAllKeywords(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }>> {
  const allRows: GscRow[] = [];
  let startRow = 0;
  const limit = 5000;

  while (true) {
    const rows = await getSearchAnalytics(siteUrl, {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: limit,
      startRow,
    });

    allRows.push(...rows);
    if (rows.length < limit) break;
    startRow += limit;
    await delay(200);
  }

  return allRows.map(r => ({
    query: r.keys[0],
    page: r.keys[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}
