import { randomUUID } from 'crypto';
import { queryAll, queryOne, execute } from '../db/client';
import { CONTENT_RULES, wordCount } from './rules';

// ── Scan + Chunk ──────────────────────────────────────────────────────

export interface ScanResult {
  sourceType: string;
  totalRows: number;
  eligibleRows: number;
  chunksCreated: number;
  chunksSkipped: number;
}

export async function scanAndChunkAllSources(): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const rule of CONTENT_RULES) {
    const result = scanSource(rule);
    results.push(result);

    execute(
      `INSERT OR REPLACE INTO rag_processing_stats (id, source_type, total_source_rows, eligible_rows, chunks_created, chunks_skipped, last_processed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [rule.sourceType, rule.sourceType, result.totalRows, result.eligibleRows, result.chunksCreated, result.chunksSkipped]
    );
  }

  return results;
}

function scanSource(rule: { sourceType: string; sourceTable: string; eligibilityFilter: (row: Record<string, unknown>) => boolean; contentExtractor: (row: Record<string, unknown>) => Array<{ content: string; chunkIndex: number; metadata: Record<string, unknown> }> }): ScanResult {
  const result: ScanResult = { sourceType: rule.sourceType, totalRows: 0, eligibleRows: 0, chunksCreated: 0, chunksSkipped: 0 };

  // Only process rows not yet in rag_chunks for this source type
  let rows: Array<Record<string, unknown>>;
  try {
    rows = queryAll(
      `SELECT s.* FROM ${rule.sourceTable} s WHERE NOT EXISTS (SELECT 1 FROM rag_chunks rc WHERE rc.source_table = ? AND rc.source_id = s.id) LIMIT 1000`,
      [rule.sourceTable]
    ) as Array<Record<string, unknown>>;
  } catch {
    return result; // table may not exist
  }

  result.totalRows = rows.length;

  for (const row of rows) {
    if (!rule.eligibilityFilter(row)) {
      result.chunksSkipped++;
      // Insert skip marker
      execute(
        `INSERT OR IGNORE INTO rag_chunks (id, source_type, source_table, source_id, chunk_index, content, word_count, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, '', 0, 'skipped', datetime('now'), datetime('now'))`,
        [randomUUID(), rule.sourceType, rule.sourceTable, row.id as string]
      );
      continue;
    }

    result.eligibleRows++;
    const chunks = rule.contentExtractor(row);

    for (const chunk of chunks) {
      const wc = wordCount(chunk.content);
      if (wc < 5) continue;

      execute(
        `INSERT OR IGNORE INTO rag_chunks (id, source_type, source_table, source_id, chunk_index, company_id, contact_id, meeting_id, content, word_count, metadata_json, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
        [
          randomUUID(), rule.sourceType, rule.sourceTable, row.id as string, chunk.chunkIndex,
          (row.company_id as string) ?? null, (row.contact_id as string) ?? null, (row.meeting_id as string) ?? (rule.sourceTable === 'meetings' ? row.id as string : null),
          chunk.content, wc, JSON.stringify(chunk.metadata),
        ]
      );
      result.chunksCreated++;
    }
  }

  return result;
}

// ── Embed ─────────────────────────────────────────────────────────────

export interface EmbedResult {
  processed: number;
  embedded: number;
  failed: number;
}

export async function embedPendingChunks(batchSize: number = 20): Promise<EmbedResult> {
  const result: EmbedResult = { processed: 0, embedded: 0, failed: 0 };
  const provider = process.env.RAG_EMBEDDING_PROVIDER;
  if (!provider) return result;

  const pending = queryAll(
    "SELECT id, content FROM rag_chunks WHERE embedding_status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [batchSize]
  );

  if (pending.length === 0) return result;

  const texts = pending.map((r) => r.content as string);

  try {
    let vectors: number[][];
    if (provider === 'cloudflare') {
      vectors = await embedCloudflare(texts);
    } else if (provider === 'openai') {
      vectors = await embedOpenAI(texts);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const model = process.env.RAG_EMBEDDING_MODEL ?? provider;

    for (let i = 0; i < pending.length; i++) {
      const vec = vectors[i];
      if (!vec) {
        execute("UPDATE rag_chunks SET embedding_status = 'failed', error = 'No vector returned', updated_at = datetime('now') WHERE id = ?", [pending[i].id as string]);
        result.failed++;
        continue;
      }
      const buf = Buffer.from(new Float32Array(vec).buffer);
      execute(
        "UPDATE rag_chunks SET embedding_vector = ?, embedding_status = 'embedded', embedding_model = ?, embedding_dim = ?, embedded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [buf, model, vec.length, pending[i].id as string]
      );
      result.embedded++;
    }
    result.processed = pending.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const row of pending) {
      execute("UPDATE rag_chunks SET embedding_status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?", [msg, row.id as string]);
    }
    result.failed = pending.length;
    result.processed = pending.length;
  }

  updateRagStats();
  return result;
}

