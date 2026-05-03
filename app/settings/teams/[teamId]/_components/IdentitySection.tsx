'use client';

import { useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/shared/Button';
import { updateTeamAction } from '@/lib/actions/team';
import {
  RESERVED_SLUGS,
  SLUG_MAX,
  SLUG_MIN,
  SLUG_PATTERN,
  TEAM_NAME_MAX,
} from '@/lib/team/slug-rules';

const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

interface IdentitySectionProps {
  /** Team UUID — sent with every update. */
  organizationId: string;
  /** Latest team name shown in the form. */
  currentName: string;
  /** Latest team slug shown in the form. */
  currentSlug: string;
  /** Called after a successful update with the changed fields. */
  onRenamed: (next: { name?: string; slug?: string }) => void;
  /** Surface a transient error from the action. */
  onError: (message: string) => void;
}

/**
 * Validate a slug locally. Mirrors the server-side guard so users get
 * instant feedback rather than waiting for a network round-trip. The
 * server is still source-of-truth.
 */
function validateSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Slug must be at least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Slug must be at most ${SLUG_MAX} characters.`;
  if (!SLUG_PATTERN.test(slug)) return 'Slug must be lowercase alphanumeric with hyphens.';
  if (RESERVED_SLUGS.has(slug)) return 'That URL slug is reserved. Try a different one.';
  return null;
}

/**
 * Team identity section — rename name and slug. Both fields are
 * optionally updatable; submitting with no changes is a no-op. Slug
 * live-validates and the Save button stays disabled while the slug is
 * malformed. Brief glow flash on the section after a successful save.
 *
 * @param props - Section configuration.
 * @returns Form card for the team's display identity.
 */
export function IdentitySection({
  organizationId,
  currentName,
  currentSlug,
  onRenamed,
  onError,
}: IdentitySectionProps) {
  const [name, setName] = useState(currentName);
  const [slug, setSlug] = useState(currentSlug);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const slugError = trimmedSlug !== currentSlug ? validateSlug(trimmedSlug) : null;
  const nameDirty = trimmedName.length > 0 && trimmedName !== currentName;
  const slugDirty = trimmedSlug !== currentSlug && trimmedSlug.length > 0;
  const dirty = nameDirty || slugDirty;
  const canSubmit = dirty && !slugError && !pending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const payload: { organizationId: string; name?: string; slug?: string } = {
      organizationId,
    };
    if (nameDirty) payload.name = trimmedName;
    if (slugDirty) payload.slug = trimmedSlug;
    startTransition(async () => {
      const result = await updateTeamAction(payload);
      if (!result.ok) {
        onError(result.message);
        return;
      }
      onRenamed({ name: payload.name, slug: payload.slug });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 900);
    });
  };

  return (
    <section className="space-y-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Team identity
      </p>
      <form
        onSubmit={handleSubmit}
        className="relative rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <AnimatePresence>
          {savedFlash ? (
            <motion.span
              key="saved-flash"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 rounded-xl shadow-[var(--shadow-glow-done)]"
            />
          ) : null}
        </AnimatePresence>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Display name
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={TEAM_NAME_MAX}
              placeholder="My team"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">URL slug</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              maxLength={SLUG_MAX}
              placeholder="my-team"
              className={`${INPUT_CLASS} font-mono ${
                slugError
                  ? 'border-cancelled/50 focus:border-cancelled'
                  : ''
              }`}
            />
            {slugError ? (
              <p className="mt-1 text-xs text-cancelled">{slugError}</p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Lowercase letters, numbers, and hyphens. {SLUG_MIN}-{SLUG_MAX} characters.
              </p>
            )}
          </label>

          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!canSubmit}
              isLoading={pending}
            >
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
