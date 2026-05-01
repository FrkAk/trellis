import "server-only";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { member } from "@/lib/db/auth-schema";

/**
 * Workspace gate — redirect to onboarding when the caller has no team.
 *
 * Calls requireSession() then queries `neon_auth.member` for any row by
 * userId. Zero memberships → redirect to /onboarding/team.
 *
 * @returns The validated session.
 */
export async function requireMembership() {
  const session = await requireSession();
  const [hasMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .limit(1);
  if (!hasMember) {
    redirect("/onboarding/team");
  }
  return session;
}
