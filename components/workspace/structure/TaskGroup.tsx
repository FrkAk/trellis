'use client';

import type { ReactNode } from 'react';
import { StatusGlyph } from '@/components/shared/StatusGlyph';
import { IconPlus } from '@/components/shared/icons';
import { STATUS_META } from '@/components/shared/StatusGlyph';
import type { TaskStatus } from '@/lib/types';

/** Optional virtual groups — derived states, not schema statuses. */
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
 * Resolve the human label and glyph status for a group key — `ready` is a
 * derived state and shares the planned color in the table but reads
 * `Ready` in copy.
 *
 * @param key - Group identifier.
 * @returns Pair of label + status used by the StatusGlyph.
 */
function resolve(key: TaskGroupKey): { label: string; glyph: TaskStatus } {
  if (key === 'ready') return { label: 'Ready', glyph: 'planned' };
  if (key === 'plannable') return { label: 'Plannable', glyph: 'draft' };
  return { label: STATUS_META[key]?.label ?? key, glyph: key };
}

/**
 * Sticky group header — 30px row with status glyph, mono uppercase label,
 * count, and an inline add button. Wraps its children directly so the
 * caller controls the row spacing.
 *
 * @param props - Group configuration.
 * @returns Header element followed by the rendered children.
 */
export function TaskGroup({ status, count, onAdd, children }: TaskGroupProps) {
  const { label, glyph } = resolve(status);

  return (
    <>
      <div className="sticky top-0 z-10 flex h-[30px] items-center gap-2 border-y border-border bg-base-2 px-4">
        <StatusGlyph status={glyph} size={12} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.10em] text-text-secondary">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-faint">{count}</span>
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
