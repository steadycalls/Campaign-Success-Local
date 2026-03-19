import cron from 'node-cron';
import { expandMeetingDetails } from './adapters/readai';

let expandTask: cron.ScheduledTask | null = null;

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

  console.log('[scheduler] Started — Read.ai expand runs every hour at :30');
}

export function stopScheduler() {
  if (expandTask) {
    expandTask.stop();
    expandTask = null;
  }
  console.log('[scheduler] Stopped');
}
