import "server-only";
import { eq, sql } from "drizzle-orm";
import {
  projects,
  tasks,
  type Project,
  type Task,
} from "@/lib/db/schema";
import { executeRaw } from "@/lib/db/raw";
import { withUserContext, type Tx } from "@/lib/db/rls";
import type { ProjectListOrganization } from "@/lib/data/views";

/** Resolved project access — what the membership check returns when a caller can read a project. */
export type ProjectAccessRow = {
  /** The authorized project row. */
  project: Project;
  /** Caller's `member.role` string from the same JOIN. */
  memberRole: string;
  /** Owning team — projected from the same lookup to save a round-trip. */
  organization: ProjectListOrganization;
};

/**
 * Membership-gated project lookup. Combines the RLS-scoped `projects`
 * SELECT with a single-row lookup against `public.current_user_orgs()`
 * for the team chip + caller's role. RLS guarantees the project is only
 * visible if the caller is a member of its org; the org-row map then
 * provides the role and display fields without touching `neon_auth.*`
 * directly (app_user has no grants there under Option B).
 *
 * @param userId - Verified user id.
 * @param projectId - UUID of the project.
 * @returns Access row, or null when the project doesn't exist or the user is not a member.
 */
export async function findProjectAccess(
  userId: string,
  projectId: string,
): Promise<ProjectAccessRow | null> {
  return withUserContext(userId, (tx) => findProjectAccessTx(tx, projectId));
}

/**
 * Same contract as {@link findProjectAccess} but runs on a caller-supplied
 * transaction handle so the membership check and the protected work can
 * share one `withUserContext` frame. Public helpers that today call
 * `findProjectAccess` and then open their own `withUserContext` pay two
 * BEGIN/COMMIT round-trips per protected read; passing the working `tx`
 * here collapses that to one.
 *
 * @param tx - Drizzle transaction handle from an active `withUserContext` frame.
 * @param projectId - UUID of the project.
 * @returns Access row, or null when the project doesn't exist or the user is not a member.
 */
export async function findProjectAccessTx(
  tx: Tx,
  projectId: string,
): Promise<ProjectAccessRow | null> {
  const [projectRow] = await tx
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!projectRow) return null;
  const [org] = await executeRaw<{
    org_id: string;
    name: string;
    slug: string;
    member_role: string;
  }>(
    tx,
    sql`SELECT org_id, name, slug, member_role FROM public.current_user_orgs() WHERE org_id = ${projectRow.organizationId}::uuid LIMIT 1`,
  );
  if (!org) return null;
  return {
    project: projectRow,
    memberRole: org.member_role,
    organization: {
      id: org.org_id,
      name: org.name,
      slug: org.slug,
    },
  };
}

/**
 * Single-query membership-gated task lookup. Returns the task row when
 * RLS allows it (i.e. the caller is a member of the task's project's
 * org); RLS does the membership gate so this helper does not need any
 * JOIN through `neon_auth.*`.
 *
 * @param userId - Verified user id.
 * @param taskId - UUID of the task.
 * @returns Full task row when the user can access it, null otherwise.
 */
export async function findTaskAccess(
  userId: string,
  taskId: string,
): Promise<Task | null> {
  return withUserContext(userId, (tx) => findTaskAccessTx(tx, taskId));
}

/**
 * Same contract as {@link findTaskAccess} but runs on a caller-supplied
 * transaction handle. See {@link findProjectAccessTx} for the rationale.
 *
 * @param tx - Drizzle transaction handle from an active `withUserContext` frame.
 * @param taskId - UUID of the task.
 * @returns Full task row when the user can access it, null otherwise.
 */
export async function findTaskAccessTx(
  tx: Tx,
  taskId: string,
): Promise<Task | null> {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row ?? null;
}
