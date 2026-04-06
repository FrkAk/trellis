import type { Task, TaskEdge } from "@/lib/db/schema";

/**
 * Check if a draft task has enough content to be planned.
 * Mirrors server-side getPlannableTasks logic.
 * @param task - The task to check.
 * @returns True if the task is draft with description and acceptance criteria.
 */
export function isPlannable(task: Task): boolean {
  if (task.status !== "draft") return false;
  if (!task.description?.trim()) return false;
  const criteria = task.acceptanceCriteria as
    | { id: string; text: string; checked: boolean }[]
    | null;
  return !!criteria && criteria.length > 0;
}

/**
 * Check if a planned task has all dependencies satisfied.
 * Mirrors server-side getReadyTasks logic.
 * @param task - The task to check.
 * @param statusMap - Pre-built map of task ID to status.
 * @param edges - All edges in the project.
 * @returns True if the task is planned and all depends_on targets are done.
 */
export function isReady(
  task: Task,
  statusMap: Map<string, string>,
  edges: TaskEdge[],
): boolean {
  if (task.status !== "planned") return false;
  const depTargetIds = edges
    .filter((e) => e.sourceTaskId === task.id && e.edgeType === "depends_on")
    .map((e) => e.targetTaskId);
  if (depTargetIds.length === 0) return true;
  return depTargetIds.every((id) => statusMap.get(id) === "done");
}

/**
 * Build a status map from a task array. Build once, pass to isReady for each task.
 * @param tasks - All tasks in the project.
 * @returns Map of task ID to status string.
 */
export function buildStatusMap(tasks: Task[]): Map<string, string> {
  return new Map(tasks.map((t) => [t.id, t.status]));
}
