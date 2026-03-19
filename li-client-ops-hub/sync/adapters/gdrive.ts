import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts, logAlert } from '../utils/logger';
import { refreshGoogleToken } from './gdrive-auth';

// ── Helpers ──────────────────────────────────────────────────────────

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ── Token management ─────────────────────────────────────────────────

async function getValidAccessToken(): Promise<string> {
  const auth = queryOne(
    'SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?',
    ['default']
  );

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error(
      'Google Drive not authorized. Go to Settings > Integrations to authorize.'
    );
  }

  // Refresh if expired or about to expire (5 min buffer)
  const expiresAt = new Date(auth.expires_at as string).getTime();
  const now = Date.now();

  if (now >= expiresAt - 300_000) {
    const clientId = getEnvValue('GOOGLE_CLIENT_ID');
    const clientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');

    const refreshed = await refreshGoogleToken(
      clientId,
      clientSecret,
      auth.refresh_token as string
    );

    const newExpiresAt = new Date(
      now + refreshed.expires_in * 1000
    ).toISOString();

    execute(
      `UPDATE google_auth SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = 'default'`,
      [refreshed.access_token, newExpiresAt]
    );

    return refreshed.access_token;
  }

  return auth.access_token as string;
}

// ── Drive API fetch ──────────────────────────────────────────────────

async function driveFetch(
  path: string,
  params?: Record<string, string>
): Promise<Record<string, unknown>> {
  const token = await getValidAccessToken();
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) {
    throw new Error(
      'Google Drive authorization expired. Re-authorize in Settings.'
    );
  }
  if (res.status === 429) throw new RateLimitError('Google Drive rate limit');
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Drive API ${res.status}: ${err}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ── Name similarity ──────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute name similarity between two strings (0-1).
 * Uses token overlap + longest common subsequence ratio.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  // Token overlap (Jaccard-like)
  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenScore = union > 0 ? intersection / union : 0;

  // Substring containment bonus
  let containmentBonus = 0;
  if (na.includes(nb) || nb.includes(na)) {
    containmentBonus = 0.3;
  }

  // LCS ratio
  const lcsLen = lcs(na, nb);
  const lcsScore = (2 * lcsLen) / (na.length + nb.length);

  return Math.min(1, Math.max(tokenScore, lcsScore) + containmentBonus);
}

