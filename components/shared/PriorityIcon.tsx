import type { Priority as SchemaPriority } from "@/lib/types";

/** Re-export the schema priority type, including the unset case. */
export type Priority = SchemaPriority | null;

interface PriorityIconProps {
  /** @param priority - Task priority. `null` renders four muted bars. */
  priority: Priority;
  /** @param className - Optional extra classes. */
  className?: string;
}

/**
 * Four ascending bars indicating priority level. Each level has a
 * dedicated bar count and color so the icon scans both quantitatively
 * (bar count) and qualitatively (hue) at a glance.
 *
 * - `urgent` fills 4 bars (danger red, tallest bar glows).
 * - `core` fills 3 bars (amber).
 * - `normal` fills 2 bars (accent blue).
 * - `backlog` fills 1 bar (muted grey).
 * - `null` renders four border-only bars to reserve space without committing to a value.
 *
 * @param props - Priority and optional className.
 * @returns A small inline-flex SVG-like span with four bars.
 */
export function PriorityIcon({ priority, className }: PriorityIconProps) {
  const filled =
    priority === "urgent"
      ? 4
      : priority === "core"
        ? 3
        : priority === "normal"
          ? 2
          : priority === "backlog"
            ? 1
            : 0;

  const color =
    priority === "urgent"
      ? "var(--color-danger)"
      : priority === "core"
        ? "var(--color-glyph-progress)"
        : priority === "normal"
          ? "var(--color-accent)"
          : priority === "backlog"
            ? "var(--color-text-muted)"
            : "var(--color-border-strong)";

  return (
    <span
      className={`inline-flex items-end gap-[2px] ${className ?? ""}`}
      style={{ height: 12 }}
      aria-label={priority ? `Priority: ${priority}` : "Priority: none"}
    >
      {[1, 2, 3, 4].map((i) => {
        const glow = priority === "urgent" && i === 4;
        return (
          <span
            key={i}
            style={{
              width: 2,
              height: i * 3,
              background: i <= filled ? color : "var(--color-border-strong)",
              borderRadius: 1,
              opacity: i <= filled ? 1 : 0.6,
              boxShadow: glow
                ? "0 0 4px color-mix(in srgb, var(--color-danger) 90%, transparent), 0 0 10px color-mix(in srgb, var(--color-danger) 55%, transparent)"
                : undefined,
            }}
          />
        );
      })}
    </span>
  );
}

export default PriorityIcon;
