'use server';

import { count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { member, organization } from '@/lib/db/auth-schema';
import { requireSession } from '@/lib/auth/session';
import { teamFail, type TeamActionResult } from '@/lib/actions/team-errors';
import { mapTeamViews, type TeamView } from '@/lib/actions/team-list-map';

export type { TeamView } from '@/lib/actions/team-list-map';

/**
 * List every team the caller is a member of, decorated with their role
 * and the team's total member count. Sorted by creation order (newest
 * first) so freshly-created teams surface at the top.
 *
 * @returns Discriminated result; `data` is the list of teams.
 */
export async function listUserTeamsAction(): Promise<TeamActionResult<TeamView[]>> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return teamFail('unauthorized');
  }

  try {
    const memberships = await db
      .select({
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        organizationCreatedAt: organization.createdAt,
        membershipCreatedAt: member.createdAt,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(desc(organization.createdAt));

    if (memberships.length === 0) return { ok: true, data: [] };

    const orgIds = memberships.map((m) => m.organizationId);
    const counts = await db
      .select({
        organizationId: member.organizationId,
        memberCount: count(member.id).as('member_count'),
      })
      .from(member)
      .where(inArray(member.organizationId, orgIds))
      .groupBy(member.organizationId);

    const countByOrg = new Map(counts.map((c) => [c.organizationId, Number(c.memberCount)]));

    const data = mapTeamViews(memberships, countByOrg);

    return { ok: true, data };
  } catch (err) {
    console.error('listUserTeamsAction failed', err);
    return teamFail('unknown');
  }
}
