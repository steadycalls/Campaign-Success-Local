import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts, logAlert } from '../utils/logger';
import { logger } from '../../lib/logger';

// ── API helper ───────────────────────────────────────────────────────

const KINSTA_API_BASE = 'https://api.kinsta.com/v2';

function getEnvValue(key: string): string {
  return process.env[key] || '';
}

async function kinstaFetch(path: string): Promise<unknown> {
  const apiKey = getEnvValue('KINSTA_API_KEY');
  if (!apiKey) throw new Error('KINSTA_API_KEY not set');

  const res = await fetch(`${KINSTA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  if (res.status === 401) throw new Error('Kinsta API key invalid');
  if (res.status === 429) throw new Error('Kinsta rate limited');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kinsta API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Name similarity (simple LCS-based) ──────────────────────────────

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const al = a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bl = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.8;

  const aWords = new Set(al.split(/\s+/));
  const bWords = new Set(bl.split(/\s+/));
  let overlap = 0;
  for (const w of aWords) { if (bWords.has(w)) overlap++; }
  const union = new Set([...aWords, ...bWords]).size;
  return union > 0 ? overlap / union : 0;
}

// ── Test connection ──────────────────────────────────────────────────

export async function testKinstaConnection(): Promise<{ success: boolean; message: string }> {
  const apiKey = getEnvValue('KINSTA_API_KEY');
  const companyId = getEnvValue('KINSTA_COMPANY_ID');
  if (!apiKey) return { success: false, message: 'KINSTA_API_KEY not set' };
  if (!companyId) return { success: false, message: 'KINSTA_COMPANY_ID not set' };

  try {
    const data = await kinstaFetch(`/sites?company=${companyId}`) as { company?: { sites?: unknown[] } };
    const siteCount = data.company?.sites?.length || 0;
    return { success: true, message: `Connected. ${siteCount} sites found.` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Sync all sites ───────────────────────────────────────────────────

export type KinstaSyncProgressCallback = (data: {
  phase: 'sites' | 'plugins';
  current: number;
  total: number;
  siteName: string;
}) => void;

export async function syncKinstaSites(onProgress?: KinstaSyncProgressCallback): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const companyId = getEnvValue('KINSTA_COMPANY_ID');
  if (!companyId) throw new Error('KINSTA_COMPANY_ID not set');

  // Use include_environments=true to get environment data inline (avoids per-site detail calls)
  const data = await kinstaFetch(`/sites?company=${companyId}&include_environments=true`) as {
    company?: { sites?: Array<Record<string, unknown>> };
  };
  const sites = data.company?.sites ?? [];
  const totalSites = sites.length;

  for (const site of sites) {
    counts.found++;
    const siteId = site.id as string;
    onProgress?.({ phase: 'sites', current: counts.found, total: totalSites, siteName: (site.display_name as string) || (site.name as string) || '' });
    const siteData = site;

    const envs = (siteData.environments as Array<Record<string, unknown>>) ?? [];
    const liveEnv = envs.find((e) => e.is_primary || e.name === 'live') ?? envs[0];

    const containerInfo = (liveEnv?.container_info as Record<string, unknown>) ?? {};
    const primaryDomain = (liveEnv?.primaryDomain as Record<string, unknown>)
      ?? (liveEnv?.primary_domain as Record<string, unknown>) ?? {};
    const domains = (liveEnv?.domains as Array<Record<string, unknown>>) ?? [];
    const dcInfo = (liveEnv?.datacenter as Record<string, unknown>) ?? {};

    const domain = (primaryDomain.name as string)
      ?? (primaryDomain.domain as string)
      ?? (domains[0]?.name as string)
      ?? (siteData.display_name as string)
      ?? '';

    // wordpress_version is at the environment level, NOT inside container_info
    const wpVersion = (liveEnv?.wordpress_version as string) ?? null;
    // php_engine_version has a "php" prefix (e.g. "php8.2") — strip it
    const rawPhp = (containerInfo.php_engine_version as string) ?? '';
    const phpVersion = rawPhp.replace(/^php/i, '') || null;

    const now = new Date().toISOString();
    const existing = queryOne('SELECT id FROM kinsta_sites WHERE kinsta_site_id = ?', [siteId]);

    if (existing) {
      execute(`
        UPDATE kinsta_sites SET
          kinsta_env_id=?, name=?, display_name=?, status=?, domain=?,
          php_version=?, wp_version=?, datacenter=?,
          raw_json=?, synced_at=?, updated_at=?
        WHERE kinsta_site_id = ?
      `, [
        (liveEnv?.id as string) ?? null,
        (siteData.name as string) ?? '',
        (siteData.display_name as string) ?? (siteData.name as string) ?? '',
        (siteData.status as string) ?? 'live',
        domain,
        phpVersion,
        wpVersion,
        (dcInfo.display_name as string) ?? null,
        JSON.stringify(siteData), now, now,
        siteId,
      ]);
      counts.updated++;
    } else {
      execute(`
        INSERT INTO kinsta_sites (id, kinsta_site_id, kinsta_env_id, name, display_name, status, domain,
          php_version, wp_version, datacenter, raw_json, synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        randomUUID(), siteId,
        (liveEnv?.id as string) ?? null,
        (siteData.name as string) ?? '',
        (siteData.display_name as string) ?? (siteData.name as string) ?? '',
        (siteData.status as string) ?? 'live',
        domain,
        phpVersion,
        wpVersion,
        (dcInfo.display_name as string) ?? null,
        JSON.stringify(siteData), now, now, now,
      ]);
      counts.created++;
    }
  }

  logger.kinsta('Sites phase done', { found: counts.found, created: counts.created, updated: counts.updated });

  // Sync plugins and themes
  await syncAllPluginsAndThemes(onProgress);

  // Compute suggestions
  computeKinstaSuggestions();

  // Log summary
  const totalPlugins = queryOne('SELECT SUM(plugins_total) as cnt FROM kinsta_sites');
  const totalUpdates = queryOne('SELECT SUM(plugins_needing_update) as cnt FROM kinsta_sites');
  logger.kinsta('Sync complete', { sites: counts.found, plugins_total: (totalPlugins?.cnt as number) || 0, plugins_needing_update: (totalUpdates?.cnt as number) || 0 });

  return counts;
}

