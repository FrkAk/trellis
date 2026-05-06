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
  'w-full rounded-md border border-border-strong bg-base px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent';

const FIELD_LABEL_CLASS =
  'mb-1.5 block text-[11.5px] font-medium text-text-muted';

interface AccountTabProps {
  /** Identity slice for the signed-in user. */
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date | string;
  };
}

/**
 * Account tab — single identity card (56px gradient avatar, locked email,
 * editable display name) plus a danger-zone card with the account-deletion
 * placeholder. Photo upload and account deletion are wired-once-backend-lands
 * placeholders — see DESIGN §11 conventions for non-functional buttons.
 *
 * @param props - Identity slice.
 * @returns Tab body with H1, identity card, danger zone.
 */
export function AccountTab({ user }: AccountTabProps) {
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
    <section className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold leading-tight text-text-primary">
          Account
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          How you appear to teammates and agents.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="relative rounded-[10px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
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
              className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[var(--shadow-glow-done)]"
            />
          ) : null}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            style={{
              background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
            }}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-[var(--shadow-card)]"
          >
            {initials({ name: user.name, email: user.email })}
          </div>
          <div>
            <Button
              variant="secondary"
              size="md"
              disabled
              className="opacity-80"
            >
              <span title="Photo upload — coming soon">Upload photo</span>
            </Button>
            <p className="mt-1.5 text-[11.5px] text-text-muted">
              JPG or PNG, max 2MB
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Display name</span>
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
            <span className={FIELD_LABEL_CLASS}>Email</span>
            <input
              type="email"
              value={user.email}
              disabled
              aria-readonly="true"
              className={`${INPUT_CLASS} cursor-not-allowed text-text-muted`}
              title="Email is your sign-in identity and can't be changed here."
            />
            <p className="mt-1 text-[11px] text-text-muted">
              Sign-in identity — managed by your auth provider.
            </p>
          </label>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[11.5px] text-text-muted">
              Member since {memberSince}
            </p>
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

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-[12px] text-cancelled"
            >
              {error}
            </p>
          ) : null}
        </div>
      </form>

      <DangerZone />
    </section>
  );
}

/**
 * Danger-zone card — placeholder for the account-deletion flow until the
 * backend ticket lands. Disabled button + tooltip per DESIGN §11.
 *
 * @returns Cancelled-tinted card with a disabled delete-account control.
 */
function DangerZone() {
  return (
    <section className="rounded-[10px] border border-cancelled/25 bg-cancelled/5 p-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cancelled">
        Danger zone
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">
            Delete account
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
            Permanently remove your account and revoke every authorized agent.
            Projects you own get transferred to the team or deleted with it.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Account deletion — coming soon"
          aria-label="Delete account — coming soon"
          className="inline-flex h-7 cursor-not-allowed items-center justify-center rounded-md border border-cancelled/30 bg-cancelled/10 px-3 text-[12px] font-semibold text-cancelled opacity-80"
        >
          Delete account
        </button>
      </div>
    </section>
  );
}
