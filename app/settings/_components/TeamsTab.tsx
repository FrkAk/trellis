'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/shared/Button';
import {
  listUserTeamsAction,
  type TeamView,
} from '@/lib/actions/team-list';
import { CreateTeamPanel } from './CreateTeamPanel';
import { EmptyState } from './EmptyState';
import { TeamCard } from './TeamCard';

interface TeamsTabProps {
  /** Initial team list, hydrated from the server component. */
  initialTeams: TeamView[];
  /** Active org id from the session, or null if the user has no team yet. */
  activeOrganizationId: string | null;
  /** Caller's display name — used to personalize the create-team placeholder. */
  userName?: string | null;
}

/**
 * Sort teams: active first, then by `createdAt` descending.
 */
function sortTeams(list: TeamView[], activeId: string | null): TeamView[] {
  return [...list].sort((a, b) => {
    if (activeId) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
    }
    return b.createdAt.valueOf() - a.createdAt.valueOf();
  });
}

/**
 * Teams tab — lists every team the user belongs to with role badges,
 * an active-team rail, and a primary action per row (Switch or active
 * marker). A New-team panel slides in above the list when triggered.
 *
 * @param props - Hydrated teams list + active id.
 * @returns Rendered tab body.
 */
export function TeamsTab({ initialTeams, activeOrganizationId, userName }: TeamsTabProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamView[]>(() =>
    sortTeams(initialTeams, activeOrganizationId),
  );
  const [activeId, setActiveId] = useState<string | null>(activeOrganizationId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);

  const refresh = useCallback(
    async (activeOverride?: string | null) => {
      const result = await listUserTeamsAction();
      if (result.ok) {
        const pinned = activeOverride !== undefined ? activeOverride : activeId;
        setTeams(sortTeams(result.data, pinned));
      }
    },
    [activeId],
  );

  const handleSwitch = useCallback(
    (organizationId: string) => {
      setError(null);
      setActiveId(organizationId);
      setTeams((prev) => sortTeams(prev, organizationId));
      router.refresh();
    },
    [router],
  );

  const handleLeft = useCallback(
    (organizationId: string) => {
      setError(null);
      setTeams((prev) => prev.filter((t) => t.id !== organizationId));
      if (activeId === organizationId) setActiveId(null);
      router.refresh();
    },
    [activeId, router],
  );

  const handleCreated = useCallback(
    async (organizationId: string) => {
      setCreating(false);
      setError(null);
      setActiveId(organizationId);
      setGlowId(organizationId);
      window.setTimeout(() => setGlowId(null), 900);
      await refresh(organizationId);
      router.refresh();
    },
    [refresh, router],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Your teams · {teams.length}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCreating(true)}
          disabled={creating}
        >
          + New team
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-cancelled/25 bg-cancelled/10 px-3 py-2 text-xs text-cancelled"
        >
          {error}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {creating ? (
          <motion.div
            key="create-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <CreateTeamPanel
              onCancel={() => setCreating(false)}
              onCreated={handleCreated}
              userName={userName}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {teams.length === 0 && !creating ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-6 w-6">
              <path d="M5.5 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM2 13a3.5 3.5 0 117 0v.5a.5.5 0 01-.5.5h-6a.5.5 0 01-.5-.5V13zm9.5-6a2 2 0 110-4 2 2 0 010 4zM10 13a3 3 0 015.99-.176A.5.5 0 0115.5 13h-3.998A.5.5 0 0110 13z" />
            </svg>
          }
          title="You're not in any teams yet"
          body="Create a team to start a fresh workspace, or ask an admin for an invite code."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Create your first team
            </Button>
          }
        />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false}>
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isActive={team.id === activeId}
                glow={glowId === team.id}
                onSwitch={handleSwitch}
                onLeft={handleLeft}
                onError={setError}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}
