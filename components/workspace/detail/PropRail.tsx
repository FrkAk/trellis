'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Markdown } from '@/components/shared/Markdown';
import { MonoId } from '@/components/shared/MonoId';
import { PriorityIcon } from '@/components/shared/PriorityIcon';
import { StatusGlyph, STATUS_META } from '@/components/shared/StatusGlyph';
import { Dropdown } from '@/components/shared/Dropdown';
import { useUndo, UndoButton } from '@/hooks/useUndo';
import { updateTask } from '@/lib/graph/mutations';
import { projectColor } from '@/lib/ui/project-color';
import {
  IconBranch,
  IconChevronDown,
  IconClock,
  IconDoc,
  IconFlag,
  IconPlus,
  IconTag,
  IconUser,
  IconX,
} from '@/components/shared/icons';
import type { TaskEdge } from '@/lib/db/schema';
import type { TaskStatus } from '@/lib/types';

/** Display order for the Status dropdown — matches the lifecycle ribbon. */
const STATUS_OPTIONS: readonly TaskStatus[] = ['draft', 'planned', 'in_progress', 'done', 'cancelled'];

interface PropRailProps {
  /** Task UUID. */
  taskId: string;
  /** Task status. */
  status: TaskStatus;
  /** Task category, or null. */
  category: string | null;
  /** Available categories for the inline picker. */
  categories: string[];
  /** Tags currently attached to the task. */
  tags: string[];
  /** Project tag vocabulary — every tag used by any task in the project. */
  projectTags: string[];
  /** Edges connected to this task. */
  edges: TaskEdge[];
  /** Map of every task in the project. */
  taskMap: Map<string, { title: string; status: string; taskRef: string }>;
  /** File paths the task touches. */
  files: string[];
  /** Project identifier (e.g. `MYMR`). */
  projectIdentifier: string;
  /** Project display name. */
  projectName: string;
  /** Click an edge target to navigate. */
  onSelectNode: (taskId: string) => void;
  /** Refresh the graph after a mutation. */
  onGraphChange?: () => void;
}

/**
 * Right-rail properties panel — Status + Category dropdowns, Tags editor,
 * Priority/Assignee/Estimate placeholders, Project (read-only), Dependencies
 * split (Depends on / Blocks), and Files Touched.
 *
 * @param props - Rail configuration.
 * @returns Aside element scrollable within the column.
 */
