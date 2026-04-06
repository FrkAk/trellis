'use client';

import { useEffect, useRef } from 'react';

/**
 * Refreshes on tab focus + listens for real-time SSE change events.
 * SSE catches changes from MCP agents or other instances while the tab is active.
 * Tab focus catches changes that happened while the tab was hidden.
 * @param callback - Function to call when a change is detected.
 * @param sseUrl - Optional SSE endpoint URL for real-time events.
 */
export function useRefreshOnFocus(callback: () => void, sseUrl?: string) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Refresh on tab focus
  useEffect(() => {
    function onVisibilityChange() {
      if (!document.hidden) callbackRef.current();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Real-time SSE listener
  useEffect(() => {
    if (!sseUrl) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource(sseUrl!);
      es.onmessage = () => callbackRef.current();
      es.onerror = () => {
        es?.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, [sseUrl]);
}
