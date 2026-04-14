"use server";

import { eq, or, and, asc, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  tasks,
  taskEdges,
  conversations,
} from "@/lib/db/schema";
import type { EdgeType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Task helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a full task row by ID.
 * @param taskId - UUID of the task.
 * @returns The full task row, or undefined.
 */
export async function fetchTask(taskId: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return row;
}

/**
 * Check whether a project exists.
 * @param projectId - UUID of the project.
 * @returns True if the project exists.
 */
export async function projectExists(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return !!row;
}

/**
 * Check whether a task exists.
 * @param taskId - UUID of the task.
 * @returns True if the task exists.
 */
export async function taskExists(taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return !!row;
}

/**
 * Check whether an edge exists.
 * @param edgeId - UUID of the edge.
 * @returns True if the edge exists.
 */
export async function edgeExists(edgeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: taskEdges.id })
    .from(taskEdges)
    .where(eq(taskEdges.id, edgeId))
    .limit(1);
  return !!row;
}

// ---------------------------------------------------------------------------
// Single-entity queries
// ---------------------------------------------------------------------------

/**
 * Fetch a project with its tasks and edges.
 * @param projectId - UUID of the project.
 * @returns Project with flat tasks and edges, or undefined.
 */
export async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return undefined;

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));

  const taskIds = projectTasks.map((t) => t.id);
  let edges: (typeof taskEdges.$inferSelect)[] = [];
  if (taskIds.length > 0) {
    edges = await db
      .select()
      .from(taskEdges)
      .where(
        or(
          sql`${taskEdges.sourceTaskId} IN ${taskIds}`,
          sql`${taskEdges.targetTaskId} IN ${taskIds}`,
        ),
      );
  }

  return { ...project, tasks: projectTasks, edges };
}

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

/**
 * Fetch all tasks for a project, ordered by `order`.
 * @param projectId - UUID of the project.
 * @returns Ordered array of tasks.
 */
export async function getProjectTasks(projectId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));
}

/**
 * Fetch slim task list for a project (id, title, status, tags, order only).
 * Used by mymir_query type='list' to keep MCP responses small.
 */
export async function getProjectTasksSlim(projectId: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      category: tasks.category,
      order: tasks.order,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));
}

// ---------------------------------------------------------------------------
// Edge queries
// ---------------------------------------------------------------------------

/**
 * Fetch all edges where a task is source or target.
 * @param taskId - UUID of the task.
 * @returns Array of edges.
 */
export async function getTaskEdges(taskId: string) {
  return db
    .select()
    .from(taskEdges)
    .where(
      or(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.targetTaskId, taskId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------

/**
 * Fetch all projects with basic stats.
 * @returns Array of projects with task counts and progress.
 */
export async function getProjectList() {
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.createdAt));

  if (allProjects.length === 0) return [];

  const projectIds = allProjects.map((p) => p.id);

  const allTasks = await db
    .select({ status: tasks.status, projectId: tasks.projectId })
    .from(tasks)
    .where(sql`${tasks.projectId} IN ${projectIds}`);

  const tasksByProject = new Map<string, { status: string }[]>();
  for (const t of allTasks) {
    const list = tasksByProject.get(t.projectId) ?? [];
    list.push({ status: t.status });
    tasksByProject.set(t.projectId, list);
  }

  return allProjects.map((project) => {
    const projTasks = tasksByProject.get(project.id) ?? [];

    const taskStats = {
      total: projTasks.length,
      done: projTasks.filter((t) => t.status === "done").length,
      inProgress: projTasks.filter((t) => t.status === "in_progress").length,
    };

    return {
      ...project,
      taskStats,
      progress:
        taskStats.total > 0
          ? Math.round((taskStats.done / taskStats.total) * 100)
          : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Fetch conversation messages for a project or specific task.
 * @param projectId - UUID of the project.
 * @param taskId - Optional UUID of the task (null for project-level chat).
 * @returns Conversation row, or undefined.
 */
export async function getConversation(projectId: string, taskId?: string) {
  if (taskId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.projectId, projectId),
          eq(conversations.taskId, taskId),
        ),
      );
    return conv;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.projectId, projectId),
        sql`${conversations.taskId} IS NULL`,
      ),
    );
  return conv;
}

