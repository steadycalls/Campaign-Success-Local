import { logger } from '../../lib/logger';

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Token-bucket rate limiter (ported from ri_sales_pulse) ───────────
//
// Serializes concurrent API callers into a queue.
// Burst of maxTokens, then sustains refillRate requests/sec.
// GHL allows ~100 req/10s — we use { maxTokens: 5, refillRate: 3 }.

export class GHLRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;
  private queue: (() => void)[] = [];
  private draining = false;

  constructor(opts: { maxTokens: number; refillRate: number }) {
    this.maxTokens = opts.maxTokens;
    this.tokens = opts.maxTokens;
    this.refillRate = opts.refillRate;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    while (this.queue.length > 0) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const next = this.queue.shift()!;
        next();
      } else {
        const waitMs = Math.ceil(((1 - this.tokens) / this.refillRate) * 1000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.draining = false;
  }
}

// ── Per-company rate limiter registry ────────────────────────────────
// GHL rate limits are per-location, so each subaccount gets its own limiter.

const limiters = new Map<string, GHLRateLimiter>();

export function getGHLRateLimiter(companyId: string): GHLRateLimiter {
  if (!limiters.has(companyId)) {
    limiters.set(companyId, new GHLRateLimiter({ maxTokens: 5, refillRate: 3 }));
  }
  return limiters.get(companyId)!;
}

// Global fallback for calls without a company context
const globalLimiter = new GHLRateLimiter({ maxTokens: 5, refillRate: 3 });

export function getGlobalGHLRateLimiter(): GHLRateLimiter {
  return globalLimiter;
}

interface BackoffOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

/**
 * Retries `fn` on 429 (rate limit) responses with exponential backoff + jitter.
 * Also retries on 5xx server errors.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const { maxRetries = 5, baseDelay = 200, maxDelay = 30_000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const exponential = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay;
      const wait = Math.min(exponential + jitter, maxDelay);

      logger.warn('RateLimit', 'Retrying', { attempt: attempt + 1, max_retries: maxRetries, wait_ms: Math.round(wait), status: status as number });
      await delay(wait);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('withBackoff exhausted retries');
}

/**
 * Wraps fetch to throw an error object with `.status` for non-OK responses,
 * so withBackoff can inspect the status code.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  backoffOptions?: BackoffOptions
): Promise<Response> {
  return withBackoff(async () => {
    const res = await fetch(url, init);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res;
  }, backoffOptions);
}
