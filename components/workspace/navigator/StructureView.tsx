'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { createTask, deleteTask, updateProject, renameCategory, deleteCategory } from '@/lib/graph/mutations';
import { useUndo, UndoButton } from '@/hooks/useUndo';
import { statusDot, statusChipText, statusLabel } from '@/lib/ui/status';
import { isPlannable, isReady, buildStatusMap } from '@/lib/ui/taskState';
import type { Task, TaskEdge } from '@/lib/db/schema';

type TaskWithRef = Task & { taskRef: string };

const FILTER_PARAM_KEYS = { tags: 'tags', categories: 'cat', statuses: 'status' } as const;

/**
 * Parses a comma-separated filter param into a Set.
 * @param value - Raw param value or null.
 * @returns Set of non-empty values.
 */
function parseFilterParam(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(',').filter(Boolean));
}

/**
 * Serializes the three filter sets into a URL query string, preserving other params.
 * @param tags - Active tag filters.
 * @param categories - Active category filters.
 * @param statuses - Active status filters.
 * @param currentParams - Existing URL search params to preserve.
 * @returns Query string starting with '?', or '' when no params remain.
 */
function serializeFilters(
  tags: Set<string>,
  categories: Set<string>,
  statuses: Set<string>,
  currentParams: URLSearchParams,
): string {
  const next = new URLSearchParams(currentParams);
  const apply = (key: string, set: Set<string>) => {
    if (set.size === 0) next.delete(key);
    else next.set(key, [...set].join(','));
  };
  apply(FILTER_PARAM_KEYS.tags, tags);
  apply(FILTER_PARAM_KEYS.categories, categories);
  apply(FILTER_PARAM_KEYS.statuses, statuses);
  const qs = next.toString();
  return qs ? `?${qs}` : '';
}

type DeletedTask = {
  title: string;
  taskData: Task;
};

interface StructureViewProps {
  /** @param tasks - All project tasks (augmented with taskRef). */
  tasks: (Task & { taskRef: string })[];
  /** @param edges - All project task edges. */
  edges?: TaskEdge[];
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
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Category-based drawer view grouping tasks by their category field.
 * Each category becomes a collapsible section with a polished header.
 * Tasks with no category go in "Ungrouped".
 * @param props - Structure view configuration.
 * @returns A category-grouped task list with CRUD actions.
 */
export function StructureView({
  tasks,
  edges = [],
  categories,
  projectId,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
  className = '',
}: StructureViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedDrawers, setExpandedDrawers] = useState<Set<string>>(() => new Set(['__init__']));
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(
    () => parseFilterParam(searchParams.get(FILTER_PARAM_KEYS.tags)),
  );
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<Set<string>>(
    () => parseFilterParam(searchParams.get(FILTER_PARAM_KEYS.categories)),
  );
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(
    () => parseFilterParam(searchParams.get(FILTER_PARAM_KEYS.statuses)),
  );

