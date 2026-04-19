'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { TabSwitcher } from '@/components/shared/TabSwitcher';
import { StructureView } from './navigator/StructureView';
import type { Task, TaskEdge } from '@/lib/db/schema';

const ForceGraph = dynamic(() => import('@/components/graph/ForceGraph'), { ssr: false });

const TABS = [
  { id: 'structure', label: 'Structure' },
  { id: 'graph', label: 'Graph' },
];

interface NavigatorPanelProps {
  /** @param tasks - All project tasks (augmented with taskRef). */
  tasks: (Task & { taskRef: string })[];
  /** @param edges - All project task edges. */
  edges: TaskEdge[];
  /** @param categories - Project-level categories for drawer grouping. */
  categories: string[];
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param selectedNodeId - Currently selected task ID. */
  selectedNodeId: string | null;
  /** @param onSelectNode - Called when a task is clicked. */
  onSelectNode: (taskId: string) => void;
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
  /** @param onDeselect - Called when clicking empty space in graph to clear selection. */
  onDeselect?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Left-panel navigator with two switchable views: Structure and Graph.
 * @param props - Navigator panel configuration.
 * @returns Navigator panel element with tab switcher.
 */
export function NavigatorPanel({
  tasks,
  edges,
  categories,
  projectId,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
  onDeselect,
  className = '',
}: NavigatorPanelProps) {
  const [activeTab, setActiveTab] = useState('structure');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing || !onGraphChange) return;
    setRefreshing(true);
    await onGraphChange();
    setRefreshing(false);
  }, [refreshing, onGraphChange]);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="shrink-0 border-b border-border px-3 py-2">
        <TabSwitcher
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          stretch
          className="w-full"
          trailing={
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto cursor-pointer rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-secondary disabled:cursor-not-allowed"
              aria-label="Refresh data"
              title="Refresh data"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              >
                <path d="M8 3a5 5 0 00-4.546 2.914.5.5 0 01-.908-.418A6 6 0 0114 8a6 6 0 01-6 6 6 6 0 01-5.454-3.496.5.5 0 01.908-.418A5 5 0 108 3z" />
                <path d="M8 1a.5.5 0 01.5.5v3a.5.5 0 01-1 0v-3A.5.5 0 018 1z" />
                <path d="M10.354 2.354a.5.5 0 010 .707l-2 2a.5.5 0 01-.708-.707l2-2a.5.5 0 01.708 0z" />
              </svg>
            </button>
          }
        />
      </div>

      <div className={`flex-1 ${activeTab === 'graph' ? 'overflow-hidden bg-base' : 'overflow-y-auto'}`}>
        {activeTab === 'structure' && (
          <StructureView
            tasks={tasks}
            edges={edges}
            categories={categories}
            projectId={projectId}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onGraphChange={onGraphChange}
          />
        )}
        {activeTab === 'graph' && (
          <ForceGraph
            tasks={tasks}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onDeselect={onDeselect}
          />
        )}
      </div>
    </div>
  );
}

export default NavigatorPanel;
