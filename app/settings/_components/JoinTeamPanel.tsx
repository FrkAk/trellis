'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/shared/Button';
import { joinTeamByCodeAction } from '@/lib/actions/team-invite-code';
import {
  INVITE_CODE_ALPHABET_PATTERN_SOURCE,
  INVITE_CODE_LENGTH,
  INVITE_CODE_PATTERN,
} from '@/lib/auth/invite-code-shape';

const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-base px-4 py-3 text-sm font-mono tracking-wider text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

const HTML_PATTERN = `${INVITE_CODE_ALPHABET_PATTERN_SOURCE}{${INVITE_CODE_LENGTH}}`;
const PLACEHOLDER = '8K3jH-pX9_aW2nQ7vB4mF';

interface JoinTeamPanelProps {
  /** Called when the user dismisses the panel without joining a team. */
  onCancel: () => void;
  /** Called after a successful redemption with the joined team's id. */
  onJoined: (organizationId: string) => void;
}

/**
 * Inline panel for joining an existing team via invite code. Delegates to
 * the canonical `joinTeamByCodeAction` server action so all auth, rate
 * limit, and anti-enumeration guarantees are preserved unchanged. The
 * server message is surfaced verbatim — branching UI text on the failure
 * code would defeat the generic message that hides whether a code never
 * existed, was revoked, expired, or hit its use limit.
 *
 * @param props - Panel callbacks.
 * @returns Accent-tinted form rendered above the team list.
 */
export function JoinTeamPanel({ onCancel, onJoined }: JoinTeamPanelProps) {
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();
  const canSubmit = INVITE_CODE_PATTERN.test(trimmed) && !pending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await joinTeamByCodeAction({ code: trimmed });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onJoined(result.data.organizationId);
      } catch {
        setError(
          'Something went wrong reaching the server. Check your connection and try again.',
        );
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-accent/25 bg-accent/5 p-5 shadow-[var(--shadow-card)]"
    >
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-light">
        Join a team
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-secondary">
          Invite code
        </span>
        <input
          type="text"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="text"
          name="invite-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          pattern={HTML_PATTERN}
          placeholder={PLACEHOLDER}
          className={INPUT_CLASS}
        />
        <span className="mt-1 block text-xs text-text-muted">
          Paste the {INVITE_CODE_LENGTH}-character invite code from a team admin.
        </span>
      </label>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-xs text-cancelled"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!canSubmit}
          isLoading={pending}
        >
          Join team
        </Button>
      </div>
    </form>
  );
}
