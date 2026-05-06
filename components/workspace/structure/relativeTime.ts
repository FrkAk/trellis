/**
 * Format a timestamp into a Linear-style 2–3 character relative tag
 * (`now`, `12m`, `1h`, `2d`, `3w`). Dates older than ~12 months collapse
 * into `Yy`. Falls back to `—` for unparseable inputs so the row never
 * renders an empty slot.
 *
 * @param input - ISO string or Date returned by the API.
 * @param nowMs - Reference time, defaults to `Date.now()` so unit tests stay deterministic.
 * @returns Compact tag.
 */
export function formatRelative(input: string | Date | null | undefined, nowMs: number = Date.now()): string {
  if (!input) return '—';
  const ts = typeof input === 'string' ? Date.parse(input) : input.getTime();
  if (Number.isNaN(ts)) return '—';

  const diffMs = Math.max(0, nowMs - ts);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
  if (diffMs < week) return `${Math.floor(diffMs / day)}d`;
  if (diffMs < month) return `${Math.floor(diffMs / week)}w`;
  if (diffMs < year) return `${Math.floor(diffMs / month)}mo`;
  return `${Math.floor(diffMs / year)}y`;
}
