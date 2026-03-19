export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      console.log(
        `[rateLimit] Retry ${attempt + 1}/${maxRetries} after ${Math.round(wait)}ms (status=${status})`
      );
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
