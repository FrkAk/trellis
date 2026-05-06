/** Schema priority enum — `null` indicates unset. */
export type Priority = 'low' | 'medium' | 'high' | 'urgent' | null;

interface PriorityIconProps {
  /** @param priority - Task priority. `null` renders three muted bars. */
  priority: Priority;
  /** @param className - Optional extra classes. */
  className?: string;
}

/**
 * Three ascending bars indicating priority level.
 *
 * - `low` fills 1 bar (muted).
 * - `medium` fills 2 bars (amber).
 * - `high` fills 3 bars (red).
 * - `urgent` fills 3 bars (red, with the tallest bar receiving the danger glow).
 * - `null` renders three border-only bars to reserve space without committing to a value.
 *
 * @param props - Priority and optional className.
 * @returns A small inline-flex SVG-like span with three bars.
 */
export function PriorityIcon({ priority, className }: PriorityIconProps) {
  const filled = priority === 'urgent' || priority === 'high'
    ? 3
    : priority === 'medium'
      ? 2
      : priority === 'low'
        ? 1
        : 0;

  const color =
    priority === 'urgent'
      ? 'var(--color-danger)'
      : priority === 'high'
        ? 'var(--color-glyph-blocked)'
        : priority === 'medium'
          ? 'var(--color-glyph-progress)'
          : priority === 'low'
            ? 'var(--color-text-muted)'
            : 'var(--color-border-strong)';

  return (
    <span
      className={`inline-flex items-end gap-[2px] ${className ?? ''}`}
      style={{ height: 12 }}
      aria-label={priority ? `Priority: ${priority}` : 'Priority: none'}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: i * 4,
            background: i <= filled ? color : 'var(--color-border-strong)',
            borderRadius: 1,
            opacity: i <= filled ? 1 : 0.6,
          }}
        />
      ))}
    </span>
  );
}

export default PriorityIcon;
