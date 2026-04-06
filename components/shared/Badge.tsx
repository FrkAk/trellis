'use client';

const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
  done: { dot: 'bg-done', bg: 'bg-done/15', text: 'text-done' },
  planned: { dot: 'bg-planned', bg: 'bg-planned/15', text: 'text-planned' },
  in_progress: { dot: 'bg-progress', bg: 'bg-progress/15', text: 'text-progress' },
  draft: { dot: 'bg-text-muted', bg: 'bg-text-muted/15', text: 'text-text-secondary' },
  depends_on: { dot: 'bg-depends', bg: 'bg-depends/15', text: 'text-depends' },
  relates_to: { dot: 'bg-relates', bg: 'bg-relates/15', text: 'text-relates' },
};

const fallback = { dot: 'bg-todo', bg: 'bg-todo/15', text: 'text-todo' };

interface BadgeProps {
  /** @param status - Status or edge type string. */
  status: string;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Status badge with colored dot and label.
 * @param props - Badge props with status and optional className.
 * @returns A styled badge element.
 */
export function Badge({ status, className = '' }: BadgeProps) {
  const style = statusStyles[status] ?? fallback;
  const label = status.replace(/[_-]/g, ' ');

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${style.bg} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${style.text}`}>
        {label}
      </span>
    </span>
  );
}

export default Badge;
