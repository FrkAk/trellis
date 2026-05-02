import "server-only";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { member } from "@/lib/db/auth-schema";

/**
 * Workspace gate — redirect to onboarding unless the session points at a
 * current membership. The onboarding page resolves three states for us:
 * no memberships → render onboarding form; memberships exist but session
 * activeOrganizationId is stale → bounce to /; otherwise redirect to /.
 *
 * Returns void: callers don't need the session, and exposing it would
 * invite re-authorization patterns that bypass `getAuthContext`.
 */
export async function requireMembership(): Promise<void> {
  const session = await requireSession();
  const activeOrgId = session.session.activeOrganizationId;

  if (!activeOrgId) {
    redirect("/onboarding/team");
  }

  const [active] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrgId)),
    )
    .limit(1);

  if (!active) {
    redirect("/onboarding/team");
  }
}
