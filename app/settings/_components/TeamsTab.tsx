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
import { JoinTeamPanel } from './JoinTeamPanel';
import { TeamCard } from './TeamCard';

interface TeamsTabProps {
  /** Initial team list, hydrated from the server component. */
  initialTeams: TeamView[];
  /** Caller's display name — used to personalize the create-team placeholder. */
  userName?: string | null;
}

/**
 * Sort teams by `createdAt` descending — newest first. There is no
 * "active" team to pin, so the list mirrors team creation order.
 */
function sortTeams(list: TeamView[]): TeamView[] {
  return [...list].sort(
    (a, b) => b.createdAt.valueOf() - a.createdAt.valueOf(),
  );
}

/**
 * Teams tab — lists every team the user belongs to with role badges and
 * a Manage link for admins/owners. A New-team panel slides in above the
 * list when triggered. The workspace spans every team the user is a
 * member of, so there is no team-switcher here.
 *
 * @param props - Hydrated teams list.
 * @returns Rendered tab body.
 */
export function TeamsTab({ initialTeams, userName }: TeamsTabProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamView[]>(() => sortTeams(initialTeams));
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);

  const startCreating = useCallback(() => {
    setJoining(false);
    setCreating(true);
  }, []);

  const startJoining = useCallback(() => {
    setCreating(false);
    setJoining(true);
  }, []);

  /**
   * Re-fetch the user's teams and replace local state on success.
   *
   * @returns `true` if the list was refreshed, `false` if the action
   *   failed. Callers must surface the failure when their UX depends on
   *   the new state being visible — `router.refresh()` alone won't fix
   *   it because `useState(initialTeams)` only seeds the first render.
   */
  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await listUserTeamsAction();
    if (!result.ok) return false;
    setTeams(sortTeams(result.data));
    return true;
  }, []);

  const handleLeft = useCallback(
    (organizationId: string) => {
      setError(null);
      setTeams((prev) => prev.filter((t) => t.id !== organizationId));
      router.refresh();
    },
    [router],
  );

  const handleAdded = useCallback(
    async (organizationId: string) => {
      setCreating(false);
      setJoining(false);
      setError(null);
      const refreshed = await refresh();
      if (!refreshed) {
        setError(
          "You've been added to the team, but we couldn't refresh the list. Reload the page to see it.",
        );
        return;
      }
      router.refresh();
      setGlowId(organizationId);
      window.setTimeout(() => setGlowId(null), 900);
    },
    [refresh, router],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Your teams · {teams.length}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={startJoining}
            disabled={joining}
          >
            Join team
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={startCreating}
            disabled={creating}
          >
            New team
          </Button>
        </div>
      </div>

      {teams.length > 0 ? (
        <p className="text-xs leading-relaxed text-text-muted">
          You can browse and edit projects in every team you&apos;re a member of from the home grid. When your coding agent creates a project, it will ask which team it belongs to.
        </p>
      ) : null}

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
              onCreated={handleAdded}
              userName={userName}
            />
          </motion.div>
        ) : null}
        {joining ? (
          <motion.div
            key="join-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <JoinTeamPanel
              onCancel={() => setJoining(false)}
              onJoined={handleAdded}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {teams.length === 0 && !creating && !joining ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-6 w-6">
              <path d="M5.5 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM2 13a3.5 3.5 0 117 0v.5a.5.5 0 01-.5.5h-6a.5.5 0 01-.5-.5V13zm9.5-6a2 2 0 110-4 2 2 0 010 4zM10 13a3 3 0 015.99-.176A.5.5 0 0115.5 13h-3.998A.5.5 0 0110 13z" />
            </svg>
          }
          title="You're not in any teams yet"
          body="Create a team to start a fresh workspace, or join an existing one with an invite code from an admin."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={startCreating}>
                Create your first team
              </Button>
              <Button variant="secondary" size="sm" onClick={startJoining}>
                Join with code
              </Button>
            </div>
          }
        />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false}>
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                glow={glowId === team.id}
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
