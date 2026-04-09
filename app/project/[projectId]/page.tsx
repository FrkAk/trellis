'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { TwoPanelLayout } from '@/components/layout/TwoPanelLayout';
import { NavigatorPanel } from '@/components/workspace/NavigatorPanel';
import { DetailPanel } from '@/components/workspace/DetailPanel';
import { ProjectChat } from '@/components/workspace/ProjectChat';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { Task, TaskEdge } from '@/lib/db/schema';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface ProjectGraph {
  id: string;
  title: string;
  updatedAt: string;
  categories: string[];
  tasks: Task[];
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
 * Workspace page with two-panel layout: navigator (left) and detail/chat (right).
 * @returns Client-rendered workspace page.
 */
export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [contextText, setContextText] = useState('');
  const [planningContext, setPlanningContext] = useState('');
  const lastModifiedRef = useRef('');

  const refreshGraph = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}/graph`);
    if (!res.ok) return;
    const data: ProjectGraph = await res.json();
    const maxUpdated = getMaxUpdatedAt(data);
    if (maxUpdated !== lastModifiedRef.current) {
      lastModifiedRef.current = maxUpdated;
      setGraph(data);
    }
  }, [projectId]);

  // Fetch project graph on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/project/${projectId}/graph`);
      if (!res.ok || cancelled) return;
      const data: ProjectGraph = await res.json();
      if (cancelled) return;
      const maxUpdated = getMaxUpdatedAt(data);
      if (maxUpdated !== lastModifiedRef.current) {
        lastModifiedRef.current = maxUpdated;
        setGraph(data);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Real-time: SSE for instant updates + tab focus as fallback
  useRefreshOnFocus(refreshGraph, `/api/project/${projectId}/events`);

  // Clear context when deselecting
  const [prevSelectedTaskId, setPrevSelectedTaskId] = useState<string | null>(null);
  if (selectedTaskId !== prevSelectedTaskId) {
    setPrevSelectedTaskId(selectedTaskId);
    if (!selectedTaskId) {
      setContextText('');
      setPlanningContext('');
    }
  }

  // Fetch context when task is selected
  useEffect(() => {
    if (!selectedTaskId) return;

    let cancelled = false;
    const fetchCtx = (depth: string) =>
      fetch('/api/mymir/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: selectedTaskId, depth }),
      }).then((r) => r.json());

    Promise.all([fetchCtx('agent'), fetchCtx('planning')])
      .then(([agent, planning]) => {
        if (!cancelled) {
          setContextText(agent ?? '');
          setPlanningContext(planning ?? '');
        }
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

  // Build taskMap for relationship title and status resolution
  const taskMap = useMemo(() => {
    if (!graph) return new Map<string, { title: string; status: string }>();
    const map = new Map<string, { title: string; status: string }>();
    for (const t of graph.tasks) map.set(t.id, { title: t.title, status: t.status });
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
            key={selectedTaskId!}
            taskId={selectedTaskId!}
            projectId={projectId}
            task={selectedTask}
            parentName={graph.title}
            categories={graph.categories}
            edges={taskEdges}
            contextText={contextText}
            planningContext={planningContext}
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
