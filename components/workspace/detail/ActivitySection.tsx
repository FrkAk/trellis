'use client';

import { Avatar } from '@/components/shared/Avatar';
import type { HistoryEntry } from '@/lib/types';
import { SectionHeader } from './SectionHeader';

interface ActivitySectionProps {
  /** History entries from the schema. */
  history: HistoryEntry[] | null | undefined;
}

/**
 * Vertical activity timeline matching the prototype — avatar per row plus a
 * thin connector running through the avatar centers. One-line entries with a
 * mono relative date pinned to the right.
 *
 * @param props - Section configuration.
 * @returns Section element or null when there is no history.
 */
export function ActivitySection({ history }: ActivitySectionProps) {
  if (!history || history.length === 0) return null;

  return (
    <section className="mb-7">
      <SectionHeader label="Activity" count={history.length} />
      <ul className="flex flex-col">
        {history.map((entry, i) => (
          <ActivityRow
            key={entry.id}
            entry={entry}
            isLast={i === history.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

interface ActivityRowProps {
  /** The single history entry to render. */
  entry: HistoryEntry;
  /** Whether this is the last row — controls the trailing connector line. */
  isLast: boolean;
}

/**
 * Single timeline row — avatar + author/verb sentence + relative date.
 *
 * @param props - Row configuration.
 * @returns List item element.
 */
function ActivityRow({ entry, isLast }: ActivityRowProps) {
  const author = entry.actor === 'ai' ? 'agent' : 'user';
  return (
    <li className="relative flex items-center gap-2.5 py-2">
      <span className="relative flex w-[22px] justify-center">
        <Avatar name={author} size={18} accent={entry.actor === 'ai'} />
        {!isLast && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[22px] h-[calc(100%+8px)] w-px -translate-x-1/2 bg-border"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
        <span className="font-medium text-text-primary">{author}</span>{' '}
        {entry.label.toLowerCase()}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-text-faint">
        {formatRelative(entry.date)}
      </span>
    </li>
  );
}

/**
 * Compact relative-time formatter — picks the largest unit that fits and
 * appends the unit suffix (`12m`, `2h`, `3d`, `2w`).
 *
 * @param iso - ISO date string.
 * @returns Two-character relative label, or `—` if unparseable.
 */
function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.floor(day / 7);
  if (week < 4) return `${week}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

export default ActivitySection;
