export interface Env {
  DB: D1Database;
  CLOUD_SYNC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for dashboard
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || token !== env.CLOUD_SYNC_API_KEY) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    try {
      // ── Sync routes (desktop pushes data) ─────────────────────────
      if (path === '/sync/batch' && request.method === 'POST') {
        const body = (await request.json()) as { statements: Array<{ sql: string; params: unknown[] }> };
        const stmts = body.statements ?? [];

        if (stmts.length === 0) return json({ success: true, executed: 0 }, 200, corsHeaders);

        const batch = stmts.map((s) => env.DB.prepare(s.sql).bind(...(s.params ?? [])));
        const results = await env.DB.batch(batch);

        return json({ success: true, executed: stmts.length }, 200, corsHeaders);
      }

      // ── API routes (dashboard reads data) ─────────────────────────
      if (path === '/api/companies' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          "SELECT * FROM companies WHERE status = 'active' ORDER BY name ASC"
        ).all();
        return json(rows.results, 200, corsHeaders);
      }

      if (path.startsWith('/api/companies/') && request.method === 'GET') {
        const id = path.split('/')[3];
        const subpath = path.split('/')[4];

        if (!subpath) {
          const row = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();
          return json(row, 200, corsHeaders);
        }

        if (subpath === 'contacts') {
          const rows = await env.DB.prepare(
            'SELECT * FROM contacts WHERE company_id = ? ORDER BY first_name ASC'
          ).bind(id).all();
          return json(rows.results, 200, corsHeaders);
        }

        if (subpath === 'meetings') {
          const rows = await env.DB.prepare(
            'SELECT * FROM meetings WHERE company_id = ? ORDER BY meeting_date DESC'
          ).bind(id).all();
          return json(rows.results, 200, corsHeaders);
        }
      }

      if (path === '/api/clients' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          "SELECT * FROM contacts WHERE tags LIKE '%client%' ORDER BY first_name ASC"
        ).all();
        return json(rows.results, 200, corsHeaders);
      }

      if (path === '/api/sync-health' && request.method === 'GET') {
        const runs = await env.DB.prepare(
          'SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50'
        ).all();
        const alerts = await env.DB.prepare(
          'SELECT * FROM sync_alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT 20'
        ).all();
        return json({ runs: runs.results, alerts: alerts.results }, 200, corsHeaders);
      }

      if (path === '/api/pulse' && request.method === 'GET') {
        const companies = await env.DB.prepare(
          "SELECT COUNT(*) as total, SUM(CASE WHEN sla_status = 'violation' THEN 1 ELSE 0 END) as violations FROM companies WHERE status = 'active'"
        ).first();
        const contacts = await env.DB.prepare('SELECT COUNT(*) as total FROM contacts').first();
        const messages = await env.DB.prepare('SELECT COUNT(*) as total FROM messages').first();
        return json({ companies, contacts, messages }, 200, corsHeaders);
      }

      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500, corsHeaders);
    }
  },
};

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
