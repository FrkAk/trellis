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
import { getDependencyChain } from "@/lib/graph/_core/traversal";
import { dbEvents } from "@/lib/events";
import {
  deriveIdentifier,
  composeTaskRef,
  asIdentifier,
  type Identifier,
} from "@/lib/graph/identifier";
import {
  IdentifierAllocationError,
  ProjectNotFoundError,
} from "@/lib/graph/errors";
import {
  formatMarkdown,
  formatTaskMarkdownFields,
} from "@/lib/markdown/format";
import type { AuthContext } from "@/lib/auth/context";
import {
  ForbiddenError,
  assertProjectAccess,
  assertTaskAccess,
} from "@/lib/auth/authorization";

/** Emit a change event to all connected SSE clients via the in-memory event bus. */
function notifyChange() {
  dbEvents.emit("change", "*");
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
 * Input for createProject — identifier optional, organizationId is set
 * from the caller's active team and is not part of the input.
 */
export type CreateProjectInput = Omit<
  NewProject,
  "id" | "identifier" | "organizationId"
> & {
  identifier?: Identifier;
};

/** Advisory-lock key serializing identifier auto-derivation across concurrent creates. */
const IDENTIFIER_LOCK_KEY = sql`hashtext('mymir:project-identifier')`;

/**
 * Pick an identifier that's not already taken, auto-suffixing on collision.
 * Must be called inside a transaction holding the identifier advisory lock.
 * @param tx - Drizzle transaction handle.
 * @param base - Starting identifier (e.g. derived from title).
 * @returns Unique identifier.
 * @throws If no unique variant found within 1000 attempts.
 */
async function pickAvailableIdentifier(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  base: Identifier,
): Promise<Identifier> {
  const existing = await tx
    .select({ identifier: projects.identifier })
    .from(projects);
  const taken = new Set(existing.map((r) => r.identifier));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 12 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate as Identifier;
  }
  throw new IdentifierAllocationError(base);
}

/**
 * Insert a new project bound to the caller's active team.
 * @param ctx - Resolved auth context — provides activeOrgId for the new project.
 * @param data - Project fields. Identifier optional.
 * @returns The created project row.
 */
