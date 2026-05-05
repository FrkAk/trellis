import "server-only";

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
import { member, organization } from "@/lib/db/auth-schema";
import type {
  Decision,
  EdgeType,
  HistoryEntry,
  TaskStatus,
} from "@/lib/types";
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
  MultiTeamAmbiguityError,
  NoTeamMembershipError,
  ProjectNotFoundError,
  type TeamOption,
} from "@/lib/graph/errors";
import {
  formatMarkdown,
  formatTaskMarkdownFields,
} from "@/lib/markdown/format";
import type { AuthContext } from "@/lib/auth/context";
import {
  ForbiddenError,
  InsufficientRoleError,
  assertProjectAccess,
  assertTaskAccess,
  isUuid,
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
 * Input for createProject — identifier optional. `organizationId` is
 * optional only when the caller is a member of exactly one team. Multi-team
 * callers must name the target explicitly; see {@link createProject}.
 */
export type CreateProjectInput = Omit<
  NewProject,
  "id" | "identifier" | "organizationId"
> & {
  identifier?: Identifier;
  /**
   * Target team. Required when the caller is a member of more than one
   * team. Membership in the supplied team is verified before insert.
   */
  organizationId?: string;
};

/**
 * Advisory-lock key serializing identifier auto-derivation across concurrent
 * creates within a single organization. Identifiers are unique per-org, so
 * scoping the lock per-org lets two teams allocate identifiers in parallel.
 * @param organizationId - UUID of the organization the lock is scoped to.
 */
function identifierLockKey(organizationId: string) {
  return sql`hashtext(${`mymir:project-identifier:${organizationId}`})`;
}

/**
 * Pick an identifier that's not already taken within an organization,
 * auto-suffixing on collision. Identifiers are unique per organization
 * (composite constraint `projects_org_identifier_unique`), so the scan
 * is scoped to the supplied team — two teams can independently use the
 * same prefix.
 *
 * Must be called inside a transaction holding the identifier advisory
 * lock; otherwise the select-then-insert window is racy.
 *
 * @param tx - Drizzle transaction handle.
 * @param organizationId - UUID of the organization the project belongs to.
 * @param base - Starting identifier (e.g. derived from title).
 * @returns Unique identifier within the organization.
 * @throws If no unique variant found within 1000 attempts.
 */
async function pickAvailableIdentifier(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  base: Identifier,
): Promise<Identifier> {
  const existing = await tx
    .select({ identifier: projects.identifier })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
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
 * Resolve the destination team for a `createProject` call.
 *
 * Resolution rules — every path enforces a fresh membership check, so a
 * stale token cannot write into a team the user has been removed from:
 *
 * 1. `data.organizationId` provided → membership-checked; on miss raise
 *    `ForbiddenError`.
 * 2. Omitted + caller has exactly one membership → use that team.
 * 3. Omitted + caller has multiple memberships → raise
 *    {@link MultiTeamAmbiguityError} carrying the team list so the
 *    tool-handler can surface the choice to the agent.
 * 4. Omitted + caller has zero memberships → raise
 *    {@link NoTeamMembershipError}.
 *
 * @param ctx - Resolved auth context.
 * @param requested - Optional explicit `organizationId` from the caller.
 * @returns Verified destination team UUID.
 */
async function resolveTargetOrgId(
  ctx: AuthContext,
  requested: string | undefined,
): Promise<string> {
  if (requested !== undefined) {
    if (!isUuid(requested)) {
      throw new ForbiddenError("Forbidden", "team", requested);
    }
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.userId, ctx.userId), eq(member.organizationId, requested)),
      )
      .limit(1);
    if (!row) throw new ForbiddenError("Forbidden", "team", requested);
    return requested;
  }

  const memberships = await db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, ctx.userId));

  if (memberships.length === 0) throw new NoTeamMembershipError();
  if (memberships.length === 1) return memberships[0].id;
  const teams: TeamOption[] = memberships.map((m) => ({ id: m.id, name: m.name }));
  throw new MultiTeamAmbiguityError(teams);
}

/**
 * Insert a new project. Destination resolution is handled by
 * {@link resolveTargetOrgId} (always membership-checked).
 *
 * If `identifier` is omitted, it is derived from the title and auto-suffixed
 * on collision under a transaction-scoped advisory lock keyed on the target
 * team. If provided, collision surfaces the DB unique-violation error.
 *
 * @param ctx - Resolved auth context.
 * @param data - Project fields. `identifier` optional. `organizationId`
 *   required when the caller is a member of more than one team.
 * @returns The created project row.
 * @throws ForbiddenError when `data.organizationId` is supplied but the
 *   caller is not a member of that team.
 * @throws MultiTeamAmbiguityError when omitted and the caller is in >1 team.
 * @throws NoTeamMembershipError when omitted and the caller has no teams.
 */
