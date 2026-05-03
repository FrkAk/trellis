'use client';

import { initials } from '@/lib/ui/initials';
import { teamAvatarGradient } from '@/lib/ui/team-avatar';
import { roleStyle } from '@/lib/ui/role-badge';

interface TeamHeroProps {
  /** Team display name. */
  name: string;
  /** URL slug — rendered in mono as supporting metadata. */
  slug: string;
  /** Team UUID — drives the avatar gradient. */
  teamId: string;
  /** Caller's role string, used for the badge. */
  memberRole: string;
  /** Total members in the team. */
  memberCount: number;
}

/**
 * Identity card for the per-team admin page. 56px gradient avatar +
 * name + slug + role chip. Sits at the top of the page as the visual
 * anchor before the operational sections.
 *
 * @param props - Team identity slice.
 * @returns Level-1 card rendering team identity.
 */
export function TeamHero({
  name,
  slug,
  teamId,
  memberRole,
  memberCount,
}: TeamHeroProps) {
  const gradient = teamAvatarGradient(teamId);
  const role = roleStyle(memberRole);

  return (
    <section className="relative flex items-center gap-4 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white shadow-[var(--shadow-card)]"
      >
        {initials({ name })}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-text-primary">{name}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${role.bg} ${role.text}`}
          >
            {role.dot ? <span className={`h-1.5 w-1.5 rounded-full ${role.dot}`} /> : null}
            {role.label}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">{slug}</span>
          <span aria-hidden="true">·</span>
          <span>
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
        </p>
      </div>
    </section>
  );
}
