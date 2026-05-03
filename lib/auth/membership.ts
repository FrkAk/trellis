import "server-only";

import { redirect } from "next/navigation";
import { and, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { member, organization } from "@/lib/db/auth-schema";
import type { AuthContext } from "@/lib/auth/context";
import { ForbiddenError, isUuid } from "@/lib/auth/authorization";

/**
 * Workspace gate — redirect to onboarding when the caller has zero teams.
 * Membership in any team is sufficient; per-resource access is gated
 * downstream by {@link assertProjectAccess} / {@link requireTeamMembership}.
 *
 * Returns void: callers don't need the session, and exposing it would
 * invite re-authorization patterns that bypass `getAuthContext`.
 */
export async function requireMembership(): Promise<void> {
  const session = await requireSession();

  const [any] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1);

  if (!any) {
    redirect("/onboarding/team");
  }
}

/** Resolved team-scope for a per-team admin route. */
export type TeamMembership = {
  /** The authorized organization row. */
  organization: typeof organization.$inferSelect;
  /** Caller's `member.role` string from the same JOIN. Reused for capability
   *  checks (e.g. owner-only delete) without a second `member` lookup. */
  memberRole: string;
};

/**
 * Verify the caller is a member of the target team and return the org row
 * plus the caller's role. A single JOIN performs both checks atomically so
 * the predicate cannot be split (mirrors `assertProjectAccess`).
 *
 * Throws `ForbiddenError` on missing/non-member so the page boundary can
 * translate to `notFound()` for anti-enumeration parity with project-access:
 * an attacker probing arbitrary team ids cannot tell membership apart from
 * non-existence.
 *
 * @param teamId - UUID of the team to authorize.
 * @param ctx - Resolved auth context (user id + active org id).
 * @returns The full organization row and the caller's member role.
 * @throws ForbiddenError if the team does not exist or the user is not a
 *   member of it.
 */
export async function requireTeamMembership(
  teamId: string,
  ctx: AuthContext,
): Promise<TeamMembership> {
  if (!isUuid(teamId)) {
    console.warn("requireTeamMembership: malformed teamId rejected", {
      teamId,
      userId: ctx.userId,
    });
    throw new ForbiddenError("Forbidden");
  }
  const [row] = await db
    .select({
      organization: getTableColumns(organization),
      memberRole: member.role,
    })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, ctx.userId),
      ),
    )
    .where(eq(organization.id, teamId))
    .limit(1);
  if (!row) throw new ForbiddenError("Forbidden");
  return { organization: row.organization, memberRole: row.memberRole };
}
