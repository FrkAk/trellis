'use client';

import { useCallback, useState, useTransition } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  listOAuthSessionsAction,
  type OAuthSessionView,
} from '@/lib/actions/oauth-session';
import { EmptyState } from './EmptyState';
import { AgentSessionGlyph, SessionRow } from './SessionRow';

interface DevicesTabProps {
  /** Initial session list, hydrated from the server component. */
  initialSessions: OAuthSessionView[];
}

/**
 * Devices tab — lists active OAuth (MCP) device sessions with a refresh
 * action and inline revoke. Optimistically removes a row on revoke and
 * rolls back if the server rejects.
 *
 * @param props - Initial server-rendered session list.
 * @returns Rendered tab body.
 */
export function DevicesTab({ initialSessions }: DevicesTabProps) {
  const [sessions, setSessions] = useState<OAuthSessionView[]>(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleRevoked = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  const handleRefresh = () => {
    setError(null);
    startTransition(async () => {
      const result = await listOAuthSessionsAction();
      if (result.ok) {
        setSessions(result.data);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Active sessions · {sessions.length}
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={pending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
          aria-label="Refresh sessions"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`}
          >
            <path d="M8 3V1.5a.5.5 0 01.85-.36l2.5 2.5a.5.5 0 010 .72l-2.5 2.5A.5.5 0 018 6.5V5a3 3 0 100 6 .75.75 0 010 1.5A4.5 4.5 0 118 3z" />
          </svg>
          Refresh
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-xs text-cancelled"
        >
          {error}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          icon={<AgentSessionGlyph className="h-6 w-6" />}
          title="No active sessions"
          body="Connect Mymir to your coding agent (Claude Code, Cursor, etc.) to see authorized devices here."
        />
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoked={handleRevoked}
                onError={handleError}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
