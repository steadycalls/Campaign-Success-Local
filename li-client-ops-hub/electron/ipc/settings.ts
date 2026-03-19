import { ipcMain, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne, execute, initDB, closeDB } from '../../db/client';

// ── .env helpers ──────────────────────────────────────────────────────

function envPath(): string {
  return path.join(app.getPath('userData'), '.env');
}

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function serializeEnv(vars: Record<string, string>): string {
  return (
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
}

/** Read all env vars from the .env file (unmasked) */
function readEnvVars(): Record<string, string> {
  const fp = envPath();
  if (!fs.existsSync(fp)) return {};
  return parseEnv(fs.readFileSync(fp, 'utf-8'));
}

function writeEnvVar(key: string, value: string): void {
  const fp = envPath();
  const vars = readEnvVars();
  vars[key] = value;
  const tmpPath = fp + '.tmp';
  fs.writeFileSync(tmpPath, serializeEnv(vars), 'utf-8');
  fs.renameSync(tmpPath, fp);
  // Update in-memory process.env
  process.env[key] = value;
}

const SECRET_PATTERNS = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i];

function maskValue(key: string, value: string): string {
  if (SECRET_PATTERNS.some((p) => p.test(key)) && value.length > 4) {
    return value.slice(0, 4) + '\u2022'.repeat(Math.min(value.length - 4, 20));
  }
  return value;
}

// ── Test connection implementations ───────────────────────────────────

async function testGHLAgency(env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const pit = env['GHL_AGENCY_PIT'];
  const companyId = env['GHL_COMPANY_ID'];
  if (!pit) return { success: false, message: 'GHL_AGENCY_PIT is not set' };
  if (!companyId) return { success: false, message: 'GHL_COMPANY_ID is not set' };

  const res = await fetch(
    `https://services.leadconnectorhq.com/locations/search?companyId=${encodeURIComponent(companyId)}&limit=1`,
    { headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28' } }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, message: `GHL API returned ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as { locations?: unknown[] };
  return { success: true, message: `Agency PIT valid. Found ${data.locations?.length ?? 0} location(s).` };
}

async function testTeamwork(env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = env['TEAMWORK_API_KEY'];
  const site = env['TEAMWORK_SITE'];
  if (!apiKey) return { success: false, message: 'TEAMWORK_API_KEY is not set' };
  if (!site) return { success: false, message: 'TEAMWORK_SITE is not set' };

  const res = await fetch(
    `https://${encodeURIComponent(site)}.teamwork.com/projects.json?status=active&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, message: `Teamwork API returned ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { projects?: unknown[] };
  const count = data.projects?.length ?? 0;
  return { success: true, message: `Connected to Teamwork (${count} project(s) found)` };
}

async function testReadAiApi(env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const apiKey = env['READAI_API_KEY'];
  if (!apiKey) return { success: false, message: 'READAI_API_KEY is not set' };

  const res = await fetch('https://api.read.ai/v1/meetings?limit=1', {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, message: `Read.ai API returned ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { data?: unknown[]; has_more?: boolean };
  return { success: true, message: `Connected to Read.ai (${data.has_more ? 'multiple' : data.data?.length ?? 0} meetings accessible)` };
}

async function testReadAiMcp(env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const mcpUrl = env['READAI_MCP_URL'];
  const mcpToken = env['READAI_MCP_TOKEN'];
  if (!mcpUrl) return { success: false, message: 'READAI_MCP_URL is not set' };

  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        ...(mcpToken ? { Authorization: `Bearer ${mcpToken}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'client-ops-hub', version: '1.0.0' },
        },
        id: 1,
      }),
    });

    if (!res.ok) return { success: false, message: `MCP server responded ${res.status}` };
    const data = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    return { success: true, message: `Connected. Server: ${data.result?.serverInfo?.name || 'Read.ai MCP'}` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
  }
}

async function testGDrive(_env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  // Delegate to the gdrive adapter's full connection test (uses OAuth tokens)
  const { testGoogleDriveConnection } = await import('../../sync/adapters/gdrive');
  return testGoogleDriveConnection();
}

async function testDiscord(env: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const token = env['DISCORD_BOT_TOKEN'];
  if (!token) return { success: false, message: 'DISCORD_BOT_TOKEN is not set' };
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, message: `Discord API returned ${res.status}: ${text.slice(0, 200)}` };
  }
  const user = (await res.json()) as { username?: string };
  return { success: true, message: `Connected as ${user.username}` };
}

const testFunctions: Record<string, (env: Record<string, string>) => Promise<{ success: boolean; message: string }>> = {
  ghl_agency: testGHLAgency,
  teamwork: testTeamwork,
  readai: testReadAiApi,
  readai_api: testReadAiApi,
  readai_mcp: testReadAiMcp,
  gdrive: testGDrive,
  discord: testDiscord,
};

// ── Register handlers ─────────────────────────────────────────────────

