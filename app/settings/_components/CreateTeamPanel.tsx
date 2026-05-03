'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/shared/Button';
import { createTeamAction } from '@/lib/actions/team';

const NAME_MAX = 64;

const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

const RESERVED_SLUGS = new Set([
  '_next', 'admin', 'api', 'app', 'assets', 'auth', 'consent', 'dev',
  'favicon', 'help', 'invite', 'join', 'login', 'logout', 'mcp', 'onboarding',
  'public', 'robots', 'settings', 'sign-in', 'sign-up', 'signin', 'signup',
  'sitemap', 'static', 'support', 'team', 'teams', 'user', 'users',
]);

/**
 * Derive a URL slug from a free-form team name. Lowercases, strips
 * accents, replaces non-alphanumerics with hyphens, collapses runs, and
 * trims hyphens off the ends. Falls back to `team` when the result is
 * empty or matches a reserved word; the server validates either way.
 */
function deriveSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base || RESERVED_SLUGS.has(base)) return `team-${Date.now().toString(36).slice(-4)}`;
  return base.slice(0, 32);
}

interface CreateTeamPanelProps {
  /** Called when the user dismisses the panel without creating a team. */
  onCancel: () => void;
  /** Called after a successful create with the new team's id. */
  onCreated: (organizationId: string) => void;
  /** Caller's display name — first word becomes "{name}'s Team" placeholder. */
  userName?: string | null;
}

/** Personalize the placeholder using the caller's first name. */
function teamNamePlaceholder(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first}'s Team` : 'My Team';
}

/**
 * Inline panel for creating a new team. Slug is derived from the name
 * client-side; the server is the source of truth and will reject
 * collisions / reserved values.
 *
 * @param props - Panel callbacks.
 * @returns Accent-tinted form rendered above the team list.
 */
export function CreateTeamPanel({ onCancel, onCreated, userName }: CreateTeamPanelProps) {
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !pending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const slug = deriveSlug(trimmed);
    startTransition(async () => {
      const result = await createTeamAction({ name: trimmed, slug });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onCreated(result.data.organizationId);
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-accent/25 bg-accent/5 p-5 shadow-[var(--shadow-card)]"
    >
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-light">
        New team
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-text-secondary">
          Team name
        </span>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          placeholder={teamNamePlaceholder(userName)}
          className={INPUT_CLASS}
        />
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
          Create team
        </Button>
      </div>
    </form>
  );
}
