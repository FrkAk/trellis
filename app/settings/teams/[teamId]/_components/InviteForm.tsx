'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/shared/Button';
import { inviteMemberAction } from '@/lib/actions/team';

const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

interface InviteFormProps {
  /** Called after a successful invite to refresh the pending list. */
  onInvited: () => Promise<void> | void;
  /** Surface a transient error from the action. */
  onError: (message: string) => void;
}

/**
 * Email-invite form. Sends a Better Auth invitation row to the active
 * team. Email delivery itself is wired in MYMR-153 — for now the row
 * appears in the pending list and an admin must share the invite link
 * out-of-band (or use the invite-code panel).
 *
 * Owner role is intentionally absent from the role picker: only owners
 * can promote-to-owner anyway, and even owners must invite-then-promote
 * rather than invite directly to the owner role (BA enforces this).
 *
 * @param props - Form callbacks.
 * @returns Email + role picker row with Send button.
 */
export function InviteForm({ onInvited, onError }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [pending, startTransition] = useTransition();

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && trimmed.includes('@') && !pending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await inviteMemberAction({ email: trimmed, role });
      if (!result.ok) {
        onError(result.message);
        return;
      }
      setEmail('');
      await onInvited();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Invite by email
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            Email address
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="alex@example.com"
            className={INPUT_CLASS}
          />
        </label>
        <label className="lg:w-40">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as 'member' | 'admin')}
            className={`${INPUT_CLASS} cursor-pointer pr-10`}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <Button type="submit" variant="primary" size="md" disabled={!canSubmit} isLoading={pending}>
          Send invitation
        </Button>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        We&apos;ll add a row to the pending list. Email delivery ships with the next release; for
        now share the invite code below.
      </p>
    </form>
  );
}
