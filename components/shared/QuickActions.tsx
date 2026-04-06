'use client';

interface QuickActionsProps {
  /** @param actions - Array of action pill definitions. */
  actions: { label: string; onClick: () => void }[];
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Row of contextual pill action buttons.
 * @param props - Quick actions configuration.
 * @returns A row of styled pill buttons.
 */
export function QuickActions({ actions, className = '' }: QuickActionsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="min-h-9 inline-flex items-center cursor-pointer rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export default QuickActions;
