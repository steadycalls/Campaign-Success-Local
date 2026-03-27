import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';
import { logger } from '../../lib/logger';

// ── API Helper ──────────────────────────────────────────────────────

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

async function teamworkFetch(path: string): Promise<unknown> {
  const apiKey = getEnvValue('TEAMWORK_API_KEY');
  const site = getEnvValue('TEAMWORK_SITE');
  if (!apiKey || !site) throw new Error('TEAMWORK_API_KEY and TEAMWORK_SITE required');

  const url = `https://${site}.teamwork.com${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
    logger.warn('Teamwork', 'Rate limited', { retry_after_s: retryAfter });
    await delay(retryAfter * 1000);
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!retry.ok) throw new Error(`Teamwork ${retry.status}: ${await retry.text().catch(() => '')}`);
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Teamwork ${res.status} at ${path}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

// ── Sync All Projects ───────────────────────────────────────────────

export async function syncTeamworkProjects(): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };

  // Fetch all active projects
  const data = await teamworkFetch('/projects.json?status=active&include=budget&pageSize=500') as {
    projects?: Array<Record<string, unknown>>;
  };
  const projects = data.projects ?? [];

  for (const proj of projects) {
    counts.found++;
    const twId = String(proj.id);
    const name = (proj.name as string) ?? 'Unnamed';
    const status = (proj.status as string) ?? 'active';

    // Extract budget from project fields
    // Teamwork API v3: project may have budget fields directly
    // Teamwork API v1: may need separate budget call
    let budgetTotal = 0;
    let budgetUsed = 0;
    let budgetPercent = 0;

    // Try direct budget fields (Teamwork v3 style)
    if (proj.budget != null) {
      budgetTotal = parseFloat(String(proj.budget)) || 0;
    }
    if (proj.budgetType === 'hours' && proj.budgetCapacity) {
      budgetTotal = parseFloat(String(proj.budgetCapacity)) || 0;
    }

    // Fetch time totals for hours used
    try {
      const timeData = await teamworkFetch(`/projects/${twId}/time/total.json`) as {
        projects?: Array<{ 'time-totals'?: { 'total-hours-sum'?: string } }>;
        'time-totals'?: { 'total-hours-sum'?: string };
      };
      const totalHours = parseFloat(
        timeData?.['time-totals']?.['total-hours-sum'] ??
        timeData?.projects?.[0]?.['time-totals']?.['total-hours-sum'] ??
        '0'
      );
      budgetUsed = totalHours;
      await delay(100);
    } catch {
      // Time endpoint may not be available
    }

    if (budgetTotal > 0) {
      budgetPercent = Math.round((budgetUsed / budgetTotal) * 100);
    }

    // Fetch task counts
    let tasksOpen = 0;
    let tasksCompleted = 0;
    let tasksTotal = 0;

    try {
      const taskData = await teamworkFetch(`/projects/${twId}/tasks/count.json`) as {
        'task-count'?: { active?: string | number; completed?: string | number; total?: string | number };
        taskCount?: { active?: number; completed?: number; total?: number };
      };
      const tc = taskData?.['task-count'] ?? taskData?.taskCount ?? {};
      tasksOpen = parseInt(String(tc.active ?? 0), 10);
      tasksCompleted = parseInt(String(tc.completed ?? 0), 10);
      tasksTotal = parseInt(String(tc.total ?? tasksOpen + tasksCompleted), 10);
      await delay(100);
    } catch {
      // Count endpoint may not exist — try fallback
      try {
        const stats = proj['taskStats'] as { active?: number; completed?: number } | undefined;
        if (stats) {
          tasksOpen = stats.active ?? 0;
          tasksCompleted = stats.completed ?? 0;
          tasksTotal = tasksOpen + tasksCompleted;
        }
      } catch { /* ignore */ }
    }

    // Upsert teamwork_projects
    const existing = queryOne(
      'SELECT id FROM teamwork_projects WHERE teamwork_id = ?',
      [twId]
    );

    if (existing) {
      execute(
        `UPDATE teamwork_projects SET
          name = ?, status = ?,
          budget_total = ?, budget_used = ?, budget_percent = ?,
          task_count_total = ?, task_count_open = ?, task_count_completed = ?,
          last_sync_at = datetime('now'), updated_at = datetime('now')
        WHERE teamwork_id = ?`,
        [name, status, budgetTotal, budgetUsed, budgetPercent,
         tasksTotal, tasksOpen, tasksCompleted, twId]
      );
      counts.updated++;
    } else {
      // New project — find matching company by name or entity_links
      const companyId = findMatchingCompany(twId, name);
      execute(
        `INSERT INTO teamwork_projects (id, company_id, teamwork_id, name, status,
          budget_total, budget_used, budget_percent,
          task_count_total, task_count_open, task_count_completed,
          last_sync_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
        [randomUUID(), companyId, twId, name, status,
         budgetTotal, budgetUsed, budgetPercent,
         tasksTotal, tasksOpen, tasksCompleted]
      );
      counts.created++;
    }

    await delay(100);
  }

  // Update company rollup columns from linked teamwork_projects
  updateCompanyBudgets();

  logger.sync('Teamwork sync complete', { projects: counts.found, created: counts.created, updated: counts.updated });
  return counts;
}

// ── Company matching ─────────────────────────────────────────────────

function findMatchingCompany(twId: string, projectName: string): string | null {
  // Check entity_links first
  const link = queryOne(
    "SELECT company_id FROM entity_links WHERE platform = 'teamwork' AND platform_id = ?",
    [twId]
  );
  if (link) return link.company_id as string;

  // Check if any company already has this teamwork_project_id
  const existing = queryOne(
    'SELECT id FROM companies WHERE teamwork_project_id = ?',
    [twId]
  );
  if (existing) return existing.id as string;

  return null;
}

// ── Update company budget columns ────────────────────────────────────

function updateCompanyBudgets(): void {
  // For each company with a linked teamwork project, copy budget data
  const linked = queryAll(`
    SELECT tp.company_id, tp.budget_total, tp.budget_used, tp.budget_percent,
           tp.task_count_open, tp.teamwork_id
    FROM teamwork_projects tp
    WHERE tp.company_id IS NOT NULL AND tp.status = 'active'
  `);

  for (const row of linked) {
    execute(
      `UPDATE companies SET
        monthly_budget = ?, budget_used = ?, budget_percent = ?,
        open_task_count = ?, teamwork_project_id = ?,
        has_teamwork = 1, updated_at = datetime('now')
      WHERE id = ?`,
      [
        row.budget_total as number, row.budget_used as number, row.budget_percent as number,
        row.task_count_open as number, row.teamwork_id as string,
        row.company_id as string,
      ]
    );
  }
}

// ── Test connection ──────────────────────────────────────────────────

export async function testTeamworkConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await teamworkFetch('/projects.json?status=active&pageSize=1') as {
      projects?: unknown[];
    };
    const count = data.projects?.length ?? 0;
    return { success: true, message: `Connected. ${count > 0 ? 'Projects accessible.' : 'No active projects found.'}` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}
