'use client';

import type { HistoryEntry } from '@/lib/types';

interface HistoryTabProps {
  /** @param history - Array of history entries for the node. */
  history: HistoryEntry[];
  /** @param className - Additional CSS classes. */
  className?: string;
}

const typeColors: Record<string, string> = {
  created: 'bg-text-muted',
  refined: 'bg-accent',
  decision: 'bg-accent-light',
  edge_added: 'bg-depends',
  status_change: 'bg-done',
  planned: 'bg-progress',
};

/**
 * Timeline history tab showing how a node evolved over time.
 * @param props - History tab configuration.
 * @returns Vertical timeline element.
 */
export function HistoryTab({ history, className = '' }: HistoryTabProps) {
  if (history.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <p className="text-sm text-text-muted">No history yet.</p>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto p-5 ${className}`}>
      <div className="relative space-y-0 pl-6">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

        {history.map((entry) => {
          const dotColor = typeColors[entry.type] ?? 'bg-text-muted';
          const date = new Date(entry.date);
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          return (
            <div key={entry.id} className="relative pb-4">
              {/* Dot */}
              <div className={`absolute -left-6 top-1.5 h-[10px] w-[10px] rounded-full border-2 border-base ${dotColor}`} />

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-text-primary">{entry.label}</span>
                <span className="font-mono text-[10px] text-text-muted">{dateStr}</span>
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">{entry.description}</p>
              <span className="font-mono text-[10px] text-text-muted">{entry.actor}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HistoryTab;
