import { ipcMain, BrowserWindow } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { syncGmail, getGmailStats } from '../../sync/adapters/gmail';
import { randomUUID } from 'crypto';

function sendGmailProgress(data: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('gmail:syncProgress', data);
  }
}

export function registerGmailHandlers(): void {
  // ── Sync Gmail ────────────────────────────────────────────────────
  ipcMain.handle('gmail:sync', async (_e, sinceDays?: number, accountId?: string) => {
    try {
      const aid = accountId ?? 'default';
      const authRow = queryOne('SELECT email FROM google_auth WHERE id = ?', [aid]);
      const accountEmail = (authRow?.email as string) ?? aid;

      sendGmailProgress({ phase: 'starting', accountEmail, percent: 0, fetched: 0, created: 0 });

      const result = await syncGmail(sinceDays ?? 30, aid, (progress) => {
        sendGmailProgress({ phase: 'syncing', accountEmail, ...progress });
      });

      sendGmailProgress({ phase: 'complete', accountEmail, percent: 100, fetched: result.found, created: result.created });
      return { success: true, ...result };
    } catch (err: unknown) {
      sendGmailProgress({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Get emails for a company ──────────────────────────────────────
  ipcMain.handle('gmail:getForCompany', (_e, companyId: string) => {
    return queryAll(`
      SELECT id, thread_id, subject, from_email, from_name, to_emails, date, snippet,
        direction, has_attachments, match_method
      FROM gmail_messages
      WHERE company_id = ?
      ORDER BY date DESC LIMIT 200
    `, [companyId]);
  });

  // ── Get thread ────────────────────────────────────────────────────
  ipcMain.handle('gmail:getThread', (_e, threadId: string) => {
    return queryAll(`
      SELECT id, subject, from_email, from_name, to_emails, cc_emails, date,
        body_text, direction, has_attachments, attachment_meta
      FROM gmail_messages
      WHERE thread_id = ?
      ORDER BY date ASC
    `, [threadId]);
  });

  // ── Get unmatched emails ──────────────────────────────────────────
  ipcMain.handle('gmail:getUnmatched', (_e, limit?: number) => {
    return queryAll(`
      SELECT id, subject, from_email, from_name, to_emails, date, snippet, direction
      FROM gmail_messages
      WHERE company_id IS NULL
      ORDER BY date DESC LIMIT ?
    `, [limit ?? 50]);
  });

  // ── Link email to company ─────────────────────────────────────────
  ipcMain.handle('gmail:linkToCompany', (_e, emailId: string, companyId: string) => {
    execute("UPDATE gmail_messages SET company_id = ?, match_method = 'manual' WHERE id = ?", [companyId, emailId]);
    const existing = queryOne(
      'SELECT id FROM email_company_links WHERE email_id = ? AND company_id = ?',
      [emailId, companyId]
    );
    if (!existing) {
      execute(
        'INSERT INTO email_company_links (id, email_id, company_id, match_field) VALUES (?, ?, ?, ?)',
        [randomUUID(), emailId, companyId, 'manual']
      );
    }
    return { success: true };
  });

  // ── Get all emails (paginated) ──────────────────────────────────────
  ipcMain.handle('gmail:getAll', (_e, limit?: number, offset?: number) => {
    return queryAll(`
      SELECT gm.id, gm.thread_id, gm.subject, gm.from_email, gm.from_name,
        gm.to_emails, gm.date, gm.snippet, gm.direction,
        gm.has_attachments, gm.company_id, gm.match_method,
        co.name as company_name
      FROM gmail_messages gm
      LEFT JOIN companies co ON co.id = gm.company_id
      ORDER BY gm.date DESC
      LIMIT ? OFFSET ?
    `, [limit ?? 200, offset ?? 0]);
  });

  // ── Stats ─────────────────────────────────────────────────────────
  ipcMain.handle('gmail:getStats', () => {
    return getGmailStats();
  });
}
