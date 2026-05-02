import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  oauthAccessToken,
  oauthRefreshToken,
  session,
} from "@/lib/db/auth-schema";

/**
 * Wipe every artifact that referenced (userId, orgId) so a removed member
 * cannot keep operating with stale credentials.
 *
 * Called from:
 * - `organizationHooks.afterRemoveMember` (admin removes another member)
 * - `leaveTeamAction` directly (Better Auth's `leaveOrganization` does NOT
 *   fire any organization hook, so the call site must invoke cleanup itself)
 * - `organizationHooks.beforeDeleteOrganization` (per-member loop before
 *   the org row is deleted; member rows then cascade)
 *
 * Order matters here: NULL the active-org pointer first so the next
 * request from any of the user's sessions does not race with a token that
 * is about to be deleted.
 *
 * @param userId - Owner of the artifacts to remove.
 * @param orgId - Organization the artifacts pointed at.
 */
export async function clearOrgMembershipArtifacts(
  userId: string,
  orgId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(session)
      .set({ activeOrganizationId: null })
      .where(
        and(
          eq(session.userId, userId),
          eq(session.activeOrganizationId, orgId),
        ),
      );
    await tx
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.referenceId, orgId),
        ),
      );
    await tx
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.referenceId, orgId),
        ),
      );
  });
}
