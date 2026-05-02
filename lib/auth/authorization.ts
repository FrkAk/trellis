import "server-only";

import { and, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  tasks,
  type Project,
  type Task,
} from "@/lib/db/schema";
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
 * Verify the caller can access the project and return its full row. The
 * project must belong to the caller's active organization AND the caller
 * must hold a membership row in that organization. A single SQL JOIN
 * performs both checks atomically so the predicate cannot be split.
 *
 * Returning the row lets callers reuse it without a second `SELECT` by
 * primary key — the post-assert refetch was a defense-in-depth gap.
 *
 * @param projectId - UUID of the project to authorize.
 * @param ctx - Resolved auth context (user id + active org id).
 * @returns The full project row.
 * @throws ForbiddenError if the project does not belong to the active org
 *   or the user is not a member of that org. The same error is thrown
 *   when the project does not exist, to avoid leaking org membership.
 */
export async function assertProjectAccess(
  projectId: string,
  ctx: AuthContext,
): Promise<Project> {
  const [row] = await db
    .select(getTableColumns(projects))
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
  return row;
}

/**
 * Verify the caller can access the task and return its full row. Joins
 * through the parent project to confirm the task's project belongs to the
 * caller's active org and the caller is a member of that org.
 *
 * @param taskId - UUID of the task to authorize.
 * @param ctx - Resolved auth context.
 * @returns The full task row.
 * @throws ForbiddenError on missing task or cross-team access.
 */
export async function assertTaskAccess(
  taskId: string,
  ctx: AuthContext,
): Promise<Task> {
  const [row] = await db
    .select(getTableColumns(tasks))
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
  return row;
}
