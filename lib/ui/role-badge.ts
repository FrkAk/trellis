/**
 * Role-chip styling shared between TeamCard, TeamHero, and MemberRow.
 *
 * Roles live in the brand-accent family so they don't collide with the
 * lifecycle status palette (planned/in_progress/done/cancelled). Owner
 * is the strongest tint, admin is a dimmer tier of the same hue, member
 * is neutral without a dot — visual hierarchy that reads as a single
 * dimension of authority.
 *
 * - owner: full brand expression (bg-accent/15, dot bg-accent)
 * - admin: dimmer brand tier (bg-accent/8, dot bg-accent/60)
 * - member: neutral, no dot
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
  admin: { bg: 'bg-accent/8', text: 'text-accent-light', dot: 'bg-accent/60', label: 'Admin' },
  member: { bg: 'bg-surface-raised', text: 'text-text-muted', dot: null, label: 'Member' },
};

/** Look up role badge style; falls back to `member` for unknown input. */
export function roleStyle(role: string): RoleBadgeStyle {
  return ROLE_BADGE[role] ?? ROLE_BADGE.member;
}
