"use server";

import { getAuthContext } from "@/lib/auth/context";
import * as core from "@/lib/graph/_core/queries";

export type {
  TaskSlim,
  ProjectTag,
  TaskState,
  SearchResult,
  DetailedEdge,
} from "@/lib/graph/_core/queries";

/**
 * Server action wrapper — fetches a project with tasks and edges,
 * scoped to the caller's active team. Throws ForbiddenError when the
 * project is in a different team.
 * @param projectId - UUID of the project.
 * @returns Project with flat tasks and edges, or undefined.
 */
export async function getProject(projectId: string) {
  const ctx = await getAuthContext();
  return core.getProject(ctx, projectId);
}

/**
 * Server action wrapper — fetches all projects in the caller's active team.
 * @returns Array of projects with task counts and progress.
 */
export async function getProjectList() {
  const ctx = await getAuthContext();
  return core.getProjectList(ctx);
}
