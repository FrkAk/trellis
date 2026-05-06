/** All task lifecycle statuses tracked by the schema. */
export type TaskStatus =
  | 'draft'
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled';

interface StatusMeta {
  label: string;
  /** Glyph visual style. */
  glyph: 'dashed' | 'ring' | 'ring-bold' | 'half' | 'blocked' | 'filled' | 'x';
  /** CSS variable holding the fill colour for this status. */
  cssVar: string;
}

/** Static metadata table for every status — labels, glyph kind, and the CSS color variable. */
export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  draft:       { label: 'Draft',       glyph: 'dashed',    cssVar: 'var(--color-glyph-draft)' },
  planned:     { label: 'Planned',     glyph: 'ring',      cssVar: 'var(--color-glyph-planned)' },
  ready:       { label: 'Ready',       glyph: 'ring-bold', cssVar: 'var(--color-glyph-ready)' },
  in_progress: { label: 'In Progress', glyph: 'half',      cssVar: 'var(--color-glyph-progress)' },
  blocked:     { label: 'Blocked',     glyph: 'blocked',   cssVar: 'var(--color-glyph-blocked)' },
  done:        { label: 'Done',        glyph: 'filled',    cssVar: 'var(--color-glyph-done)' },
  cancelled:   { label: 'Cancelled',   glyph: 'x',         cssVar: 'var(--color-glyph-cancelled)' },
};

interface StatusGlyphProps {
  /** @param status - Task status. Falls back to `draft` if unknown. */
  status: TaskStatus | string;
  /** @param size - Pixel dimension. Defaults to 14. */
  size?: number;
  /** @param className - Optional extra classes. */
  className?: string;
}

/**
 * SVG status glyph used in lists, graph nodes, and pill badges.
 * Each lifecycle status renders as a distinct shape (dashed / ring / half / pulse / filled / blocked / x).
 *
 * @param props - Status, optional size and className.
 * @returns A 1:1 SVG element coloured by the status' CSS variable.
 */
export function StatusGlyph({ status, size = 14, className }: StatusGlyphProps) {
  const meta = STATUS_META[status as TaskStatus] ?? STATUS_META.draft;
  const half = size / 2;
  const r = half - 1.5;
  const c = meta.cssVar;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ flexShrink: 0 }}
      aria-label={meta.label}
      role="img"
    >
      {meta.glyph === 'dashed' && (
        <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.4} strokeDasharray="2 2" opacity={0.85} />
      )}
      {meta.glyph === 'ring' && (
        <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.6} />
      )}
      {meta.glyph === 'ring-bold' && (
        <>
          <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.6} />
          <circle cx={half} cy={half} r={r * 0.4} fill={c} />
        </>
      )}
      {meta.glyph === 'half' && (
        <>
          <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.6} />
          <path d={`M ${half} ${half - r} A ${r} ${r} 0 0 1 ${half} ${half + r} Z`} fill={c} />
        </>
      )}
      {meta.glyph === 'blocked' && (
        <>
          <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.6} />
          <line x1={half - r * 0.55} y1={half} x2={half + r * 0.55} y2={half} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {meta.glyph === 'filled' && (
        <>
          <circle cx={half} cy={half} r={r} fill={c} />
          <path
            d={`M ${half - r * 0.5} ${half} L ${half - r * 0.1} ${half + r * 0.4} L ${half + r * 0.55} ${half - r * 0.35}`}
            fill="none"
            stroke="var(--color-base)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {meta.glyph === 'x' && (
        <>
          <circle cx={half} cy={half} r={r} fill="none" stroke={c} strokeWidth={1.4} opacity={0.6} />
          <line x1={half - r * 0.45} y1={half - r * 0.45} x2={half + r * 0.45} y2={half + r * 0.45} stroke={c} strokeWidth={1.5} strokeLinecap="round" />
          <line x1={half + r * 0.45} y1={half - r * 0.45} x2={half - r * 0.45} y2={half + r * 0.45} stroke={c} strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default StatusGlyph;
