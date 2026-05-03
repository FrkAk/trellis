/**
 * Format a timestamp as a short relative string (e.g. "2m ago", "3d ago").
 * Falls back to an absolute "Mon DD, YYYY" date for anything older than 30 days.
 *
 * @param date - Date, ISO string, or epoch milliseconds.
 * @returns Human-readable relative time string.
 */
export function formatRelative(date: Date | string | number): string {
  const d = new Date(date);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.round(sec / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a timestamp as an absolute date "Mon DD, YYYY" — used in tooltips
 * and "member since" labels where we want the full date, not relative.
 *
 * @param date - Date, ISO string, or epoch milliseconds.
 * @returns Locale-aware absolute date string.
 */
export function formatAbsolute(date: Date | string | number): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
