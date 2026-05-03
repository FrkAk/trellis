"use server";

import { getAuthContext } from "@/lib/auth/context";
import * as core from "@/lib/graph/_core/mutations";
import type { Identifier } from "@/lib/graph/identifier";
import type { NewTaskEdge } from "@/lib/db/schema";

export type {
  CreateProjectInput,
  ProjectUpdate,
  CreateTaskInput,
  TaskUpdate,
} from "@/lib/graph/_core/mutations";

// Wrappers exist on demand for client-component callers. MCP and route
// handlers import lib/graph/_core/mutations directly with their own ctx.

/**
 * Server action wrapper — update a project's fields.
 * @param projectId - UUID of the project.
 * @param changes - Subset of project fields to update.
 * @returns The updated project row.
 */
export async function updateProject(
  projectId: string,
  changes: core.ProjectUpdate,
) {
  const ctx = await getAuthContext();
  return core.updateProject(ctx, projectId, changes);
}

/**
 * Server action wrapper — rename a project's identifier prefix.
 * @param projectId - UUID of the project.
 * @param identifier - New identifier (already shape-validated).
 * @returns The updated project row.
 */
export async function renameProjectIdentifier(
  projectId: string,
  identifier: Identifier,
) {
  const ctx = await getAuthContext();
  return core.renameProjectIdentifier(ctx, projectId, identifier);
}

/**
 * Server action wrapper — create a task under a project.
 * @param data - Task fields. sequenceNumber is assigned internally.
 * @returns Task summary with composed taskRef.
 */
export async function createTask(data: core.CreateTaskInput) {
  const ctx = await getAuthContext();
  return core.createTask(ctx, data);
}

/**
 * Server action wrapper — update a task's fields.
 * @param taskId - UUID of the task.
 * @param changes - Partial fields to update.
 * @param overwriteArrays - When true, replace array fields instead of appending.
 * @returns The updated row.
 */
export async function updateTask(
  taskId: string,
  changes: core.TaskUpdate,
  overwriteArrays = false,
) {
  const ctx = await getAuthContext();
  return core.updateTask(ctx, taskId, changes, overwriteArrays);
}

/**
 * Server action wrapper — delete a task and its edges.
 * @param taskId - UUID of the task.
 * @returns Deletion summary.
 */
export async function deleteTask(taskId: string) {
  const ctx = await getAuthContext();
  return core.deleteTask(ctx, taskId);
}

/**
 * Server action wrapper — create an edge between two tasks.
 * @param data - Edge fields to insert.
 * @returns The created edge.
 */
export async function createEdge(data: Omit<NewTaskEdge, "id">) {
  const ctx = await getAuthContext();
  return core.createEdge(ctx, data);
}

/**
 * Server action wrapper — remove an edge by id.
 * @param edgeId - UUID of the edge.
 */
export async function removeEdge(edgeId: string) {
  const ctx = await getAuthContext();
  return core.removeEdge(ctx, edgeId);
}

/**
 * Server action wrapper — rename a project category and its task references.
 * @param projectId - UUID of the project.
 * @param oldName - Current category name.
 * @param newName - New category name.
 */
export async function renameCategory(
  projectId: string,
  oldName: string,
  newName: string,
) {
  const ctx = await getAuthContext();
  return core.renameCategory(ctx, projectId, oldName, newName);
}

/**
 * Server action wrapper — delete a project category and uncategorize its tasks.
 * @param projectId - UUID of the project.
 * @param categoryName - Category to remove.
 */
export async function deleteCategory(projectId: string, categoryName: string) {
  const ctx = await getAuthContext();
  return core.deleteCategory(ctx, projectId, categoryName);
}
