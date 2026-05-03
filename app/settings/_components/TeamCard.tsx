'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/shared/Button';
import { initials } from '@/lib/ui/initials';
import { teamAvatarGradient } from '@/lib/ui/team-avatar';
import { formatAbsolute } from '@/lib/ui/relative-time';
import { switchActiveTeamAction } from '@/lib/actions/team-switch';
import { leaveTeamAction } from '@/lib/actions/team';
import { getOrCreateTeamInviteCodeAction } from '@/lib/actions/team-invite-code';
import type { TeamView } from '@/lib/actions/team-list';
import { InlineConfirm } from './InlineConfirm';

interface TeamCardProps {
  /** Team membership row (id, name, role, memberCount, createdAt). */
  team: TeamView;
  /** True when this is the user's active team for the current session. */
  isActive: boolean;
  /** Briefly highlight this card on render — used after creation. */
  glow?: boolean;
  /** Called after a successful Switch with the new active team id. */
  onSwitch: (organizationId: string) => void;
  /** Called after a successful Leave to remove the row. */
  onLeft: (organizationId: string) => void;
  /** Surface a transient error from any team action. */
  onError: (message: string) => void;
}

const ROLE_BADGE: Record<string, { bg: string; text: string; dot: string | null; label: string }> = {
  owner: { bg: 'bg-accent/15', text: 'text-accent-light', dot: 'bg-accent', label: 'Owner' },
  admin: { bg: 'bg-planned/15', text: 'text-planned', dot: 'bg-planned', label: 'Admin' },
  member: { bg: 'bg-surface-raised', text: 'text-text-muted', dot: null, label: 'Member' },
};

/** Lookup the role badge style; falls back to member styling for unknowns. */
function roleStyle(role: string) {
  return ROLE_BADGE[role] ?? ROLE_BADGE.member;
}

/**
 * Single team row — avatar, name, role badge, active indicator, and the
 * primary action (Switch or active marker) plus an overflow menu with
 * Copy invite / Leave.
 *
 * @param props - Team card configuration.
 * @returns Animated, layout-aware row.
 */
export function TeamCard({
  team,
  isActive,
  glow,
  onSwitch,
  onLeft,
  onError,
}: TeamCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const gradient = teamAvatarGradient(team.id);
  const role = roleStyle(team.role);
  const isAdminOrOwner = team.role === 'owner' || team.role === 'admin';
  const soleOwner = team.role === 'owner' && team.memberCount <= 1;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleSwitch = () => {
    startTransition(async () => {
      const result = await switchActiveTeamAction({ organizationId: team.id });
      if (result.ok) {
        onSwitch(team.id);
      } else {
        onError(result.message);
      }
    });
  };

  const handleLeave = async () => {
    setMenuOpen(false);
    const result = await leaveTeamAction({ organizationId: team.id });
    if (result.ok) {
      onLeft(team.id);
    } else {
      onError(result.message);
    }
  };

  const handleCopyInvite = () => {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await getOrCreateTeamInviteCodeAction();
      if (!result.ok) {
        onError(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.code);
        setCopyState('copied');
        window.setTimeout(() => setCopyState('idle'), 1500);
      } catch (err) {
        console.error('clipboard write failed', err);
        onError('Could not copy to clipboard.');
      }
    });
  };

  const containerClasses = [
    'relative flex items-center gap-4 rounded-xl border p-5 transition-colors',
    isActive
      ? 'border-accent/30 bg-accent/4 shadow-[var(--shadow-card)]'
      : 'border-border bg-surface shadow-[var(--shadow-card)] hover:border-border-strong hover:shadow-[var(--shadow-card-hover)]',
  ].join(' ');

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={
        glow
          ? {
              opacity: 1,
              y: 0,
              boxShadow: ['var(--shadow-card)', 'var(--shadow-glow-accent)', 'var(--shadow-card)'],
            }
          : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className={containerClasses}
    >
      {isActive ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-accent"
        />
      ) : null}

      <div
        aria-hidden="true"
        style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white shadow-[var(--shadow-card)]"
      >
        {initials({ name: team.name })}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-text-primary">{team.name}</p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] ${role.bg} ${role.text}`}
          >
            {role.dot ? <span className={`h-1.5 w-1.5 rounded-full ${role.dot}`} /> : null}
            {role.label}
          </span>
          {isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-accent-light">
              <span className="loading-dot h-1.5 w-1.5 rounded-full bg-accent" />
              Active
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-text-muted">
          {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'} ·{' '}
          {team.role === 'owner' ? 'Created' : 'Joined'} {formatAbsolute(team.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!isActive ? (
          <Button variant="primary" size="sm" onClick={handleSwitch} isLoading={pending}>
            Switch
          </Button>
        ) : null}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Team actions"
            className="cursor-pointer rounded-md p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M3.5 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9.5 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM14 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            </svg>
          </button>

          {menuOpen ? (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-float)]"
            >
              {isActive && isAdminOrOwner ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyInvite}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
                    <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
                    <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
                  </svg>
                  {copyState === 'copied' ? 'Copied!' : 'Copy invite code'}
                </button>
              ) : null}
              <InlineLeaveItem
                soleOwner={soleOwner}
                teamName={team.name}
                onLeave={handleLeave}
              />
            </motion.div>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}

interface InlineLeaveItemProps {
  /** True when leaving would orphan the team (only-owner guard). */
  soleOwner: boolean;
  /** Team display name for the confirm prompt. */
  teamName: string;
  /** Async callback that leaves the team. */
  onLeave: () => Promise<void>;
}

/**
 * Menu-item wrapper around InlineConfirm so Leave gets a two-step
 * confirmation without leaving the menu's visual flow.
 *
 * @param props - Configuration.
 * @returns Menu-item-styled trigger that morphs into a confirm row.
 */
function InlineLeaveItem({ soleOwner, teamName, onLeave }: InlineLeaveItemProps) {
  if (soleOwner) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled
        title="You are the only member — invite someone or delete the team."
        className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text-muted opacity-60"
      >
        <LeaveGlyph />
        Leave team
      </button>
    );
  }
  return (
    <div className="px-1 py-1">
      <InlineConfirm
        trigger={
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-cancelled transition-colors hover:bg-cancelled/10"
          >
            <LeaveGlyph />
            Leave team
          </button>
        }
        prompt={`Leave ${teamName}?`}
        body="You'll lose access to its projects."
        confirmLabel="Leave"
        destructive
        onConfirm={onLeave}
      />
    </div>
  );
}

/** Small door-arrow glyph used by the Leave menu item. */
function LeaveGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
      <path d="M2 2.5A1.5 1.5 0 013.5 1h6A1.5 1.5 0 0111 2.5V4a.5.5 0 01-1 0V2.5a.5.5 0 00-.5-.5h-6a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h6a.5.5 0 00.5-.5V12a.5.5 0 011 0v1.5A1.5 1.5 0 019.5 15h-6A1.5 1.5 0 012 13.5v-11z" />
      <path d="M11.354 7.146a.5.5 0 00-.708.708L11.793 9H6.5a.5.5 0 000 1h5.293l-1.147 1.146a.5.5 0 00.708.708l2-2a.5.5 0 000-.708l-2-2z" />
    </svg>
  );
}
