import type { RateLimitBackend, RateLimitResult } from "./rate-limit";

/**
 * In-memory sliding window rate limit backend.
 * Suitable for single-process deployments (Bun/Docker).
 */
export class MemoryRateLimitBackend implements RateLimitBackend {
  private windows = new Map<string, number[]>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private maxWindowMs: number;

  /**
   * Initialize the backend and start the periodic cleanup timer.
   * @param maxWindowMs - Initial maximum window in ms used for stale entry
   *   cleanup. Grows monotonically: any `check()` call with a larger window
   *   bumps it, so callers don't have to register up-front and the cleaner
   *   can never wrongly evict a still-live timestamp.
   */
  constructor(maxWindowMs: number) {
    this.maxWindowMs = maxWindowMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer?.unref) this.cleanupTimer.unref();
  }

  /**
   * Check and consume one request against the rate limit.
   * @param key - Unique key identifying the client (e.g. IP, session, API key).
   * @param max - Maximum requests allowed in the window.
   * @param windowSeconds - Window duration in seconds.
   * @returns Result with allowed status and quota info.
   */
  async check(
    key: string,
    max: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    if (windowMs > this.maxWindowMs) this.maxWindowMs = windowMs;
    let timestamps = this.windows.get(key) ?? [];

    timestamps = timestamps.filter((t) => now - t < windowMs);

    const allowed = timestamps.length < max;
    if (allowed) {
      timestamps.push(now);
    }
    this.windows.set(key, timestamps);

    const resetIn =
      timestamps.length > 0
        ? Math.ceil((timestamps[0]! + windowMs - now) / 1000)
        : windowSeconds;

    return {
      allowed,
      limit: max,
      remaining: Math.max(0, max - timestamps.length),
      resetIn,
    };
  }

  /**
   * Remove stale keys to prevent unbounded memory growth.
   * Uses the maximum configured rule window to avoid evicting live entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const live = timestamps.filter((t) => now - t < this.maxWindowMs);
      if (live.length === 0) this.windows.delete(key);
      else this.windows.set(key, live);
    }
  }
}