// ── Sync plugins + themes per site ───────────────────────────────────

async function syncAllPluginsAndThemes(onProgress?: KinstaSyncProgressCallback): Promise<void> {
  const sites = queryAll(
    'SELECT kinsta_site_id, kinsta_env_id, name FROM kinsta_sites WHERE kinsta_env_id IS NOT NULL'
  );
  const totalSites = sites.length;
  let current = 0;

  for (const site of sites) {
    current++;
    onProgress?.({ phase: 'plugins', current, total: totalSites, siteName: (site.name as string) || '' });
    const siteId = site.kinsta_site_id as string;
    const envId = site.kinsta_env_id as string;
    const now = new Date().toISOString();

    try {
      // Plugins — endpoint is /wp-plugins (not /plugins)
      const pluginData = await kinstaFetch(`/sites/environments/${envId}/wp-plugins`) as Record<string, unknown>;
      await delay(300);

      // Response: environment.plugins.items[] (not container_info.wp_plugins)
      const envData = pluginData.environment as Record<string, unknown> | undefined;
      const pluginsObj = (envData?.plugins as Record<string, unknown>) ?? {};
      const plugins = Array.isArray(pluginsObj.items) ? pluginsObj.items as Array<Record<string, unknown>> : [];

      if (plugins.length === 0 && envData) {
        logger.warn('Kinsta', 'No plugins found', { site: site.name as string, response_keys: JSON.stringify(Object.keys(envData)) });
      }

      let pluginsNeedingUpdate = 0;
      let pluginsActive = 0;

      execute('DELETE FROM kinsta_plugins WHERE kinsta_site_id = ?', [siteId]);

      for (const plugin of plugins) {
        // update field is a string "available" | "none" (not an object)
        const updateAvailable =
          plugin.update === 'available' ||
          (plugin.update as Record<string, unknown>)?.available === true ||
          plugin.update_available === true;
        if (updateAvailable) pluginsNeedingUpdate++;
        if (plugin.status === 'active') pluginsActive++;

        execute(`
          INSERT INTO kinsta_plugins (id, kinsta_site_id, plugin_slug, plugin_name, current_version,
            new_version, update_available, status, raw_json, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(), siteId,
          (plugin.name as string) ?? '',                           // name is the slug
          (plugin.title as string) ?? (plugin.name as string) ?? '', // title is the display name
          (plugin.version as string) ?? null,
          (plugin.update_version as string) ?? null,               // NOT update.new_version
          updateAvailable ? 1 : 0,
          (plugin.status as string) ?? 'unknown',
          JSON.stringify(plugin), now,
        ]);
      }

      logger.kinsta('Plugins synced', { site: site.name as string, plugins: plugins.length, needing_update: pluginsNeedingUpdate });

      // Themes — endpoint is /wp-themes (not /themes)
      const themeData = await kinstaFetch(`/sites/environments/${envId}/wp-themes`) as Record<string, unknown>;
      await delay(300);

      // Response: environment.themes.items[] (not container_info.wp_themes)
      const themeEnv = themeData.environment as Record<string, unknown> | undefined;
      const themesObj = (themeEnv?.themes as Record<string, unknown>) ?? {};
      const themes = Array.isArray(themesObj.items) ? themesObj.items as Array<Record<string, unknown>> : [];

      if (themes.length === 0 && themeEnv) {
        logger.warn('Kinsta', 'No themes found', { site: site.name as string, response_keys: JSON.stringify(Object.keys(themeEnv)) });
      }

      let themesNeedingUpdate = 0;

      execute('DELETE FROM kinsta_themes WHERE kinsta_site_id = ?', [siteId]);

      for (const theme of themes) {
        const updateAvailable =
          theme.update === 'available' ||
          (theme.update as Record<string, unknown>)?.available === true ||
          theme.update_available === true;
        if (updateAvailable) themesNeedingUpdate++;

        execute(`
          INSERT INTO kinsta_themes (id, kinsta_site_id, theme_slug, theme_name, current_version,
            new_version, update_available, status, raw_json, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(), siteId,
          (theme.name as string) ?? '',                            // slug
          (theme.title as string) ?? (theme.name as string) ?? '', // display name
          (theme.version as string) ?? null,
          (theme.update_version as string) ?? null,                // NOT update.new_version
          updateAvailable ? 1 : 0,
          (theme.status as string) ?? 'unknown',
          JSON.stringify(theme), now,
        ]);
      }

      logger.kinsta('Themes synced', { site: site.name as string, themes: themes.length, needing_update: themesNeedingUpdate });

      // Update site counts
      execute(`
        UPDATE kinsta_sites SET plugins_total=?, plugins_active=?, plugins_needing_update=?,
          themes_total=?, themes_needing_update=?, updated_at=datetime('now')
        WHERE kinsta_site_id = ?
      `, [plugins.length, pluginsActive, pluginsNeedingUpdate, themes.length, themesNeedingUpdate, siteId]);

      // Update linked company
      const linked = queryOne('SELECT company_id FROM kinsta_sites WHERE kinsta_site_id = ?', [siteId]);
      if (linked?.company_id) {
        execute('UPDATE companies SET kinsta_plugins_needing_update = ? WHERE id = ?',
          [pluginsNeedingUpdate, linked.company_id as string]);
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Kinsta', 'Failed to sync plugins/themes', { site: site.name as string, error: msg });
      logAlert('kinsta_plugin_sync_failed', 'warning', `Plugin/theme sync failed for ${site.name}: ${msg}`);
    }
  }
}

// ── Domain-based matching ────────────────────────────────────────────

function computeKinstaSuggestions(): void {
  const unlinked = queryAll('SELECT id, name, display_name, domain FROM kinsta_sites WHERE company_id IS NULL');
  const companies = queryAll("SELECT id, name FROM companies WHERE status = 'active'");

  for (const site of unlinked) {
    let best = { companyId: '', companyName: '', score: 0 };

    for (const company of companies) {
      const scores = [
        nameSimilarity(site.name as string, company.name as string),
        nameSimilarity((site.display_name as string) ?? '', company.name as string),
        (site.domain as string)
          ? nameSimilarity(
              (site.domain as string).replace(/\.(com|net|org|co)$/, '').replace('www.', ''),
              company.name as string
            )
          : 0,
      ];
      const maxScore = Math.max(...scores);
      if (maxScore > best.score) {
        best = { companyId: company.id as string, companyName: company.name as string, score: maxScore };
      }
    }

    if (best.score > 0.3) {
      execute(`
        UPDATE kinsta_sites SET suggested_company_id=?, suggested_company_name=?, suggestion_score=? WHERE id=?
      `, [best.companyId, best.companyName, best.score, site.id as string]);
    }
  }
}
