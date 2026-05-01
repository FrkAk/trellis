'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TabSwitcher } from '@/components/shared/TabSwitcher';
import { TaskTab } from './tabs/TaskTab';
import { PlanTab } from './tabs/PlanTab';
import { ContextTab } from './tabs/ContextTab';
import { HistoryTab } from './tabs/HistoryTab';
import { updateTask } from '@/lib/graph/mutations';
import { useUndo, UndoButton } from '@/hooks/useUndo';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { Task, TaskEdge } from '@/lib/db/schema';

interface DetailPanelProps {
  /** @param taskId - UUID of the selected task. */
  taskId: string;
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param task - The full task data, enriched with composed taskRef. */
  task: Task & { taskRef: string };
  /** @param parentName - Project title. */
  parentName: string;
  /** @param categories - Project-level categories for category selector. */
  categories: string[];
  /** @param edges - Edges connected to this task. */
  edges: TaskEdge[];
  /** @param contextText - Pre-built context string. */
  contextText: string;
  /** @param planningContext - Pre-built planning context string. */
  planningContext: string;
  /** @param taskMap - Map of task IDs to title, status, and taskRef for relationship display. */
  taskMap: Map<string, { title: string; status: string; taskRef: string }>;
  /** @param onClose - Called when the close button is clicked. */
  onClose: () => void;
  /** @param onSelectNode - Called when a relationship link is clicked. */
  onSelectNode: (taskId: string) => void;
  /** @param onGraphChange - Called after graph mutations to trigger re-fetch. */
  onGraphChange?: () => void;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/** Status lifecycle for tasks. */
const STATUS_FLOW = ['draft', 'planned', 'in_progress', 'done'];

/** Status display labels. */
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** Status colors for the stepper. */
const STATUS_COLORS: Record<string, string> = {
  draft: 'text-draft',
  planned: 'text-planned',
  in_progress: 'text-progress',
  done: 'text-done',
  cancelled: 'text-cancelled',
};

/** Header gradient keyed to task status. */
const STATUS_HEADER: Record<string, { gradient: string; border: string; badge: string }> = {
  draft: { gradient: 'from-draft/10 via-draft/3 to-transparent', border: 'border-draft/20', badge: 'bg-draft/10 text-draft' },
  planned: { gradient: 'from-planned/15 via-planned/4 to-transparent', border: 'border-planned/25', badge: 'bg-planned/15 text-planned' },
  in_progress: { gradient: 'from-progress/15 via-progress/4 to-transparent', border: 'border-progress/25', badge: 'bg-progress/15 text-progress' },
  done: { gradient: 'from-done/20 via-done/5 to-transparent', border: 'border-done/30', badge: 'bg-done/15 text-done' },
  cancelled: { gradient: 'from-cancelled/10 via-cancelled/3 to-transparent', border: 'border-cancelled/20', badge: 'bg-cancelled/10 text-cancelled' },
};

/**
 * Right-panel detail view for a selected task.
 * @param props - Detail panel configuration.
 * @returns Detail panel with header, status stepper, tab switcher, and tab content.
 */
export function DetailPanel({
  taskId,
  projectId,
  task,
  parentName,
  categories,
  edges,
  contextText,
  planningContext,
  taskMap,
  onClose,
  onSelectNode,
  onGraphChange,
  className = '',
}: DetailPanelProps) {
  const tabs = buildTabs();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 'refine');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');
  const [localTitle, setLocalTitle] = useState(task.title);
  const [prevTitle, setPrevTitle] = useState(task.title);
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  const [editingTitle, setEditingTitle] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const titleCancelledRef = useRef(false);

