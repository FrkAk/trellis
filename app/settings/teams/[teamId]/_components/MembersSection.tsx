'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { MemberView } from '@/lib/actions/team-members-map';
import { MemberRow } from './MemberRow';

interface MembersSectionProps {
  /** Team UUID — threaded down to MemberRow for role/remove calls. */
  teamId: string;
  /** Members to render (already sorted by `TeamSettingsView`). */
  members: MemberView[];
  /** Caller's user id — drives self-row detection in MemberRow. */
  currentUserId: string;
  /** Caller's role on this team. */
  viewerRole: string;
  /** Member id whose row should briefly glow after a role transition. */
  glowMemberId: string | null;
  /** Called from MemberRow after a successful role change. */
  onRoleChanged: (memberId: string, newRole: 'member' | 'admin' | 'owner') => void;
  /** Called from MemberRow after a successful remove. */
  onRemoved: (memberId: string) => void;
  /** Surface a transient error from any row action. */
  onError: (message: string) => void;
}

/**
 * Members section — section label + Level-1 card containing the row list.
 * Used by every viewer role: members see read-only chips, admin/owner see
 * inline action menus on each row (gating handled in MemberRow).
 *
 * @param props - Section configuration.
 * @returns Section header + animated member list.
 */
export function MembersSection({
  teamId,
  members,
  currentUserId,
  viewerRole,
  glowMemberId,
  onRoleChanged,
  onRemoved,
  onError,
}: MembersSectionProps) {
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  return (
    <section className="space-y-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Members · {members.length}
      </p>
      <div className="rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <motion.ul
          layout
          className="divide-y divide-border [&>li:first-child]:rounded-t-[11px] [&>li:last-child]:rounded-b-[11px]"
        >
          <AnimatePresence initial={false}>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                teamId={teamId}
                member={member}
                currentUserId={currentUserId}
                viewerRole={viewerRole}
                ownerCount={ownerCount}
                totalMemberCount={members.length}
                glow={glowMemberId === member.id}
                onRoleChanged={onRoleChanged}
                onRemoved={onRemoved}
                onError={onError}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>
    </section>
  );
}