function lcs(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Space-optimized LCS
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

// ── Sync client folders ──────────────────────────────────────────────

export async function syncClientFolders(): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const parentFolderId = getEnvValue('GOOGLE_DRIVE_CLIENT_FOLDER_ID');
  if (!parentFolderId)
    throw new Error('GOOGLE_DRIVE_CLIENT_FOLDER_ID not set');

  let pageToken: string | null = null;

  do {
    const params: Record<string, string> = {
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields:
        'nextPageToken, files(id, name, webViewLink, modifiedTime, createdTime, owners, shared)',
      pageSize: '100',
      orderBy: 'name',
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await driveFetch('/files', params);
    const folders = (data.files as Array<Record<string, unknown>>) || [];
    pageToken = (data.nextPageToken as string) || null;

    for (const folder of folders) {
      counts.found++;
      const driveFolderId = folder.id as string;
      const rawJson = JSON.stringify(folder);

      const existing = queryOne(
        'SELECT id FROM drive_folders WHERE drive_folder_id = ?',
        [driveFolderId]
      );

      if (existing) {
        execute(
          `UPDATE drive_folders SET
            name = ?, web_view_url = ?, modified_at = ?, created_at_drive = ?,
            owner_email = ?, shared = ?, raw_json = ?, synced_at = datetime('now'),
            updated_at = datetime('now')
          WHERE drive_folder_id = ?`,
          [
            folder.name as string,
            (folder.webViewLink as string) || null,
            (folder.modifiedTime as string) || null,
            (folder.createdTime as string) || null,
            ((folder.owners as Array<{ emailAddress?: string }>) || [])[0]
              ?.emailAddress || null,
            folder.shared ? 1 : 0,
            rawJson,
            driveFolderId,
          ]
        );
        counts.updated++;
      } else {
        const id = randomUUID();
        execute(
          `INSERT INTO drive_folders (
            id, drive_folder_id, name, web_view_url, modified_at, created_at_drive,
            owner_email, shared, raw_json, synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
          [
            id,
            driveFolderId,
            folder.name as string,
            (folder.webViewLink as string) || null,
            (folder.modifiedTime as string) || null,
            (folder.createdTime as string) || null,
            ((folder.owners as Array<{ emailAddress?: string }>) || [])[0]
              ?.emailAddress || null,
            folder.shared ? 1 : 0,
            rawJson,
          ]
        );
        counts.created++;
      }
    }

    await delay(200); // respect rate limits
  } while (pageToken);

  return counts;
}

// ── Sync files for a folder ──────────────────────────────────────────

export async function syncFolderFiles(
  driveFolderId: string,
  limit: number = 50
): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  const params: Record<string, string> = {
    q: `'${driveFolderId}' in parents and trashed = false`,
    fields:
      'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
  };

  const data = await driveFetch('/files', params);
  const files = (data.files as Array<Record<string, unknown>>) || [];

  // Look up folder's company_id
  const folder = queryOne(
    'SELECT company_id FROM drive_folders WHERE drive_folder_id = ?',
    [driveFolderId]
  );
  const companyId = (folder?.company_id as string) || null;

  for (const file of files) {
    counts.found++;
    const driveFileId = file.id as string;
    const rawJson = JSON.stringify(file);

    const existing = queryOne(
      'SELECT id FROM drive_files WHERE drive_file_id = ?',
      [driveFileId]
    );

    if (existing) {
      execute(
        `UPDATE drive_files SET
          name = ?, mime_type = ?, size_bytes = ?, modified_at = ?,
          web_view_url = ?, folder_id = ?, company_id = ?, raw_json = ?,
          synced_at = datetime('now')
        WHERE drive_file_id = ?`,
        [
          file.name as string,
          (file.mimeType as string) || null,
          file.size ? parseInt(file.size as string) : null,
          (file.modifiedTime as string) || null,
          (file.webViewLink as string) || null,
          driveFolderId,
          companyId,
          rawJson,
          driveFileId,
        ]
      );
      counts.updated++;
    } else {
      const id = randomUUID();
      execute(
        `INSERT INTO drive_files (
          id, drive_file_id, company_id, folder_id, name, mime_type, size_bytes,
          modified_at, web_view_url, raw_json, synced_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          driveFileId,
          companyId,
          driveFolderId,
          file.name as string,
          (file.mimeType as string) || null,
          file.size ? parseInt(file.size as string) : null,
          (file.modifiedTime as string) || null,
          (file.webViewLink as string) || null,
          rawJson,
        ]
      );
      counts.created++;
    }
  }

  // Update folder file count
  const fileCount = queryOne(
    'SELECT COUNT(*) as cnt FROM drive_files WHERE folder_id = ?',
    [driveFolderId]
  );

  execute(
    `UPDATE drive_folders SET file_count = ?, synced_at = datetime('now') WHERE drive_folder_id = ?`,
    [(fileCount?.cnt as number) || 0, driveFolderId]
  );

  return counts;
}

// ── Compute folder-to-company suggestions ────────────────────────────

export function computeFolderSuggestions(): void {
  const folders = queryAll(
    'SELECT id, name FROM drive_folders WHERE company_id IS NULL'
  );
  const companies = queryAll(
    "SELECT id, name FROM companies WHERE status = 'active'"
  );

  for (const folder of folders) {
    let bestMatch = { companyId: '', companyName: '', score: 0 };

    for (const company of companies) {
      const score = nameSimilarity(
        folder.name as string,
        company.name as string
      );
      if (score > bestMatch.score) {
        bestMatch = {
          companyId: company.id as string,
          companyName: company.name as string,
          score,
        };
      }
    }

    if (bestMatch.score > 0.3) {
      execute(
        `UPDATE drive_folders SET
          suggested_company_id = ?, suggested_company_name = ?,
          suggestion_score = ?, updated_at = datetime('now')
        WHERE id = ?`,
        [bestMatch.companyId, bestMatch.companyName, bestMatch.score, folder.id]
      );
    }
  }
}

// ── Test connection ──────────────────────────────────────────────────

export async function testGoogleDriveConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const parentFolderId = getEnvValue('GOOGLE_DRIVE_CLIENT_FOLDER_ID');
    if (!parentFolderId)
      return { success: false, message: 'Client Folder ID not set' };

    // Check auth
    const auth = queryOne(
      'SELECT access_token FROM google_auth WHERE id = ?',
      ['default']
    );
    if (!auth?.access_token)
      return { success: false, message: 'Not authorized. Click "Authorize Google Drive" first.' };

    // Test: get parent folder name
    const parentData = await driveFetch(`/files/${parentFolderId}`, {
      fields: 'name',
    });

    // List 1 subfolder
    const data = await driveFetch('/files', {
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      pageSize: '1',
      fields: 'files(id, name)',
    });

    const subCount = (data.files as unknown[])?.length ?? 0;

    return {
      success: true,
      message: `Connected. Folder "${parentData.name}" accessible${subCount > 0 ? ` (contains subfolders)` : ''}.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Link folder to company ───────────────────────────────────────────

export function linkFolderToCompany(
  folderId: string,
  companyId: string
): { success: boolean } {
  const folder = queryOne('SELECT * FROM drive_folders WHERE id = ?', [
    folderId,
  ]);
  if (!folder) return { success: false };

  execute('UPDATE drive_folders SET company_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [
    companyId,
    folderId,
  ]);
  execute(
    `UPDATE companies SET drive_folder_id = ?, drive_folder_url = ?, has_drive = 1, updated_at = datetime('now') WHERE id = ?`,
    [folder.drive_folder_id, folder.web_view_url, companyId]
  );
  execute('UPDATE drive_files SET company_id = ? WHERE folder_id = ?', [
    companyId,
    folder.drive_folder_id,
  ]);

  // Update drive file count on company
  const fileCount = queryOne(
    'SELECT COUNT(*) as cnt FROM drive_files WHERE company_id = ?',
    [companyId]
  );
  execute('UPDATE companies SET drive_file_count = ? WHERE id = ?', [
    (fileCount?.cnt as number) || 0,
    companyId,
  ]);

  return { success: true };
}

export function acceptFolderSuggestion(
  folderId: string
): { success: boolean } {
  const folder = queryOne('SELECT * FROM drive_folders WHERE id = ?', [
    folderId,
  ]);
  if (!folder?.suggested_company_id) return { success: false };

  return linkFolderToCompany(folderId, folder.suggested_company_id as string);
}