export function registerSettingsHandlers(): void {
  // ── Integrations ────────────────────────────────────────────────────
  ipcMain.handle('settings:getIntegrations', () => {
    return queryAll('SELECT * FROM integrations ORDER BY name ASC');
  });

  // ── Env values ──────────────────────────────────────────────────────
  ipcMain.handle('settings:getEnvValue', (_e, key: string) => {
    const vars = readEnvVars();
    const value = vars[key] ?? '';
    return { key, value: maskValue(key, value), hasValue: value.length > 0 };
  });

  ipcMain.handle('settings:setEnvValue', (_e, key: string, value: string) => {
    writeEnvVar(key, value);
    return { success: true };
  });

  // ── Test integration ────────────────────────────────────────────────
  ipcMain.handle('settings:testIntegration', async (_e, name: string) => {
    const testFn = testFunctions[name];
    if (!testFn) {
      return { success: false, error: `No test implemented for "${name}"` };
    }

    const env = readEnvVars();
    try {
      const result = await testFn(env);

      // Update integration record
      const now = new Date().toISOString();
      if (result.success) {
        execute(
          `UPDATE integrations SET status = 'connected', last_tested_at = ?, last_error = NULL, updated_at = ? WHERE name = ?`,
          [now, now, name]
        );
      } else {
        execute(
          `UPDATE integrations SET status = 'error', last_tested_at = ?, last_error = ?, updated_at = ? WHERE name = ?`,
          [now, result.message, now, name]
        );
      }

      return { success: result.success, message: result.message, error: result.success ? undefined : result.message };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      execute(
        `UPDATE integrations SET status = 'error', last_tested_at = ?, last_error = ?, updated_at = ? WHERE name = ?`,
        [now, message, now, name]
      );
      return { success: false, error: message };
    }
  });

  // ── App state (key-value) ───────────────────────────────────────────
  ipcMain.handle('settings:getAppState', (_e, key: string) => {
    const row = queryOne('SELECT value FROM app_state WHERE key = ?', [key]);
    return row ? (row.value as string) : null;
  });

  ipcMain.handle('settings:setAppState', (_e, key: string, value: string) => {
    execute(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, value]
    );
    return { success: true };
  });

  // ── App info ────────────────────────────────────────────────────────
  ipcMain.handle('settings:getAppInfo', () => {
    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'data', 'ops-hub.db');
    let version = '0.1.0';
    try {
      const pkgPath = app.isPackaged
        ? path.join(process.resourcesPath, 'package.json')
        : path.join(__dirname, '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version ?? version;
    } catch {
      // fallback to default
    }
    return { version, dbPath, userData };
  });

  ipcMain.handle('settings:openInChrome', (_e, url: string) => {
    const { exec } = require('child_process');
    // Windows: use 'start chrome', macOS: 'open -a "Google Chrome"', Linux: 'google-chrome'
    const platform = process.platform;
    if (platform === 'win32') {
      exec(`start chrome "${url}"`);
    } else if (platform === 'darwin') {
      exec(`open -a "Google Chrome" "${url}"`);
    } else {
      exec(`google-chrome "${url}"`);
    }
  });

  ipcMain.handle('settings:openDataFolder', () => {
    const userData = app.getPath('userData');
    const dataDir = path.join(userData, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    shell.openPath(dataDir);
  });

  ipcMain.handle('settings:resetDatabase', async () => {
    closeDB();
    const dbPath = path.join(app.getPath('userData'), 'data', 'ops-hub.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    await initDB();
    return { success: true };
  });

  // ── Read.ai: download recording ────────────────────────────────────

  ipcMain.handle('readai:downloadRecording', async (_e, meetingId: string) => {
    const meeting = queryOne(
      'SELECT readai_meeting_id, recording_url, title FROM meetings WHERE id = ?',
      [meetingId]
    );

    if (!meeting?.recording_url) {
      return { success: false, message: 'No recording URL available' };
    }

    const vars = readEnvVars();
    const recordingsDir = vars['READAI_RECORDINGS_PATH'] ||
      path.join(app.getPath('userData'), 'data', 'recordings');
    fs.mkdirSync(recordingsDir, { recursive: true });

    const safeTitle = ((meeting.title as string) || (meeting.readai_meeting_id as string))
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 80);

    const filename = `${safeTitle}_${meeting.readai_meeting_id}.mp4`;
    const filepath = path.join(recordingsDir, filename);

    try {
      const res = await fetch(meeting.recording_url as string);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(filepath, Buffer.from(buffer));

      execute('UPDATE meetings SET recording_local_path = ? WHERE id = ?', [filepath, meetingId]);
      return { success: true, filepath, size: buffer.byteLength };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Read.ai: full meeting detail ───────────────────────────────────

  ipcMain.handle('meetings:getFullDetail', (_e, meetingId: string) => {
    const meeting = queryOne('SELECT * FROM meetings WHERE id = ?', [meetingId]);
    const actionItems = queryAll(
      'SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at ASC',
      [meetingId]
    );
    return { meeting, actionItems };
  });

  // ── Read.ai: RAG readiness stats ──────────────────────────────────

  ipcMain.handle('readai:getRagStats', () => {
    return queryOne(`
      SELECT
        COUNT(*) as total_meetings,
        SUM(CASE WHEN expanded = 1 THEN 1 ELSE 0 END) as expanded,
        SUM(CASE WHEN transcript_text IS NOT NULL THEN 1 ELSE 0 END) as with_transcript,
        SUM(CASE WHEN summary IS NOT NULL THEN 1 ELSE 0 END) as with_summary,
        SUM(CASE WHEN recording_url IS NOT NULL THEN 1 ELSE 0 END) as with_recording,
        SUM(CASE WHEN recording_local_path IS NOT NULL THEN 1 ELSE 0 END) as downloaded_recordings
      FROM meetings
    `);
  });

}
