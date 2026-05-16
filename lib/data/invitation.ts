import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/auth/authorization";
import { executeRaw } from "@/lib/db/raw";
import { withUserContext } from "@/lib/db/rls";

/**
 * Fetch the organization id for an invitation, routed through the
 * `lookup_invitation_org_id` SECURITY DEFINER function so `app_user` can
 * resolve `neon_auth.invitation` rows under the Option-B lockdown. The
 * SDF returns the org id only when the caller is already a member of
 * that org — cross-org probes resolve to null (anti-enumeration).
 *
 * @param userId - Authenticated caller's user id.
 * @param invitationId - UUID of the invitation.
 * @returns The organization id, or null when the invitation does not
 *   exist or the caller is not a member of its org.
 */
export async function findInvitationOrgId(
  userId: string,
  invitationId: string,
): Promise<string | null> {
  if (!isUuid(invitationId)) return null;
  return withUserContext(userId, async (tx) => {
    const rows = await executeRaw<{ org_id: string | null }>(
      tx,
      sql`SELECT public.lookup_invitation_org_id(${invitationId}::uuid) AS org_id`,
    );
    return rows[0]?.org_id ?? null;
  });
}