  useEffect(() => {
    const qs = serializeFilters(activeTagFilters, activeCategoryFilters, activeStatusFilters, searchParams);
    router.replace(`${pathname}${qs}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTagFilters, activeCategoryFilters, activeStatusFilters]);
  const [panelTab, setPanelTab] = useState<'filter' | 'categories'>('filter');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renamingDrawer, setRenamingDrawer] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-drawer-menu]')) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Group tasks by category
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, TaskWithRef[]>();
    const ungrouped: TaskWithRef[] = [];

    for (const task of tasks) {
      if (!task.category) {
        ungrouped.push(task);
      } else {
        const arr = groups.get(task.category) ?? [];
        arr.push(task);
        groups.set(task.category, arr);
      }
    }

    const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (ungrouped.length > 0) {
      sorted.push(['Ungrouped', ungrouped]);
    }

    return sorted;
  }, [tasks]);

  const statusMap = useMemo(() => buildStatusMap(tasks), [tasks]);

  // Initialize expanded state for all drawers on first render
  useEffect(() => {
    if (expandedDrawers.has('__init__')) {
      const allCategories = new Set(categoryGroups.map(([cat]) => cat));
      setExpandedDrawers(allCategories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryGroups]);

  // All unique tags with task counts (for filter bar)
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.tags) for (const t of task.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks]);

  // Filter groups by search, category filters, tag filters, and status filters
  const filteredGroups = useMemo(() => {
    const hasTagFilter = activeTagFilters.size > 0;
    const hasCatFilter = activeCategoryFilters.size > 0;
    const hasStatusFilter = activeStatusFilters.size > 0;
    const hasSearch = searchQuery.trim().length > 0;
    if (!hasTagFilter && !hasCatFilter && !hasStatusFilter && !hasSearch) return categoryGroups;

    let filtered = categoryGroups;

    // Category filter: show only drawers matching the selected categories
    if (hasCatFilter) {
      filtered = filtered.filter(([cat]) => {
        if (cat === 'Ungrouped') return activeCategoryFilters.has('Uncategorized');
        return activeCategoryFilters.has(cat);
      });
    }

    // Status filter: within remaining drawers, show only tasks matching status (includes derived states)
    if (hasStatusFilter) {
      filtered = filtered
        .map(([cat, groupTasks]) => [cat, groupTasks.filter((t) => {
          if (activeStatusFilters.has(t.status)) return true;
          if (activeStatusFilters.has('plannable') && isPlannable(t, statusMap, edges)) return true;
          if (activeStatusFilters.has('ready') && isReady(t, statusMap, edges)) return true;
          return false;
        })] as [string, TaskWithRef[]])
        .filter(([, groupTasks]) => groupTasks.length > 0);
    }

    // Tag filter: within remaining drawers, show only tasks matching tags
    if (hasTagFilter) {
      filtered = filtered
        .map(([cat, groupTasks]) => [cat, groupTasks.filter((t) => t.tags?.some((tg) => activeTagFilters.has(tg)))] as [string, TaskWithRef[]])
        .filter(([, groupTasks]) => groupTasks.length > 0);
    }

    // Search filter: within remaining drawers, show only tasks matching query
    if (hasSearch) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered
        .map(([cat, groupTasks]) => [cat, groupTasks.filter((t) => t.title.toLowerCase().includes(q) || t.taskRef.toLowerCase().includes(q))] as [string, TaskWithRef[]])
        .filter(([, groupTasks]) => groupTasks.length > 0);
    }

    return filtered;
  }, [categoryGroups, activeTagFilters, activeCategoryFilters, activeStatusFilters, searchQuery, edges, statusMap]);

  const toggleTagFilter = useCallback((tag: string) => {
    setActiveTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }, []);

  /** @param status - Status or derived state to toggle in/out of the active filter set. */
  const toggleStatusFilter = useCallback((status: string) => {
    setActiveStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);

  /** @param cat - Category name to toggle in/out of the active filter set. */
  const toggleCategoryFilter = useCallback((cat: string) => {
    setActiveCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const toggleDrawer = (tag: string) => {
    setExpandedDrawers((prev) => {
      const next = new Set(prev);
      next.delete('__init__');
      if (next.has(tag)) { next.delete(tag); } else { next.add(tag); }
      return next;
    });
  };

  const handleAddTask = useCallback(async (category: string) => {
    if (!addTitle.trim() || !projectId) return;
    const cat = category === 'Ungrouped' ? undefined : category;
    await createTask({ projectId, title: addTitle.trim(), description: '', order: tasks.length, category: cat });
    setAddTitle('');
    setAddingTaskTo(null);
    onGraphChange?.();
  }, [addTitle, tasks.length, projectId, onGraphChange]);

  const handleRestoreNode = useCallback(async (item: DeletedTask) => {
    const t = item.taskData;
    await createTask({
      projectId: t.projectId,
      title: t.title,
      description: t.description,
      status: t.status,
      order: tasks.length,
      acceptanceCriteria: t.acceptanceCriteria,
      decisions: t.decisions,
      implementationPlan: t.implementationPlan,
      executionRecord: t.executionRecord,
      tags: t.tags,
      category: t.category,
      files: t.files,
    });
    onGraphChange?.();
  }, [tasks.length, onGraphChange]);

  const { canUndo: canUndoDelete, push: pushDeleteUndo, undo: undoDelete } = useUndo<DeletedTask>({
    onUndo: handleRestoreNode,
    keyboard: { panelSelector: '[data-panel="navigator"]' },
  });

  const handleDelete = useCallback(async (taskId: string) => {
    const taskData = tasks.find((t) => t.id === taskId);
    if (taskData) pushDeleteUndo({ title: taskData.title, taskData: taskData });
    await deleteTask(taskId);
    setConfirmDelete(null);
    onGraphChange?.();
  }, [tasks, pushDeleteUndo, onGraphChange]);

  /** Creates a new project-level category from newCategoryName input. */
  const handleAddCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    if (!name || categories.includes(name)) { setAddingCategory(false); setNewCategoryName(''); return; }
    await updateProject(projectId, { categories: [...categories, name] });
    setAddingCategory(false);
    setNewCategoryName('');
    setExpandedDrawers((prev) => new Set([...prev, name]));
    onGraphChange?.();
  }, [newCategoryName, categories, projectId, onGraphChange]);

  /** @param oldName - Current category name. @param newName - New name to apply. */
  const handleRenameCategory = useCallback(async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setRenamingDrawer(null); setRenamingCategory(null); return; }
    const trimmed = newName.trim();
    if (categories.includes(trimmed) && trimmed !== oldName) { setRenamingDrawer(null); setRenamingCategory(null); return; }
    await renameCategory(projectId, oldName, trimmed);
    setRenamingDrawer(null);
    setRenamingCategory(null);
    onGraphChange?.();
  }, [categories, projectId, onGraphChange]);

  /** @param categoryName - Category to delete. Tasks are uncategorized atomically. */
  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    await deleteCategory(projectId, categoryName);
    setConfirmDeleteCategory(null);
    onGraphChange?.();
  }, [projectId, onGraphChange]);

  // Compute drawer-level stats
  const drawerStats = useCallback((groupTasks: TaskWithRef[]) => {
    const done = groupTasks.filter((t) => t.status === 'done').length;
    const total = groupTasks.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, []);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const plannableTasks = tasks.filter((t) => isPlannable(t, statusMap, edges)).length;
  const readyTasks = tasks.filter((t) => isReady(t, statusMap, edges)).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="text-sm text-text-secondary">No tasks yet</p>
        <p className="mt-1 text-xs text-text-muted">Use the chat to create tasks.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-1 p-4 ${className}`}>
      {/* Undo notification bar */}
      <AnimatePresence>
        {canUndoDelete && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-1 flex items-center gap-2 rounded-lg bg-surface px-3 py-2"
          >
            <span className="text-[10px] text-text-secondary">Task deleted</span>
            <UndoButton canUndo={canUndoDelete} onUndo={undoDelete} className="ml-auto" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress summary */}
      {totalTasks > 0 && (
        <div className="mb-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Progress
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-text-primary">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${progressPct === 100 ? 'bg-done' : 'bg-gradient-to-r from-accent to-done'} ${progressPct > 0 && progressPct < 100 ? 'progress-shimmer' : ''}`}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-done" />
              {doneTasks} done
            </span>
            {inProgressTasks > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-progress" />
                {inProgressTasks} active
              </span>
            )}
            {readyTasks > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-progress/50" />
                {readyTasks} ready
              </span>
            )}
            {plannableTasks > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-planned/50" />
                {plannableTasks} plannable
              </span>
            )}
            <span className="ml-auto tabular-nums">{totalTasks} total</span>
          </div>
        </div>
      )}

      {/* Unified Filter & Categories panel */}
      <div className="mb-2 rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 transition-colors ${searchQuery ? 'text-accent' : 'text-text-muted/50'}`}>
            <path fillRule="evenodd" d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            style={{ outline: 'none', border: 'none' }}
            className="flex-1 bg-transparent font-mono text-[11px] text-text-primary placeholder:text-text-muted/40 [&:focus-visible]:outline-none [&:focus-visible]:border-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="cursor-pointer shrink-0 rounded p-0.5 text-text-muted/50 hover:text-text-muted transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          )}
        </div>

        {/* Tab header */}
        <div className="flex items-center">
          {(['filter', 'categories'] as const).map((tab) => {
            const isActive = panelExpanded && panelTab === tab;
            const filterCount = activeTagFilters.size + activeCategoryFilters.size + activeStatusFilters.size;
            return (
              <button
                key={tab}
                onClick={() => {
                  if (panelExpanded && panelTab === tab) { setPanelExpanded(false); }
                  else { setPanelTab(tab); setPanelExpanded(true); }
                }}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 py-2.5 transition-colors ${
                  isActive ? 'bg-surface-hover/30' : 'hover:bg-surface-hover/50'
                }`}
              >
                {tab === 'filter' && (
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 transition-colors ${filterCount > 0 ? 'text-accent' : 'text-text-muted'}`}>
                    <path d="M1 3a1 1 0 011-1h12a1 1 0 01.8 1.6L10 9.333V13a1 1 0 01-.553.894l-2 1A1 1 0 016 14V9.333L1.2 3.6A1 1 0 011 3z" />
                  </svg>
                )}
                <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${isActive ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {tab === 'filter' ? 'Filter' : 'Categories'}
                </span>
                {tab === 'filter' && filterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/15 px-1.5 font-mono text-[9px] font-bold tabular-nums text-accent">
                    {filterCount}
                  </span>
                )}
                {tab === 'categories' && (
                  <span className="font-mono text-[9px] tabular-nums text-text-muted/50">{categories.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Expandable content */}
        <AnimatePresence initial={false}>
          {panelExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="border-t border-border px-3 pt-2.5 pb-3">
                {panelTab === 'filter' && (
                  <>
                    {/* Active filter summary + clear */}
                    {(activeTagFilters.size > 0 || activeCategoryFilters.size > 0 || activeStatusFilters.size > 0) && (
                      <div className="mb-2 flex items-center justify-between">
                        <span className="truncate font-mono text-[10px] text-accent/70">
                          {[...activeCategoryFilters, ...activeStatusFilters, ...activeTagFilters].join(' / ')}
                        </span>
                        <button
                          onClick={() => { setActiveTagFilters(new Set()); setActiveCategoryFilters(new Set()); setActiveStatusFilters(new Set()); }}
                          className="cursor-pointer shrink-0 ml-2 font-mono text-[10px] text-text-muted hover:text-accent transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* Category filter chips */}
                    {(categories.length > 0 || categoryGroups.some(([c]) => c === 'Ungrouped')) && (
                      <>
                        <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted/50">Categories</span>
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {categories.map((cat) => {
                            const isActive = activeCategoryFilters.has(cat);
                            const count = tasks.filter((t) => t.category === cat).length;
                            return (
                              <button
                                key={cat}
                                onClick={() => toggleCategoryFilter(cat)}
                                className={`cursor-pointer rounded-md px-2 py-[3px] font-mono text-[10px] transition-all duration-100 border ${
                                  isActive
                                    ? 'border-accent/25 bg-accent/10 text-accent font-semibold shadow-[inset_0_0_0_0.5px_rgba(224,145,0,0.15)]'
                                    : 'border-transparent bg-surface-raised/60 text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                                }`}
                              >
                                {cat}
                                <span className={`ml-1 tabular-nums ${isActive ? 'text-accent/60' : 'text-text-muted/50'}`}>{count}</span>
                              </button>
                            );
                          })}
                          {categoryGroups.some(([c]) => c === 'Ungrouped') && (
                            <button
                              onClick={() => toggleCategoryFilter('Uncategorized')}
                              className={`cursor-pointer rounded-md px-2 py-[3px] font-mono text-[10px] transition-all duration-100 border ${
                                activeCategoryFilters.has('Uncategorized')
                                  ? 'border-accent/25 bg-accent/10 text-accent font-semibold shadow-[inset_0_0_0_0.5px_rgba(224,145,0,0.15)]'
                                  : 'border-transparent bg-surface-raised/60 text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                              }`}
                            >
                              Uncategorized
                              <span className={`ml-1 tabular-nums ${activeCategoryFilters.has('Uncategorized') ? 'text-accent/60' : 'text-text-muted/50'}`}>
                                {tasks.filter((t) => !t.category).length}
                              </span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Status filter chips */}
                    <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted/50">Status</span>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {(['draft', 'planned', 'in_progress', 'done', 'plannable', 'ready'] as const).map((status) => {
                        const isActive = activeStatusFilters.has(status);
                        const isDerived = status === 'plannable' || status === 'ready';
                        const count = isDerived
                          ? (status === 'plannable' ? plannableTasks : readyTasks)
                          : tasks.filter((t) => t.status === status).length;
                        if (count === 0) return null;
                        const label = status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
                        return (
                          <button
                            key={status}
                            onClick={() => toggleStatusFilter(status)}
                            className={`cursor-pointer rounded-md px-2 py-[3px] font-mono text-[10px] transition-all duration-100 border ${
                              isActive
                                ? 'border-accent/25 bg-accent/10 text-accent font-semibold shadow-[inset_0_0_0_0.5px_rgba(224,145,0,0.15)]'
                                : 'border-transparent bg-surface-raised/60 text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                            }`}
                          >
                            {label}
                            <span className={`ml-1 tabular-nums ${isActive ? 'text-accent/60' : 'text-text-muted/50'}`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Tag filter chips */}
                    {allTags.length > 0 && (
                      <>
                        <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted/50">Tags</span>
                        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                          {allTags.map(([tag, count]) => {
                            const isActive = activeTagFilters.has(tag);
                            return (
                              <button
                                key={tag}
                                onClick={() => toggleTagFilter(tag)}
                                className={`cursor-pointer rounded-md px-2 py-[3px] font-mono text-[10px] transition-all duration-100 border ${
                                  isActive
                                    ? 'border-accent/25 bg-accent/10 text-accent font-semibold shadow-[inset_0_0_0_0.5px_rgba(224,145,0,0.15)]'
                                    : 'border-transparent bg-surface-raised/60 text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                                }`}
                              >
                                {tag}
                                <span className={`ml-1 tabular-nums ${isActive ? 'text-accent/60' : 'text-text-muted/50'}`}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}

                {panelTab === 'categories' && (
                  <>
                    {/* Existing categories */}
                    {categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {categories.map((cat) => {
                          const count = tasks.filter((t) => t.category === cat).length;

                          if (renamingCategory === cat) {
                            return (
                              <div key={cat} className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameCategoryValue}
                                  onChange={(e) => setRenameCategoryValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameCategory(cat, renameCategoryValue);
                                    if (e.key === 'Escape') setRenamingCategory(null);
                                  }}
                                  autoFocus
                                  className="w-24 rounded-md bg-surface-raised px-2 py-[3px] font-mono text-[10px] text-text-primary outline-none ring-1 ring-border-strong focus:ring-border-strong"
                                />
                                <button onClick={() => handleRenameCategory(cat, renameCategoryValue)} className="cursor-pointer text-[10px] text-accent hover:underline">ok</button>
                                <button onClick={() => setRenamingCategory(null)} className="cursor-pointer text-[10px] text-text-muted hover:underline">esc</button>
                              </div>
                            );
                          }

                          if (confirmDeleteCategory === cat) {
                            return (
                              <div key={cat} className="flex items-center gap-1.5 rounded-md border border-danger/20 bg-danger/5 px-2 py-1">
                                <span className="font-mono text-[10px] text-danger">
                                  Delete &quot;{cat}&quot;?{count > 0 && ` ${count} task${count > 1 ? 's' : ''} will be uncategorized.`} No undo.
                                </span>
                                <button onClick={() => handleDeleteCategory(cat)} className="cursor-pointer font-mono text-[10px] font-semibold text-danger hover:underline">Yes</button>
                                <button onClick={() => setConfirmDeleteCategory(null)} className="cursor-pointer font-mono text-[10px] text-text-muted hover:underline">No</button>
                              </div>
                            );
                          }

                          return (
                            <div key={cat} className="group/cat flex items-center gap-px">
                              <span className="rounded-md bg-surface-raised/60 px-2 py-[3px] font-mono text-[10px] text-text-secondary">
                                {cat}
                                <span className="ml-1 tabular-nums text-text-muted/50">{count}</span>
                              </span>
                              <button
                                onClick={() => { setRenamingCategory(cat); setRenameCategoryValue(cat); }}
                                className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 transition-all hover:text-accent group-hover/cat:opacity-100"
                                title="Rename"
                              >
                                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.1a.25.25 0 00-.064.108l-.563 1.97 1.971-.564a.25.25 0 00.108-.064l8.609-8.61a.25.25 0 000-.353l-1.097-1.097z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteCategory(cat)}
                                className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 transition-all hover:text-danger group-hover/cat:opacity-100"
                                title="Delete"
                              >
                                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new category */}
                    {addingCategory ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddCategory();
                            if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); }
                          }}
                          autoFocus
                          placeholder="Category name..."
                          className="flex-1 rounded-md bg-surface-raised px-2 py-[3px] font-mono text-[10px] text-text-primary placeholder:text-text-muted outline-none ring-1 ring-border-strong focus:ring-border-strong"
                        />
                        <button onClick={handleAddCategory} className="cursor-pointer text-[10px] font-semibold text-accent hover:underline">Add</button>
                        <button onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} className="cursor-pointer text-[10px] text-text-muted hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingCategory(true); setNewCategoryName(''); }}
                        className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-[3px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                          <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                        </svg>
                        <span className="font-mono text-[10px]">Add</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {filteredGroups.map(([cat, groupTasks]) => {
        const stats = drawerStats(groupTasks);
        const isExpanded = expandedDrawers.has(cat);
        const isUngrouped = cat === 'Ungrouped';
        const isEmpty = groupTasks.length === 0;

        return (
          <div key={cat} className={"mb-0.5 rounded-lg"}>
            {/* Category drawer header */}
            {confirmDeleteCategory === cat && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 mb-0.5">
                <span className="flex-1 font-mono text-[10px] text-danger">
                  Delete &quot;{cat}&quot;?{!isEmpty && ` ${groupTasks.length} task${groupTasks.length > 1 ? 's' : ''} will be uncategorized.`} This cannot be undone.
                </span>
                <button onClick={() => handleDeleteCategory(cat)} className="cursor-pointer font-mono text-[10px] font-semibold text-danger hover:underline">Delete</button>
                <button onClick={() => setConfirmDeleteCategory(null)} className="cursor-pointer font-mono text-[10px] text-text-muted hover:underline">Cancel</button>
              </div>
            )}
            <div className="group flex items-center">
              {renamingDrawer === cat ? (
                <div className="flex flex-1 items-center gap-1 px-3 py-1.5">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameCategory(cat, renameValue);
                      if (e.key === 'Escape') setRenamingDrawer(null);
                    }}
                    autoFocus
                    className="flex-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-text-primary placeholder:text-text-muted outline-none ring-1 ring-border-strong focus:ring-border-strong transition-shadow"
                  />
                  <button onClick={() => handleRenameCategory(cat, renameValue)} className="cursor-pointer rounded-lg px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors">Save</button>
                  <button onClick={() => setRenamingDrawer(null)} className="cursor-pointer rounded-lg px-2 py-1 text-[10px] text-text-muted hover:bg-surface-hover transition-colors">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => toggleDrawer(cat)}
                  className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150 hover:bg-surface-hover ${
                    isExpanded ? 'bg-surface/60' : ''
                  }`}
                >
                  <motion.svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-3 w-3 shrink-0 text-text-muted"
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
                  </motion.svg>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {cat}
                  </span>
                  {/* Mini progress indicator */}
                  <div className="flex items-center gap-2">
                    {stats.done > 0 && stats.done === stats.total && (
                      <svg className="h-3 w-3 text-done" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="font-mono text-[10px] tabular-nums text-text-muted">
                      {stats.done}/{stats.total}
                    </span>
                  </div>
                </button>
              )}
              {/* Add task button */}
              <button
                onClick={() => { setAddingTaskTo(cat); setAddTitle(''); }}
                className="cursor-pointer rounded-lg p-1.5 text-text-muted opacity-0 transition-all duration-150 hover:bg-surface-hover hover:text-accent group-hover:opacity-100"
                title="Add task"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                </svg>
              </button>
              {/* Drawer menu (rename/delete) — not shown for Ungrouped */}
              {!isUngrouped && renamingDrawer !== cat && (
                <div className="relative" data-drawer-menu>
                  <button
                    onClick={() => setMenuOpen(menuOpen === cat ? null : cat)}
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted opacity-0 transition-all duration-150 hover:bg-surface-hover hover:text-text-secondary group-hover:opacity-100"
                    title="Category options"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M8 2a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM8 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM8 11a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {menuOpen === cat && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-border bg-surface-raised p-1 shadow-[var(--shadow-float)]"
                      >
                        <button
                          onClick={() => { setRenamingDrawer(cat); setRenameValue(cat); setMenuOpen(null); }}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => { setConfirmDeleteCategory(cat); setMenuOpen(null); }}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                        >
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Tasks */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden"
                >
                  <div className="ml-3 border-l border-border pl-3 py-0.5">
                    {/* Add task inline input */}
                    {addingTaskTo === cat && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1 py-1"
                      >
                        <input
                          type="text"
                          value={addTitle}
                          onChange={(e) => setAddTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddTask(cat);
                            if (e.key === 'Escape') { setAddingTaskTo(null); setAddTitle(''); }
                          }}
                          autoFocus
                          placeholder="Task name..."
                          className="flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none ring-1 ring-border-strong focus:ring-accent transition-shadow"
                        />
                        <button
                          onClick={() => handleAddTask(cat)}
                          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingTaskTo(null); setAddTitle(''); }}
                          className="cursor-pointer rounded-lg px-2 py-1.5 text-xs text-text-muted hover:bg-surface-hover transition-colors"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    )}

                    {groupTasks.map((task) => (
                      <div key={task.id} className="group/task flex items-center">
                        <button
                          onClick={() => onSelectNode(task.id)}
                          className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-hover ${
                            selectedNodeId === task.id
                              ? 'bg-accent/8 border-accent/15'
                              : 'border-transparent'
                          }`}
                        >
                          {/* Status dot */}
                          <span className={`h-2 w-2 shrink-0 rounded-full transition-colors ${statusDot(task.status)} ${task.status === 'in_progress' ? 'status-pulse' : ''}`} />
                          <span className={`shrink-0 min-w-14 font-mono text-[10px] font-medium tabular-nums ${
                            selectedNodeId === task.id ? 'text-accent/70' : 'text-text-muted'
                          }`}>
                            {task.taskRef}
                          </span>
                          <span className={`flex-1 text-sm transition-colors duration-150 ${
                            selectedNodeId === task.id
                              ? 'text-accent font-medium'
                              : task.status === 'done'
                                ? 'text-text-muted line-through'
                                : 'text-text-secondary'
                          }`}>
                            {task.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${statusChipText(task.status)}`}>
                              {statusLabel(task.status)}
                            </span>
                            {isPlannable(task, statusMap, edges) && (
                              <span className="rounded bg-planned/15 px-1 py-px font-mono text-[9px] font-semibold text-planned">
                                plannable
                              </span>
                            )}
                            {isReady(task, statusMap, edges) && (
                              <span className="rounded bg-progress/15 px-1 py-px font-mono text-[9px] font-semibold text-progress">
                                ready
                              </span>
                            )}
                          </span>
                        </button>
                        {confirmDelete === task.id ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-1"
                          >
                            <button onClick={() => handleDelete(task.id)} className="cursor-pointer rounded-lg px-2 py-1 text-[10px] font-semibold text-danger hover:bg-danger/10 transition-colors">
                              Delete
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="cursor-pointer rounded-lg px-2 py-1 text-[10px] text-text-muted hover:bg-surface-hover transition-colors">
                              No
                            </button>
                          </motion.div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(task.id)}
                            className="cursor-pointer rounded-lg p-1.5 text-text-muted opacity-0 transition-all duration-150 hover:text-danger group-hover/task:opacity-100"
                            title="Delete task"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

    </div>
  );
}

export default StructureView;
