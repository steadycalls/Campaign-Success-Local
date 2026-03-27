import cron from 'node-cron';
import { expandMeetingDetails, syncReadAiMeetingsRange, getReadAiSyncState, saveReadAiSyncState, getOvernightSyncPending, clearOvernightSync } from './adapters/readai';
import { syncClientFolders, syncFolderFiles, computeFolderSuggestions } from './adapters/gdrive';
import { syncCalendarList, syncCalendarEvents } from './adapters/gcal';
import { syncKinstaSites } from './adapters/kinsta';
import { syncTeamworkProjects } from './adapters/teamwork';
import { logAlert, logSyncStart, logSyncEnd } from './utils/logger';
import { delay } from './utils/rateLimit';
import { queryAll, queryOne } from '../db/client';
import { computeAllHealthScores } from './health/compute';
import { generateWeeklyReport } from '../reports/generator';
import { runAllNotificationChecks, checkAndNotifyUpcomingMeetings } from '../notifications/triggers';
import { logger } from '../lib/logger';
import { checkAndRunA2PSchedule } from '../a2p/schedule';
import { checkAndRunSEOSchedule } from '../seo/schedule';
import { syncGmail } from './adapters/gmail';

let expandTask: cron.ScheduledTask | null = null;
let gdriveTask: cron.ScheduledTask | null = null;
let gcalTask: cron.ScheduledTask | null = null;
let healthTask: cron.ScheduledTask | null = null;
let reportTask: cron.ScheduledTask | null = null;
let kinstaTask: cron.ScheduledTask | null = null;
let notifyTask: cron.ScheduledTask | null = null;
let meetingCheckTask: cron.ScheduledTask | null = null;
let readaiDailyTask: cron.ScheduledTask | null = null;
let readaiOvernightTask: cron.ScheduledTask | null = null;
let teamworkTask: cron.ScheduledTask | null = null;
let a2pTask: cron.ScheduledTask | null = null;
let seoTask: cron.ScheduledTask | null = null;
let gmailTask: cron.ScheduledTask | null = null;

function getEnvValue(key: string): string | undefined {
  return process.env[key] || undefined;
}