export async function createProject(
  ctx: AuthContext,
  data: CreateProjectInput,
) {
  if (typeof data.description === "string" && data.description.trim()) {
    data = {
      ...data,
      description: (await formatMarkdown(data.description)) ?? data.description,
    };
  }
  const project = await db.transaction(async (tx) => {
    let identifier = data.identifier;
    if (identifier === undefined) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${IDENTIFIER_LOCK_KEY})`);
      identifier = await pickAvailableIdentifier(tx, deriveIdentifier(data.title));
    }

    const [row] = await tx
      .insert(projects)
      .values({
        ...data,
        identifier,
        organizationId: ctx.activeOrgId,
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
    return row;
  });
  notifyChange();
  return project;
}

/** Fields an `updateProject` caller is allowed to change. */
export type ProjectUpdate = Partial<
  Pick<
    typeof projects.$inferInsert,
    "title" | "description" | "status" | "categories" | "identifier"
  >
>;

/**
 * Update a project's fields.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @param changes - Typed subset of project fields to update.
 * @returns The updated project row.
 */
export async function updateProject(
  ctx: AuthContext,
  projectId: string,
  changes: ProjectUpdate,
) {
  await assertProjectAccess(projectId, ctx);

  if (typeof changes.description === "string" && changes.description.trim()) {
    changes = {
      ...changes,
      description:
        (await formatMarkdown(changes.description)) ?? changes.description,
    };
  }
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
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project to delete.
 */
export async function deleteProject(ctx: AuthContext, projectId: string) {
  await assertProjectAccess(projectId, ctx);
  await db.delete(projects).where(eq(projects.id, projectId));
  notifyChange();
}

/**
 * Rename a project's identifier under the shared identifier advisory lock.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project to rename.
 * @param identifier - New identifier (already shape-validated).
 * @returns The updated project row.
 * @throws {ProjectNotFoundError} If no project matches `projectId`.
 */
export async function renameProjectIdentifier(
  ctx: AuthContext,
  projectId: string,
  identifier: Identifier,
) {
  await assertProjectAccess(projectId, ctx);

  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${IDENTIFIER_LOCK_KEY})`);
    const [row] = await tx
      .update(projects)
      .set({ identifier, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    if (!row) throw new ProjectNotFoundError(projectId);
    return row;
  });
  notifyChange();
  return updated;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

/** Input for createTask — sequenceNumber is always computed internally. */
export type CreateTaskInput = Omit<NewTask, "id" | "sequenceNumber">;

/**
 * Insert a new task under a project owned by the caller's active team.
 * @param ctx - Resolved auth context.
 * @param data - Task fields. sequenceNumber assigned internally.
 * @returns Task summary with composed taskRef.
 */
export async function createTask(ctx: AuthContext, data: CreateTaskInput) {
  await assertProjectAccess(data.projectId, ctx);

  if (Array.isArray(data.acceptanceCriteria)) {
    data = {
      ...data,
      acceptanceCriteria: (data.acceptanceCriteria as unknown[]).map((c) => {
        if (typeof c === "string")
          return { id: crypto.randomUUID(), text: c, checked: false };
        const obj = c as Record<string, unknown>;
        return {
          id: (obj.id as string) ?? crypto.randomUUID(),
          text:
            (obj.text as string) ?? (obj.description as string) ?? String(c),
          checked: (obj.checked as boolean) ?? false,
        };
      }),
    };
  }

  if (Array.isArray(data.decisions)) {
    data = {
      ...data,
      decisions: (data.decisions as unknown[]).map((d) => {
        if (typeof d === "string") {
          return {
            id: crypto.randomUUID(),
            text: d,
            date: new Date().toISOString().slice(0, 10),
            source: "refinement" as const,
          };
        }
        const obj = d as Record<string, unknown>;
        return {
          id: (obj.id as string) ?? crypto.randomUUID(),
          text: (obj.text as string) ?? String(d),
          date: (obj.date as string) ?? new Date().toISOString().slice(0, 10),
          source: (obj.source as Decision["source"]) ?? "refinement",
        } as Decision;
      }),
    };
  }

  data = await formatTaskMarkdownFields(data);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.projectId}))`);

    const [proj] = await tx
      .select({ identifier: projects.identifier })
      .from(projects)
      .where(eq(projects.id, data.projectId));
    if (!proj) throw new ProjectNotFoundError(data.projectId);

    const [maxRow] = await tx
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${tasks.order}), -1)`,
        maxSeq: sql<number>`COALESCE(MAX(${tasks.sequenceNumber}), 0)`,
      })
      .from(tasks)
      .where(eq(tasks.projectId, data.projectId));

    const sequenceNumber = (maxRow?.maxSeq ?? 0) + 1;
    const order =
      data.order === undefined || data.order === 0
        ? (maxRow?.maxOrder ?? -1) + 1
        : data.order;

    const [task] = await tx
      .insert(tasks)
      .values({
        ...data,
        order,
        sequenceNumber,
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

    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      order: task.order,
      sequenceNumber: task.sequenceNumber,
      taskRef: composeTaskRef(asIdentifier(proj.identifier), task.sequenceNumber),
    };
  });

  notifyChange();
  return result;
}

// ---------------------------------------------------------------------------
// Update task
// ---------------------------------------------------------------------------

/**
 * Update a task and append a history entry.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task to update.
 * @param changes - Partial fields to update.
 * @param overwriteArrays - When true, replace array fields instead of appending.
 * @returns The updated row.
 */
