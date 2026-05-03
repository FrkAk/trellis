'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { initials } from '@/lib/ui/initials';
import { teamAvatarGradient } from '@/lib/ui/team-avatar';
import { formatAbsolute } from '@/lib/ui/relative-time';
import { roleStyle } from '@/lib/ui/role-badge';
import { removeMemberAction, updateMemberRoleAction } from '@/lib/actions/team';
import type { MemberView } from '@/lib/actions/team-members-map';

interface MemberRowProps {
  /** The member to render. */
  member: MemberView;
  /** Caller's user id — drives self-row detection. */
  currentUserId: string;
  /** Caller's role on this team. */
  viewerRole: string;
  /** Number of members with role `'owner'` — for last-owner safeguards. */
  ownerCount: number;
  /** Total members in the team — for sole-member safeguard. */
  totalMemberCount: number;
  /** Called after a successful role change with `(memberId, newRole)`. */
  onRoleChanged: (memberId: string, newRole: 'member' | 'admin' | 'owner') => void;
  /** Called after a successful remove with the member id. */
  onRemoved: (memberId: string) => void;
  /** Surface a transient error message above the list. */
  onError: (message: string) => void;
  /** Briefly highlight this row — used after a role transition lands. */
  glow?: boolean;
}

type MenuAction =
  | { kind: 'role'; role: 'member' | 'admin' | 'owner'; label: string }
  | { kind: 'remove'; label: string };

/**
 * Decide which actions the viewer may perform on this target member.
 * Implements the precise privilege gates per DESIGN.md decisions:
 * - admin: promote/demote between member↔admin, remove non-self
 * - owner: above + promote-to-owner, demote owner→admin (only if another
 *   owner exists)
 * - last-owner / sole-member safeguards prevent orphaning the team
 */
function resolveActions(args: {
  target: MemberView;
  viewerRole: string;
  isSelf: boolean;
  ownerCount: number;
  totalMemberCount: number;
}): MenuAction[] {
  const { target, viewerRole, isSelf, ownerCount, totalMemberCount } = args;
  const isAdminViewer = viewerRole === 'admin' || viewerRole === 'owner';
  if (!isAdminViewer) return [];

  const actions: MenuAction[] = [];

  if (target.role === 'member') {
    actions.push({ kind: 'role', role: 'admin', label: 'Promote to admin' });
    if (viewerRole === 'owner') {
      actions.push({ kind: 'role', role: 'owner', label: 'Promote to owner' });
    }
  } else if (target.role === 'admin') {
    actions.push({ kind: 'role', role: 'member', label: 'Demote to member' });
    if (viewerRole === 'owner') {
      actions.push({ kind: 'role', role: 'owner', label: 'Promote to owner' });
    }
  } else if (target.role === 'owner') {
    if (viewerRole === 'owner' && ownerCount > 1) {
      actions.push({ kind: 'role', role: 'admin', label: 'Demote to admin' });
    }
  }

  if (!isSelf && totalMemberCount > 1) {
    actions.push({ kind: 'remove', label: 'Remove from team' });
  }

  return actions;
}

/**
 * Single row in the team members list. Avatar + identity + role chip +
 * actions menu. Menu visibility and contents derive from caller role and
 * target role — see {@link resolveActions}.
 *
 * @param props - Row configuration.
 * @returns Animated list-item rendering one member.
 */
export function MemberRow({
  member,
  currentUserId,
  viewerRole,
  ownerCount,
  totalMemberCount,
  onRoleChanged,
  onRemoved,
  onError,
  glow,
}: MemberRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isSelf = member.userId === currentUserId;
  const role = roleStyle(member.role);
  const gradient = teamAvatarGradient(member.userId);
  const actions = resolveActions({
    target: member,
    viewerRole,
    isSelf,
    ownerCount,
    totalMemberCount,
  });

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirmingRemove(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setConfirmingRemove(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleRoleChange = (next: 'member' | 'admin' | 'owner') => {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ memberId: member.id, role: next });
      if (result.ok) {
        onRoleChanged(member.id, next);
      } else {
        onError(result.message);
      }
    });
  };

  const handleRemove = () => {
    setConfirmingRemove(false);
    setMenuOpen(false);
    startTransition(async () => {
      const result = await removeMemberAction({ memberIdOrEmail: member.id });
      if (result.ok) {
        onRemoved(member.id);
      } else {
        onError(result.message);
      }
    });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={
        glow
          ? {
              opacity: 1,
              y: 0,
              boxShadow: ['var(--shadow-card)', 'var(--shadow-glow-accent)', 'var(--shadow-card)'],
            }
          : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22 }}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover"
    >
      <div
        aria-hidden="true"
        style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white shadow-[var(--shadow-card)]"
      >
        {initials({ name: member.name, email: member.email })}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">
            {member.name}
            {isSelf ? (
              <span className="ml-1.5 text-xs font-normal text-text-muted">(you)</span>
            ) : null}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${role.bg} ${role.text}`}
          >
            {role.dot ? <span className={`h-1.5 w-1.5 rounded-full ${role.dot}`} /> : null}
            {role.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          <span className="break-all">{member.email}</span>
          <span aria-hidden="true"> · </span>
          <span>Joined {formatAbsolute(member.joinedAt)}</span>
        </p>
      </div>

      {actions.length > 0 ? (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setConfirmingRemove(false);
            }}
            disabled={pending}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Actions for ${member.name}`}
            className="cursor-pointer rounded-md p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M3.5 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9.5 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
          </button>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-float)]"
              >
                {actions.map((action) => {
                  if (action.kind === 'role') {
                    return (
                      <button
                        key={action.label}
                        type="button"
                        role="menuitem"
                        onClick={() => handleRoleChange(action.role)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                      >
                        {action.label}
                      </button>
                    );
                  }
                  if (confirmingRemove) {
                    return (
                      <div
                        key="remove-confirm"
                        className="flex flex-col gap-1.5 rounded-md bg-cancelled/5 p-2"
                      >
                        <p className="text-[11px] text-text-secondary">
                          Remove {member.name}?
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmingRemove(false)}
                            className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleRemove}
                            className="cursor-pointer rounded-md border border-cancelled/30 bg-cancelled/10 px-2 py-1 text-[11px] font-semibold text-cancelled transition-colors hover:bg-cancelled/15"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key="remove-trigger"
                      type="button"
                      role="menuitem"
                      onClick={() => setConfirmingRemove(true)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-cancelled transition-colors hover:bg-cancelled/10"
                    >
                      {action.label}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.li>
  );
}