export function startScheduler() {
  // Expand unexpanded Read.ai meetings every hour at :30
  expandTask = cron.schedule('30 * * * *', async () => {
    // Check if Read.ai is authorized (OAuth tokens stored)
    const readaiAuth = queryOne('SELECT id FROM readai_auth WHERE id = ?', ['default']);
    if (!readaiAuth) return;

    // Check how many need expanding
    const pending = queryOne('SELECT COUNT(*) as cnt FROM meetings WHERE expanded = 0');
    const pendingCount = (pending?.cnt as number) || 0;

    if (pendingCount === 0) return; // nothing to expand

    logger.scheduler('Read.ai expand starting', { pending: pendingCount });

    try {
      const counts = await expandMeetingDetails(20); // 20 per run instead of 10
      logger.scheduler('Read.ai expand complete', { expanded: counts.updated, attempted: counts.found, remaining: Math.max(0, pendingCount - counts.found) });
    } catch (err: unknown) {
      logger.error('Scheduler', 'Read.ai expand failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Google Drive folder + file sync: 7am, 11am, 3pm, 7pm CT on weekdays
  gdriveTask = cron.schedule('0 7,11,15,19 * * 1-5', async () => {
    const auth = queryOne('SELECT id FROM google_auth WHERE id = ?', ['default']);
    if (!auth) return;

    try {
      const counts = await syncClientFolders();
      computeFolderSuggestions();
      logger.scheduler('Google Drive synced', { found: counts.found, created: counts.created, updated: counts.updated });

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
      logger.error('Scheduler', 'Google Drive sync failed', { error: message });
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
        logger.scheduler('Google Calendar synced', { found: counts.found, created: counts.created, updated: counts.updated });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Scheduler', 'Google Calendar sync failed', { error: message });
      logAlert('sync_failed', 'warning', `Google Calendar sync failed: ${message}`);
    }
  }, { timezone: 'America/Chicago' });

  // Health scores: recompute every 2 hours (after syncs) + on app startup
  healthTask = cron.schedule('5 6,8,10,12,14,16,18,20 * * 1-5', () => {
    try {
      const result = computeAllHealthScores();
      logger.scheduler('Health scores computed', { computed: result.computed, changed: result.changed });
    } catch (err: unknown) {
      logger.error('Scheduler', 'Health score compute failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Also compute on startup
  try {
    const result = computeAllHealthScores();
    logger.scheduler('Health scores (startup)', { computed: result.computed, changed: result.changed });
  } catch (err: unknown) {
    logger.error('Scheduler', 'Health score startup compute failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Weekly report: auto-generate every Friday at 4 PM CST
  reportTask = cron.schedule('0 16 * * 5', () => {
    try {
      const reportId = generateWeeklyReport({ autoGenerated: true });
      logger.scheduler('Weekly report generated', { report_id: reportId });
    } catch (err: unknown) {
      logger.error('Scheduler', 'Weekly report generation failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Kinsta: daily at 7 AM CST on weekdays
  kinstaTask = cron.schedule('0 7 * * 1-5', async () => {
    const apiKey = getEnvValue('KINSTA_API_KEY');
    if (!apiKey) return;

    const runId = logSyncStart('kinsta', 'scheduled');
    try {
      const counts = await syncKinstaSites();
      logSyncEnd(runId, 'success', counts);
      logger.scheduler('Kinsta synced', { found: counts.found, created: counts.created, updated: counts.updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      logger.error('Scheduler', 'Kinsta sync failed', { error: message });
      logAlert('sync_failed', 'warning', `Kinsta sync failed: ${message}`);
    }
  }, { timezone: 'America/Chicago' });

  // Teamwork: every 4 hours during business hours on weekdays
  teamworkTask = cron.schedule('30 7,11,15,19 * * 1-5', async () => {
    const apiKey = getEnvValue('TEAMWORK_API_KEY');
    if (!apiKey) return;

    const runId = logSyncStart('teamwork', 'scheduled');
    try {
      const counts = await syncTeamworkProjects();
      logSyncEnd(runId, 'success', counts);
      logger.scheduler('Teamwork synced', { found: counts.found, created: counts.created, updated: counts.updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logSyncEnd(runId, 'error', {}, message);
      logger.error('Scheduler', 'Teamwork sync failed', { error: message });
      logAlert('sync_failed', 'warning', `Teamwork sync failed: ${message}`);
    }
  }, { timezone: 'America/Chicago' });

  // Notification checks: SLA, budgets, health drops, new leads, stale syncs
  // Runs 10 minutes after each health score computation
  notifyTask = cron.schedule('15 6,8,10,12,14,16,18,20 * * 1-5', async () => {
    try {
      await runAllNotificationChecks();
      logger.scheduler('Notification checks complete');
    } catch (err: unknown) {
      logger.error('Scheduler', 'Notification checks failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Meeting reminders: every 5 minutes
  meetingCheckTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await checkAndNotifyUpcomingMeetings();
    } catch (err: unknown) {
      logger.error('Scheduler', 'Meeting check failed', { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Read.ai: sync recent meetings every 2 hours during business hours on weekdays
  readaiDailyTask = cron.schedule('20 6,8,10,12,14,16,18,20 * * *', async () => {
    const readaiAuth = queryOne('SELECT id FROM readai_auth WHERE id = ?', ['default']);
    if (!readaiAuth) return;

    logger.scheduler('Read.ai daily sync starting');

    try {
      // Pass 1: fetch recent meetings (last 2 days)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const result = await syncReadAiMeetingsRange({
        sinceDate: twoDaysAgo.toISOString(),
        maxPages: 10,
      });

      logger.scheduler('Read.ai Pass 1 complete', { fetched: result.fetched, created: result.created });

      // Pass 2: expand unexpanded meetings (summaries + transcripts)
      if (result.fetched > 0) {
        let expanded = 0;
        let batch;
        do {
          batch = await expandMeetingDetails(20);
          expanded += batch.updated;
        } while (batch.found > 0);

        if (expanded > 0) {
          logger.scheduler('Read.ai Pass 2 complete', { expanded });
        }
      }
    } catch (err: unknown) {
      logger.error('Scheduler', 'Read.ai daily sync failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Read.ai overnight historical sync: runs at 10 PM CST, processes in batches until 6 AM
  readaiOvernightTask = cron.schedule('0 22 * * *', async () => {
    const pending = getOvernightSyncPending();
    if (!pending) return;

    const readaiAuth = queryOne('SELECT id FROM readai_auth WHERE id = ?', ['default']);
    if (!readaiAuth) return;

    logger.scheduler('Starting overnight Read.ai sync', { target: pending.range });

    const state = getReadAiSyncState();
    let totalFetched = 0;
    let batchNumber = 0;

    while (true) {
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 6 && hour < 22) {
        logger.scheduler('Read.ai overnight window closed, will resume tonight', { hour });
        break;
      }

      try {
        const result = await syncReadAiMeetingsRange({
          sinceDate: pending.sinceDate,
          cursor: state.historicalSyncCursor,
          maxPages: 10,
        });

        totalFetched += result.fetched;
        batchNumber++;

        state.historicalSyncCursor = result.hasMore ? result.cursor : null;
        state.lastSyncAt = new Date().toISOString();
        const totalRow = queryOne('SELECT COUNT(*) as cnt FROM meetings');
        state.totalMeetingsSynced = (totalRow?.cnt as number) || 0;
        if (result.oldestFetched && (!state.oldestMeetingSynced || result.oldestFetched < state.oldestMeetingSynced)) {
          state.oldestMeetingSynced = result.oldestFetched;
        }
        saveReadAiSyncState(state);

        logger.scheduler('Read.ai overnight batch', { batch: batchNumber, fetched: result.fetched, total: totalFetched });

        if (!result.hasMore) {
          logger.scheduler('Read.ai historical sync complete', { total_fetched: totalFetched });
          state.historicalSyncComplete = true;
          saveReadAiSyncState(state);
          clearOvernightSync();
          break;
        }

        await delay(2000);
      } catch (err: unknown) {
        logger.error('Scheduler', 'Read.ai overnight sync error, retrying in 60s', { error: err instanceof Error ? err.message : String(err) });
        await delay(60000);
      }
    }
  }, { timezone: 'America/Chicago' });

  // A2P compliance: check daily at 3 AM CST if a scheduled run is due
  a2pTask = cron.schedule('0 3 * * *', async () => {
    try {
      await checkAndRunA2PSchedule();
    } catch (err: unknown) {
      logger.error('Scheduler', 'A2P schedule check failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // SEO agent: check daily at 5 AM CST if gap detection or feedback tracking is due
  seoTask = cron.schedule('0 5 * * *', async () => {
    try {
      await checkAndRunSEOSchedule();
    } catch (err: unknown) {
      logger.error('Scheduler', 'SEO schedule check failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  // Gmail sync: every 2 hours on weekdays, 8am-8pm CT
  gmailTask = cron.schedule('0 8,10,12,14,16,18,20 * * 1-5', async () => {
    const auth = queryOne('SELECT id, scopes FROM google_auth WHERE id = ?', ['default']);
    if (!auth) return;
    const scopes = (auth.scopes as string) ?? '';
    if (!scopes.includes('gmail')) return;
    try {
      await syncGmail(7);
      logger.scheduler('Gmail synced');
    } catch (err: unknown) {
      logger.error('Scheduler', 'Gmail sync failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, { timezone: 'America/Chicago' });

  logger.scheduler('Started', { readai: ':30/:20', gdrive: '7/11/15/19', cal: '2h', health: '2h', kinsta: '7am', teamwork: '4h', reports: 'Fri 4pm', notifications: '2h', meetings: '5m', overnight: '10pm CT', a2p: '3am daily', seo: '5am daily', gmail: '2h weekdays' });
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
  if (reportTask) {
    reportTask.stop();
    reportTask = null;
  }
  if (kinstaTask) {
    kinstaTask.stop();
    kinstaTask = null;
  }
  if (notifyTask) {
    notifyTask.stop();
    notifyTask = null;
  }
  if (meetingCheckTask) {
    meetingCheckTask.stop();
    meetingCheckTask = null;
  }
  if (readaiDailyTask) {
    readaiDailyTask.stop();
    readaiDailyTask = null;
  }
  if (readaiOvernightTask) {
    readaiOvernightTask.stop();
    readaiOvernightTask = null;
  }
  if (teamworkTask) {
    teamworkTask.stop();
    teamworkTask = null;
  }
  if (a2pTask) {
    a2pTask.stop();
    a2pTask = null;
  }
  if (seoTask) {
    seoTask.stop();
    seoTask = null;
  }
  if (gmailTask) {
    gmailTask.stop();
    gmailTask = null;
  }
  logger.scheduler('Stopped');
}
