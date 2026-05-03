'use client';

import { motion } from 'motion/react';
import type { OAuthSessionView } from '@/lib/actions/oauth-session';
import { revokeOAuthSessionAction } from '@/lib/actions/oauth-session';
import { formatOAuthClientName } from '@/lib/ui/oauth-client-name';
import { formatAbsolute, formatRelative } from '@/lib/ui/relative-time';
import { InlineConfirm } from './InlineConfirm';

interface SessionRowProps {
  /** OAuth session to render. */
  session: OAuthSessionView;
  /** Called after a successful revoke so the parent can drop the row. */
  onRevoked: (id: string) => void;
  /** Called after a failed revoke to surface an inline error. */
  onError: (message: string) => void;
}

interface AgentSessionGlyphProps {
  /** Tailwind classes controlling the rendered icon size. */
  className?: string;
}

/**
 * Neutral glyph for OAuth device sessions.
 *
 * @param props - Icon size configuration.
 * @returns SVG glyph for an authorized coding-agent session.
 */
export function AgentSessionGlyph({
  className = 'h-4 w-4',
}: AgentSessionGlyphProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M11 1.25a.5.5 0 01.47.33l.62 1.73 1.73.62a.5.5 0 010 .94l-1.73.62-.62 1.73a.5.5 0 01-.94 0l-.62-1.73-1.73-.62a.5.5 0 010-.94l1.73-.62.62-1.73a.5.5 0 01.47-.33zM2 4.5A1.5 1.5 0 013.5 3h3a.75.75 0 010 1.5h-3v8h9v-3a.75.75 0 011.5 0v3a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-8zm3.22 2.03a.75.75 0 011.06 0l1.44 1.44a.75.75 0 010 1.06l-1.44 1.44a.75.75 0 11-1.06-1.06l.91-.91-.91-.91a.75.75 0 010-1.06zM8.75 10h1.75a.75.75 0 010 1.5H8.75a.75.75 0 010-1.5z" />
    </svg>
  );
}

/**
 * Single OAuth session row — icon tile, client name, meta line with
 * authorized/last-used relative timestamps, and an inline revoke
 * confirmation.
 *
 * @param props - Session row configuration.
 * @returns Rendered row with revoke action.
 */
export function SessionRow({ session, onRevoked, onError }: SessionRowProps) {
  const handleRevoke = async () => {
    const result = await revokeOAuthSessionAction({ sessionId: session.id });
    if (result.ok) {
      onRevoked(session.id);
    } else {
      onError(result.message);
    }
  };

  const lastActiveLabel = formatRelative(session.lastActiveAt);
  const authorizedLabel = formatRelative(session.authorizedAt);
  const clientLabel = formatOAuthClientName(session.clientName);
  const tooltip = `Authorized ${formatAbsolute(session.authorizedAt)} · Last active ${formatAbsolute(session.lastActiveAt)}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-text-secondary">
        <AgentSessionGlyph />
      </div>

      <div className="min-w-0 flex-1" title={tooltip}>
        <p className="truncate text-sm font-semibold text-text-primary">
          {clientLabel}
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          Last active {lastActiveLabel} · Authorized {authorizedLabel}
          {session.organizationName ? ` · ${session.organizationName}` : ''}
        </p>
      </div>

      <InlineConfirm
        trigger={
          <button
            type="button"
            className="cursor-pointer rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-cancelled/40 hover:text-cancelled"
          >
            Revoke
          </button>
        }
        prompt="Revoke this session?"
        body="The client will need to re-authorize."
        confirmLabel="Revoke"
        destructive
        onConfirm={handleRevoke}
      />
    </motion.div>
  );
}
