'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TwoPanelLayout } from '@/components/layout/TwoPanelLayout';
import { NavigatorPanel } from '@/components/workspace/NavigatorPanel';
import { DetailPanel } from '@/components/workspace/DetailPanel';
import { PropRail } from '@/components/workspace/detail/PropRail';
import { PropRailDrawer } from '@/components/workspace/detail/PropRailDrawer';
import { WorkspaceGraphView } from '@/components/workspace/graph/WorkspaceGraphView';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { Task, TaskEdge } from '@/lib/db/schema';
import { asIdentifier, enrichWithTaskRef, type TaskWithRef } from '@/lib/graph/identifier';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { dedupedFetch } from '@/lib/fetch-dedupe';

interface ProjectGraph {
  /** Project UUID. */
  id: string;
  /** Project title — fed to the breadcrumb. */
  title: string;
  /** Project identifier (e.g. `MYMR`). */
  identifier: string;
  /** Project's last-update timestamp. */
  updatedAt: string;
  /** Categories. */
  categories: string[];
  /** Tasks with composed taskRef. */
  tasks: TaskWithRef<Task>[];
  /** Edges. */
  edges: TaskEdge[];
}

/** Workspace view identifier — mirrors the navigator's FilterBar value. */
type WorkspaceView = 'structure' | 'graph';

/**
 * Compute the latest updatedAt across project, tasks, and edges so we can
 * skip a re-render when the SSE refresh produces no actual change.
 *
 * @param graph - The project graph.
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
 *
 * @param graph - Raw graph as returned by the API.
 * @returns Graph with each task carrying its taskRef.
 */
function enrichGraph(graph: ProjectGraph): ProjectGraph {
  const tasks = enrichWithTaskRef(graph.tasks, asIdentifier(graph.identifier));
  return { ...graph, tasks };
}

/**
 * Type guard narrowing a DOM Event to a `mymir:project-updated` CustomEvent.
 *
 * @param e - Incoming DOM event.
 * @returns True when `e` carries the expected `{ projectId?: string }` shape.
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
 * Resolve the active view from the URL — defaults to `structure`. Mirrors
 * the navigator's own `readView` so the page-level branch and the FilterBar
 * never disagree about which surface is active.
 *
 * @param raw - Raw `view` query param.
 * @returns Workspace view identifier.
 */
function readView(raw: string | null): WorkspaceView {
  return raw === 'graph' ? 'graph' : 'structure';
}

/**
 * Workspace page — three-column layout above 1280px (navigator | detail |
 * property rail), two columns + drawer below 1280px, mobile toggle below
 * 1024px. In graph mode the navigator slot is replaced with the
 * `WorkspaceGraphView` (rail + canvas); detail and property rail behave
 * identically once a task is selected so operators get the same task
 * workspace either way. All real-time wiring is inherited from the previous
 * shell: SSE refresh + tab focus refetch + `mymir:project-updated` event.
 *
 * @returns Client-rendered workspace page.
 */
