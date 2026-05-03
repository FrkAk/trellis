/**
 * Role-chip styling shared between TeamCard, TeamHero, and MemberRow.
 * Each role gets its own visual identity per DESIGN.md:
 * - owner: indigo accent (brand color)
 * - admin: planned-blue (status palette)
 * - member: surface-raised neutral (no dot)
 *
 * Falls through to member styling for unknown role strings so a malformed
 * `member.role` value renders as the most-restrictive level.
 */

export type RoleBadgeStyle = {
  /** Background tailwind class (e.g. `bg-accent/15`). */
  bg: string;
  /** Text color tailwind class. */
  text: string;
  /** Status-dot background class, or `null` to render no dot. */
  dot: string | null;
  /** Capitalized display label. */
  label: string;
};

/** Closed map keyed by Better Auth's role strings. */
export const ROLE_BADGE: Record<string, RoleBadgeStyle> = {
  owner: { bg: 'bg-accent/15', text: 'text-accent-light', dot: 'bg-accent', label: 'Owner' },
  admin: { bg: 'bg-planned/15', text: 'text-planned', dot: 'bg-planned', label: 'Admin' },
  member: { bg: 'bg-surface-raised', text: 'text-text-muted', dot: null, label: 'Member' },
};

/** Look up role badge style; falls back to `member` for unknown input. */
export function roleStyle(role: string): RoleBadgeStyle {
  return ROLE_BADGE[role] ?? ROLE_BADGE.member;
}
