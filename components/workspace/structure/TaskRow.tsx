'use client';

import type { ReactNode } from 'react';
import { MonoId } from '@/components/shared/MonoId';
import { StatusGlyph } from '@/components/shared/StatusGlyph';
import { useTheme } from '@/components/layout/ThemeProvider';
import type { TaskStatus } from '@/lib/types';

interface TaskRowProps {
  /** Task UUID — used as React key by the parent. */
  id: string;
  /** Composed task identifier (e.g. `MYMR-104`). */
  taskRef: string;
  /** Display title. */
  title: string;
  /** Schema task status. */
  status: TaskStatus;
  /** First category — rendered as a tiny lowercase chip. */
  category?: string | null;
  /** Count of upstream `depends_on` edges. */
  upstreamCount: number;
  /** Count of downstream `depends_on` edges (incoming). */
  downstreamCount: number;
  /** Last activity in compact form (e.g. `1h`, `2d`). */
  lastActive: string;
  /** Whether this row is the currently selected detail target. */
  selected: boolean;
  /** Whether the row is a derived `ready` state (planned + all deps done). */
  isReady: boolean;
  /** Whether the row is a derived `plannable` state (draft + criteria + done deps). */
  isPlannable: boolean;
  /** Click handler — opens the detail column for this task. */
  onClick: () => void;
  /** Trailing slot for an inline overflow menu (delete, etc). */
  trailing?: ReactNode;
  /**
   * Keep the trailing slot visible without hover — used when the slot is
   * rendering destructive confirmation UI that the operator must commit or
   * cancel before the row de-emphasises again.
   */
  trailingPersistent?: boolean;
}

/**
 * Format the task title with the right de-emphasis for non-active states —
 * done/cancelled rows are muted, cancelled also struck through.
 *
 * @param status - Task status driving the title classes.
 * @returns Tailwind class string for the title span.
 */
function titleClass(status: TaskStatus): string {
  if (status === 'cancelled') return 'text-text-muted line-through';
  if (status === 'done') return 'text-text-muted';
  return 'text-text-primary';
}

/**
 * Linear-density task row — single 34px line with status glyph, mono id,
 * dependency hints, category, title, last-active and assignee slot.
 *
 * @param props - Row data.
 * @returns Clickable row with hover and selected variants.
 */
export function TaskRow({
  id,
  taskRef,
  title,
  status,
  category,
  upstreamCount,
  downstreamCount,
  lastActive,
  selected,
  isReady,
  isPlannable,
  onClick,
  trailing,
  trailingPersistent = false,
}: TaskRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      data-task-id={id}
      data-task-ref={taskRef}
      className={`group relative flex h-[34px] cursor-pointer items-center gap-2.5 border-b border-border pl-4 pr-3 transition-colors duration-100 ${
        selected
          ? 'bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)]'
          : 'hover:bg-surface-raised/40'
      }`}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px]" style={{ background: 'var(--color-accent-grad)' }} />
      )}

      <StatusGlyph status={status} size={14} className={status === 'in_progress' ? 'status-pulse' : undefined} />

      <MonoId
        id={taskRef}
        dim={status === 'done' || status === 'cancelled'}
        tone={
          isReady && status === 'planned'
            ? 'ready'
            : isPlannable && status === 'draft'
              ? 'plannable'
              : 'default'
        }
      />

      <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${titleClass(status)}`}>
        {title}
      </span>

      {upstreamCount > 0 && <DepsHint icon="up" count={upstreamCount} />}

      {downstreamCount > 0 && <DepsHint icon="down" count={downstreamCount} />}

      {category && <CategoryChip name={category} />}

      <span className="font-mono text-[10px] tabular-nums text-text-faint" title={`Last updated ${lastActive}`}>
        {lastActive}
      </span>

      <span
        aria-hidden="true"
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-dashed border-border-strong"
        title="Unassigned · backend wiring pending"
      >
        <span className="sr-only">Unassigned</span>
      </span>

      {trailing && (
        <span
          className={`absolute inset-y-0 right-1.5 flex items-center pl-6 transition-opacity duration-150 ${
            trailingPersistent
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
          }`}
          style={{
            background: selected
              ? 'linear-gradient(to left, color-mix(in srgb, var(--color-accent) 6%, var(--color-base)) 50%, transparent 100%)'
              : 'linear-gradient(to left, var(--color-base) 50%, transparent 100%)',
          }}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}

/**
 * Hash a string to a stable index — drives the deterministic pastel palette
 * applied to category chips. Same string maps to the same color forever.
 *
 * @param input - String to hash.
 * @returns Non-negative integer suitable for modulus.
 */
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h * 31) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable hue palette per category — same string maps to the same hue across themes. */
const CATEGORY_HUES: readonly number[] = [205, 162, 280, 32, 220, 138, 12, 254, 312, 88];

/**
 * Mono lowercase category chip — hue is hashed deterministically from the
 * name so categories scan consistently across rows. Background, border, and
 * text values branch on theme so dark mode shows light pastel text on a
 * tinted dark surface, while light mode shows saturated dark text on a
 * near-white pastel tint.
 *
 * @param props - Category name.
 * @returns Inline chip element with theme-aware color.
 */
function CategoryChip({ name }: { name: string }) {
  const hue = CATEGORY_HUES[hashString(name) % CATEGORY_HUES.length];
  const { theme } = useTheme();
  const isLight = theme === 'light';
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium"
      style={{
        background: isLight ? `hsl(${hue} 65% 92%)` : `hsl(${hue} 70% 45% / 0.14)`,
        border: `1px solid ${isLight ? `hsl(${hue} 45% 62% / 0.5)` : `hsl(${hue} 70% 60% / 0.25)`}`,
        color: isLight ? `hsl(${hue} 55% 28%)` : `hsl(${hue} 75% 78%)`,
      }}
    >
      {name.toLowerCase()}
    </span>
  );
}

interface DepsHintProps {
  /** `up` for upstream `depends_on`, `down` for downstream. */
  icon: 'up' | 'down';
  /** Edge count to render. */
  count: number;
}

/**
 * Tiny mono dependency hint — `↑3` for upstream, `↓1` for downstream. The
 * arrow color cues the edge category (depends-on vs related-to).
 *
 * @param props - Direction and count.
 * @returns Inline-flex span rendering arrow + count.
 */
function DepsHint({ icon, count }: DepsHintProps) {
  return (
    <span className="hidden shrink-0 items-center gap-0.5 font-mono text-[10px] text-text-muted sm:inline-flex" title={icon === 'up' ? `${count} upstream` : `${count} downstream`}>
      <span style={{ color: icon === 'up' ? 'var(--color-depends)' : 'var(--color-relates)' }}>
        {icon === 'up' ? '↑' : '↓'}
      </span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

export default TaskRow;