async function embedCloudflare(texts: string[]): Promise<number[][]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  const model = process.env.RAG_EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5';
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN required');

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts }),
  });
  if (!res.ok) throw new Error(`Cloudflare AI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { result?: { data?: number[][] } };
  return data.result?.data ?? [];
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small';
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

// ── Search ────────────────────────────────────────────────────────────

export async function ragSearch(query: string, limit: number = 10, filters?: { companyId?: string; sourceType?: string }): Promise<Array<{ id: string; content: string; score: number; sourceType: string; companyName: string | null; metadata: unknown }>> {
  const provider = process.env.RAG_EMBEDDING_PROVIDER;
  if (!provider) return [];

  let queryVec: number[];
  if (provider === 'cloudflare') {
    const vecs = await embedCloudflare([query]);
    queryVec = vecs[0];
  } else {
    const vecs = await embedOpenAI([query]);
    queryVec = vecs[0];
  }
  if (!queryVec) return [];

  let sql = "SELECT id, content, metadata_json, embedding_vector, source_type, company_name FROM rag_chunks WHERE embedding_status = 'embedded'";
  const params: unknown[] = [];
  if (filters?.companyId) { sql += ' AND company_id = ?'; params.push(filters.companyId); }
  if (filters?.sourceType) { sql += ' AND source_type = ?'; params.push(filters.sourceType); }

  const rows = queryAll(sql, params);

  const scored = rows.map((row) => {
    const stored = new Float32Array((row.embedding_vector as Buffer).buffer, (row.embedding_vector as Buffer).byteOffset, (row.embedding_vector as Buffer).byteLength / 4);
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < queryVec.length; i++) {
      dot += queryVec[i] * stored[i]; nA += queryVec[i] ** 2; nB += stored[i] ** 2;
    }
    const score = dot / (Math.sqrt(nA) * Math.sqrt(nB));
    return { id: row.id as string, content: (row.content as string).slice(0, 300), score, sourceType: row.source_type as string, companyName: (row.company_name as string) ?? null, metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : null };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Stats ─────────────────────────────────────────────────────────────

function updateRagStats(): void {
  const sources = queryAll("SELECT DISTINCT source_type FROM rag_chunks");
  for (const s of sources) {
    const st = s.source_type as string;
    const stats = queryOne(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN embedding_status = 'embedded' THEN 1 ELSE 0 END) as embedded,
        SUM(CASE WHEN embedding_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN embedding_status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM rag_chunks WHERE source_type = ?`, [st]);
    execute(
      `UPDATE rag_processing_stats SET chunks_created = ? - COALESCE(?, 0), chunks_embedded = ?, chunks_failed = ?, chunks_skipped = ?, updated_at = datetime('now') WHERE source_type = ?`,
      [(stats?.total as number) ?? 0, (stats?.skipped as number) ?? 0, (stats?.embedded as number) ?? 0, (stats?.failed as number) ?? 0, (stats?.skipped as number) ?? 0, st]
    );
  }
}

export function getRagTotals(): Record<string, unknown> {
  return queryOne(`
    SELECT COUNT(*) as total_chunks,
      SUM(CASE WHEN embedding_status = 'embedded' THEN 1 ELSE 0 END) as embedded,
      SUM(CASE WHEN embedding_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN embedding_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN embedding_status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(word_count) as total_words,
      SUM(CASE WHEN embedding_vector IS NOT NULL THEN length(embedding_vector) ELSE 0 END) as vector_bytes
    FROM rag_chunks
  `) ?? {};
}
