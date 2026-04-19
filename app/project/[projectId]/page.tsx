'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { TwoPanelLayout } from '@/components/layout/TwoPanelLayout';
import { NavigatorPanel } from '@/components/workspace/NavigatorPanel';
import { DetailPanel } from '@/components/workspace/DetailPanel';
import { ProjectChat } from '@/components/workspace/ProjectChat';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { Task, TaskEdge } from '@/lib/db/schema';
import { asIdentifier, enrichWithTaskRef, type TaskWithRef } from '@/lib/graph/identifier';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { dedupedFetch } from '@/lib/fetch-dedupe';

interface ProjectGraph {
  id: string;
  title: string;
  identifier: string;
  updatedAt: string;
  categories: string[];
  tasks: TaskWithRef<Task>[];
  edges: TaskEdge[];
}

/**
 * Compute the latest updatedAt across project, tasks, and edges.
 * @param graph - The full project graph.
 * @returns ISO timestamp string of the most recent update.
 */
function getMaxUpdatedAt(graph: ProjectGraph): string {
  let max = graph.updatedAt ?? '';
  for (const t of graph.tasks) if (String(t.updatedAt) > max) max = String(t.updatedAt);
  for (const e of graph.edges) if (String(e.updatedAt) > max) max = String(e.updatedAt);
  return max;
}

/**
 * Enrich raw graph tasks with composed `taskRef` from project identifier.
 * @param graph - Raw graph as returned by the API.
 * @returns Graph with each task carrying its composed taskRef.
 */
function enrichGraph(graph: ProjectGraph): ProjectGraph {
  const tasks = enrichWithTaskRef(graph.tasks, asIdentifier(graph.identifier));
  return { ...graph, tasks };
}

/**
 * Type guard narrowing a DOM Event to a `mymir:project-updated` CustomEvent.
 * @param e - Incoming DOM event.
 * @returns True when `e` carries the expected `{ projectId?: string }` detail shape.
 */
function isProjectUpdatedEvent(e: Event): e is CustomEvent<{ projectId?: string }> {
  if (!(e instanceof CustomEvent)) return false;
  const detail: unknown = e.detail;
  if (detail === null || detail === undefined) return true;
  if (typeof detail !== 'object') return false;
  const maybe = detail as { projectId?: unknown };
  return maybe.projectId === undefined || typeof maybe.projectId === 'string';
}

/**
 * Workspace page with two-panel layout: navigator (left) and detail/chat (right).
 * @returns Client-rendered workspace page.
 */
export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskContext, setTaskContext] = useState<{ agent: string; planning: string }>({ agent: '', planning: '' });
  const lastModifiedRef = useRef('');

  const refreshGraph = useCallback(async () => {
    const data = await dedupedFetch<ProjectGraph | null>(`graph:${projectId}`, () =>
      fetch(`/api/project/${projectId}/graph`).then((r) => (r.ok ? r.json() : null)),
    );
    if (!data) return;
    const enriched = enrichGraph(data);
    const maxUpdated = getMaxUpdatedAt(enriched);
    if (maxUpdated !== lastModifiedRef.current) {
      lastModifiedRef.current = maxUpdated;
      setGraph(enriched);
    }
  }, [projectId]);

  // Fetch project graph on mount
  useEffect(() => {
    let cancelled = false;
    dedupedFetch<ProjectGraph | null>(`graph:${projectId}`, () =>
      fetch(`/api/project/${projectId}/graph`).then((r) => (r.ok ? r.json() : null)),
    ).then((data) => {
      if (cancelled || !data) return;
      const enriched = enrichGraph(data);
      const maxUpdated = getMaxUpdatedAt(enriched);
      if (maxUpdated !== lastModifiedRef.current) {
        lastModifiedRef.current = maxUpdated;
        setGraph(enriched);
      }
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Real-time: SSE for instant updates + tab focus as fallback
  useRefreshOnFocus(refreshGraph, `/api/project/${projectId}/events`);

  // Primary signal for project-settings updates; SSE acts as a fallback if the window event is missed.
  useEffect(() => {
    const handler = (e: Event): void => {
      if (!isProjectUpdatedEvent(e)) return;
      const detail = e.detail;
      if (!detail?.projectId || detail.projectId === projectId) {
        lastModifiedRef.current = '';
        refreshGraph();
      }
    };
    window.addEventListener('mymir:project-updated', handler);
    return () => window.removeEventListener('mymir:project-updated', handler);
  }, [projectId, refreshGraph]);

  // Clear context when deselecting
  const [prevSelectedTaskId, setPrevSelectedTaskId] = useState<string | null>(null);
  if (selectedTaskId !== prevSelectedTaskId) {
    setPrevSelectedTaskId(selectedTaskId);
    if (!selectedTaskId) {
      setTaskContext({ agent: '', planning: '' });
    }
  }

  // Fetch context when task is selected
  useEffect(() => {
    if (!selectedTaskId) return;

    let cancelled = false;
    dedupedFetch(`context:${projectId}:${selectedTaskId}`, () =>
      fetch(`/api/project/${projectId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: selectedTaskId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Context fetch failed: ${r.status}`);
        return r.json() as Promise<{ agent: string; planning: string }>;
      }),
    )
      .then((data) => {
        if (!cancelled) setTaskContext({ agent: data.agent ?? '', planning: data.planning ?? '' });
      })
      .catch((err) => { if (!cancelled) console.error('[workspace] context fetch failed:', err); });
    return () => { cancelled = true; };
  }, [projectId, selectedTaskId]);

  const handleSelectNode = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const taskMap = useMemo(() => {
    if (!graph) return new Map<string, { title: string; status: string; taskRef: string }>();
    const map = new Map<string, { title: string; status: string; taskRef: string }>();
    for (const t of graph.tasks) map.set(t.id, { title: t.title, status: t.status, taskRef: t.taskRef });
    return map;
  }, [graph]);

  if (!graph) {
    return (
      <div className="flex h-[calc(var(--viewport-height)-var(--topbar-h))] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Resolve selected task
  const selectedTask = selectedTaskId
    ? graph.tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const taskEdges = selectedTaskId
    ? graph.edges.filter((e) => e.sourceTaskId === selectedTaskId || e.targetTaskId === selectedTaskId)
    : [];

  return (
    <TwoPanelLayout
      activePanelHint={selectedTaskId ? 'right' : 'left'}
      left={
        <NavigatorPanel
          tasks={graph.tasks}
          edges={graph.edges}
          categories={graph.categories}
          projectId={projectId}
          selectedNodeId={selectedTaskId}
          onSelectNode={handleSelectNode}
          onGraphChange={refreshGraph}
          onDeselect={handleClose}
        />
      }
      right={
        selectedTask ? (
          <DetailPanel
            taskId={selectedTaskId!}
            projectId={projectId}
            task={selectedTask}
            parentName={graph.title}
            categories={graph.categories}
            edges={taskEdges}
            contextText={taskContext.agent}
            planningContext={taskContext.planning}
            taskMap={taskMap}
            onClose={handleClose}
            onSelectNode={handleSelectNode}
            onGraphChange={refreshGraph}
          />
        ) : (
          <ProjectChat projectId={projectId} onGraphChange={refreshGraph} />
        )
      }
    />
  );
}
