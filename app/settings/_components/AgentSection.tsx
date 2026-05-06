'use client';

import { AnimatePresence } from 'motion/react';
import { IconAgent } from '@/components/shared/icons';
import type { OAuthSessionView } from '@/lib/actions/oauth-session';
import { AgentSessionRow } from './AgentSessionRow';

interface AgentSectionProps {
  /** Brand label rendered in the card header (e.g. "Claude Code"). */
  brand: string;
  /** Sessions belonging to this brand — already filtered by the parent. */
  sessions: OAuthSessionView[];
  /** Empty-state body copy override. Defaults to the standard MCP onboarding hint. */
  emptyBody?: string;
  /** Called when a row inside this section is revoked. */
  onRevoked: (id: string) => void;
  /** Called when a revoke action fails. */
  onError: (message: string) => void;
}

/**
 * One brand-grouped card. Header shows the brand name + session count;
 * body renders one {@link AgentSessionRow} per active session, or the
 * empty-state copy when no sessions are authorized.
 *
 * @param props - Section configuration.
 * @returns Card with a header strip and a stacked list (or empty state).
 */
export function AgentSection({
  brand,
  sessions,
  emptyBody = 'No sessions yet. Run `/mcp` in your CLI to authorize.',
  onRevoked,
  onError,
}: AgentSectionProps) {
  const count = sessions.length;

  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-surface shadow-[var(--shadow-card)]">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: 'var(--color-accent-grad)', color: '#0b0c10' }}
        >
          <IconAgent size={14} />
        </span>
        <span className="text-[13px] font-semibold text-text-primary">
          {brand}
        </span>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-muted">
          {count} {count === 1 ? 'session' : 'sessions'}
        </span>
      </header>

      {count === 0 ? (
        <p className="px-4 py-5 text-[12px] leading-relaxed text-text-muted">
          {emptyBody}
        </p>
      ) : (
        <div>
          <AnimatePresence initial={false}>
            {sessions.map((session, idx) => (
              <AgentSessionRow
                key={session.id}
                session={session}
                showDivider={idx < sessions.length - 1}
                onRevoked={onRevoked}
                onError={onError}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
