"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { NavigatorPanel } from "@/components/workspace/NavigatorPanel";
import { DetailPanel } from "@/components/workspace/DetailPanel";
import { PropRail } from "@/components/workspace/detail/PropRail";
import { PropRailDrawer } from "@/components/workspace/detail/PropRailDrawer";
import { WorkspaceGraphView } from "@/components/workspace/graph/WorkspaceGraphView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { DeferredLoadingSpinner } from "@/components/shared/DeferredLoadingSpinner";
import { projectKeys, taskKeys } from "@/lib/query/keys";
import { fetchProjectGraph, fetchTaskBody } from "@/lib/query/queries";
import type {
  ProjectGraphSlim,
  TaskGraphSlim,
} from "@/lib/data/views";
import type { TaskEdge } from "@/lib/db/schema";

/** Workspace view identifier — mirrors the navigator's FilterBar value. */
type WorkspaceView = "structure" | "graph";

/**
 * Resolve the active view from the URL — defaults to `structure`. Mirrors
 * the navigator's own `readView` so the page-level branch and the FilterBar
 * never disagree about which surface is active.
 *
 * @param raw - Raw `view` query param.
 * @returns Workspace view identifier.
 */
function readView(raw: string | null): WorkspaceView {
  return raw === "graph" ? "graph" : "structure";
}

interface WorkspaceClientProps {
  /** Project UUID — taken from the route params on the server shell. */
  projectId: string;
}

/**
 * Client-side workspace shell. Owns selection state and the URL `view`
 * sync; reads the slim graph via TanStack Query (server prefetches; SSE
 * invalidates on remote mutations). The selected-task body fetch lives in
 * {@link WorkspaceBodyWithSelection} so it only registers a Query observer
 * when there is a live, in-graph selection — no `["task", projectId, ""]`
 * placeholder entry pollutes the cache, and a deleted task can't keep
 * triggering 404 refetches via SSE invalidations.
 *
 * @param props - Workspace configuration.
 * @returns Three-column workspace, with graph mode swap when `?view=graph`.
 */
