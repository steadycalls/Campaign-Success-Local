/**
 * Database adapter interface.
 *
 * Abstracts the difference between:
 * - Local: sql.js (synchronous, in-process SQLite via WASM)
 * - Cloud: Cloudflare D1 (async, HTTP-based SQLite)
 *
 * All methods return Promises so the interface works for both.
 * The local adapter wraps synchronous sql.js calls in Promise.resolve().
 */

export interface DBAdapter {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void>;
}
