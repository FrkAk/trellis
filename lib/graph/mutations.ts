"use server";

import { eq, or, and, sql, gt, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  tasks,
  taskEdges,
  type NewProject,
  type NewTask,
  type NewTaskEdge,
} from "@/lib/db/schema";
import type { Decision, EdgeType, HistoryEntry } from "@/lib/types";
import { getDependencyChain } from "./traversal";
import { dbEvents } from "@/lib/events";

/** Emit a change event to all connected SSE clients via the in-memory event bus. */
function notifyChange() {
  dbEvents.emit('change', '*');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a timestamped history entry.
 * @param entry - Partial entry without id/date.
 * @returns Complete history entry with generated id and current date.
 */
function makeHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "date">,
): HistoryEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };
}

/**
 * Append a history entry to a task's history array.
 * @param taskId - UUID of the task.
 * @param entry - The history entry to append.
 */
async function appendTaskHistory(
  taskId: string,
  entry: HistoryEntry,
): Promise<void> {
  const [current] = await db
    .select({ history: tasks.history })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  const existing = (current?.history ?? []) as HistoryEntry[];
  await db
    .update(tasks)
    .set({ history: [...existing, entry], updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * Insert a new project.
 * @param data - Project fields to insert.
 * @returns The created project row.
 */
export async function createProject(data: Omit<NewProject, "id">) {
  const [project] = await db
    .insert(projects)
    .values({
      ...data,
      history: [
        makeHistoryEntry({
          type: "created",
          label: "Project created",
          description: `Project "${data.title}" created.`,
          actor: "user",
        }),
      ],
    })
    .returning();
  notifyChange();
  return project;
}

/**
 * Update a project's fields.
 * @param projectId - UUID of the project.
 * @param changes - Fields to update (title, description, etc.).
 * @returns The updated project row.
 */
export async function updateProject(
  projectId: string,
  changes: Record<string, unknown>,
) {
  const [updated] = await db
    .update(projects)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  notifyChange();
  return updated;
}

/**
 * Delete a project and all its children (cascade via DB foreign keys).
 * @param projectId - UUID of the project to delete.
 */
export async function deleteProject(projectId: string) {
  await db.delete(projects).where(eq(projects.id, projectId));
  notifyChange();
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

/**
 * Insert a new task under a project.
 * @param data - Task fields to insert.
 * @returns The created task with id, title, projectId, and order.
 */
export async function createTask(data: Omit<NewTask, "id">) {
  if (Array.isArray(data.acceptanceCriteria)) {
    data = {
      ...data,
      acceptanceCriteria: (data.acceptanceCriteria as unknown[]).map((c) => {
        if (typeof c === "string") return { id: crypto.randomUUID(), text: c, checked: false };
        return c as { id: string; text: string; checked: boolean };
      }),
    };
  }

  if (Array.isArray(data.decisions)) {
    data = {
      ...data,
      decisions: (data.decisions as unknown[]).map((d) => {
        if (typeof d === "string") {
          return { id: crypto.randomUUID(), text: d, date: new Date().toISOString().slice(0, 10), source: "refinement" as const };
        }
        return d as Decision;
      }),
    };
  }

  if (data.order === undefined || data.order === 0) {
    const [maxRow] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${tasks.order}), -1)` })
      .from(tasks)
      .where(eq(tasks.projectId, data.projectId));
    data = { ...data, order: (maxRow?.maxOrder ?? -1) + 1 };
  }

  const [task] = await db
    .insert(tasks)
    .values({
      ...data,
      history: [
        makeHistoryEntry({
          type: "created",
          label: "Task created",
          description: `Task "${data.title}" created.`,
          actor: "ai",
        }),
      ],
    })
    .returning();
  notifyChange();
  return { id: task.id, title: task.title, projectId: task.projectId, order: task.order };
}

// ---------------------------------------------------------------------------
// Update task
// ---------------------------------------------------------------------------

/**
 * Update a task and append a history entry.
 * @param taskId - UUID of the task to update.
 * @param changes - Partial fields to update.
 * @returns The updated row.
 */
export async function updateTask(
  taskId: string,
  changes: Record<string, unknown>,
  overwriteArrays = false,
) {
  // Normalize acceptanceCriteria: AI may pass plain strings instead of objects
  if (Array.isArray(changes.acceptanceCriteria)) {
    changes.acceptanceCriteria = (changes.acceptanceCriteria as unknown[]).map((c) => {
      if (typeof c === "string") {
        return { id: crypto.randomUUID(), text: c, checked: false };
      }
      const obj = c as Record<string, unknown>;
      return {
        id: (obj.id as string) ?? crypto.randomUUID(),
        text: (obj.text as string) ?? (obj.description as string) ?? String(c),
        checked: (obj.checked as boolean) ?? false,
      };
    });
  }

  // Normalize decisions: AI may pass plain strings instead of objects
  if (Array.isArray(changes.decisions)) {
    changes.decisions = (changes.decisions as unknown[]).map((d) => {
      if (typeof d === "string") {
        return { id: crypto.randomUUID(), text: d, date: new Date().toISOString().slice(0, 10), source: "refinement" };
      }
      const obj = d as Record<string, unknown>;
      return {
        id: (obj.id as string) ?? crypto.randomUUID(),
        text: (obj.text as string) ?? String(d),
        date: (obj.date as string) ?? new Date().toISOString().slice(0, 10),
        source: (obj.source as string) ?? "refinement",
      };
    });
  }

  const [current] = await db
    .select({
      history: tasks.history,
      decisions: tasks.decisions,
      acceptanceCriteria: tasks.acceptanceCriteria,
      files: tasks.files,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  // Append array fields to existing values unless overwrite is requested
  if (!overwriteArrays && current) {
    if (Array.isArray(changes.decisions)) {
      const existing = (current.decisions ?? []) as Record<string, unknown>[];
      const incoming = changes.decisions as Record<string, unknown>[];
      const incomingIds = new Set(incoming.map((c) => c.id));
      const incomingTexts = new Set(incoming.map((c) => c.text));
      changes.decisions = [...existing.filter((c) => !incomingIds.has(c.id) && !incomingTexts.has(c.text)), ...incoming];
    }
    if (Array.isArray(changes.acceptanceCriteria)) {
      const existing = (current.acceptanceCriteria ?? []) as Record<string, unknown>[];
      const incoming = changes.acceptanceCriteria as Record<string, unknown>[];
      const incomingIds = new Set(incoming.map((c) => c.id));
      const incomingTexts = new Set(incoming.map((c) => c.text));
      changes.acceptanceCriteria = [...existing.filter((c) => !incomingIds.has(c.id) && !incomingTexts.has(c.text)), ...incoming];
    }
    if (Array.isArray(changes.files)) {
      const existing = (current.files ?? []) as string[];
      const merged = new Set([...existing, ...(changes.files as string[])]);
      changes.files = [...merged];
    }
  }

  const entry = makeHistoryEntry({
    type: "refined",
    label: "Task updated",
    description: `Updated task fields: ${Object.keys(changes).join(", ")}.`,
    actor: "ai",
  });

  const existingHistory = (current?.history ?? []) as HistoryEntry[];

  const [updated] = await db
    .update(tasks)
    .set({
      ...changes,
      history: [...existingHistory, entry],
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  notifyChange();
  return updated;
}

// ---------------------------------------------------------------------------
// Delete task
// ---------------------------------------------------------------------------

/**
 * Delete a task and remove all referencing edges.
 * @param taskId - UUID of the task to delete.
 * @returns Deletion summary.
 */
export async function deleteTask(taskId: string) {
  const deletedEdges = await db
    .delete(taskEdges)
    .where(
      or(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.targetTaskId, taskId),
      ),
    )
    .returning({ id: taskEdges.id });

  await db.delete(tasks).where(eq(tasks.id, taskId));

  notifyChange();
  return {
    deleted: { id: taskId },
    edgesRemoved: deletedEdges.length,
  };
}

// ---------------------------------------------------------------------------
// Delete task preview
// ---------------------------------------------------------------------------

/**
 * Preview what would be deleted without actually deleting.
 * @param taskId - UUID of the task.
 * @returns Summary of the task and edge impact.
 */
export async function deleteTaskPreview(taskId: string) {
  const [task] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) return null;

  const edgeRows = await db
    .select({ id: taskEdges.id })
    .from(taskEdges)
    .where(
      or(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.targetTaskId, taskId),
      ),
    );

  return {
    task: { id: task.id, title: task.title },
    edgesRemoved: edgeRows.length,
  };
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * Create an edge between two tasks and append history to both.
 * Validates against self-edges, duplicates, and circular depends_on.
 * @param data - Edge fields to insert.
 * @returns The created edge.
 * @throws Error if validation fails.
 */
export async function createEdge(data: Omit<NewTaskEdge, "id">) {
  if (data.sourceTaskId === data.targetTaskId) {
    throw new Error("Cannot create self-edge: source and target are the same task.");
  }

  const [sourceTask, targetTask] = await Promise.all([
    db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, data.sourceTaskId)).then(r => r[0]),
    db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, data.targetTaskId)).then(r => r[0]),
  ]);
  if (!sourceTask || !targetTask) {
    throw new Error("Task not found: source or target task does not exist.");
  }
  if (sourceTask.projectId !== targetTask.projectId) {
    throw new Error("Cannot create edge between tasks in different projects.");
  }

  const [existing] = await db
    .select({ id: taskEdges.id })
    .from(taskEdges)
    .where(
      and(
        eq(taskEdges.sourceTaskId, data.sourceTaskId),
        eq(taskEdges.targetTaskId, data.targetTaskId),
        eq(taskEdges.edgeType, data.edgeType),
      ),
    );
  if (existing) {
    throw new Error("Duplicate edge: an identical edge already exists.");
  }

  if (data.edgeType === "depends_on") {
    const chain = await getDependencyChain(data.targetTaskId);
    const wouldCycle = chain.some((node) => node.id === data.sourceTaskId);
    if (wouldCycle) {
      throw new Error("Circular dependency: adding this edge would create a cycle.");
    }
  }

  const [edge] = await db.insert(taskEdges).values(data).returning();

  const historyEntry = makeHistoryEntry({
    type: "edge_added",
    label: `Edge: ${data.edgeType}`,
    description: `${data.edgeType} edge created.`,
    actor: "ai",
  });

  await Promise.all([
    appendTaskHistory(data.sourceTaskId, historyEntry),
    appendTaskHistory(data.targetTaskId, historyEntry),
  ]);

  notifyChange();
  return { id: edge.id, sourceTaskId: edge.sourceTaskId, targetTaskId: edge.targetTaskId, edgeType: edge.edgeType, note: edge.note };
}

/**
 * Update an existing edge's edgeType and/or note.
 * @param edgeId - UUID of the edge to update.
 * @param updates - Fields to update.
 * @returns The updated edge.
 * @throws Error if edge not found or validation fails.
 */
export async function updateEdge(
  edgeId: string,
  updates: { edgeType?: EdgeType; note?: string },
) {
  const [existing] = await db
    .select()
    .from(taskEdges)
    .where(eq(taskEdges.id, edgeId));
  if (!existing) throw new Error("Edge not found.");

  if (updates.edgeType && updates.edgeType !== existing.edgeType) {
    const [dup] = await db
      .select({ id: taskEdges.id })
      .from(taskEdges)
      .where(
        and(
          eq(taskEdges.sourceTaskId, existing.sourceTaskId),
          eq(taskEdges.targetTaskId, existing.targetTaskId),
          eq(taskEdges.edgeType, updates.edgeType),
        ),
      );
    if (dup) throw new Error("Duplicate edge: an edge with this type already exists between these tasks.");

    if (updates.edgeType === "depends_on") {
      const chain = await getDependencyChain(existing.targetTaskId);
      if (chain.some((node) => node.id === existing.sourceTaskId)) {
        throw new Error("Circular dependency: changing this edge type would create a cycle.");
      }
    }
  }

  const setClause: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.edgeType !== undefined) setClause.edgeType = updates.edgeType;
  if (updates.note !== undefined) setClause.note = updates.note;

  const [updated] = await db
    .update(taskEdges)
    .set(setClause)
    .where(eq(taskEdges.id, edgeId))
    .returning();

  const historyEntry = makeHistoryEntry({
    type: "edge_updated",
    label: `Edge updated: ${updated.edgeType}`,
    description: `Edge updated${updates.edgeType ? ` to ${updates.edgeType}` : ""}${updates.note !== undefined ? " with new note" : ""}.`,
    actor: "ai",
  });

  await Promise.all([
    appendTaskHistory(existing.sourceTaskId, historyEntry),
    appendTaskHistory(existing.targetTaskId, historyEntry),
  ]);

  notifyChange();
  return { id: updated.id, sourceTaskId: updated.sourceTaskId, targetTaskId: updated.targetTaskId, edgeType: updated.edgeType, note: updated.note };
}

/**
 * Remove an edge by ID and append history to both tasks.
 * @param edgeId - UUID of the edge to delete.
 */
export async function removeEdge(edgeId: string) {
  const [edge] = await db
    .select()
    .from(taskEdges)
    .where(eq(taskEdges.id, edgeId));
  if (!edge) return;

  await db.delete(taskEdges).where(eq(taskEdges.id, edgeId));

  const historyEntry = makeHistoryEntry({
    type: "edge_removed",
    label: `Edge removed: ${edge.edgeType}`,
    description: `${edge.edgeType} edge removed.`,
    actor: "user",
  });

  await Promise.all([
    appendTaskHistory(edge.sourceTaskId, historyEntry),
    appendTaskHistory(edge.targetTaskId, historyEntry),
  ]);
  notifyChange();
}

/**
 * Find and remove an edge matching source, target, and type. Appends history to both tasks.
 * @param sourceTaskId - UUID of the source task.
 * @param targetTaskId - UUID of the target task.
 * @param edgeType - The edge relationship type.
 * @returns The removed edge, or null if not found.
 */
export async function removeEdgeByNodes(
  sourceTaskId: string,
  targetTaskId: string,
  edgeType: EdgeType,
) {
  const [edge] = await db
    .select()
    .from(taskEdges)
    .where(
      and(
        eq(taskEdges.sourceTaskId, sourceTaskId),
        eq(taskEdges.targetTaskId, targetTaskId),
        eq(taskEdges.edgeType, edgeType),
      ),
    );
  if (!edge) return null;

  await db.delete(taskEdges).where(eq(taskEdges.id, edge.id));

  const historyEntry = makeHistoryEntry({
    type: "edge_removed",
    label: `Edge removed: ${edgeType}`,
    description: `${edgeType} edge removed.`,
    actor: "user",
  });

  await Promise.all([
    appendTaskHistory(sourceTaskId, historyEntry),
    appendTaskHistory(targetTaskId, historyEntry),
  ]);

  notifyChange();
  return edge;
}

// ---------------------------------------------------------------------------
// Reorder task
// ---------------------------------------------------------------------------

/**
 * Update a task's order and shift siblings to make room.
 * @param taskId - UUID of the task to reorder.
 * @param newOrder - The desired order position.
 * @returns The updated task row.
 */
export async function reorderTask(
  taskId: string,
  newOrder: number,
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found.`);

  const oldOrder = task.order;
  if (oldOrder === newOrder) return task;

  if (newOrder > oldOrder) {
    await db
      .update(tasks)
      .set({ order: sql`${tasks.order} - 1` })
      .where(
        and(
          eq(tasks.projectId, task.projectId),
          gt(tasks.order, oldOrder),
          sql`${tasks.order} <= ${newOrder}`,
        ),
      );
  } else {
    await db
      .update(tasks)
      .set({ order: sql`${tasks.order} + 1` })
      .where(
        and(
          eq(tasks.projectId, task.projectId),
          gte(tasks.order, newOrder),
          lt(tasks.order, oldOrder),
        ),
      );
  }

  const [updated] = await db
    .update(tasks)
    .set({ order: newOrder, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  notifyChange();
  return updated;
}

// ---------------------------------------------------------------------------
// Category operations (transactional)
// ---------------------------------------------------------------------------

/**
 * Rename a project category and update all tasks that reference it.
 * Runs in a single transaction to prevent inconsistent state.
 * @param projectId - UUID of the project.
 * @param oldName - Current category name.
 * @param newName - New category name (trimmed by caller).
 */
export async function renameCategory(
  projectId: string,
  oldName: string,
  newName: string,
) {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ categories: projects.categories })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return;

    const updatedCategories = project.categories.map((c) =>
      c === oldName ? newName : c,
    );
    await tx
      .update(projects)
      .set({ categories: updatedCategories, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    await tx
      .update(tasks)
      .set({ category: newName, updatedAt: new Date() })
      .where(and(eq(tasks.projectId, projectId), eq(tasks.category, oldName)));
  });
  notifyChange();
}

/**
 * Delete a project category and uncategorize all tasks in it.
 * Runs in a single transaction to prevent inconsistent state.
 * @param projectId - UUID of the project.
 * @param categoryName - Category to remove.
 */
export async function deleteCategory(
  projectId: string,
  categoryName: string,
) {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ categories: projects.categories })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return;

    const updatedCategories = project.categories.filter(
      (c) => c !== categoryName,
    );
    await tx
      .update(projects)
      .set({ categories: updatedCategories, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    await tx
      .update(tasks)
      .set({ category: null, updatedAt: new Date() })
      .where(
        and(eq(tasks.projectId, projectId), eq(tasks.category, categoryName)),
      );
  });
  notifyChange();
}