  if (task.title !== prevTitle) {
    setPrevTitle(task.title);
    setLocalTitle(task.title);
  }

  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setCategoryOpen(false);
    setAddingTag(false);
    setNewTagValue('');
    setEditingTitle(false);
  }

  // Close category tray on outside click
  useEffect(() => {
    if (!categoryOpen) return;
    const handler = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [categoryOpen]);

  const handleRestoreStatus = useCallback(async (prevStatus: string) => {
    await updateTask(taskId, { status: prevStatus });
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  const { canUndo: canUndoStatus, push: pushStatusUndo, undo: undoStatus } = useUndo<string>({
    onUndo: handleRestoreStatus,
    resetOn: taskId,
  });

  const handleStatusChange = useCallback(async (newStatus: string) => {
    pushStatusUndo(task.status);
    await updateTask(taskId, { status: newStatus });
    onGraphChange?.();
  }, [taskId, task.status, pushStatusUndo, onGraphChange]);

  const handleSaveTitle = useCallback(async () => {
    setEditingTitle(false);
    const trimmed = localTitle.trim();
    if (!trimmed) { setLocalTitle(task.title); return; }
    if (trimmed !== task.title) {
      await updateTask(taskId, { title: trimmed });
      onGraphChange?.();
    }
  }, [localTitle, task.title, taskId, onGraphChange]);

  /** @param category - New category name, or null to uncategorize. */
  const handleCategoryChange = useCallback(async (category: string | null) => {
    await updateTask(taskId, { category });
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  /** @param tag - Tag string to remove from the task. */
  const handleRemoveTag = useCallback(async (tag: string) => {
    const current = (task.tags as string[] | null) ?? [];
    const updated = current.filter((t) => t !== tag);
    await updateTask(taskId, { tags: updated }, true);
    onGraphChange?.();
  }, [taskId, task.tags, onGraphChange]);

  /** Adds newTagValue to the task's tags after trimming and deduplication. */
  const handleAddTag = useCallback(async () => {
    const trimmed = newTagValue.trim().toLowerCase();
    if (!trimmed) { setAddingTag(false); setNewTagValue(''); return; }
    const current = (task.tags as string[] | null) ?? [];
    if (current.includes(trimmed)) { setAddingTag(false); setNewTagValue(''); return; }
    await updateTask(taskId, { tags: [...current, trimmed] }, true);
    setAddingTag(false);
    setNewTagValue('');
    onGraphChange?.();
  }, [taskId, task.tags, newTagValue, onGraphChange]);

  const { status: refCopyStatus, copy: copyRef } = useCopyToClipboard();

  const currentIdx = STATUS_FLOW.indexOf(task.status);
  const header = STATUS_HEADER[task.status] ?? STATUS_HEADER.draft;

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Gradient header — color shifts with task status */}
      <div className={`shrink-0 border-b ${header.border} bg-gradient-to-b ${header.gradient} transition-colors duration-500`}>
        <div className="px-5 pt-3.5 pb-2">
          {/* Top row: type badge + parent + close */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyRef(task.taskRef)}
                aria-label={`Copy task ID ${task.taskRef}`}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all duration-500 ${header.badge} hover:brightness-110`}
              >
                <span>{'\u25CF'}</span>
                <AnimatePresence mode="wait" initial={false}>
                  {refCopyStatus === 'copied' ? (
                    <motion.span
                      key="done"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      aria-live="polite"
                    >
                      Copied
                    </motion.span>
                  ) : refCopyStatus === 'error' ? (
                    <motion.span
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      aria-live="polite"
                    >
                      Copy failed
                    </motion.span>
                  ) : (
                    <motion.span
                      key="ref"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      {task.taskRef}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              {parentName && (
                <>
                  <span className="text-text-muted text-[10px]">/</span>
                  <span className="text-xs text-text-muted truncate max-w-[120px]">{parentName}</span>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="cursor-pointer rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>

          {/* Title — click to edit */}
          {editingTitle ? (
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                if (titleCancelledRef.current) { titleCancelledRef.current = false; setLocalTitle(task.title); setEditingTitle(false); }
                else handleSaveTitle();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === 'Escape') { titleCancelledRef.current = true; e.currentTarget.blur(); }
              }}
              autoFocus
              className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1 text-lg font-bold text-text-primary leading-tight outline-none transition-colors duration-150 focus:border-accent mb-1.5"
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              className="group/title relative cursor-pointer rounded-lg border border-transparent px-2 py-1 text-lg font-bold text-text-primary leading-tight mb-1.5 transition-all duration-150 hover:border-border hover:bg-surface/50"
            >
              {localTitle}
              <svg viewBox="0 0 16 16" fill="currentColor" className="absolute right-2 top-2 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-150 group-hover/title:opacity-100">
                <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.097-1.097z" />
              </svg>
            </h2>
          )}

          {/* Category + Tags — same row */}
          <div className="flex items-center gap-2 mb-2">
            {/* Category (left) */}
            <div ref={categoryRef} className="shrink-0">
              <AnimatePresence mode="wait">
                {!categoryOpen ? (
                  <motion.button
                    key="chip"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    onClick={() => categories.length > 0 && setCategoryOpen(true)}
                    className={`cursor-pointer inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium transition-all ${
                      task.category
                        ? 'bg-accent/8 text-accent-light hover:bg-accent/12'
                        : categories.length > 0
                          ? 'border border-dashed border-border-strong text-text-muted/30 hover:text-text-muted/50'
                          : 'border border-dashed border-border-strong text-text-muted/30'
                    }`}
                  >
                    {task.category ?? 'Uncategorized'}
                    {categories.length > 0 && (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 opacity-40">
                        <path d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" />
                      </svg>
                    )}
                  </motion.button>
                ) : (
                  <motion.div
                    key="tray"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="flex items-center gap-0.5 overflow-x-auto"
                  >
                    {categories.map((cat) => {
                      const isCurrent = task.category === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => { handleCategoryChange(isCurrent ? null : cat); setCategoryOpen(false); }}
                          className={`shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium transition-all ${
                            isCurrent
                              ? 'bg-accent/10 text-accent-light'
                              : 'text-text-muted/40 hover:bg-surface-hover hover:text-text-muted'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tags (right) — editable */}
            <div className="flex flex-wrap items-center justify-end gap-1 ml-auto min-w-0">
              {((task.tags as string[] | null) ?? []).map((tag) => (
                <span key={tag} className="group/tag inline-flex items-center gap-0.5 rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-light">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="cursor-pointer rounded-sm opacity-0 transition-opacity group-hover/tag:opacity-100 hover:text-accent-light"
                    title={`Remove tag "${tag}"`}
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                    </svg>
                  </button>
                </span>
              ))}
              {addingTag ? (
                <input
                  type="text"
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag();
                    if (e.key === 'Escape') { setAddingTag(false); setNewTagValue(''); }
                  }}
                  onBlur={handleAddTag}
                  autoFocus
                  placeholder="tag"
                  style={{ outline: 'none' }}
                  className="w-16 rounded-md bg-accent/5 px-1.5 py-0.5 font-mono text-[10px] text-accent placeholder:text-accent/30 ring-1 ring-accent/20"
                />
              ) : (
                <button
                  onClick={() => { setAddingTag(true); setNewTagValue(''); }}
                  className="cursor-pointer rounded-md px-1 py-0.5 text-accent/30 transition-colors hover:bg-accent/5 hover:text-accent/60"
                  title="Add tag"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Status stepper */}
          <div className="flex items-center gap-0.5 mb-2 overflow-x-auto">
            {task.status === 'cancelled' ? (
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center rounded-md bg-cancelled/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-cancelled line-through">
                  Cancelled
                </span>
                <button
                  onClick={() => handleStatusChange('draft')}
                  title="Reopen this task as draft"
                  className="cursor-pointer min-h-9 inline-flex items-center rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                >
                  Reopen
                </button>
              </div>
            ) : (
              STATUS_FLOW.map((status, i) => {
                const isCurrent = status === task.status;
                const isPast = i < currentIdx;
                const color = STATUS_COLORS[status] ?? 'text-text-muted';

                return (
                  <div key={status} className="flex items-center">
                    {i > 0 && (
                      <div className={`mx-0.5 h-px w-3 ${isPast ? 'bg-done/40' : 'bg-border-strong'}`} />
                    )}
                    <button
                      onClick={() => handleStatusChange(status)}
                      className={`relative cursor-pointer rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                        isCurrent
                          ? `${color} bg-surface-raised ring-1 ring-current/20`
                          : isPast
                            ? 'text-done/60 hover:bg-surface-hover'
                            : 'text-text-muted/50 hover:bg-surface-hover hover:text-text-muted'
                      }`}
                      title={`Set to ${STATUS_LABELS[status]}`}
                    >
                      {STATUS_LABELS[status]}
                      {isCurrent && (
                        <motion.div
                          layoutId={`status-indicator-${taskId}`}
                          className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-current"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </button>
                  </div>
                );
              })
            )}
            <UndoButton canUndo={canUndoStatus} onUndo={undoStatus} className="ml-auto" />
            {task.status !== 'cancelled' && task.status !== 'done' && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                aria-label="Cancel task"
                title="Cancel this task — preserves rationale (vs delete which removes it)"
                className="cursor-pointer min-h-9 inline-flex items-center rounded-md px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted/50 hover:text-cancelled hover:bg-cancelled/10 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pb-2">
          <TabSwitcher tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="h-full overflow-hidden"
          >
            {activeTab === 'refine' && (
              <TaskTab
                taskId={taskId}
                description={task.description}
                acceptanceCriteria={task.acceptanceCriteria}
                decisions={task.decisions}
                edges={edges}
                taskMap={taskMap}
                onSelectNode={onSelectNode}
                files={(task.files as string[] | null) ?? undefined}
                executionRecord={task.executionRecord ?? null}
                onGraphChange={onGraphChange}
              />
            )}
            {activeTab === 'plan' && (
              <PlanTab
                key={taskId}
                taskId={taskId}
                projectId={projectId}
                status={task.status}
                planningContext={planningContext}
                existingPlan={task.implementationPlan ?? null}
                existingExecution={task.executionRecord ?? null}
                edges={edges}
                taskMap={taskMap}
                onGraphChange={onGraphChange}
              />
            )}
            {activeTab === 'context' && (
              <ContextTab contextText={contextText} />
            )}
            {activeTab === 'history' && (
              <HistoryTab history={task.history} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Build available tabs based on task state.
 * @param task - The full task data.
 * @returns Array of tab definitions with optional glow indicator.
 */
function buildTabs() {
  return [
    { id: 'refine', label: 'Refine' },
    { id: 'plan', label: 'Plan' },
    { id: 'context', label: 'Context' },
    { id: 'history', label: 'History' },
  ];
}

export default DetailPanel;
