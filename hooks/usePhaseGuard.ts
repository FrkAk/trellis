'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectPhaseInfo } from '@/lib/actions/project';
import type { ProjectStatus } from '@/lib/types';

type Phase = 'brainstorm' | 'decompose' | 'review';

const ALLOWED_STATUSES: Record<Phase, ProjectStatus[]> = {
  brainstorm: ['brainstorming', 'decomposing'],
  decompose: ['decomposing'],
  review: ['decomposing'],
};

/**
 * Get the correct redirect path for a given project status.
 * @param status - Current project status.
 * @param projectId - Project UUID.
 * @returns Redirect URL path.
 */
function getRedirectPath(status: ProjectStatus, projectId: string): string {
  switch (status) {
    case 'brainstorming':
      return `/new/brainstorm?projectId=${projectId}`;
    case 'decomposing':
      return `/new/decompose?projectId=${projectId}`;
    case 'active':
      return `/project/${projectId}`;
    case 'archived':
      return '/';
    default:
      return '/';
  }
}

interface PhaseGuardResult {
  /** @param loading - True while validating phase or redirecting. */
  loading: boolean;
  /** @param taskCount - Number of tasks in the project. */
  taskCount: number;
  /** @param error - Error message if phase check failed. */
  error: string | null;
}

/**
 * Validates the project is in the correct phase for the current page.
 * Redirects to the correct page if the phase doesn't match.
 * @param projectId - Project UUID, or null if not yet created.
 * @param phase - Which creation phase this page represents.
 * @returns Loading state, task count, and any error.
 */
export function usePhaseGuard(projectId: string | null, phase: Phase): PhaseGuardResult {
  const router = useRouter();
  const [loading, setLoading] = useState(!!projectId);
  const [taskCount, setTaskCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prevProjectId, setPrevProjectId] = useState(projectId);

  if (projectId !== prevProjectId) {
    setPrevProjectId(projectId);
    setLoading(!!projectId);
    setError(null);
  }

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function check() {
      try {
        const info = await getProjectPhaseInfo(projectId!);
        if (cancelled) return;

        if (!info) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        setTaskCount(info.taskCount);

        const allowed = ALLOWED_STATUSES[phase];
        if (!allowed.includes(info.status)) {
          router.replace(getRedirectPath(info.status, projectId!));
          return;
        }

        setLoading(false);
      } catch {
        if (cancelled) return;
        setError('Failed to verify project phase');
        setLoading(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [projectId, phase, router]);

  return { loading, taskCount, error };
}
