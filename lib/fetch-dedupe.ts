const inflight = new Map<string, Promise<unknown>>();

/**
 * Dedupes concurrent fetches by key. Concurrent callers for the same key
 * share a single in-flight promise; once it settles, the entry is removed.
 * Prevents duplicate network requests from React 19 Strict Mode's parallel
 * mount, rapid re-renders, or Fast Refresh re-invocations.
 * @param key - Unique key identifying this request (URL + relevant params).
 * @param fetcher - Function that initiates the request and returns the parsed result.
 * @returns The fetcher result, shared across concurrent callers.
 */
export function dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
