/**
 * Tailwind class set describing a team's chip colours. Drives the dot
 * fill, the chip's tinted background, and the foreground text colour so
 * the chip shape stays consistent across the app while the palette varies
 * per team.
 */
export type TeamColor = {
  /** Dot background (e.g. `bg-accent`). */
  dot: string;
  /** Chip background tint (e.g. `bg-accent/15`). */
  bg: string;
  /** Chip foreground text (e.g. `text-accent-light`). */
  text: string;
};

/**
 * Six-entry palette drawn from existing design tokens so team chips reuse
 * the same hues that already appear in status chips and edge labels. The
 * static class strings are critical for Tailwind v4: the scanner must see
 * the literal `bg-accent/15` form for the utility to be emitted.
 */
const PALETTE: readonly TeamColor[] = [
  { dot: "bg-accent", bg: "bg-accent/15", text: "text-accent-light" },
  { dot: "bg-relates", bg: "bg-relates/15", text: "text-relates" },
  { dot: "bg-planned", bg: "bg-planned/15", text: "text-planned" },
  { dot: "bg-done", bg: "bg-done/15", text: "text-done" },
  { dot: "bg-progress", bg: "bg-progress/15", text: "text-progress" },
  { dot: "bg-cancelled", bg: "bg-cancelled/15", text: "text-cancelled" },
];

/**
 * 32-bit FNV-1a hash. Stable across JS engines and platforms — picked over
 * crypto hashes because it has no async surface and the team-color choice
 * is non-secret. The `>>> 0` keeps the running value in unsigned 32-bit
 * space so the multiplication doesn't drift into negatives.
 *
 * @param str - String to hash.
 * @returns 32-bit unsigned integer hash.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Pick the team's deterministic colour from the palette. Same input always
 * yields the same entry, so chip colour is stable across reloads, devices,
 * and SSR/client renders.
 *
 * @param teamId - Stable identifier for the team (typically the UUID).
 * @returns Tailwind class set for chip rendering.
 */
export function getTeamColor(teamId: string): TeamColor {
  return PALETTE[fnv1a(teamId) % PALETTE.length];
}
