'use client';

import { motion } from 'motion/react';
import type { OAuthSessionView } from '@/lib/actions/oauth-session';
import { revokeOAuthSessionAction } from '@/lib/actions/oauth-session';
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

/** Pick a glyph for the row icon based on the OAuth client name. */
function ClientGlyph({ name }: { name: string }) {
  if (/claude/i.test(name)) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path d="M8 0l1.6 4.5L14 6l-4.4 1.5L8 12l-1.6-4.5L2 6l4.4-1.5L8 0zm5 9l.8 2 2.2.8-2.2.8L13 15l-.8-2.4-2.2-.8 2.2-.8L13 9z" />
      </svg>
    );
  }
  if (/cursor/i.test(name)) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path d="M3 1.5a.5.5 0 01.8-.4l9 6.5a.5.5 0 01-.1.9l-3.6 1-1 3.6a.5.5 0 01-.9.1l-4.5-9A.5.5 0 013 1.5z" />
      </svg>
    );
  }
  if (/codex|gemini|copilot|terminal/i.test(name)) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm2.3 3.3a.75.75 0 011.05-.05l2.5 2.25a.75.75 0 010 1.1l-2.5 2.25a.75.75 0 11-1-1.1L6.18 9 4.3 7.35a.75.75 0 010-1.05zM8.5 11h3a.75.75 0 010 1.5h-3a.75.75 0 010-1.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M5 1a1 1 0 011 1v3h4V2a1 1 0 112 0v3h.5a.5.5 0 010 1H12v2.5a4 4 0 01-3 3.87V14a1 1 0 11-2 0v-1.63A4 4 0 014 8.5V6h-.5a.5.5 0 010-1H4V2a1 1 0 011-1z" />
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
        <ClientGlyph name={session.clientName} />
      </div>

      <div className="min-w-0 flex-1" title={tooltip}>
        <p className="truncate text-sm font-semibold text-text-primary">
          {session.clientName}
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
