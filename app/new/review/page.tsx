'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { updateProjectStatus } from '@/lib/actions/project';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { usePhaseGuard } from '@/hooks/usePhaseGuard';
import type { Task, TaskEdge } from '@/lib/db/schema';

interface ProjectGraph {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
  edges: TaskEdge[];
}

/**
 * Review page content -- fetches real project data and displays summary.
 * @returns Review summary with real project stats.
 */
function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { loading: guardLoading, error: guardError } = usePhaseGuard(projectId, 'review');
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchGraph = useCallback(async () => {
    if (!projectId) return;
    try {
      setFetchError(false);
      const res = await fetch(`/api/project/${projectId}/graph`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGraph(data);
    } catch (err) {
      console.error('[review] graph fetch failed:', err);
      setFetchError(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!guardLoading && projectId) fetchGraph();
  }, [guardLoading, projectId, fetchGraph]);

  if (!projectId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-mono text-sm text-text-muted">No project ID provided.</p>
      </div>
    );
  }

  if (guardLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (guardError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-secondary">{guardError}</p>
        <Button variant="ghost" onClick={() => router.push('/')}>Go home</Button>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-text-secondary">Failed to load project data.</p>
        <Button variant="secondary" onClick={fetchGraph}>Retry</Button>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const totalTasks = graph.tasks.length;
  const doneTasks = graph.tasks.filter((t) => t.status === 'done').length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Collect unique tags
  const allTags = [...new Set(graph.tasks.flatMap((t) => t.tags))].sort();

  const handleEnterProject = async () => {
    try {
      setTransitionError(null);
      setIsTransitioning(true);
      await updateProjectStatus(projectId, 'active');
      router.push(`/project/${projectId}`);
    } catch (err) {
      console.error('[review] failed to activate project:', err);
      setIsTransitioning(false);
      setTransitionError('Failed to activate project. Please try again.');
    }
  };

  return (
    <>
      <TopBar projectName={graph.title} stageLabel="Review" />
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Review</h1>
          <p className="text-sm text-text-muted truncate">{graph.title}</p>
        </div>

        <Card animated className="mb-8 p-6">
          <h2 className="mb-1 text-xl font-semibold text-text-primary">
            {graph.title}
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-text-secondary">
            {graph.description}
          </p>

          <div className="mb-5 flex items-center gap-3 font-mono text-xs text-text-muted">
            <span>{totalTasks} tasks</span>
            <span>&middot;</span>
            <span>{graph.edges.length} edges</span>
            <span>&middot;</span>
            <span>{progress}% complete</span>
          </div>

          {/* Tags overview */}
          {allTags.length > 0 && (
            <div className="mb-5">
              <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-accent/8 px-2 py-0.5 text-xs text-accent-light"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Task summary by status */}
          <div>
            <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Task Breakdown
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              {(['draft', 'planned', 'in_progress', 'done'] as const).map((status) => {
                const count = graph.tasks.filter((t) => t.status === status).length;
                if (count === 0) return null;
                return (
                  <span key={status} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusDotColor(status)}`} />
                    <span className="font-mono text-xs">{count} {statusDisplayLabel(status)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push(`/new/decompose?projectId=${projectId}`)}
          >
            &larr; Adjust structure
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button variant="primary" onClick={handleEnterProject} isLoading={isTransitioning}>
              Enter project &rarr;
            </Button>
            {transitionError && (
              <p className="text-xs text-red-400">{transitionError}</p>
            )}
          </div>
        </div>
      </PageShell>
    </>
  );
}

/**
 * Map status to dot color class.
 * @param status - Task status.
 * @returns Tailwind class.
 */
function statusDotColor(status: string): string {
  switch (status) {
    case 'done': return 'bg-done';
    case 'in_progress': return 'bg-progress';
    case 'planned': return 'bg-planned';
    default: return 'bg-draft';
  }
}

/**
 * Map status to display label.
 * @param status - Task status.
 * @returns Label string.
 */
function statusDisplayLabel(status: string): string {
  switch (status) {
    case 'done': return 'done';
    case 'in_progress': return 'in progress';
    case 'planned': return 'planned';
    default: return 'draft';
  }
}

/**
 * Review page -- wrapped in Suspense for useSearchParams.
 * @returns The review page component.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>}>
      <ReviewContent />
    </Suspense>
  );
}