// ---------------------------------------------------------------------------
// Task state derivation
// ---------------------------------------------------------------------------

/** Derived task state based on status + dependency readiness. */
export type TaskState = "done" | "in_progress" | "ready" | "plannable" | "blocked" | "draft";

/**
 * Derive the actionable state for a single task.
 * @param task - Task with status, description, and acceptanceCriteria.
 * @param depsBySource - Map of taskId → array of depends_on target IDs.
 * @param statusMap - Map of taskId → status for all project tasks.
 * @returns Derived TaskState.
 */
function deriveTaskState(
  task: { id: string; status: string; description: string; acceptanceCriteria: unknown },
  depsBySource: Map<string, string[]>,
  statusMap: Map<string, string>,
): TaskState {
  if (task.status === "done") return "done";
  if (task.status === "in_progress") return "in_progress";

  const deps = depsBySource.get(task.id) ?? [];
  const allDepsDone = deps.every((depId) => statusMap.get(depId) === "done");

  if (task.status === "planned") {
    return allDepsDone ? "ready" : "blocked";
  }

  // status === "draft"
  if (!allDepsDone) return "blocked";

  const hasDescription = task.description.trim().length > 0;
  const criteria = task.acceptanceCriteria as { id: string; text: string; checked: boolean }[] | null;
  const hasCriteria = Array.isArray(criteria) && criteria.length > 0;

  return hasDescription && hasCriteria ? "plannable" : "draft";
}

/**
 * Derive states for a batch of tasks in one project. Fetches depends_on edges once.
 * @param projectId - UUID of the project.
 * @param taskSubset - Tasks to derive states for (must belong to the project).
 * @returns Map of taskId → TaskState.
 */