export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = readView(searchParams.get('view'));

  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskContext, setTaskContext] = useState<{ agent: string; planning: string; working: string }>({ agent: '', planning: '', working: '' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navigatorClosed, setNavigatorClosed] = useState(false);
  const lastModifiedRef = useRef('');
  const isXl = useMediaQuery('(min-width: 1280px)', true);

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

  useRefreshOnFocus(refreshGraph, `/api/project/${projectId}/events`);

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

  const [prevSelectedTaskId, setPrevSelectedTaskId] = useState<string | null>(null);
  if (selectedTaskId !== prevSelectedTaskId) {
    setPrevSelectedTaskId(selectedTaskId);
    if (!selectedTaskId) {
      setTaskContext({ agent: '', planning: '', working: '' });
      setDrawerOpen(false);
      // Closing a task auto-restores the navigator. The toggle is only useful
      // *while* a task is selected, so resetting it on deselect keeps the
      // shell predictable on the next open.
      setNavigatorClosed(false);
    }
  }

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
        return r.json() as Promise<{ agent: string; planning: string; working: string }>;
      }),
    )
      .then((data) => {
        if (!cancelled) setTaskContext({
          agent: data.agent ?? '',
          planning: data.planning ?? '',
          working: data.working ?? '',
        });
      })
      .catch((err) => { if (!cancelled) console.error('[workspace] context fetch failed:', err); });
    return () => { cancelled = true; };
  }, [projectId, selectedTaskId]);

  /**
   * Update a single search-param key without disturbing the rest. Mirrors the
   * navigator's helper so the URL contract stays consistent across surfaces.
   *
   * @param key - Param key to update.
   * @param value - New value (or `null` to delete).
   */
  const updateParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleSelectNode = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      // At narrow viewports there is no room to show the canvas + detail at
      // once. Auto-switch back to structure so the user lands on the task.
      if (view === 'graph' && !isXl) {
        updateParam('view', null);
      }
    },
    [view, isXl, updateParam],
  );

  const handleClose = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleSwitchToStructure = useCallback(() => {
    updateParam('view', null);
  }, [updateParam]);

  const taskMap = useMemo(() => {
    if (!graph) return new Map<string, { title: string; status: string; taskRef: string }>();
    const map = new Map<string, { title: string; status: string; taskRef: string }>();
    for (const t of graph.tasks) map.set(t.id, { title: t.title, status: t.status, taskRef: t.taskRef });
    return map;
  }, [graph]);

  const projectTags = useMemo(() => {
    if (!graph) return [] as string[];
    const set = new Set<string>();
    for (const t of graph.tasks) for (const tag of (t.tags as string[] | null) ?? []) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [graph]);

  if (!graph) {
    return (
      <div className="flex h-[calc(var(--viewport-height)-var(--topbar-h))] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const selectedTask = selectedTaskId
    ? graph.tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  const taskEdges = selectedTaskId
    ? graph.edges.filter((e) => e.sourceTaskId === selectedTaskId || e.targetTaskId === selectedTaskId)
    : [];

  const navigator = (
    <NavigatorPanel
      tasks={graph.tasks}
      edges={graph.edges}
      categories={graph.categories}
      projectId={projectId}
      selectedNodeId={selectedTaskId}
      onSelectNode={handleSelectNode}
      onGraphChange={refreshGraph}
    />
  );

  const showNavigatorToggle = view === 'structure' && isXl && Boolean(selectedTask);
  const detail = selectedTask ? (
    <DetailPanel
      taskId={selectedTaskId!}
      projectId={projectId}
      task={selectedTask}
      parentName={graph.title}
      edges={taskEdges}
      allEdges={graph.edges}
      allTasks={graph.tasks}
      bundles={taskContext}
      taskMap={taskMap}
      drawerOpen={drawerOpen}
      onToggleDrawer={() => setDrawerOpen((v) => !v)}
      onClose={handleClose}
      onSelectNode={handleSelectNode}
      onGraphChange={refreshGraph}
      navigatorClosed={showNavigatorToggle ? navigatorClosed : undefined}
      onToggleNavigator={
        showNavigatorToggle ? () => setNavigatorClosed((v) => !v) : undefined
      }
    />
  ) : (
    <EmptyDetail />
  );

  const propRail = selectedTask ? (
    <PropRail
      taskId={selectedTaskId!}
      status={selectedTask.status}
      category={selectedTask.category}
      categories={graph.categories}
      tags={(selectedTask.tags as string[] | null) ?? []}
      projectTags={projectTags}
      edges={taskEdges}
      taskMap={taskMap}
      files={Array.from(new Set((selectedTask.files as string[] | null) ?? []))}
      projectIdentifier={graph.identifier}
      projectName={graph.title}
      onSelectNode={handleSelectNode}
      onGraphChange={refreshGraph}
    />
  ) : null;

  // Graph view — canvas always fills the available width. When a task is
  // selected at xl, detail + property rail slide in as a right-pinned overlay
  // on top of the canvas (no layout reflow). Below xl `handleSelectNode`
  // already routes the click through structure mode, so the overlay is xl-only.
  if (view === 'graph') {
    const showOverlay = isXl && Boolean(selectedTask);
    return (
      <div className="flex h-[calc(var(--viewport-height)-var(--topbar-h))]">
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkspaceGraphView
            tasks={graph.tasks}
            edges={graph.edges}
            selectedNodeId={selectedTaskId}
            onSelectNode={handleSelectNode}
            onDeselect={handleClose}
            onSwitchToStructure={handleSwitchToStructure}
            detailSlot={showOverlay ? detail : undefined}
            propRailSlot={showOverlay ? propRail : undefined}
          />
        </div>
      </div>
    );
  }

  // Structure view — when a task is selected at xl, the navigator column can
  // be folded away via the detail header's panel-toggle so the operator
  // focuses on the task. Width animates with motion; closing the task (Esc /
  // close button) auto-resets the toggle so the next open still sees the list.
  if (isXl) {
    return (
      <div className="flex h-[calc(var(--viewport-height)-var(--topbar-h))]">
        <motion.div
          className="flex flex-col overflow-hidden"
          animate={{ width: navigatorClosed ? 0 : 460 }}
          initial={false}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          style={{ flexShrink: 0, minWidth: 0 }}
        >
          <div className="flex h-full min-w-[320px] flex-col">{navigator}</div>
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="bg-gradient-to-b from-border-strong via-border to-transparent"
          animate={{ width: navigatorClosed ? 0 : 1, opacity: navigatorClosed ? 0 : 1 }}
          initial={false}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          style={{ flexShrink: 0 }}
        />
        <div data-panel="detail" className="flex min-w-0 flex-1 flex-col">
          {detail}
        </div>
        {propRail}
      </div>
    );
  }

  return (
    <>
      <TwoPanelLayout
        activePanelHint={selectedTaskId ? 'right' : 'left'}
        left={navigator}
        right={detail}
      />
      <PropRailDrawer open={drawerOpen && !!selectedTask} onClose={() => setDrawerOpen(false)}>
        {propRail}
      </PropRailDrawer>
    </>
  );
}

/**
 * Empty placeholder for when no task is selected — same copy as the
 * previous workspace shell so the muscle memory carries over.
 *
 * @returns Centred hint card.
 */
function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <p className="text-sm text-text-secondary">No task selected</p>
      <p className="mt-1 max-w-sm text-xs text-text-muted">
        Pick a task from the navigator to view and edit its details.
      </p>
    </div>
  );
}
