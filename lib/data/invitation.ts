import "server-only";
import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/auth/authorization";
import { withUserContext } from "@/lib/db/rls";
import { invitation } from "@/lib/db/auth-schema";

/**
 * Fetch the organization id for an invitation. Used by the cancel-invite
 * action to scope the admin check to the invitation's own team.
 *
 * Wrapped in `withUserContext` for discipline-uniformity even though
 * `neon_auth.invitation` is not RLS-policied — the convention is that every
 * data-ring entry point opens a GUC frame so callers don't have to reason
 * about which reads are gated by RLS.
 *
 * @param userId - Authenticated caller's user id.
 * @param invitationId - UUID of the invitation.
 * @returns The organization id, or null if no row matches.
 */
export async function findInvitationOrgId(
  userId: string,
  invitationId: string,
): Promise<string | null> {
  if (!isUuid(invitationId)) return null;
  return withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select({ organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .limit(1);
    return row?.organizationId ?? null;
  });
}
