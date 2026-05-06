'use client';

import { useEffect, useState } from 'react';

/**
 * Track a CSS media query as boolean state. SSR returns the `defaultValue`
 * (defaults to `false`) and the real value lands on the first client paint.
 *
 * @param query - Standard CSS media query string (e.g. `(min-width: 1280px)`).
 * @param defaultValue - SSR fallback. Defaults to `false`.
 * @returns `true` when the query currently matches.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);
  const [prevQuery, setPrevQuery] = useState(query);

  if (query !== prevQuery) {
    setPrevQuery(query);
    if (typeof window !== 'undefined') {
      setMatches(window.matchMedia(query).matches);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    if (mql.matches !== matches) setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}
