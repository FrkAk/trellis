import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member } from "@/lib/db/auth-schema";
import type { AuthContext } from "@/lib/auth/context";
import {
  roleHasProjectPermission,
  type ProjectAction,
} from "@/lib/auth/permissions";

/**
 * Read the caller's role string for the active organization. Returns the
 * raw `member.role` value (possibly comma-separated for multi-role) or
 * `null` when the membership row has been removed since session start.
 *
 * @param ctx - Resolved auth context.
 * @returns Role string or null if no membership row exists.
 */
export async function getActiveMemberRole(
  ctx: AuthContext,
): Promise<string | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.activeOrgId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * Resolve whether the caller can perform a set of project actions in the
 * active org. Returns false when no membership row is found.
 *
 * @param ctx - Resolved auth context.
 * @param actions - Required project actions.
 * @returns True when the active member's role grants every requested action.
 */
export async function canPerformProjectActions(
  ctx: AuthContext,
  actions: readonly ProjectAction[],
): Promise<boolean> {
  const role = await getActiveMemberRole(ctx);
  if (!role) return false;
  return roleHasProjectPermission(role, actions);
}
