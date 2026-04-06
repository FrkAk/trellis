/**
 * Global rate limiter for LLM API calls.
 * Enforces minimum spacing between requests to stay within free-tier RPM limits.
 * Gemini 3.1 Flash Lite free tier: 15 RPM, 500 RPD.
 */

const requestTimestamps: number[] = [];
const MAX_RPM = 12;
const WINDOW_MS = 60_000;
const MIN_SPACING_MS = Math.ceil(WINDOW_MS / MAX_RPM);
const MAX_RETRIES = 6;
const BASE_DELAY_MS = 15_000;

let lastRequestTime = 0;

let _queue: Promise<void> = Promise.resolve();

/**
 * Wait until a request slot is available, enforcing both RPM window and minimum spacing.
 * Concurrent callers are serialized via a promise chain to prevent race conditions.
 * @returns Resolves when a slot has been acquired.
 */
export async function waitForRateLimit(): Promise<void> {
  const ticket = _queue.then(() => _acquireSlot());
  _queue = ticket.then(() => undefined, () => undefined);
  return ticket;
}

/**
 * Acquire a single rate-limit slot, waiting as needed.
 * Uses a while loop to re-check after sleeping when the window is full.
 * @returns Resolves when the slot is acquired and timestamps are recorded.
 */
async function _acquireSlot(): Promise<void> {
  while (true) {
    const now = Date.now();

    while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= MAX_RPM) {
      const waitTime = requestTimestamps[0]! + WINDOW_MS - now + 500;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    const timeSinceLast = Date.now() - lastRequestTime;
    if (timeSinceLast < MIN_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_SPACING_MS - timeSinceLast));
    }

    lastRequestTime = Date.now();
    requestTimestamps.push(lastRequestTime);
    return;
  }
}

/**
 * Get seconds until the next rate limit slot opens.
 * @returns Seconds to wait, or 0 if a slot is available now.
 */
export function getCooldownSeconds(): number {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length < MAX_RPM) return 0;
  return Math.ceil((requestTimestamps[0]! + WINDOW_MS - now) / 1000);
}

/**
 * Custom error for rate limit exhaustion after all retries.
 */
export class RateLimitError extends Error {
  /** Seconds until a rate-limit slot opens. */
  cooldownSeconds: number;

  /**
   * @param cooldownSeconds - Seconds until a slot opens.
   */
  constructor(cooldownSeconds: number) {
    super(`Rate limit exceeded. Try again in ${cooldownSeconds} seconds.`);
    this.name = "RateLimitError";
    this.cooldownSeconds = cooldownSeconds;
  }
}

/**
 * Create a rate-limited fetch wrapper that retries on 429 with patient backoff.
 * @param baseFetch - The underlying fetch implementation.
 * @returns A fetch function with rate limiting and 429 retry.
 */
export function createRateLimitedFetch(
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await waitForRateLimit();
      const response = await baseFetch(input, init);

      if (response.status !== 429) return response;

      if (attempt === MAX_RETRIES) {
        const cooldown = getCooldownSeconds();
        throw new RateLimitError(cooldown || 60);
      }

      const retryAfter = response.headers.get("retry-after");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS + (attempt * 10_000);
      console.warn(`[rate-limiter] 429 received, waiting ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new RateLimitError(getCooldownSeconds() || 60);
  };
}
