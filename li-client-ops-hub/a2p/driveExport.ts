import { queryOne, queryAll, execute } from '../db/client';
import { refreshGoogleToken } from '../sync/adapters/gdrive-auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';

// ── Token management (mirrors gdrive adapter pattern) ───────────────

async function getValidAccessToken(): Promise<string> {
  const auth = queryOne(
    'SELECT access_token, refresh_token, expires_at FROM google_auth WHERE id = ?',
    ['default']
  );

  if (!auth?.access_token || !auth?.refresh_token) {
    throw new Error('Google Drive not authorized. Go to Settings > Integrations to authorize.');
  }

  const expiresAt = new Date(auth.expires_at as string).getTime();
  const now = Date.now();

  if (now >= expiresAt - 300_000) {
    const clientId = process.env['GOOGLE_CLIENT_ID'] || '';
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';

    const refreshed = await refreshGoogleToken(clientId, clientSecret, auth.refresh_token as string);
    const newExpiresAt = new Date(now + refreshed.expires_in * 1000).toISOString();

    execute(
      `UPDATE google_auth SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = 'default'`,
      [refreshed.access_token, newExpiresAt]
    );

    return refreshed.access_token;
  }

  return auth.access_token as string;
}

// ── Folder lookup ───────────────────────────────────────────────────

function getClientDriveFolder(companyId: string): { folderId: string; folderName: string } | null {
  // Check entity_links for a Drive folder association
  const link = queryOne(
    `SELECT platform_id, platform_name FROM entity_links WHERE company_id = ? AND platform = 'gdrive' LIMIT 1`,
    [companyId]
  );
  if (link) return { folderId: link.platform_id as string, folderName: link.platform_name as string };

  // Fallback: check drive_folders table
  const folder = queryOne(
    `SELECT drive_folder_id, name FROM drive_folders WHERE company_id = ? LIMIT 1`,
    [companyId]
  );
  if (folder) return { folderId: folder.drive_folder_id as string, folderName: folder.name as string };

  return null;
}

// ── Create or find A2P subfolder ────────────────────────────────────

async function getOrCreateA2PSubfolder(parentFolderId: string, token: string): Promise<string> {
  // Check if "A2P Compliance" subfolder already exists
  const searchUrl = new URL(`${DRIVE_API}/files`);
  searchUrl.searchParams.set('q', `'${parentFolderId}' in parents and name = 'A2P Compliance' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  searchUrl.searchParams.set('fields', 'files(id, name)');

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (searchRes.ok) {
    const data = await searchRes.json() as { files?: Array<{ id: string }> };
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create the subfolder
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'A2P Compliance',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!createRes.ok) throw new Error(`Failed to create A2P folder: ${createRes.status}`);
  const folder = await createRes.json() as { id: string };
  return folder.id;
}

// ── Create Google Doc from Markdown ─────────────────────────────────

async function createGoogleDoc(
  title: string,
  markdownContent: string,
  parentFolderId: string,
  token: string,
): Promise<{ fileId: string; webViewLink: string }> {
  // Create the Google Doc
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentFolderId],
    }),
  });

  if (!createRes.ok) throw new Error(`Failed to create doc: ${createRes.status}`);
  const docMeta = await createRes.json() as { id: string };
  const fileId = docMeta.id;

  // Insert content
  const updateRes = await fetch(`${DOCS_API}/documents/${fileId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        insertText: {
          location: { index: 1 },
          text: markdownContent,
        },
      }],
    }),
  });

  if (!updateRes.ok) {
    console.error('[A2P] Doc content insert failed:', await updateRes.text().catch(() => ''));
  }

  // Get web view link
  const getRes = await fetch(`${DRIVE_API}/files/${fileId}?fields=webViewLink`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const fileData = await getRes.json() as { webViewLink?: string };

  return {
    fileId,
    webViewLink: fileData.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`,
  };
}

// ── Export single content item ──────────────────────────────────────

const PAGE_TYPE_LABELS: Record<string, string> = {
  contact: 'Contact Page',
  privacy_policy: 'Privacy Policy',
  terms_of_service: 'Terms of Service',
  sms_policy: 'SMS Policy',
};

export async function exportContentToDrive(contentId: string): Promise<{ fileId: string; url: string }> {
  const content = queryOne('SELECT * FROM a2p_generated_content WHERE id = ?', [contentId]) as Record<string, unknown> | null;
  if (!content) throw new Error('Content not found');

  const a2p = queryOne('SELECT * FROM a2p_compliance WHERE id = ?', [content.a2p_id]) as Record<string, unknown> | null;
  if (!a2p) throw new Error('A2P record not found');

  const folder = getClientDriveFolder(content.company_id as string);
  if (!folder) {
    throw new Error(`No Google Drive folder linked for ${a2p.business_name}. Link a Drive folder first in Settings > Google Drive.`);
  }

  const token = await getValidAccessToken();
  const a2pFolderId = await getOrCreateA2PSubfolder(folder.folderId, token);

  const title = `${a2p.business_name} — ${PAGE_TYPE_LABELS[content.page_type as string] || content.page_type}`;
  const result = await createGoogleDoc(title, content.content_md as string, a2pFolderId, token);

  execute(
    `UPDATE a2p_generated_content SET
      content_status = 'exported',
      exported_to_drive = 1,
      drive_file_id = ?,
      drive_file_url = ?,
      exported_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?`,
    [result.fileId, result.webViewLink, contentId]
  );

  return { fileId: result.fileId, url: result.webViewLink };
}

// ── Export all draft content for a company ───────────────────────────

export async function exportAllContentToDrive(companyId: string): Promise<{
  exported: number;
  errors: string[];
}> {
  const contents = queryAll(
    `SELECT * FROM a2p_generated_content WHERE company_id = ? AND content_status = 'draft' ORDER BY page_type`,
    [companyId]
  ) as Array<Record<string, unknown>>;

  let exported = 0;
  const errors: string[] = [];

  for (const content of contents) {
    try {
      await exportContentToDrive(content.id as string);
      exported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${content.page_type}: ${msg}`);
    }
    await delay(1000);
  }

  return { exported, errors };
}

// ── Check if Drive folder is linked ─────────────────────────────────

export function checkDriveFolder(companyId: string): { linked: boolean; folderId?: string; folderName?: string } {
  const folder = getClientDriveFolder(companyId);
  return folder ? { linked: true, ...folder } : { linked: false };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
