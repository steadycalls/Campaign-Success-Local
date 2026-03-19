import cron from 'node-cron';
import { expandMeetingDetails } from './adapters/readai';
import { syncClientFolders, syncFolderFiles, computeFolderSuggestions } from './adapters/gdrive';
import { syncCalendarList, syncCalendarEvents } from './adapters/gcal';
import { logAlert } from './utils/logger';
import { delay } from './utils/rateLimit';
import { queryAll, queryOne } from '../db/client';
import { computeAllHealthScores } from './health/compute';

let expandTask: cron.ScheduledTask | null = null;
let gdriveTask: cron.ScheduledTask | null = null;
let gcalTask: cron.ScheduledTask | null = null;
let healthTask: cron.ScheduledTask | null = null;

function getEnvValue(key: string): string | undefined {
  return process.env[key] || undefined;
}

export function startScheduler() {
  // Expand unexpanded Read.ai meetings every hour at :30
  expandTask = cron.schedule('30 * * * *', async () => {
    const apiKey = getEnvValue('READAI_API_KEY');
    if (!apiKey) return;

    try {
      const counts = await expandMeetingDetails(apiKey, 10);
      if (counts.updated > 0) {
        console.log(`[scheduler] Read.ai expanded ${counts.updated} meetings`);
      }
    } catch (err: unknown) {
      console.error(`[scheduler] Read.ai expand failed: ${err instanceof Error ? err.message : err}`);
    }
  }, { timezone: 'America/Chicago' });

  // Google Drive folder + file sync: 7am, 11am, 3pm, 7pm CT on weekdays
  gdriveTask = cron.schedule('0 7,11,15,19 * * 1-5', async () => {
    const auth = queryOne('SELECT id FROM google_auth WHERE id = ?', ['default']);
    if (!auth) return;

    try {
      const counts = await syncClientFolders();
      computeFolderSuggestions();
      console.log(`[scheduler] Google Drive synced ${counts.found} folders (${counts.created} new, ${counts.updated} updated)`);

      // Sync files for top 20 most recently modified linked folders
      const linkedFolders = queryAll(`
        SELECT drive_folder_id FROM drive_folders
        WHERE company_id IS NOT NULL
        ORDER BY modified_at DESC LIMIT 20
      `);

      for (const folder of linkedFolders) {
        await syncFolderFiles(folder.drive_folder_id as string);
        await delay(500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Google Drive sync failed: ${message}`);
      logAlert('sync_failed', 'warning', `Google Drive sync failed: ${message}`);
    }
  }, { timezone: 'America/Chicago' });

  // Google Calendar sync: every 2 hours during business hours on weekdays
  gcalTask = cron.schedule('10 6,8,10,12,14,16,18,20 * * 1-5', async () => {
    const auth = queryOne('SELECT id, scopes FROM google_auth WHERE id = ?', ['default']);
    if (!auth) return;
    const scopes = (auth.scopes as string) || '';
    if (!scopes.includes('calendar')) return;

    try {
      await syncCalendarList();
      const counts = await syncCalendarEvents({ daysBack: 30, daysForward: 14 });
      if (counts.found > 0) {
        console.log(`[scheduler] Google Calendar synced ${counts.found} events (${counts.created} new, ${counts.updated} updated)`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Google Calendar sync failed: ${message}`);
      logAlert('sync_failed', 'warning', `Google Calendar sync failed: ${message}`);
    }
  }, { timezone: 'America/Chicago' });

  // Health scores: recompute every 2 hours (after syncs) + on app startup
  healthTask = cron.schedule('5 6,8,10,12,14,16,18,20 * * 1-5', () => {
    try {
      const result = computeAllHealthScores();
      console.log(`[scheduler] Health scores computed: ${result.computed} companies, ${result.changed} changed`);
    } catch (err: unknown) {
      console.error(`[scheduler] Health score compute failed: ${err instanceof Error ? err.message : err}`);
    }
  }, { timezone: 'America/Chicago' });

  // Also compute on startup
  try {
    const result = computeAllHealthScores();
    console.log(`[scheduler] Health scores (startup): ${result.computed} companies, ${result.changed} changed`);
  } catch (err: unknown) {
    console.error(`[scheduler] Health score startup compute failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log('[scheduler] Started — Read.ai :30, Google Drive 7/11/15/19, Calendar every 2h, Health every 2h CT weekdays');
}

export function stopScheduler() {
  if (expandTask) {
    expandTask.stop();
    expandTask = null;
  }
  if (gdriveTask) {
    gdriveTask.stop();
    gdriveTask = null;
  }
  if (gcalTask) {
    gcalTask.stop();
    gcalTask = null;
  }
  if (healthTask) {
    healthTask.stop();
    healthTask = null;
  }
  console.log('[scheduler] Stopped');
}