export function WorkspaceClient({ projectId }: WorkspaceClientProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = readView(searchParams.get("view"));
  const isXl = useMediaQuery("(min-width: 1280px)", true);

  const { data: graph } = useQuery({
    queryKey: projectKeys.graph(projectId),
    queryFn: fetchProjectGraph(qc, projectId),
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navigatorClosed, setNavigatorClosed] = useState(false);

  /**
   * Slim row for the selected task. `null` while there is no selection AND
   * when the slim graph no longer contains the selected id (deleted by us
   * or by another tab via SSE).
   */
  const selectedTaskSlim: TaskGraphSlim | null = selectedTaskId && graph
    ? graph.tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  /**
   * Render-phase reset: when the slim graph has refreshed and the selected
   * task is no longer in it (delete from another tab, undo created a new
   * id, etc.), drop the dangling selection so the body `useQuery` doesn't
   * keep polling a 404. Mirrors the existing `prevSelectedTaskId` reset
   * pattern below — keeps the reset inside the render cycle.
   */
  if (selectedTaskId && graph && !selectedTaskSlim) {
    setSelectedTaskId(null);
  }

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: projectKeys.graph(projectId) });
    if (selectedTaskId) {
      qc.invalidateQueries({
        queryKey: taskKeys.detail(projectId, selectedTaskId),
      });
    }
  }, [qc, projectId, selectedTaskId]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      const nextQs = next.toString();
      if (nextQs === searchParams.toString()) return;
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  /**
   * Select a task. At narrow viewports (`!isXl`), the graph canvas and
   * detail panel cannot share screen space, so auto-switch back to the
   * structure view when graph mode is currently active.
   *
   * @param taskId - Task to select.
   */
  const handleSelectNode = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      if (view === "graph" && !isXl) updateParam("view", null);
    },
    [view, isXl, updateParam],
  );

  const handleClose = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleSwitchToStructure = useCallback(() => {
    updateParam("view", null);
  }, [updateParam]);

  const [prevSelectedTaskId, setPrevSelectedTaskId] = useState<string | null>(
    null,
  );
  if (selectedTaskId !== prevSelectedTaskId) {
    setPrevSelectedTaskId(selectedTaskId);
    if (selectedTaskId === null) {
      setDrawerOpen(false);
      setNavigatorClosed(false);
    }
  }

  const taskMap = useMemo(() => {
    if (!graph) return new Map<string, { title: string; status: string; taskRef: string }>();
    const map = new Map<string, { title: string; status: string; taskRef: string }>();
    for (const t of graph.tasks) {
      map.set(t.id, { title: t.title, status: t.status, taskRef: t.taskRef });
    }
    return map;
  }, [graph]);

  const projectTags = useMemo(() => {
    if (!graph) return [] as string[];
    const set = new Set<string>();
    for (const t of graph.tasks) for (const tag of t.tags ?? []) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [graph]);

  if (!graph) {
    return (
      <div className="flex h-[calc(var(--viewport-height)-var(--topbar-h))] items-center justify-center">
        <DeferredLoadingSpinner />
      </div>
    );
  }

  const showNavigatorToggle =
    view === "structure" && isXl && Boolean(selectedTaskSlim);

  const sharedLayoutProps: SharedLayoutProps = {
    projectId,
    graph,
    view,
    isXl,
    selectedTaskId,
    drawerOpen,
    setDrawerOpen,
    navigatorClosed,
    setNavigatorClosed,
    showNavigatorToggle,
    handleSelectNode,
    handleClose,
    handleSwitchToStructure,
    refreshAll,
    taskMap,
    projectTags,
  };

  if (selectedTaskSlim) {
    return (
      <WorkspaceBodyWithSelection
        {...sharedLayoutProps}
        taskSlim={selectedTaskSlim}
      />
    );
  }

  return (
    <WorkspaceLayout
      {...sharedLayoutProps}
      taskSlim={null}
      detail={<EmptyDetail />}
      propRail={null}
      taskEdges={[]}
    />
  );
}

interface SharedLayoutProps {
  projectId: string;
  graph: ProjectGraphSlim;
  view: WorkspaceView;
  isXl: boolean;
  selectedTaskId: string | null;
  drawerOpen: boolean;
  setDrawerOpen: (updater: (v: boolean) => boolean) => void;
  navigatorClosed: boolean;
  setNavigatorClosed: (updater: (v: boolean) => boolean) => void;
  showNavigatorToggle: boolean;
  handleSelectNode: (taskId: string) => void;
  handleClose: () => void;
  handleSwitchToStructure: () => void;
  refreshAll: () => void;
  taskMap: Map<string, { title: string; status: string; taskRef: string }>;
  projectTags: string[];
}

interface WorkspaceBodyWithSelectionProps extends SharedLayoutProps {
  /** Slim row for the currently selected task (already validated against the graph). */
  taskSlim: TaskGraphSlim;
}

/**
 * Renders the workspace layout for a live, in-graph selection. The
 * selected-task body is fetched here so the Query observer is only
 * registered when there is a non-null, valid task id — solves the cache
 * pollution issue where a placeholder query keyed on `""` would otherwise
 * survive every empty-state render.
 *
 * @param props - Layout + selected slim row.
 * @returns Layout with populated detail and prop rail slots.
 */
