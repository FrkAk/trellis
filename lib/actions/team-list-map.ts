export type TeamView = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  joinedAt: Date;
  /** Role of the caller within this team (member.role). */
  role: string;
  /** Total active members in the team. */
  memberCount: number;
};

export type TeamMembershipRow = {
  organizationId: string;
  name: string;
  slug: string;
  organizationCreatedAt: Date;
  membershipCreatedAt: Date;
  role: string;
};

/**
 * Convert joined membership rows plus aggregate member counts into UI
 * team views.
 *
 * @param memberships - Membership rows for the caller.
 * @param countByOrg - Member count keyed by organization id.
 * @returns Team views rendered by Settings.
 */
export function mapTeamViews(
  memberships: TeamMembershipRow[],
  countByOrg: Map<string, number>,
): TeamView[] {
  return memberships.map((m) => ({
    id: m.organizationId,
    name: m.name,
    slug: m.slug,
    createdAt: m.organizationCreatedAt,
    joinedAt: m.membershipCreatedAt,
    role: m.role,
    memberCount: countByOrg.get(m.organizationId) ?? 1,
  }));
}
