'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/shared/Button';
import { initials } from '@/lib/ui/initials';
import { teamAvatarGradient } from '@/lib/ui/team-avatar';
import { formatAbsolute } from '@/lib/ui/relative-time';
import { updateProfileAction } from '@/lib/actions/profile';

const NAME_MAX = 80;

const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-base px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

interface ProfileTabProps {
  /** Identity slice for the signed-in user. */
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date | string;
  };
}

/**
 * Profile tab — identity card (editable name, locked email, avatar) plus
 * an account-meta card with read-only signed-in-as / member-since rows.
 *
 * @param props - Identity slice.
 * @returns Two stacked cards.
 */
export function ProfileTab({ user }: ProfileTabProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== user.name.trim();
  const gradient = teamAvatarGradient(user.id);
  const memberSince = formatAbsolute(user.createdAt);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      const result = await updateProfileAction({ name: trimmed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 900);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <section className="relative rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
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
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-xs text-cancelled"
          >
            {error}
          </div>
        ) : null}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 lg:flex-row lg:items-start"
        >
          <div
            aria-hidden="true"
            style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white shadow-[var(--shadow-card)]"
          >
            {initials({ name: user.name, email: user.email })}
          </div>

          <div className="flex-1 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Display name
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NAME_MAX}
                placeholder="Your name"
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">
                Email
              </span>
              <div className="relative">
                <input
                  type="email"
                  value={user.email}
                  disabled
                  aria-readonly="true"
                  className={`${INPUT_CLASS} cursor-not-allowed pr-10 text-text-muted`}
                />
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                >
                  <path d="M8 1a3 3 0 00-3 3v2H4a2 2 0 00-2 2v5a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-1V4a3 3 0 00-3-3zm2 5V4a2 2 0 10-4 0v2h4z" />
                </svg>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Email is your sign-in identity and can&apos;t be changed here.
              </p>
            </label>

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!dirty}
                isLoading={pending}
              >
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className={SECTION_LABEL_CLASS}>Signed in as</p>
            <p className="mt-1 break-all text-sm text-text-secondary">{user.email}</p>
          </div>
          <div>
            <p className={SECTION_LABEL_CLASS}>Member since</p>
            <p className="mt-1 text-sm text-text-secondary">{memberSince}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
