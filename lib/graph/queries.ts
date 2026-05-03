"use server";

import { getAuthContext } from "@/lib/auth/context";
import * as core from "@/lib/graph/_core/queries";

export type {
  TaskSlim,
  ProjectTag,
  TaskState,
  SearchResult,
  DetailedEdge,
  ProjectListEntry,
  ProjectListOrganization,
} from "@/lib/graph/_core/queries";

/**
 * Server action wrapper — fetches a project with tasks and edges. The
 * project must belong to a team the caller is a member of; cross-team
 * probes raise a `ForbiddenError`.
 * @param projectId - UUID of the project.
 * @returns Project with flat tasks and edges.
 */
export async function getProject(projectId: string) {
  const ctx = await getAuthContext();
  return core.getProject(ctx, projectId);
}

/**
 * Server action wrapper — fetches every project across every team the
 * caller is a member of, decorated with team metadata, the caller's role,
 * and progress stats.
 * @returns Array of projects ordered by `updatedAt` descending.
 */
export async function getProjectList() {
  const ctx = await getAuthContext();
  return core.getProjectList(ctx);
}
