import path from 'path';
import fs from 'fs';

/**
 * Read an env value from the user's .env file (main process only).
 * This avoids importing settings.ts which registers IPC handlers.
 */
export function getEnvValue(key: string): string | null {
  try {
    const app = require('electron').app as import('electron').App;
    const envPath = path.join(app.getPath('userData'), '.env');
    if (!fs.existsSync(envPath)) return null;

    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k === key) return v || null;
    }
    return null;
  } catch {
    return process.env[key] || null;
  }
}