export async function updateTask(
  ctx: AuthContext,
  taskId: string,
  changes: Record<string, unknown>,
  overwriteArrays = false,
) {
  await assertTaskAccess(taskId, ctx);

  if (Array.isArray(changes.acceptanceCriteria)) {
    changes.acceptanceCriteria = (
      changes.acceptanceCriteria as unknown[]
    ).map((c) => {
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

  if (Array.isArray(changes.decisions)) {
    changes.decisions = (changes.decisions as unknown[]).map((d) => {
      if (typeof d === "string") {
        return {
          id: crypto.randomUUID(),
          text: d,
          date: new Date().toISOString().slice(0, 10),
          source: "refinement",
        };
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

  changes = await formatTaskMarkdownFields(changes);

  const [current] = await db
    .select({
      status: tasks.status,
      history: tasks.history,
      decisions: tasks.decisions,
      acceptanceCriteria: tasks.acceptanceCriteria,
      files: tasks.files,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!overwriteArrays && current) {
    if (Array.isArray(changes.decisions)) {
      const existing = (current.decisions ?? []) as Record<string, unknown>[];
      const incoming = changes.decisions as Record<string, unknown>[];
      const incomingIds = new Set(incoming.map((c) => c.id));
      const incomingTexts = new Set(incoming.map((c) => c.text));
      changes.decisions = [
        ...existing.filter(
          (c) => !incomingIds.has(c.id) && !incomingTexts.has(c.text),
        ),
        ...incoming,
      ];
    }
    if (Array.isArray(changes.acceptanceCriteria)) {
      const existing = (current.acceptanceCriteria ?? []) as Record<
        string,
        unknown
      >[];
      const incoming = changes.acceptanceCriteria as Record<string, unknown>[];
      const incomingIds = new Set(incoming.map((c) => c.id));
      const incomingTexts = new Set(incoming.map((c) => c.text));
      changes.acceptanceCriteria = [
        ...existing.filter(
          (c) => !incomingIds.has(c.id) && !incomingTexts.has(c.text),
        ),
        ...incoming,
      ];
    }
    if (Array.isArray(changes.files)) {
      const existing = (current.files ?? []) as string[];
      const merged = new Set([...existing, ...(changes.files as string[])]);
      changes.files = [...merged];
    }
  }

  const isStatusChange =
    "status" in changes && current?.status !== changes.status;
  const entry = makeHistoryEntry({
    type: isStatusChange ? "status_change" : "refined",
    label: isStatusChange
      ? `Status: ${current?.status} → ${changes.status}`
      : "Task updated",
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
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task to delete.
 * @returns Deletion summary.
 */
export async function deleteTask(ctx: AuthContext, taskId: string) {
  await assertTaskAccess(taskId, ctx);

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
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task.
 * @returns Summary of the task and edge impact.
 */
export async function deleteTaskPreview(ctx: AuthContext, taskId: string) {
  await assertTaskAccess(taskId, ctx);

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
 * @param ctx - Resolved auth context.
 * @param data - Edge fields to insert.
 * @returns The created edge.
 * @throws Error if validation fails.
 */
export async function createEdge(
  ctx: AuthContext,
  data: Omit<NewTaskEdge, "id">,
) {
  if (data.sourceTaskId === data.targetTaskId) {
    throw new Error(
      "Cannot create self-edge: source and target are the same task.",
    );
  }

  await assertTaskAccess(data.sourceTaskId, ctx);
  await assertTaskAccess(data.targetTaskId, ctx);

  if (typeof data.note === "string" && data.note.trim()) {
    data = { ...data, note: (await formatMarkdown(data.note)) ?? data.note };
  }

  const [sourceTask, targetTask] = await Promise.all([
    db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, data.sourceTaskId))
      .then((r) => r[0]),
    db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, data.targetTaskId))
      .then((r) => r[0]),
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
      throw new Error(
        "Circular dependency: adding this edge would create a cycle.",
      );
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
  return {
    id: edge.id,
    sourceTaskId: edge.sourceTaskId,
    targetTaskId: edge.targetTaskId,
    edgeType: edge.edgeType,
    note: edge.note,
  };
}

/**
 * Internal helper: fetch an edge by id then assert the caller can reach it
 * via the parent project. Throws ForbiddenError if missing or cross-team.
 * @param edgeId - UUID of the edge.
 * @param ctx - Resolved auth context.
 * @returns The edge row.
 */
async function loadAuthorizedEdge(edgeId: string, ctx: AuthContext) {
  const [edge] = await db
    .select()
    .from(taskEdges)
    .where(eq(taskEdges.id, edgeId));
  if (!edge) throw new ForbiddenError();
  await assertTaskAccess(edge.sourceTaskId, ctx);
  return edge;
}

/**
 * Update an existing edge's edgeType and/or note.
 * @param ctx - Resolved auth context.
 * @param edgeId - UUID of the edge to update.
 * @param updates - Fields to update.
 * @returns The updated edge.
 * @throws Error if edge not found or validation fails.
 */
export async function updateEdge(
  ctx: AuthContext,
  edgeId: string,
  updates: { edgeType?: EdgeType; note?: string },
) {
  const existing = await loadAuthorizedEdge(edgeId, ctx);

  if (typeof updates.note === "string" && updates.note.trim()) {
    updates = {
      ...updates,
      note: (await formatMarkdown(updates.note)) ?? updates.note,
    };
  }

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
    if (dup)
      throw new Error(
        "Duplicate edge: an edge with this type already exists between these tasks.",
      );

    if (updates.edgeType === "depends_on") {
      const chain = await getDependencyChain(existing.targetTaskId);
      if (chain.some((node) => node.id === existing.sourceTaskId)) {
        throw new Error(
          "Circular dependency: changing this edge type would create a cycle.",
        );
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
    description: `Edge updated${updates.edgeType ? ` to ${updates.edgeType}` : ""}${
      updates.note !== undefined ? " with new note" : ""
    }.`,
    actor: "ai",
  });

  await Promise.all([
    appendTaskHistory(existing.sourceTaskId, historyEntry),
    appendTaskHistory(existing.targetTaskId, historyEntry),
  ]);

  notifyChange();
  return {
    id: updated.id,
    sourceTaskId: updated.sourceTaskId,
    targetTaskId: updated.targetTaskId,
    edgeType: updated.edgeType,
    note: updated.note,
  };
}

/**
 * Remove an edge by ID and append history to both tasks.
 * @param ctx - Resolved auth context.
 * @param edgeId - UUID of the edge to delete.
 */
export async function removeEdge(ctx: AuthContext, edgeId: string) {
  const edge = await loadAuthorizedEdge(edgeId, ctx);

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

// ---------------------------------------------------------------------------
// Reorder task
// ---------------------------------------------------------------------------

/**
 * Update a task's order and shift siblings to make room.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task to reorder.
 * @param newOrder - The desired order position.
 * @returns The updated task row.
 */
export async function reorderTask(
  ctx: AuthContext,
  taskId: string,
  newOrder: number,
) {
  await assertTaskAccess(taskId, ctx);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
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
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @param oldName - Current category name.
 * @param newName - New category name.
 */
export async function renameCategory(
  ctx: AuthContext,
  projectId: string,
  oldName: string,
  newName: string,
) {
  await assertProjectAccess(projectId, ctx);

  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ categories: projects.categories })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new ProjectNotFoundError(projectId);

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
      .where(
        and(eq(tasks.projectId, projectId), eq(tasks.category, oldName)),
      );
  });
  notifyChange();
}

/**
 * Delete a project category and uncategorize all tasks in it.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @param categoryName - Category to remove.
 */
export async function deleteCategory(
  ctx: AuthContext,
  projectId: string,
  categoryName: string,
) {
  await assertProjectAccess(projectId, ctx);

  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ categories: projects.categories })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new ProjectNotFoundError(projectId);

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