function WorkspaceBodyWithSelection(
  props: WorkspaceBodyWithSelectionProps,
) {
  const { projectId, graph, taskSlim, taskMap, projectTags, refreshAll, handleSelectNode, handleClose, drawerOpen, setDrawerOpen, navigatorClosed, setNavigatorClosed, showNavigatorToggle } = props;
  const qc = useQueryClient();
  const taskId = taskSlim.id;

  const { data: selectedTaskFull } = useQuery({
    queryKey: taskKeys.detail(projectId, taskId),
    queryFn: fetchTaskBody(qc, projectId, taskId),
  });

  const taskEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) => e.sourceTaskId === taskId || e.targetTaskId === taskId,
      ),
    [graph.edges, taskId],
  );

  const taskFullMatches =
    selectedTaskFull && selectedTaskFull.id === taskId;

  const detail = taskFullMatches && selectedTaskFull ? (
    <DetailPanel
      taskId={taskId}
      projectId={projectId}
      task={selectedTaskFull}
      parentName={graph.project.title}
      edges={taskEdges}
      allEdges={graph.edges}
      allTasks={graph.tasks}
      taskMap={taskMap}
      drawerOpen={drawerOpen}
      onToggleDrawer={() => setDrawerOpen((v) => !v)}
      onClose={handleClose}
      onSelectNode={handleSelectNode}
      onGraphChange={refreshAll}
      navigatorClosed={showNavigatorToggle ? navigatorClosed : undefined}
      onToggleNavigator={
        showNavigatorToggle ? () => setNavigatorClosed((v) => !v) : undefined
      }
    />
  ) : (
    <DetailLoading />
  );

  const propRail =
    taskFullMatches && selectedTaskFull ? (
      <PropRail
        taskId={taskId}
        status={selectedTaskFull.status}
        category={selectedTaskFull.category}
        categories={graph.project.categories}
        tags={selectedTaskFull.tags ?? []}
        projectTags={projectTags}
        edges={taskEdges}
        taskMap={taskMap}
        files={Array.from(new Set(selectedTaskFull.files ?? []))}
        projectIdentifier={graph.project.identifier}
        projectName={graph.project.title}
        onSelectNode={handleSelectNode}
        onGraphChange={refreshAll}
      />
    ) : null;

  return (
    <WorkspaceLayout
      {...props}
      taskSlim={taskSlim}
      detail={detail}
      propRail={propRail}
      taskEdges={taskEdges}
    />
  );
}

interface WorkspaceLayoutProps extends SharedLayoutProps {
  taskSlim: TaskGraphSlim | null;
  detail: React.ReactNode;
  propRail: React.ReactNode;
  taskEdges: TaskEdge[];
}

/**
 * Pure layout shell. Receives pre-built `detail` and `propRail` JSX so the
 * useQuery for the task body lives outside this component. Branches on
 * `view`, `isXl`, and presence of `taskSlim` to drive the three layout
 * shapes (graph overlay, xl 3-column, narrow drawer).
 *
 * @param props - Layout shape configuration plus pre-built slot JSX.
 * @returns The right layout for the current breakpoint and view.
 */
function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const {
    projectId,
    graph,
    view,
    isXl,
    selectedTaskId,
    drawerOpen,
    setDrawerOpen,
    navigatorClosed,
    handleSelectNode,
    handleClose,
    handleSwitchToStructure,
    refreshAll,
    taskSlim,
    detail,
    propRail,
  } = props;

  const navigator = (
    <NavigatorPanel
      tasks={graph.tasks}
      edges={graph.edges}
      categories={graph.project.categories}
      projectId={projectId}
      selectedNodeId={selectedTaskId}
      onSelectNode={handleSelectNode}
      onGraphChange={refreshAll}
    />
  );

  if (view === "graph") {
    const showOverlay = isXl && Boolean(taskSlim);
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
        activePanelHint={selectedTaskId ? "right" : "left"}
        left={navigator}
        right={detail}
      />
      <PropRailDrawer
        open={drawerOpen && !!taskSlim}
        onClose={() => setDrawerOpen(() => false)}
      >
        {propRail}
      </PropRailDrawer>
    </>
  );
}

/** Placeholder shown when no task is selected. */
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

/** Loading state while a freshly-selected task body is being fetched. */
function DetailLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <DeferredLoadingSpinner />
    </div>
  );
}
