import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../../db/client';
import { delay } from '../utils/rateLimit';
import { type SyncCounts } from '../utils/logger';
import { logger } from '../../lib/logger';

const DISCORD_BASE = 'https://discord.com/api/v10';

async function discordFetch(path: string, botToken: string): Promise<unknown> {
  const res = await fetch(`${DISCORD_BASE}${path}`, {
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
  });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') ?? '5');
    logger.warn('Discord', 'Rate limited', { retry_after_s: retryAfter });
    await delay(retryAfter * 1000);
    const retry = await fetch(`${DISCORD_BASE}${path}`, {
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    });
    if (!retry.ok) throw new Error(`Discord ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const CHANNEL_TYPES: Record<number, string> = {
  0: 'text', 2: 'voice', 4: 'category', 5: 'announcement',
  10: 'announcement_thread', 11: 'public_thread', 12: 'private_thread',
  13: 'stage', 15: 'forum', 16: 'media',
};

export async function testDiscordConnection(botToken: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = (await discordFetch('/users/@me', botToken)) as { username?: string; id?: string };
    return { success: true, message: `Connected as ${user.username} (${user.id})` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncDiscordChannels(botToken: string, guildId?: string): Promise<SyncCounts> {
  const counts: SyncCounts = { found: 0, created: 0, updated: 0 };
  const now = new Date().toISOString();

  let guildIds: string[] = [];
  if (guildId) {
    guildIds = [guildId];
  } else {
    const guilds = (await discordFetch('/users/@me/guilds', botToken)) as Array<Record<string, unknown>>;
    guildIds = guilds.map((g) => g.id as string);
    for (const g of guilds) {
      const existing = queryOne('SELECT id FROM discord_servers WHERE discord_server_id = ?', [g.id as string]);
      if (existing) {
        execute(
          'UPDATE discord_servers SET name = ?, icon_url = ?, raw_json = ?, synced_at = ? WHERE id = ?',
          [(g.name as string) ?? '', (g.icon as string) ?? null, JSON.stringify(g), now, existing.id as string]
        );
      } else {
        execute(
          'INSERT INTO discord_servers (id, discord_server_id, name, icon_url, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), g.id as string, (g.name as string) ?? '', (g.icon as string) ?? null, JSON.stringify(g), now]
        );
      }
    }
  }

  for (const gId of guildIds) {
    const channels = (await discordFetch(`/guilds/${gId}/channels`, botToken)) as Array<Record<string, unknown>>;
    const server = queryOne('SELECT name FROM discord_servers WHERE discord_server_id = ?', [gId]);
    const serverName = (server?.name as string) ?? '';

    for (const ch of channels) {
      counts.found++;
      const discordChId = ch.id as string;
      const existing = queryOne('SELECT id FROM discord_channels WHERE discord_channel_id = ?', [discordChId]);

      const fields = {
        discord_server_id: gId,
        server_name: serverName,
        name: (ch.name as string) ?? '',
        type: CHANNEL_TYPES[ch.type as number] ?? `type_${ch.type}`,
        topic: (ch.topic as string) ?? null,
        position: (ch.position as number) ?? 0,
        parent_id: (ch.parent_id as string) ?? null,
      };

      if (existing) {
        execute(
          `UPDATE discord_channels SET discord_server_id=?, server_name=?, name=?, type=?, topic=?, position=?, parent_id=?, raw_json=?, synced_at=?, updated_at=datetime('now') WHERE id=?`,
          [fields.discord_server_id, fields.server_name, fields.name, fields.type, fields.topic, fields.position, fields.parent_id, JSON.stringify(ch), now, existing.id as string]
        );
        counts.updated++;
      } else {
        execute(
          `INSERT INTO discord_channels (id, discord_channel_id, discord_server_id, server_name, name, type, topic, position, parent_id, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), discordChId, fields.discord_server_id, fields.server_name, fields.name, fields.type, fields.topic, fields.position, fields.parent_id, JSON.stringify(ch), now]
        );
        counts.created++;
      }
    }

    await delay(500);
  }

  return counts;
}