export async function createProject(
  ctx: AuthContext,
  data: CreateProjectInput,
) {
  const targetOrgId = await resolveTargetOrgId(ctx, data.organizationId);

  if (typeof data.description === "string" && data.description.trim()) {
    data = {
      ...data,
      description: (await formatMarkdown(data.description)) ?? data.description,
    };
  }
  const project = await db.transaction(async (tx) => {
    let identifier = data.identifier;
    if (identifier === undefined) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${identifierLockKey(targetOrgId)})`,
      );
      identifier = await pickAvailableIdentifier(
        tx,
        targetOrgId,
        deriveIdentifier(data.title),
      );
    }

    const [row] = await tx
      .insert(projects)
      .values({
        ...data,
        identifier,
        organizationId: targetOrgId,
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

/** Fields an `updateProject` caller is allowed to change. `identifier`
 * is intentionally excluded — renames must go through
 * {@link renameProjectIdentifier} so they hold the per-org advisory lock. */
export type ProjectUpdate = Partial<
  Pick<
    typeof projects.$inferInsert,
    "title" | "description" | "status" | "categories"
  >
>;

/** Fields callers must not change via `updateProject` — managed internally
 * (history, timestamps, id), tenant-scoped (organizationId), or gated by a
 * separate API (identifier → renameProjectIdentifier). Stripped at runtime
 * from the input object before the spread to defeat mass-assignment via
 * untyped or `as any` callers. */
const PROTECTED_PROJECT_FIELDS = [
  "id",
  "organizationId",
  "identifier",
  "history",
  "createdAt",
  "updatedAt",
] as const;

/**
 * Update a project's fields. Intentionally NOT role-gated for the
 * member-editable subset (title, description, categories, status); only
 * `delete` and identifier `rename` require admin/owner, and those gates
 * live on {@link deleteProject} and {@link renameProjectIdentifier}.
 *
 * Defense in depth: the {@link ProjectUpdate} type erases at runtime, so
 * this function additionally rejects `changes.identifier` with
 * {@link InsufficientRoleError} (callers must use
 * {@link renameProjectIdentifier}) and strips every key in
 * {@link PROTECTED_PROJECT_FIELDS} before forwarding to Drizzle.
 *
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @param changes - Typed subset of project fields to update.
 * @returns The updated project row.
 * @throws {InsufficientRoleError} If `changes.identifier` is set.
 */
export async function updateProject(
  ctx: AuthContext,
  projectId: string,
  changes: ProjectUpdate,
) {
  await assertProjectAccess(projectId, ctx);

  const incoming = changes as Record<string, unknown>;
  if (incoming.identifier !== undefined) {
    throw new InsufficientRoleError(["rename"], "project", projectId);
  }
  const safe: Record<string, unknown> = { ...incoming };
  for (const key of PROTECTED_PROJECT_FIELDS) {
    if (key in safe) delete safe[key];
  }

  if (typeof safe.description === "string" && safe.description.trim()) {
    const formatted = await formatMarkdown(safe.description);
    safe.description = formatted ?? safe.description;
  }
  const [updated] = await db
    .update(projects)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  notifyChange();
  return updated;
}

/**
 * Delete a project and all its children (cascade via DB foreign keys).
 * Requires the caller's active-org role to grant `project:delete` (admin or
 * owner); plain members trigger {@link InsufficientRoleError}.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project to delete.
 */
export async function deleteProject(ctx: AuthContext, projectId: string) {
  await assertProjectAccess(projectId, ctx, { project: ["delete"] });
  await db.delete(projects).where(eq(projects.id, projectId));
  notifyChange();
}

/**
 * Rename a project's identifier under the per-org identifier advisory lock.
 *
 * Holding the org-scoped lock serializes this rename with concurrent
 * `createProject` auto-suffix allocation in the same org, closing the
 * select-then-insert window. The composite unique constraint
 * `projects_org_identifier_unique` still surfaces a `23505` if the target
 * is already taken inside this org by a project outside the lock-protected
 * critical section (e.g. a direct SQL rename).
 *
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
  const { project } = await assertProjectAccess(projectId, ctx, {
    project: ["rename"],
  });

  const updated = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${identifierLockKey(project.organizationId)})`,
    );
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
 * Insert a new task under a project the caller has access to. The
 * project's team scope is verified by `assertProjectAccess` and inherited
 * by the new task — task team scope is never derived from the session.
 *
 * Uses a transaction-scoped PostgreSQL advisory lock keyed on the project UUID
 * to serialize concurrent task creation and prevent sequence_number collisions.
 * Computes order (append-to-end when unset) and sequenceNumber inside the lock.
 *
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

/** Fields callers must not change via updateTask — managed internally or set on create. */
const PROTECTED_TASK_FIELDS = [
  "id",
  "projectId",
  "sequenceNumber",
  "history",
  "createdAt",
  "updatedAt",
] as const;

/**
 * Whitelist of fields callers may pass to {@link updateTask}. The strict type
 * prevents typed callers from supplying protected fields at compile time;
 * the runtime PROTECTED_TASK_FIELDS strip below is a belt-and-suspenders
 * defense against callers using `as any` or routing through `Record<string,
 * unknown>`.
 *
 * `decisions` and `acceptanceCriteria` are typed `unknown[]` because the
 * normalization below accepts strings or partial objects and shapes them
 * into the canonical {@link Decision}/{@link AcceptanceCriterion} forms.
 */
export type TaskUpdate = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  category?: string | null;
  order?: number;
  executionRecord?: string | null;
  implementationPlan?: string | null;
  tags?: string[];
  files?: string[];
  decisions?: unknown[];
  acceptanceCriteria?: unknown[];
};

