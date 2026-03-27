/**
 * Structured logger for Client Ops Hub.
 * Every line is prefixed with a parseable tag so external scripts
 * can filter, count, and alert on specific event types.
 *
 * Format: [TAG] Message | key=value key=value
 *
 * Tags:
 *   [Scheduler]  — cron trigger events
 *   [Queue]      — queue consumer events
 *   [Sync]       — sync orchestration / adapters
 *   [API]        — HTTP request handling
 *   [Auth]       — OAuth / token operations
 *   [D1]         — database operations
 *   [Health]     — health score computations
 *   [Cloud]      — cloud sync operations
 *   [Notify]     — notification dispatch
 *   [Report]     — report generation
 *   [Kinsta]     — Kinsta hosting sync
 *   [Recovery]   — queue recovery / cleanup
 *   [Startup]    — app initialization
 *   [Shutdown]   — app teardown
 *   [Error]      — any error (always includes context)
 *   [Warn]       — non-fatal issues
 *   [Perf]       — timing / performance data
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMeta {
  [key: string]: string | number | boolean | null | undefined;
}

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  const pairs = Object.entries(meta)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return pairs ? ` | ${pairs}` : '';
}

function log(level: LogLevel, tag: string, message: string, meta?: LogMeta) {
  const line = `[${tag}] ${message}${formatMeta(meta)}`;
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  // Domain loggers
  scheduler: (msg: string, meta?: LogMeta) => log('info', 'Scheduler', msg, meta),
  queue:     (msg: string, meta?: LogMeta) => log('info', 'Queue', msg, meta),
  sync:      (msg: string, meta?: LogMeta) => log('info', 'Sync', msg, meta),
  api:       (msg: string, meta?: LogMeta) => log('info', 'API', msg, meta),
  auth:      (msg: string, meta?: LogMeta) => log('info', 'Auth', msg, meta),
  d1:        (msg: string, meta?: LogMeta) => log('info', 'D1', msg, meta),
  health:    (msg: string, meta?: LogMeta) => log('info', 'Health', msg, meta),
  cloud:     (msg: string, meta?: LogMeta) => log('info', 'Cloud', msg, meta),
  notify:    (msg: string, meta?: LogMeta) => log('info', 'Notify', msg, meta),
  report:    (msg: string, meta?: LogMeta) => log('info', 'Report', msg, meta),
  kinsta:    (msg: string, meta?: LogMeta) => log('info', 'Kinsta', msg, meta),
  recovery:  (msg: string, meta?: LogMeta) => log('info', 'Recovery', msg, meta),
  startup:   (msg: string, meta?: LogMeta) => log('info', 'Startup', msg, meta),
  shutdown:  (msg: string, meta?: LogMeta) => log('info', 'Shutdown', msg, meta),

  // Level loggers
  warn:  (tag: string, msg: string, meta?: LogMeta) => log('warn', 'Warn', `[${tag}] ${msg}`, meta),
  error: (tag: string, msg: string, meta?: LogMeta) => log('error', 'Error', `[${tag}] ${msg}`, meta),
  debug: (tag: string, msg: string, meta?: LogMeta) => log('debug', 'Debug', `[${tag}] ${msg}`, meta),
  perf:  (tag: string, msg: string, meta?: LogMeta) => log('info', 'Perf', `[${tag}] ${msg}`, meta),

  // Timing helper — returns a function that logs elapsed time
  time: (tag: string, operation: string): (() => void) => {
    const start = Date.now();
    return () => {
      const elapsed = Date.now() - start;
      log('info', 'Perf', `[${tag}] ${operation}`, { elapsed_ms: elapsed });
    };
  },
};
