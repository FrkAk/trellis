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
  const [error, setError] = useState<string | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listUserTeamsAction();
    if (result.ok) setTeams(sortTeams(result.data));
  }, []);

  const handleLeft = useCallback(
    (organizationId: string) => {
      setError(null);
      setTeams((prev) => prev.filter((t) => t.id !== organizationId));
      router.refresh();
    },
    [router],
  );

  const handleCreated = useCallback(
    async (organizationId: string) => {
      setCreating(false);
      setError(null);
      setGlowId(organizationId);
      window.setTimeout(() => setGlowId(null), 900);
      await refresh();
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