/**
 * Update a task and append a history entry. Protected fields (id, projectId,
 * sequenceNumber, history, createdAt, updatedAt) are stripped before the
 * write so a malformed input cannot reassign a task across projects or
 * forge timestamps.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task to update.
 * @param input - Partial fields to update.
 * @param overwriteArrays - When true, replace array fields instead of appending.
 * @returns The updated row.
 */
export async function updateTask(
  ctx: AuthContext,
  taskId: string,
  input: TaskUpdate,
  overwriteArrays = false,
) {
  const current = await assertTaskAccess(taskId, ctx);

  let changes: Record<string, unknown> = { ...input };
  for (const key of PROTECTED_TASK_FIELDS) {
    if (key in changes) delete changes[key];
  }

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

  if (!overwriteArrays) {
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
    "status" in changes && current.status !== changes.status;
  const entry = makeHistoryEntry({
    type: isStatusChange ? "status_change" : "refined",
    label: isStatusChange
      ? `Status: ${current.status} → ${changes.status}`
      : "Task updated",
    description: `Updated task fields: ${Object.keys(changes).join(", ")}.`,
    actor: "ai",
  });

  const existingHistory = current.history;

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
  const task = await assertTaskAccess(taskId, ctx);

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

  const [sourceTask, targetTask] = await Promise.all([
    assertTaskAccess(data.sourceTaskId, ctx),
    assertTaskAccess(data.targetTaskId, ctx),
  ]);

  if (sourceTask.projectId !== targetTask.projectId) {
    throw new Error("Cannot create edge between tasks in different projects.");
  }

  if (typeof data.note === "string" && data.note.trim()) {
    data = { ...data, note: (await formatMarkdown(data.note)) ?? data.note };
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
    const chain = await getDependencyChain(
      data.targetTaskId,
      targetTask.projectId,
    );
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
 * via the parent project. Both the missing-edge case and a cross-team task
 * surface as a `ForbiddenError` tagged with `resource: "edge"` so the tool
 * layer can render an edge-specific recovery hint without re-querying.
 * @param edgeId - UUID of the edge.
 * @param ctx - Resolved auth context.
 * @returns The edge row.
 */
async function loadAuthorizedEdge(edgeId: string, ctx: AuthContext) {
  if (!isUuid(edgeId)) {
    throw new ForbiddenError("Forbidden", "edge", edgeId);
  }
  const [edge] = await db
    .select()
    .from(taskEdges)
    .where(eq(taskEdges.id, edgeId));
  if (!edge) throw new ForbiddenError("Forbidden", "edge", edgeId);
  try {
    await assertTaskAccess(edge.sourceTaskId, ctx);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      throw new ForbiddenError("Forbidden", "edge", edgeId);
    }
    throw err;
  }
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
      const targetTask = await assertTaskAccess(existing.targetTaskId, ctx);
      const chain = await getDependencyChain(
        existing.targetTaskId,
        targetTask.projectId,
      );
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
  const task = await assertTaskAccess(taskId, ctx);

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
