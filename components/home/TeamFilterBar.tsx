'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { TeamChip } from '@/components/shared/TeamChip';
import type { TeamView } from '@/lib/actions/team-list';
import { getTeamColor } from '@/lib/ui/team-color';

interface TeamFilterBarProps {
  /** All teams the caller is a member of. */
  teams: TeamView[];
  /** Currently selected team id, or `null` for the `All teams` pill. */
  activeTeamId: string | null;
  /** Maximum inline pills before the overflow dropdown takes over. */
  inlineCap?: number;
  /** Render the group-by-team toggle inside the segmented container. */
  showGroupToggle?: boolean;
  /** True when the grid is currently grouped by team. */
  groupActive?: boolean;
}

/**
 * Sticky filter bar above the home grid. Mirrors the Tab Switcher pattern
 * (`rounded-lg bg-surface-raised/60 p-0.5` container, `bg-surface
 * shadow-[var(--shadow-button)]` active indicator) so the segmented control
 * blends with the rest of the design system. State syncs to `?team=<id>`
 * via `router.replace`, so links and refreshes preserve the selection. The
 * optional group-by-team toggle is rendered as a trailing pill so it shares
 * the segmented container instead of floating beside it.
 *
 * @param props - Bar configuration.
 * @returns Animated segmented filter with an overflow popover.
 */
export function TeamFilterBar({
  teams,
  activeTeamId,
  inlineCap = 5,
  showGroupToggle = false,
  groupActive = false,
}: TeamFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);

  const { inlineTeams, overflowTeams } = useMemo(() => {
    if (teams.length <= inlineCap) {
      return { inlineTeams: teams, overflowTeams: [] as TeamView[] };
    }
    const active = activeTeamId ? teams.find((t) => t.id === activeTeamId) : undefined;
    // Reserve a slot for the active team if it would otherwise fall into overflow,
    // so the current selection always stays visible on the inline rail.
    const headRoom = active ? inlineCap - 1 : inlineCap;
    const head = teams.slice(0, headRoom);
    const inline = active && !head.some((t) => t.id === active.id) ? [...head, active] : head;
    const overflow = teams.filter((t) => !inline.some((it) => it.id === t.id));
    return { inlineTeams: inline, overflowTeams: overflow };
  }, [teams, activeTeamId, inlineCap]);

  const overflowActive = overflowTeams.some((t) => t.id === activeTeamId);

  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOverflowOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [overflowOpen]);

  const select = (teamId: string | null) => {
    setOverflowOpen(false);
    const params = new URLSearchParams(searchParams);
    if (teamId) params.set('team', teamId);
    else params.delete('team');
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const toggleGroup = () => {
    const params = new URLSearchParams(searchParams);
    if (groupActive) params.delete('group');
    else params.set('group', 'team');
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return (
    <div
      className="sticky top-[var(--topbar-h,3.5rem)] z-10 -mx-1 mb-6 flex items-center gap-2 bg-base/85 px-1 py-3 backdrop-blur-md"
      role="toolbar"
      aria-label="Filter by team"
    >
      <div
        className="flex min-w-0 max-w-full flex-1 items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-raised/60 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        <FilterPill
          label="All teams"
          active={activeTeamId === null}
          onClick={() => select(null)}
          disabled={pending}
        />
        {inlineTeams.map((team) => (
          <FilterPill
            key={team.id}
            label={team.name}
            team={team}
            active={team.id === activeTeamId}
            onClick={() => select(team.id)}
            disabled={pending}
          />
        ))}

        {overflowTeams.length > 0 ? (
          <div ref={overflowRef} className="relative">
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label={`Show ${overflowTeams.length} more teams`}
              className={`relative cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-opacity ${
                overflowActive
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:opacity-80'
              }`}
            >
              {overflowActive ? (
                <motion.span
                  layoutId="team-filter-indicator"
                  className="absolute inset-0 rounded-md bg-surface shadow-[var(--shadow-button)]"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              ) : null}
              <span className="relative">+{overflowTeams.length}</span>
            </button>

            {overflowOpen ? (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-float)]"
              >
                {overflowTeams.map((team) => {
                  const isActive = team.id === activeTeamId;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      role="menuitem"
                      onClick={() => select(team.id)}
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-surface-hover text-text-primary'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <TeamChip team={team} size="xs" />
                      <span className="font-mono text-[10px] tabular-nums text-text-muted">
                        {team.memberCount}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </div>
        ) : null}

        {showGroupToggle ? (
          <>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={toggleGroup}
              disabled={pending}
              aria-pressed={groupActive}
              title={groupActive ? 'Switch to flat grid' : 'Group by team'}
              className={`relative flex shrink-0 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${
                groupActive
                  ? 'bg-surface text-text-primary shadow-[var(--shadow-button)]'
                  : 'text-text-muted hover:text-text-secondary hover:opacity-80'
              }`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
                <path d="M2 3.75A1.75 1.75 0 013.75 2h8.5A1.75 1.75 0 0114 3.75v1.5A1.75 1.75 0 0112.25 7h-8.5A1.75 1.75 0 012 5.25v-1.5zM2 10.75A1.75 1.75 0 013.75 9h8.5A1.75 1.75 0 0114 10.75v1.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-1.5z" />
              </svg>
              <span className="sr-only">{groupActive ? 'Stop grouping by team' : 'Group by team'}</span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  team?: TeamView;
}

/**
 * Single segmented pill. Renders the active indicator via a shared
 * `layoutId="team-filter-indicator"` so Motion animates the slide
 * between selections.
 *
 * @param props - Pill configuration.
 * @returns Tab-style button with an animated active indicator.
 */
function FilterPill({ label, active, onClick, disabled, team }: FilterPillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? 'text-text-primary'
          : 'text-text-muted hover:text-text-secondary hover:opacity-80'
      }`}
    >
      {active ? (
        <motion.span
          layoutId="team-filter-indicator"
          className="absolute inset-0 rounded-md bg-surface shadow-[var(--shadow-button)]"
          style={{ zIndex: -1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      ) : null}
      {team ? (
        <TeamDot teamId={team.id} />
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

/**
 * Tiny coloured dot mirroring the team's chip colour. Inline so the pill
 * stays readable even when its label is the team name without the chip
 * wrapper.
 */
function TeamDot({ teamId }: { teamId: string }) {
  const color = getTeamColor(teamId);
  return <span className={`relative h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} aria-hidden="true" />;
}
