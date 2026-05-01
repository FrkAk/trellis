import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { member } from "@/lib/db/auth-schema";
import type { AuthContext } from "@/lib/auth/context";

/**
 * Thrown when the caller is authenticated but not authorized for the target
 * resource. Default-deny: helpers throw this so the application layer
 * cannot accidentally bypass the check by ignoring a boolean return value.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Verify the caller can access the project. The project must belong to
 * the caller's active organization AND the caller must hold a membership
 * row in that organization. A single SQL JOIN performs both checks
 * atomically so the predicate cannot be split.
 *
 * @param projectId - UUID of the project to authorize.
 * @param ctx - Resolved auth context (user id + active org id).
 * @throws ForbiddenError if the project does not belong to the active org
 *   or the user is not a member of that org. The same error is thrown
 *   when the project does not exist, to avoid leaking org membership.
 */
export async function assertProjectAccess(
  projectId: string,
  ctx: AuthContext,
): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.organizationId),
        eq(member.userId, ctx.userId),
      ),
    )
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, ctx.activeOrgId),
      ),
    )
    .limit(1);
  if (!row) throw new ForbiddenError();
}

/**
 * Verify the caller can access the task. Joins through the parent project
 * to confirm the task's project belongs to the caller's active org and
 * the caller is a member of that org.
 *
 * @param taskId - UUID of the task to authorize.
 * @param ctx - Resolved auth context.
 * @returns The parent projectId so callers can avoid a second lookup.
 * @throws ForbiddenError on missing task or cross-team access.
 */
export async function assertTaskAccess(
  taskId: string,
  ctx: AuthContext,
): Promise<{ projectId: string }> {
  const [row] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.organizationId),
        eq(member.userId, ctx.userId),
      ),
    )
    .where(
      and(
        eq(tasks.id, taskId),
        eq(projects.organizationId, ctx.activeOrgId),
      ),
    )
    .limit(1);
  if (!row) throw new ForbiddenError();
  return { projectId: row.projectId };
}