export async function deriveTaskStates(
  projectId: string,
  taskSubset: { id: string; status: string; description: string; acceptanceCriteria: unknown }[],
): Promise<Map<string, TaskState>> {
  const allProjectTasks = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  const statusMap = new Map<string, string>();
  for (const t of allProjectTasks) statusMap.set(t.id, t.status);

  const taskIds = allProjectTasks.map((t) => t.id);
  const dependsOnEdges = taskIds.length > 0
    ? await db
        .select({ sourceTaskId: taskEdges.sourceTaskId, targetTaskId: taskEdges.targetTaskId })
        .from(taskEdges)
        .where(and(sql`${taskEdges.sourceTaskId} IN ${taskIds}`, eq(taskEdges.edgeType, "depends_on")))
    : [];

  const depsBySource = new Map<string, string[]>();
  for (const edge of dependsOnEdges) {
    const existing = depsBySource.get(edge.sourceTaskId) ?? [];
    existing.push(edge.targetTaskId);
    depsBySource.set(edge.sourceTaskId, existing);
  }

  const result = new Map<string, TaskState>();
  for (const task of taskSubset) {
    result.set(task.id, deriveTaskState(task, depsBySource, statusMap));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** A search result task. */
export type SearchResult = {
  id: string;
  title: string;
  status: string;
  state: TaskState;
  tags: string[];
  category: string | null;
};

/**
 * Search tasks by title or tags (case-insensitive) within a project.
 * @param projectId - UUID of the project.
 * @param query - Search string matched against title and tag values.
 * @returns Up to 20 matching tasks with derived state, title matches ranked first.
 */
export async function searchTasks(
  projectId: string,
  query: string,
): Promise<SearchResult[]> {
  const pattern = `%${query}%`;
  const lower = query.toLowerCase();

  const tagMatch = sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${tasks.tags}) AS t WHERE t ILIKE ${pattern})`;

  const matchingTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      category: tasks.category,
      description: tasks.description,
      acceptanceCriteria: tasks.acceptanceCriteria,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), or(ilike(tasks.title, pattern), tagMatch)));

  matchingTasks.sort((a, b) => {
    const aLower = a.title.toLowerCase();
    const bLower = b.title.toLowerCase();
    const aTitle = aLower === lower ? 0 : aLower.startsWith(lower) ? 1 : aLower.includes(lower) ? 2 : 3;
    const bTitle = bLower === lower ? 0 : bLower.startsWith(lower) ? 1 : bLower.includes(lower) ? 2 : 3;
    return aTitle - bTitle;
  });

  const trimmed = matchingTasks.slice(0, 20);
  const stateMap = await deriveTaskStates(projectId, trimmed);

  return trimmed.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    state: stateMap.get(t.id) ?? "draft",
    tags: t.tags,
    category: t.category,
  }));
}

// ---------------------------------------------------------------------------
// Task edges with details
// ---------------------------------------------------------------------------

/** An edge with full connected task details. */
type DetailedEdge = {
  edgeId: string;
  edgeType: EdgeType;
  direction: "outgoing" | "incoming";
  note: string;
  connectedTask: { id: string; title: string; status: string };
};

/**
 * Fetch all edges on a task with connected task titles and statuses.
 * @param taskId - UUID of the task.
 * @returns Array of detailed edges.
 */
export async function getTaskEdgesDetailed(
  taskId: string,
): Promise<DetailedEdge[]> {
  const edges = await db
    .select()
    .from(taskEdges)
    .where(
      or(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.targetTaskId, taskId),
      ),
    );

  const idsToFetch = new Set<string>();
  for (const edge of edges) {
    const isOutgoing = edge.sourceTaskId === taskId;
    idsToFetch.add(isOutgoing ? edge.targetTaskId : edge.sourceTaskId);
  }

  const taskInfoMap = new Map<string, { title: string; status: string }>();

  if (idsToFetch.size > 0) {
    const ids = [...idsToFetch];
    const taskRows = await db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(sql`${tasks.id} IN ${ids}`);
    for (const t of taskRows) taskInfoMap.set(t.id, { title: t.title, status: t.status });
  }

  return edges
    .map((edge) => {
      const isOutgoing = edge.sourceTaskId === taskId;
      const connectedId = isOutgoing ? edge.targetTaskId : edge.sourceTaskId;
      const info = taskInfoMap.get(connectedId);
      if (!info) return null;
      return {
        edgeId: edge.id,
        edgeType: edge.edgeType,
        direction: isOutgoing ? ("outgoing" as const) : ("incoming" as const),
        note: edge.note,
        connectedTask: { id: connectedId, ...info },
      };
    })
    .filter((e): e is DetailedEdge => e !== null);
}

// ---------------------------------------------------------------------------
// Edge notes
// ---------------------------------------------------------------------------

/**
 * Fetch edge notes for outgoing depends_on edges from a task, keyed by target task ID.
 * @param taskId - UUID of the source task.
 * @returns Map of target task ID to edge note.
 */
export async function fetchEdgeNotesBySource(taskId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ targetTaskId: taskEdges.targetTaskId, note: taskEdges.note })
    .from(taskEdges)
    .where(
      and(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.edgeType, "depends_on"),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.note) map.set(r.targetTaskId, r.note);
  }
  return map;
}

/**
 * Fetch edge notes for incoming depends_on edges to a task, keyed by source task ID.
 * @param taskId - UUID of the target task.
 * @returns Map of source task ID to edge note.
 */
export async function fetchEdgeNotesByTarget(taskId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ sourceTaskId: taskEdges.sourceTaskId, note: taskEdges.note })
    .from(taskEdges)
    .where(
      and(
        eq(taskEdges.targetTaskId, taskId),
        eq(taskEdges.edgeType, "depends_on"),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.note) map.set(r.sourceTaskId, r.note);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Batch task summaries
// ---------------------------------------------------------------------------

/**
 * Fetch title, status, and description for multiple tasks by ID.
 * @param taskIds - Array of task UUIDs.
 * @returns Array of task summaries.
 */
export async function fetchTaskSummaries(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, description: tasks.description })
    .from(tasks)
    .where(sql`${tasks.id} IN ${taskIds}`);
}
