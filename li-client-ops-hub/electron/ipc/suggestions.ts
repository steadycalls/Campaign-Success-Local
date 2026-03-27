import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { runSuggestionEngine } from '../../sync/matching/suggestionEngine';
import { pushSuggestionNote, buildSuggestionNoteBody } from '../../sync/matching/ghlWriteBack';
import { randomUUID } from 'crypto';

export function registerSuggestionHandlers(): void {
  // ── List suggestions with filters ─────────────────────────────────
  ipcMain.handle('suggestions:getAll', (_e, filters?: {
    status?: string; linkType?: string; companyId?: string; minConfidence?: number; limit?: number;
  }) => {
    let sql = `
      SELECT sl.*,
        CASE sl.source_type
          WHEN 'company' THEN (SELECT name FROM companies WHERE id = sl.source_id)
          WHEN 'contact' THEN (SELECT first_name || ' ' || last_name FROM contacts WHERE id = sl.source_id)
          ELSE sl.source_id
        END as source_name,
        CASE sl.target_type
          WHEN 'company' THEN (SELECT name FROM companies WHERE id = sl.target_id)
          WHEN 'contact' THEN (SELECT first_name || ' ' || last_name FROM contacts WHERE id = sl.target_id)
          WHEN 'meeting' THEN (SELECT title FROM meetings WHERE id = sl.target_id)
          WHEN 'teamwork' THEN (SELECT name FROM teamwork_projects WHERE id = sl.target_id)
          WHEN 'kinsta' THEN (SELECT display_name FROM kinsta_sites WHERE id = sl.target_id)
          WHEN 'discord' THEN (SELECT name FROM discord_channels WHERE id = sl.target_id)
          ELSE sl.target_id
        END as target_name
      FROM suggested_links sl WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.status) { sql += ' AND sl.status = ?'; params.push(filters.status); }
    if (filters?.linkType) { sql += ' AND sl.link_type = ?'; params.push(filters.linkType); }
    if (filters?.companyId) {
      sql += " AND (sl.source_id = ? OR sl.target_id = ?)";
      params.push(filters.companyId, filters.companyId);
    }
    if (filters?.minConfidence) { sql += ' AND sl.confidence >= ?'; params.push(filters.minConfidence); }

    sql += ' ORDER BY sl.confidence DESC';
    if (filters?.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }

    return queryAll(sql, params);
  });

  // ── Suggestions for a company ─────────────────────────────────────
  ipcMain.handle('suggestions:getForCompany', (_e, companyId: string) => {
    return queryAll(`
      SELECT sl.*,
        CASE sl.target_type
          WHEN 'contact' THEN (SELECT first_name || ' ' || last_name FROM contacts WHERE id = sl.target_id)
          WHEN 'meeting' THEN (SELECT title FROM meetings WHERE id = sl.target_id)
          WHEN 'teamwork' THEN (SELECT name FROM teamwork_projects WHERE id = sl.target_id)
          WHEN 'kinsta' THEN (SELECT display_name FROM kinsta_sites WHERE id = sl.target_id)
          WHEN 'discord' THEN (SELECT name FROM discord_channels WHERE id = sl.target_id)
          ELSE sl.target_id
        END as target_name
      FROM suggested_links sl
      WHERE sl.source_id = ? AND sl.source_type = 'company' AND sl.status = 'pending'
      ORDER BY sl.confidence DESC
    `, [companyId]);
  });

  // ── Suggestions for a contact ─────────────────────────────────────
  ipcMain.handle('suggestions:getForContact', (_e, contactId: string) => {
    return queryAll(`
      SELECT sl.*,
        CASE WHEN sl.source_type = 'contact' THEN
          CASE sl.target_type
            WHEN 'meeting' THEN (SELECT title FROM meetings WHERE id = sl.target_id)
            WHEN 'company' THEN (SELECT name FROM companies WHERE id = sl.target_id)
            ELSE sl.target_id
          END
        ELSE
          (SELECT name FROM companies WHERE id = sl.source_id)
        END as target_name
      FROM suggested_links sl
      WHERE (sl.source_id = ? OR sl.target_id = ?) AND sl.status = 'pending'
      ORDER BY sl.confidence DESC
    `, [contactId, contactId]);
  });

  // ── Counts ────────────────────────────────────────────────────────
  ipcMain.handle('suggestions:getCounts', () => {
    const total = queryOne("SELECT COUNT(*) as cnt FROM suggested_links WHERE status = 'pending'");
    const byType = queryAll(
      "SELECT link_type, COUNT(*) as cnt FROM suggested_links WHERE status = 'pending' GROUP BY link_type"
    );
    const typeMap: Record<string, number> = {};
    for (const r of byType) typeMap[r.link_type as string] = r.cnt as number;
    return { total: (total?.cnt as number) || 0, pending: (total?.cnt as number) || 0, byType: typeMap };
  });

  // ── Accept ────────────────────────────────────────────────────────
  ipcMain.handle('suggestions:accept', (_e, suggestionId: string) => {
    const suggestion = queryOne('SELECT * FROM suggested_links WHERE id = ?', [suggestionId]);
    if (!suggestion) return { success: false, error: 'Suggestion not found' };

    const linkType = suggestion.link_type as string;

    // Create the real link based on type
    if (linkType === 'company_contact') {
      // Link contact to company
      execute('UPDATE contacts SET company_id = ? WHERE id = ?', [suggestion.source_id, suggestion.target_id]);
    } else if (linkType === 'company_meeting') {
      // Link meeting to company
      execute("UPDATE meetings SET company_id = ?, match_method = 'auto_suggestion' WHERE id = ?",
        [suggestion.source_id, suggestion.target_id]);
    } else if (linkType === 'contact_meeting') {
      // Link meeting to the contact's company
      const contact = queryOne('SELECT company_id FROM contacts WHERE id = ?', [suggestion.source_id]);
      if (contact?.company_id) {
        execute("UPDATE meetings SET company_id = ?, match_method = 'auto_suggestion' WHERE id = ?",
          [contact.company_id, suggestion.target_id]);
      }
    } else if (['company_teamwork', 'company_kinsta', 'company_gdrive', 'company_discord'].includes(linkType)) {
      // Create entity_link
      const platform = linkType.replace('company_', '');
      const existing = queryOne(
        'SELECT id FROM entity_links WHERE company_id = ? AND platform = ? AND platform_id = ?',
        [suggestion.source_id, platform, suggestion.target_id]
      );
      if (!existing) {
        const targetName = queryOne(`
          SELECT COALESCE(
            (SELECT name FROM teamwork_projects WHERE id = ?),
            (SELECT display_name FROM kinsta_sites WHERE id = ?),
            (SELECT name FROM discord_channels WHERE id = ?),
            ?
          ) as name
        `, [suggestion.target_id, suggestion.target_id, suggestion.target_id, suggestion.target_id]);

        execute(
          `INSERT INTO entity_links (id, company_id, platform, platform_id, platform_name, match_type, confidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'auto_suggestion', ?, datetime('now'), datetime('now'))`,
          [randomUUID(), suggestion.source_id, platform, suggestion.target_id,
           (targetName?.name as string) ?? '', suggestion.confidence]
        );
      }
    }

    execute("UPDATE suggested_links SET status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [suggestionId]);

    return { success: true };
  });

  // ── Dismiss ───────────────────────────────────────────────────────
  ipcMain.handle('suggestions:dismiss', (_e, suggestionId: string) => {
    execute("UPDATE suggested_links SET status = 'dismissed', dismissed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [suggestionId]);
    return { success: true };
  });

  // ── Push to GHL ───────────────────────────────────────────────────
  ipcMain.handle('suggestions:pushToGHL', async (_e, suggestionId: string) => {
    const suggestion = queryOne('SELECT * FROM suggested_links WHERE id = ?', [suggestionId]);
    if (!suggestion) return { success: false, error: 'Suggestion not found' };

    // First accept the suggestion
    const acceptResult = await (ipcMain as any)._events['suggestions:accept']?.(null, suggestionId);

    // Find the contact's GHL ID and company PIT
    let ghlContactId: string | null = null;
    let pit: string | null = null;
    let companyId: string | null = null;
    let targetName = 'Unknown';

    if (suggestion.link_type === 'company_contact') {
      const contact = queryOne('SELECT ghl_contact_id FROM contacts WHERE id = ?', [suggestion.target_id]);
      ghlContactId = (contact?.ghl_contact_id as string) ?? null;
      companyId = suggestion.source_id as string;
      const company = queryOne('SELECT pit_token, name FROM companies WHERE id = ?', [companyId]);
      pit = (company?.pit_token as string) ?? null;
      targetName = (company?.name as string) ?? 'Unknown';
    }

    if (!ghlContactId || !pit) {
      return { success: false, error: 'Cannot push: missing GHL contact ID or PIT token' };
    }

    const noteBody = buildSuggestionNoteBody(suggestion, targetName);
    const writeResult = await pushSuggestionNote(ghlContactId, noteBody, pit, companyId ?? undefined);

    if (writeResult.success) {
      execute(
        "UPDATE suggested_links SET status = 'pushed_to_ghl', pushed_at = datetime('now'), push_detail = ?, updated_at = datetime('now') WHERE id = ?",
        [JSON.stringify(writeResult), suggestionId]
      );
    }

    return { success: writeResult.success, writeResult };
  });

  // ── Bulk accept ───────────────────────────────────────────────────
  ipcMain.handle('suggestions:acceptBulk', async (_e, ids: string[]) => {
    let accepted = 0;
    for (const id of ids) {
      try {
        execute("UPDATE suggested_links SET status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
        accepted++;
      } catch { /* skip */ }
    }
    return { accepted, errors: ids.length - accepted };
  });

  // ── Bulk dismiss ──────────────────────────────────────────────────
  ipcMain.handle('suggestions:dismissBulk', (_e, ids: string[]) => {
    let dismissed = 0;
    for (const id of ids) {
      execute("UPDATE suggested_links SET status = 'dismissed', dismissed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
      dismissed++;
    }
    return { dismissed };
  });

  // ── Run engine manually ───────────────────────────────────────────
  ipcMain.handle('suggestions:runEngine', () => {
    return runSuggestionEngine();
  });
}
