'use client';

import type { ReactNode } from 'react';
import { StatusGlyph, STATUS_META, type TaskStatus as GlyphStatus } from '@/components/shared/StatusGlyph';
import { IconPlus } from '@/components/shared/icons';
import type { TaskStatus } from '@/lib/types';

/** Optional virtual groups — derived sub-stages, not schema statuses. */
export type TaskGroupKey = TaskStatus | 'ready' | 'plannable';

interface TaskGroupProps {
  /** Identifier driving glyph + label lookup. */
  status: TaskGroupKey;
  /** Number of tasks in this group. */
  count: number;
  /** Click the inline `+` to start a new task in this group. */
  onAdd?: () => void;
  /** Task rows. */
  children: ReactNode;
}

/**
 * Sticky group header — 30px row with status glyph, mono uppercase label,
 * count, and an inline add button. Wraps its children directly so the
 * caller controls the row spacing. The glyph + label come straight from
 * `STATUS_META` so the convention used here matches the rail, hover card,
 * and graph canvas (`plannable` / `ready` → dashed planned-blue).
 *
 * @param props - Group configuration.
 * @returns Header element followed by the rendered children.
 */
export function TaskGroup({ status, count, onAdd, children }: TaskGroupProps) {
  const meta = STATUS_META[status as GlyphStatus] ?? STATUS_META.draft;
  const label = meta.label;

  // Tint the label + count with the same CSS var the glyph uses so the
  // header reads as a single coloured band — matches the toned task-ref
  // (MonoId) below for `plannable` / `ready`, and gives every group its
  // own visual lane regardless of state. The count gets a slight opacity
  // dip so it still recedes against the label.
  return (
    <>
      <div className="sticky top-0 z-10 flex h-[30px] items-center gap-2 border-y border-border bg-base-2 px-4">
        <StatusGlyph status={status} size={12} />
        <span
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.10em]"
          style={{ color: meta.cssVar }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: meta.cssVar, opacity: 0.6 }}
        >
          {count}
        </span>
        <span className="flex-1" />
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add task to ${label}`}
            title={`Add task to ${label}`}
            className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            <IconPlus size={10} />
          </button>
        )}
      </div>
      {children}
    </>
  );
}

export default TaskGroup;
