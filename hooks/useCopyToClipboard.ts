import { useCallback, useEffect, useRef, useState } from 'react';

/** Copy-to-clipboard lifecycle state. */
export type CopyStatus = 'idle' | 'copied' | 'error';

/**
 * Copy-to-clipboard state with auto-reset and error surfacing.
 *
 * Catches clipboard write failures (insecure context, Permissions-Policy,
 * unfocused document) and exposes them via the `'error'` status. Clears any
 * pending reset timer on unmount or rapid re-copy to avoid stale updates.
 *
 * @param resetMs - How long a non-idle status persists (default 1200ms).
 * @returns `{ status, copy }` — call `copy(text)` per invocation.
 */
export function useCopyToClipboard(resetMs = 1200) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Write `text` to the clipboard and update status.
   * @param text - String to write to the clipboard.
   * @returns Resolves once status has transitioned.
   */
  const copy = useCallback(async (text: string) => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
    timeoutRef.current = setTimeout(() => {
      setStatus('idle');
      timeoutRef.current = null;
    }, resetMs);
  }, [resetMs]);

  return { status, copy };
}
