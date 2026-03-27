// ── Notification Trigger Checks ──────────────────────────────────────
//
// Each function queries the DB for conditions that should fire a
// notification, then calls dispatchNotification for each match.

import { queryAll, queryOne } from '../db/client';
import { dispatchNotification, getNotificationPreferences } from './dispatcher';

// ── SLA ──────────────────────────────────────────────────────────────

export async function checkAndNotifySLA(): Promise<void> {
  // Violations: contacts tagged "client" with sla_status = 'violation'
  const violations = queryAll(`
    SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
      c.days_since_outbound, c.sla_status, c.company_id,
      co.name as company_name
    FROM contacts c
    JOIN companies co ON co.id = c.company_id
    WHERE c.sla_status = 'violation'
      AND co.status = 'active'
      AND co.sync_enabled = 1
  `);

  for (const v of violations) {
    const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || 'Unknown';
    const days = (v.days_since_outbound as number) || 0;

    await dispatchNotification({
      type: 'sla_violation',
      title: `SLA Violation: ${name}`,
      body: `${name}${v.company_name ? ` (${v.company_name})` : ''} has not been contacted in ${days} days.`,
      urgency: days >= 14 ? 'critical' : 'warning',
      companyId: v.company_id as string,
      companyName: v.company_name as string,
      contactId: v.id as string,
      contactName: name,
      actionUrl: '/clients',
      data: { daysSince: days },
      timestamp: new Date().toISOString(),
    });
  }

  // Warnings: sla_status = 'warning'
  const warnings = queryAll(`
    SELECT c.id, c.first_name, c.last_name, c.days_since_outbound,
      c.company_id, co.name as company_name
    FROM contacts c
    JOIN companies co ON co.id = c.company_id
    WHERE c.sla_status = 'warning'
      AND co.status = 'active'
      AND co.sync_enabled = 1
  `);

  for (const w of warnings) {
    const name = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'Unknown';
    const days = (w.days_since_outbound as number) || 0;

    await dispatchNotification({
      type: 'sla_warning',
      title: `SLA Warning: ${name}`,
      body: `${name} — ${days} days since last contact. Due within ${7 - days} day(s).`,
      urgency: 'warning',
      companyId: w.company_id as string,
      companyName: w.company_name as string,
      contactId: w.id as string,
      contactName: name,
      actionUrl: '/clients',
      data: { daysSince: days },
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Budget ───────────────────────────────────────────────────────────

export async function checkAndNotifyBudgets(): Promise<void> {
  // Critical: >90%
  const critical = queryAll(`
    SELECT tp.id, tp.name, tp.budget_percent,
      tp.budget_used, tp.budget_total,
      c.id as company_id, c.name as company_name
    FROM teamwork_projects tp
    LEFT JOIN companies c ON c.id = tp.company_id
    WHERE tp.budget_percent >= 90 AND tp.status = 'active'
  `);

  for (const p of critical) {
    const pct = Math.round((p.budget_percent as number) || 0);
    await dispatchNotification({
      type: 'budget_critical',
      title: `Budget Alert: ${(p.company_name as string) || (p.name as string)}`,
      body: `${p.name} is at ${pct}% budget utilization.`,
      urgency: pct >= 100 ? 'critical' : 'warning',
      companyId: (p.company_id as string) || undefined,
      companyName: (p.company_name as string) || undefined,
      actionUrl: p.company_id
        ? `/company/${p.company_id}`
        : '/settings/teamwork',
      data: { budgetPercent: pct },
      timestamp: new Date().toISOString(),
    });
  }

  // Warning: 75-90%
  const warning = queryAll(`
    SELECT tp.id, tp.name, tp.budget_percent,
      c.id as company_id, c.name as company_name
    FROM teamwork_projects tp
    LEFT JOIN companies c ON c.id = tp.company_id
    WHERE tp.budget_percent >= 75 AND tp.budget_percent < 90 AND tp.status = 'active'
  `);

  for (const p of warning) {
    const pct = Math.round((p.budget_percent as number) || 0);
    await dispatchNotification({
      type: 'budget_warning',
      title: `Budget Warning: ${(p.company_name as string) || (p.name as string)}`,
      body: `${p.name} is at ${pct}% budget utilization.`,
      urgency: 'warning',
      companyId: (p.company_id as string) || undefined,
      companyName: (p.company_name as string) || undefined,
      actionUrl: p.company_id
        ? `/company/${p.company_id}`
        : '/settings/teamwork',
      data: { budgetPercent: pct },
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Sync failures (sync_failed) ──────────────────────────────────────

export async function notifySyncFailure(
  companyId: string,
  companyName: string,
  taskType: string,
  error: string
): Promise<void> {
  await dispatchNotification({
    type: 'sync_failed',
    title: `Sync Failed: ${companyName || 'Unknown'}`,
    body: `${taskType} sync failed for ${companyName}. Error: ${error.substring(0, 200)}`,
    urgency: 'warning',
    companyId,
    companyName,
    actionUrl: '/logs',
    data: { taskType, error: error.substring(0, 500) },
    timestamp: new Date().toISOString(),
  });
}

// ── PIT expired ──────────────────────────────────────────────────────

export async function notifyPitExpired(
  companyId: string,
  companyName: string
): Promise<void> {
  await dispatchNotification({
    type: 'pit_expired',
    title: `PIT Expired: ${companyName}`,
    body: `The Private Integration Token for ${companyName} is no longer valid. Re-enter in Settings > Sub-Accounts.`,
    urgency: 'warning',
    companyId,
    companyName,
    actionUrl: '/settings/subaccounts',
    timestamp: new Date().toISOString(),
  });
}

// ── Stale syncs ──────────────────────────────────────────────────────

export async function checkAndNotifyStaleSyncs(): Promise<void> {
  const stale = queryAll(`
    SELECT id, name, last_sync_at FROM companies
    WHERE sync_enabled = 1 AND status = 'active'
      AND last_sync_at IS NOT NULL
      AND last_sync_at < datetime('now', '-12 hours')
  `);

  for (const c of stale) {
    await dispatchNotification({
      type: 'sync_stale',
      title: `Stale Sync: ${c.name}`,
      body: `${c.name} has not synced in over 12 hours. Last sync: ${c.last_sync_at}.`,
      urgency: 'critical',
      companyId: c.id as string,
      companyName: c.name as string,
      actionUrl: '/logs',
      timestamp: new Date().toISOString(),
    });
  }
}

// ── New leads ────────────────────────────────────────────────────────

export async function checkAndNotifyNewLeads(): Promise<void> {
  const prefs = getNotificationPreferences();
  const threshold = prefs.new_leads_threshold || 5;

  const companies = queryAll(`
    SELECT c.id, c.name,
      (SELECT COUNT(*) FROM contacts ct
       WHERE ct.company_id = c.id
       AND ct.created_at >= datetime('now', 'start of day')
      ) as new_today
    FROM companies c
    WHERE c.sync_enabled = 1 AND c.status = 'active'
  `);

  for (const co of companies) {
    const newToday = (co.new_today as number) || 0;
    if (newToday >= threshold) {
      await dispatchNotification({
        type: 'new_leads',
        title: `New Leads: ${co.name}`,
        body: `${newToday} new contacts added to ${co.name} today.`,
        urgency: 'info',
        companyId: co.id as string,
        companyName: co.name as string,
        actionUrl: `/company/${co.id}`,
        data: { newContactCount: newToday },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// ── Health score drops ───────────────────────────────────────────────

export async function checkAndNotifyHealthDrops(): Promise<void> {
  const prefs = getNotificationPreferences();
  const dropThreshold = prefs.health_drop_threshold || 10;

  const companies = queryAll(`
    SELECT c.id, c.name, c.health_score,
      (SELECT health_score FROM health_score_history
       WHERE company_id = c.id
       ORDER BY computed_at DESC LIMIT 1 OFFSET 1) as previous_score
    FROM companies c
    WHERE c.health_score IS NOT NULL AND c.status = 'active'
  `);

  for (const co of companies) {
    const currentScore = (co.health_score as number) || 0;
    const previousScore = co.previous_score as number | null;

    // Health drop
    if (previousScore !== null && previousScore !== undefined) {
      const drop = previousScore - currentScore;
      if (drop >= dropThreshold) {
        await dispatchNotification({
          type: 'health_drop',
          title: `Health Drop: ${co.name}`,
          body: `${co.name} health score dropped from ${previousScore} to ${currentScore} (-${drop} points).`,
          urgency: currentScore < 35 ? 'critical' : 'warning',
          companyId: co.id as string,
          companyName: co.name as string,
          actionUrl: `/company/${co.id}`,
          data: {
            healthScore: currentScore,
            previousScore,
            drop,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Health critical
    if (currentScore < 35) {
      await dispatchNotification({
        type: 'health_critical',
        title: `Critical Health: ${co.name}`,
        body: `${co.name} health score is ${currentScore}/100. Immediate attention needed.`,
        urgency: 'critical',
        companyId: co.id as string,
        companyName: co.name as string,
        actionUrl: `/company/${co.id}`,
        data: { healthScore: currentScore },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// ── Meeting reminders ────────────────────────────────────────────────

export async function checkAndNotifyUpcomingMeetings(): Promise<void> {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const fifteenMin = 15 * 60 * 1000;

  // Events starting in 5-15 minutes (fire once within that window)
  const upcoming = queryAll(
    `SELECT ce.id, ce.title, ce.start_time, ce.conference_url, ce.hangout_link,
      ce.company_id, c.name as company_name, ce.attendees_count
    FROM calendar_events ce
    LEFT JOIN companies c ON c.id = ce.company_id
    WHERE ce.start_time >= ? AND ce.start_time <= ?
      AND ce.status != 'cancelled'
      AND ce.all_day = 0`,
    [
      new Date(now + fiveMin).toISOString(),
      new Date(now + fifteenMin).toISOString(),
    ]
  );

  for (const meeting of upcoming) {
    const meetLink =
      (meeting.conference_url as string) ||
      (meeting.hangout_link as string) ||
      null;
    const startTime = new Date(meeting.start_time as string);
    const timeStr = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    await dispatchNotification({
      type: 'meeting_soon',
      title: `Meeting in 15 min: ${meeting.title}`,
      body: `${meeting.title}${meeting.company_name ? ` with ${meeting.company_name}` : ''} starts at ${timeStr}.`,
      urgency: 'info',
      companyId: (meeting.company_id as string) || undefined,
      companyName: (meeting.company_name as string) || undefined,
      actionUrl: '/',
      externalUrl: meetLink || undefined,
      data: {
        meetLink,
        attendeeCount: meeting.attendees_count,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Convenience: run all periodic checks ─────────────────────────────

export async function runAllNotificationChecks(): Promise<void> {
  await checkAndNotifySLA();
  await checkAndNotifyBudgets();
  await checkAndNotifyNewLeads();
  await checkAndNotifyHealthDrops();
  await checkAndNotifyStaleSyncs();
}
