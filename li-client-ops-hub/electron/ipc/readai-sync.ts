import { ipcMain } from 'electron';
import { queryAll, queryOne, execute } from '../../db/client';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';
import {
  syncReadAiMeetingsRange,
  expandMeetingDetails,
  getReadAiSyncState,
  saveReadAiSyncState,
  scheduleOvernightSync,
  getOvernightSyncPending,
  clearOvernightSync,
  getSinceDate,
  type SyncRange,
  type ReadAiSyncState,
} from '../../sync/adapters/readai';

export function registerReadAiSyncHandlers(): void {
  // ── Manual sync by range ──────────────────────────────────────────
  ipcMain.handle('readai:syncRange', async (_, range: SyncRange) => {
    const runId = logSyncStart('readai', 'manual');
    try {
      const sinceDate = getSinceDate(range);
      const maxPages = range === 'year' ? 500 : range === 'quarter' ? 200 : range === 'month' ? 100 : 50;

      let totalFetched = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let cursor: string | null = null;
      let hasMore = true;
      let oldestFetched: string | null = null;
      let newestFetched: string | null = null;

      while (hasMore) {
        const batchSize = Math.min(50, maxPages - Math.floor(totalFetched / 10));
        if (batchSize <= 0) break;

        const batch = await syncReadAiMeetingsRange({ sinceDate, cursor, maxPages: batchSize });
        totalFetched += batch.fetched;
        totalCreated += batch.created;
        totalUpdated += batch.updated;
        cursor = batch.cursor;
        hasMore = batch.hasMore;
        if (batch.oldestFetched && (!oldestFetched || batch.oldestFetched < oldestFetched)) oldestFetched = batch.oldestFetched;
        if (batch.newestFetched && (!newestFetched || batch.newestFetched > newestFetched)) newestFetched = batch.newestFetched;
        if (!hasMore) break;
      }

      const result = { fetched: totalFetched, created: totalCreated, updated: totalUpdated, cursor, hasMore, oldestFetched, newestFetched };

      // Pass 2: Expand newly synced meetings to get summaries + transcripts
      let expanded = 0;
      if (totalFetched > 0) {
        let batch;
        do {
          batch = await expandMeetingDetails(20);
          expanded += batch.updated;
        } while (batch.found > 0);
      }

      const state = getReadAiSyncState();
      state.lastSyncAt = new Date().toISOString();
      const totalRow = queryOne('SELECT COUNT(*) as cnt FROM meetings');
      state.totalMeetingsSynced = (totalRow?.cnt as number) || 0;
      if (result.oldestFetched && (!state.oldestMeetingSynced || result.oldestFetched < state.oldestMeetingSynced)) {
        state.oldestMeetingSynced = result.oldestFetched;
      }
      if (result.newestFetched && (!state.newestMeetingSynced || result.newestFetched > state.newestMeetingSynced)) {
        state.newestMeetingSynced = result.newestFetched;
      }
      saveReadAiSyncState(state);

      logSyncEnd(runId, 'success', { found: totalFetched, created: totalCreated, updated: totalUpdated });

      return {
        success: true,
        scheduled: false,
        message: `Synced ${result.fetched} meetings (${result.created} new, ${result.updated} updated). Expanded ${expanded} with summaries/transcripts.`,
        ...result,
      };
    } catch (err: unknown) {
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Get sync state for UI ─────────────────────────────────────────
  ipcMain.handle('readai:getSyncState', () => {
    return getReadAiSyncState();
  });

  // ── Get overnight sync status ─────────────────────────────────────
  ipcMain.handle('readai:getOvernightStatus', () => {
    return getOvernightSyncPending();
  });

  // ── Cancel overnight sync ─────────────────────────────────────────
  ipcMain.handle('readai:cancelOvernight', () => {
    clearOvernightSync();
    return { success: true };
  });

  // ── Force run historical sync now (bypass overnight check) ────────
  ipcMain.handle('readai:syncHistoricalNow', async (_, range: SyncRange) => {
    const runId = logSyncStart('readai_historical', 'manual');
    try {
      const sinceDate = getSinceDate(range);
      const state = getReadAiSyncState();

      const maxPages = range === 'year' ? 500 : range === 'quarter' ? 200 : 50;

      let totalFetched = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let cursor = state.historicalSyncCursor;
      let hasMore = true;

      while (hasMore) {
        const batchSize = Math.min(50, maxPages - totalFetched / 10);
        if (batchSize <= 0) break;

        const result = await syncReadAiMeetingsRange({
          sinceDate,
          cursor,
          maxPages: batchSize,
        });

        totalFetched += result.fetched;
        totalCreated += result.created;
        totalUpdated += result.updated;
        cursor = result.cursor;
        hasMore = result.hasMore;

        state.historicalSyncCursor = hasMore ? cursor : null;
        state.lastSyncAt = new Date().toISOString();
        const totalRow = queryOne('SELECT COUNT(*) as cnt FROM meetings');
        state.totalMeetingsSynced = (totalRow?.cnt as number) || 0;
        if (result.oldestFetched && (!state.oldestMeetingSynced || result.oldestFetched < state.oldestMeetingSynced)) {
          state.oldestMeetingSynced = result.oldestFetched;
        }
        if (result.newestFetched && (!state.newestMeetingSynced || result.newestFetched > state.newestMeetingSynced)) {
          state.newestMeetingSynced = result.newestFetched;
        }
        saveReadAiSyncState(state);

        if (!hasMore) state.historicalSyncComplete = true;
      }

      saveReadAiSyncState(state);

      let expanded = 0;
      if (totalFetched > 0) {
        let batch;
        do {
          batch = await expandMeetingDetails(20);
          expanded += batch.updated;
        } while (batch.found > 0);
      }

      logSyncEnd(runId, 'success', { found: totalFetched, created: totalCreated, updated: totalUpdated });

      return {
        success: true,
        fetched: totalFetched,
        created: totalCreated,
        updated: totalUpdated,
        cursor,
        hasMore,
        message: `Synced ${totalFetched} meetings (${totalCreated} new, ${totalUpdated} updated). Expanded ${expanded} with summaries/transcripts.`,
      };
    } catch (err: unknown) {
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Paginated meetings list for table ─────────────────────────────
  ipcMain.handle('readai:getMeetingsList', (_, limit: number = 50, offset: number = 0) => {
    return queryAll(`
      SELECT
        m.id, m.readai_meeting_id, m.title, m.meeting_date, m.start_time_ms, m.end_time_ms,
        m.duration_minutes, m.participants_count, m.attended_count, m.summary, m.report_url,
        m.read_score, m.sentiment, m.engagement, m.expanded, m.transcript_text,
        m.company_id, m.owner_name, m.owner_email, m.platform, m.synced_at, m.participants_json,
        m.topics_json, m.key_questions_json, m.action_items_json, m.chapter_summaries_json,
        c.name AS company_name, c.ghl_location_id
      FROM meetings m
      LEFT JOIN companies c ON m.company_id = c.id
      ORDER BY COALESCE(m.start_time_ms, 0) DESC, m.meeting_date DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  });

  // ── Get transcript text for copy-to-clipboard ─────────────────────
  ipcMain.handle('readai:getTranscript', (_, meetingId: string) => {
    const meeting = queryOne(
      'SELECT transcript_text, transcript_json FROM meetings WHERE id = ?',
      [meetingId]
    );

    if (meeting?.transcript_text) return meeting.transcript_text as string;

    if (meeting?.transcript_json) {
      try {
        const json = JSON.parse(meeting.transcript_json as string);
        if (json.text) return json.text as string;
        if (Array.isArray(json.segments)) {
          return json.segments.map((s: { speaker?: string; text?: string }) =>
            `${s.speaker || 'Speaker'}: ${s.text || ''}`
          ).join('\n');
        }
      } catch { /* fall through */ }
    }

    return null;
  });

  // ── Expand all unexpanded meetings (fetch transcripts, summaries) ─
  ipcMain.handle('readai:expandAll', async () => {
    const runId = logSyncStart('readai_expand', 'manual');
    try {
      let expanded = 0;
      while (true) {
        const result = await expandMeetingDetails(20);
        expanded += result.updated;
        if (result.found === 0) break;
      }
      logSyncEnd(runId, 'success', { found: expanded, updated: expanded });
      return { success: true, expanded, message: `Expanded ${expanded} meetings (transcripts + summaries fetched).` };
    } catch (err: unknown) {
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Expand meetings by date range (sync details: summaries + transcripts) ─
  ipcMain.handle('readai:expandRange', async (_, range: SyncRange) => {
    const runId = logSyncStart('readai_expand', 'manual');
    try {
      // Only expand meetings that haven't been expanded yet — never reset existing data
      let expanded = 0;
      while (true) {
        const result = await expandMeetingDetails(20);
        expanded += result.updated;
        if (result.found === 0) break;
      }

      logSyncEnd(runId, 'success', { found: expanded, updated: expanded });
      return {
        success: true,
        expanded,
        message: expanded > 0
          ? `Expanded ${expanded} meetings (summaries + transcripts fetched).`
          : 'All meetings already have summaries and transcripts.',
      };
    } catch (err: unknown) {
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Meetings count for header stats ───────────────────────────────
  ipcMain.handle('readai:getMeetingsCount', () => {
    const row = queryOne('SELECT COUNT(*) as cnt FROM meetings');
    return (row?.cnt as number) || 0;
  });
}
