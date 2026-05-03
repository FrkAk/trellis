import { type ReactNode } from 'react';

interface EmptyStateProps {
  /** SVG icon node rendered above the title. */
  icon: ReactNode;
  /** Heading text. */
  title: string;
  /** Body / description text. */
  body: string;
  /** Optional action element rendered below the body (button, link, etc). */
  action?: ReactNode;
}

/**
 * Dashed-border empty state container used across settings tabs when a
 * collection has no rows yet.
 *
 * @param props - Empty-state configuration.
 * @returns Centered placeholder card with optional action.
 */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-transparent p-8 text-center">
      <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center text-text-muted/40">
        {icon}
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-text-muted">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