export function PropRail({
  taskId,
  status,
  category,
  categories,
  tags,
  projectTags,
  edges,
  taskMap,
  files,
  projectIdentifier,
  projectName,
  onSelectNode,
  onGraphChange,
}: PropRailProps) {
  const dependsOn = edges.filter((e) => e.edgeType === 'depends_on' && e.sourceTaskId === taskId);
  const blocks = edges.filter((e) => e.edgeType === 'depends_on' && e.targetTaskId === taskId);
  const totalDeps = dependsOn.length + blocks.length;

  const handleRestoreStatus = useCallback(async (prev: TaskStatus) => {
    await updateTask(taskId, { status: prev });
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  const { canUndo: canUndoStatus, push: pushStatusUndo, undo: undoStatus } = useUndo<TaskStatus>({
    onUndo: handleRestoreStatus,
    resetOn: taskId,
  });

  const handleStatusChange = useCallback(async (next: TaskStatus) => {
    if (next === status) return;
    pushStatusUndo(status);
    await updateTask(taskId, { status: next });
    onGraphChange?.();
  }, [taskId, status, pushStatusUndo, onGraphChange]);

  const handleCategoryChange = useCallback(async (next: string | null) => {
    await updateTask(taskId, { category: next });
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  const handleTagsChange = useCallback(async (next: string[]) => {
    await updateTask(taskId, { tags: next }, true);
    onGraphChange?.();
  }, [taskId, onGraphChange]);

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-base"
      style={{ width: 'var(--rail-w)' }}
    >
      <div className="space-y-5 p-4">
        <RailGroup label="Properties" trailing={<UndoButton canUndo={canUndoStatus} onUndo={undoStatus} />}>
          <RailRow icon={<StatusGlyph status={status} size={11} />} label="Status">
            <StatusDropdown status={status} onChange={handleStatusChange} align="end" />
          </RailRow>

          <RailRow icon={<IconFlag size={11} />} label="Priority">
            <PlaceholderValue title="Priority is not yet wired — backend ticket pending">
              <PriorityIcon priority={null} />
              <span>—</span>
            </PlaceholderValue>
          </RailRow>

          <RailRow icon={<IconUser size={11} />} label="Assignee">
            <PlaceholderValue title="Assignee is not yet wired — backend ticket pending">
              <span aria-hidden="true" className="inline-flex h-4 w-4 rounded-full border border-dashed border-border-strong" />
              <span>—</span>
            </PlaceholderValue>
          </RailRow>

          <RailRow icon={<IconTag size={11} />} label="Category">
            <CategoryDropdown
              category={category}
              categories={categories}
              onChange={handleCategoryChange}
              align="end"
            />
          </RailRow>

          <RailRow icon={<IconClock size={11} />} label="Estimate">
            <PlaceholderValue title="Estimate is not yet wired — backend ticket pending">
              <span>—</span>
            </PlaceholderValue>
          </RailRow>

          <RailRow icon={<IconBranch size={11} />} label="Project">
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-primary" title={projectName}>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ background: projectColor(projectIdentifier) }} />
              <span className="min-w-0 truncate">{projectName}</span>
            </span>
          </RailRow>
        </RailGroup>

        <RailGroup label="Tags" count={tags.length > 0 ? tags.length : undefined}>
          <TagsEditor tags={tags} vocabulary={projectTags} onChange={handleTagsChange} />
        </RailGroup>

        <RailGroup label="Dependencies" count={totalDeps > 0 ? totalDeps : undefined}>
          <DepGroup
            kind="depends"
            label="Depends on"
            items={dependsOn.map((e) => ({ edgeId: e.id, otherId: e.targetTaskId }))}
            taskMap={taskMap}
            onSelectNode={onSelectNode}
          />
          <DepGroup
            kind="relates"
            label="Blocks"
            items={blocks.map((e) => ({ edgeId: e.id, otherId: e.sourceTaskId }))}
            taskMap={taskMap}
            onSelectNode={onSelectNode}
          />
        </RailGroup>

        <RailGroup label="Files touched" count={files.length > 0 ? files.length : undefined}>
          {files.length > 0 ? (
            <ul className="space-y-1">
              {files.map((path) => (
                <FileChip key={path} path={path} />
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] italic text-text-muted">No files yet.</p>
          )}
        </RailGroup>
      </div>
    </aside>
  );
}

interface StatusDropdownProps {
  /** Active status. */
  status: TaskStatus;
  /** Update the status. */
  onChange: (next: TaskStatus) => void;
  /** Panel anchor side — defaults to `start`. */
  align?: 'start' | 'end';
}

/**
 * Status dropdown — pill-styled trigger paired with a list of every status,
 * matching the prototype's `StatusPill` aesthetic.
 *
 * @param props - Dropdown props.
 * @returns Anchored dropdown element.
 */
function StatusDropdown({ status, onChange, align = 'start' }: StatusDropdownProps) {
  const options = useMemo(
    () => STATUS_OPTIONS.map((s) => {
      const meta = STATUS_META[s] ?? STATUS_META.draft;
      return {
        value: s,
        label: meta.label,
        leading: <StatusGlyph status={s} size={11} />,
      };
    }),
    [],
  );

  return (
    <Dropdown
      value={status}
      options={options}
      onChange={onChange}
      align={align}
      ariaLabel="Change status"
      title="Change status"
      renderTrigger={(active, open) => {
        const meta = STATUS_META[active?.value ?? status] ?? STATUS_META.draft;
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${meta.cssVar} 22%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.cssVar} 38%, transparent)`,
              color: meta.cssVar,
            }}
          >
            <StatusGlyph status={active?.value ?? status} size={10} />
            {meta.label}
            <span aria-hidden="true" className="opacity-70 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
              <IconChevronDown size={9} />
            </span>
          </span>
        );
      }}
    />
  );
}

interface CategoryDropdownProps {
  /** Active category. */
  category: string | null;
  /** Project categories. */
  categories: string[];
  /** Update the category. */
  onChange: (next: string | null) => void;
  /** Panel anchor side — defaults to `start`. */
  align?: 'start' | 'end';
}

/**
 * Category dropdown — chip-styled trigger that anchors a list of project
 * categories plus a "Clear" entry. Supersedes the prior horizontal-scroll
 * tray.
 *
 * @param props - Dropdown props.
 * @returns Anchored dropdown element.
 */
function CategoryDropdown({ category, categories, onChange, align = 'start' }: CategoryDropdownProps) {
  const SENTINEL_NULL = '__none__';
  const options = useMemo(() => {
    const items: { value: string; label: string }[] = [
      { value: SENTINEL_NULL, label: 'Uncategorized' },
    ];
    for (const cat of categories) items.push({ value: cat, label: cat });
    return items;
  }, [categories]);

  if (categories.length === 0 && !category) {
    return <PlaceholderValue title="No project categories yet"><span>—</span></PlaceholderValue>;
  }

  const selected = category ?? SENTINEL_NULL;

  return (
    <Dropdown
      value={selected}
      options={options}
      onChange={(v) => onChange(v === SENTINEL_NULL ? null : v)}
      align={align}
      ariaLabel="Change category"
      title="Change category"
      minWidth={180}
      renderTrigger={(_active, open) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${
            category
              ? 'bg-accent/10 text-accent-light'
              : 'border border-dashed border-border-strong text-text-muted/70'
          }`}
        >
          {category ?? 'Uncategorized'}
          <span aria-hidden="true" className="opacity-70 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
            <IconChevronDown size={9} />
          </span>
        </span>
      )}
    />
  );
}

interface TagsEditorProps {
  /** Tags currently attached to the task. */
  tags: string[];
  /** Project tag vocabulary. */
  vocabulary: string[];
  /** Update the tag list (replacement, not append). */
  onChange: (next: string[]) => void;
}

/**
 * Multi-select tag editor — current tags render as removable chips, and a
 * trailing "+ Add" trigger opens a popover that lets the operator toggle
 * existing project tags or add a new one.
 *
 * @param props - Editor props.
 * @returns Wrap of chips plus the add control.
 */
function TagsEditor({ tags, vocabulary, onChange }: TagsEditorProps) {
  const tagSet = useMemo(() => new Set(tags), [tags]);

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const toggleTag = (tag: string) => {
    if (tagSet.has(tag)) onChange(tags.filter((t) => t !== tag));
    else onChange([...tags, tag]);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tagSet.has(trimmed)) return;
    onChange([...tags, trimmed]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="group inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 py-px pl-2 pr-1 font-mono text-[11px] text-accent-light"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag ${tag}`}
            className="cursor-pointer rounded p-0.5 text-accent-light/70 transition-colors hover:bg-accent/15 hover:text-accent-light"
          >
            <IconX size={9} />
          </button>
        </span>
      ))}
      <TagAdd
        vocabulary={vocabulary}
        active={tagSet}
        onToggle={toggleTag}
        onCreate={addTag}
      />
    </div>
  );
}

interface TagAddProps {
  /** Project tag vocabulary. */
  vocabulary: string[];
  /** Tags currently attached to the task. */
  active: Set<string>;
  /** Toggle a tag on/off. */
  onToggle: (tag: string) => void;
  /** Create a new tag (also attaches it). */
  onCreate: (tag: string) => void;
}

/**
 * "+ Add" trigger that opens a popover combining a search input with a
 * checklist of every tag in the project vocabulary. Pressing Enter on a
 * non-existing query creates the tag.
 *
 * @param props - Add control props.
 * @returns Inline-flex popover element.
 */
function TagAdd({ vocabulary, active, onToggle, onCreate }: TagAddProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const sorted = useMemo(() => [...vocabulary].sort((a, b) => a.localeCompare(b)), [vocabulary]);
  const filtered = q ? sorted.filter((t) => t.toLowerCase().includes(q)) : sorted;
  const exact = q && sorted.some((t) => t.toLowerCase() === q);
  const canCreate = q && !exact;

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 py-px font-mono text-[10px] text-text-muted transition-colors hover:border-border-stronger hover:bg-surface-hover hover:text-text-secondary"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <IconPlus size={9} />
        Add
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.11, ease: 'easeOut' }}
            className="absolute right-0 top-full z-30 mt-1 w-[200px] overflow-hidden rounded-md border border-border-strong bg-surface-raised shadow-float"
          >
            <div className="border-b border-border bg-base p-1.5">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    onCreate(query);
                    setQuery('');
                  }
                }}
                placeholder={vocabulary.length > 0 ? 'Search or create tag…' : 'Create a tag…'}
                className="w-full bg-transparent px-1 font-mono text-[11px] text-text-primary placeholder:text-text-muted/50 outline-none"
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto py-1">
              {filtered.length === 0 && !canCreate && (
                <p className="px-2.5 py-1.5 font-mono text-[11px] italic text-text-muted">
                  No tags yet — type to create one.
                </p>
              )}
              {filtered.map((tag) => {
                const on = active.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(tag)}
                    className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors ${
                      on ? 'bg-accent/10 text-accent-light' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border"
                      style={{
                        background: on ? 'var(--color-accent-grad)' : 'transparent',
                        borderColor: on ? 'transparent' : 'var(--color-border-strong)',
                      }}
                    >
                      {on && (
                        <svg width="8" height="8" viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3 8.5L6.5 12 13 5" stroke="var(--color-base)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">{tag}</span>
                  </button>
                );
              })}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onCreate(query);
                    setQuery('');
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 border-t border-border px-2.5 py-1.5 text-left font-mono text-[11px] text-accent-light transition-colors hover:bg-accent/10"
                >
                  <IconPlus size={10} />
                  <span>Create &ldquo;{query.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface RailGroupProps {
  /** Group label. */
  label: string;
  /** Optional count rendered next to the label. */
  count?: React.ReactNode;
  /** Optional trailing slot. */
  trailing?: React.ReactNode;
  /** Group body. */
  children: React.ReactNode;
}

/**
 * Mono uppercase group label plus its content.
 *
 * @param props - Group configuration.
 * @returns Group element.
 */
function RailGroup({ label, count, trailing, children }: RailGroupProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</span>
        {count != null && <span className="font-mono text-[10px] tabular-nums text-text-faint">{count}</span>}
        <span className="flex-1" />
        {trailing}
      </div>
      {children}
    </div>
  );
}

interface RailRowProps {
  /** Leading icon. */
  icon: React.ReactNode;
  /** Row label. */
  label: string;
  /** Row value. */
  children: React.ReactNode;
}

/**
 * Two-column row inside a rail group — fixed-width label + flexible value.
 *
 * @param props - Row configuration.
 * @returns Row element.
 */
function RailRow({ icon, label, children }: RailRowProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="inline-flex w-[88px] shrink-0 items-center gap-1.5 text-[12px] text-text-muted">
        <span aria-hidden="true" className="text-text-faint">{icon}</span>
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
    </div>
  );
}

interface PlaceholderValueProps {
  /** Tooltip text. */
  title: string;
  /** Slot content. */
  children: React.ReactNode;
  /** Optional extra class. */
  className?: string;
}

/**
 * Placeholder slot for un-wired property fields. Pairs an em-dash with a
 * tooltip explaining that backend wiring is pending.
 *
 * @param props - Placeholder configuration.
 * @returns Inline-flex span with the slot content.
 */
function PlaceholderValue({ title, children, className = '' }: PlaceholderValueProps) {
  return (
    <span
      title={title}
      className={`inline-flex cursor-help items-center gap-1.5 text-[12px] text-text-muted/70 ${className}`}
    >
      {children}
    </span>
  );
}

interface DepGroupProps {
  /** Edge type — drives the dot colour. */
  kind: 'depends' | 'relates';
  /** Section label. */
  label: string;
  /** Edge entries. */
  items: { edgeId: string; otherId: string }[];
  /** Map of every task in the project. */
  taskMap: Map<string, { title: string; status: string; taskRef: string }>;
  /** Click a row to navigate. */
  onSelectNode: (taskId: string) => void;
}

/**
 * Sub-group of dependency rows — labelled header plus list of links.
 *
 * @param props - Group configuration.
 * @returns Sub-group element.
 */
function DepGroup({ kind, label, items, taskMap, onSelectNode }: DepGroupProps) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: kind === 'depends' ? 'var(--color-depends)' : 'var(--color-relates)' }}
        />
        <span className="text-[11px] text-text-muted">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-text-faint">{items.length}</span>
      </div>
      <ul className="space-y-px">
        {items.map(({ edgeId, otherId }) => {
          const other = taskMap.get(otherId);
          if (!other) return null;
          return (
            <li key={edgeId}>
              <button
                type="button"
                onClick={() => onSelectNode(otherId)}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
              >
                <StatusGlyph status={other.status} size={11} />
                <MonoId id={other.taskRef} copyable={false} dim />
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary group-hover:text-text-primary">
                  {other.title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface FileChipProps {
  /** File path. */
  path: string;
}

/**
 * Mono file chip — path-only since the schema stores `string[]`. Diff
 * stats wait for a backend shape change.
 *
 * @param props - File chip configuration.
 * @returns Inline-flex chip element.
 */
function FileChip({ path }: FileChipProps) {
  return (
    <li
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface-raised/50 px-2 py-1 font-mono text-[11px] text-text-secondary"
      title={path}
    >
      <span aria-hidden="true" className="text-text-faint">
        <IconDoc size={10} />
      </span>
      <span className="min-w-0 truncate">{path}</span>
    </li>
  );
}

/**
 * Tiny note rendered when a relationship has additional context — kept
 * out of the main row so the chip stays scannable.
 *
 * @param props - Note text.
 * @returns Markdown sub-line.
 */
export function EdgeNote({ note }: { note: string }) {
  return <Markdown className="mt-0.5 pl-1 text-[11px] leading-tight text-text-muted">{note}</Markdown>;
}

export default PropRail;
