import "server-only";

import { eq, or, and, asc, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks, taskEdges } from "@/lib/db/schema";
import { member } from "@/lib/db/auth-schema";
import type { EdgeType } from "@/lib/types";
import {
  asIdentifier,
  composeTaskRef,
  enrichWithTaskRef,
} from "@/lib/graph/identifier";
import { buildEffectiveDepGraph } from "@/lib/graph/effective-deps";
import { normalizeTags } from "@/lib/graph/tag-similarity";
import type { AuthContext } from "@/lib/auth/context";
import {
  assertProjectAccess,
  assertTaskAccess,
} from "@/lib/auth/authorization";

// ---------------------------------------------------------------------------
// Single-entity queries
// ---------------------------------------------------------------------------

/**
 * Fetch a full task row by ID, scoped to the caller's active team.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task.
 * @returns The full task row.
 * @throws ForbiddenError when the task is not in the active team.
 */
export async function fetchTask(ctx: AuthContext, taskId: string) {
  return assertTaskAccess(taskId, ctx);
}

/**
 * Look up an edge by (source, target, type) when the caller can access
 * both endpoints. Returns the row, or null when no such edge exists.
 * @param ctx - Resolved auth context.
 * @param sourceTaskId - UUID of the source task.
 * @param targetTaskId - UUID of the target task.
 * @param edgeType - Edge relationship type.
 * @throws ForbiddenError when either endpoint is cross-team.
 */
export async function findEdgeByNodes(
  ctx: AuthContext,
  sourceTaskId: string,
  targetTaskId: string,
  edgeType: EdgeType,
) {
  await assertTaskAccess(sourceTaskId, ctx);
  await assertTaskAccess(targetTaskId, ctx);
  const [row] = await db
    .select()
    .from(taskEdges)
    .where(
      and(
        eq(taskEdges.sourceTaskId, sourceTaskId),
        eq(taskEdges.targetTaskId, targetTaskId),
        eq(taskEdges.edgeType, edgeType),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Fetch a project with its tasks and edges, scoped to the active team.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @returns Project with flat tasks and edges, or undefined.
 * @throws ForbiddenError when the project is cross-team.
 */
export async function getProject(ctx: AuthContext, projectId: string) {
  const project = await assertProjectAccess(projectId, ctx);

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
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @returns Ordered array of tasks.
 */
export async function getProjectTasks(ctx: AuthContext, projectId: string) {
  await assertProjectAccess(projectId, ctx);
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));
}

/** Slim task representation for project listings. */
export type TaskSlim = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  tags: string[];
  category: string | null;
  order: number;
};

/**
 * Fetch slim task list for a project (id, title, status, tags, order only).
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @returns Ordered array of slim tasks with composed taskRef.
 */
export async function getProjectTasksSlim(
  ctx: AuthContext,
  projectId: string,
): Promise<TaskSlim[]> {
  const project = await assertProjectAccess(projectId, ctx);

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      category: tasks.category,
      order: tasks.order,
      sequenceNumber: tasks.sequenceNumber,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));

  return enrichWithTaskRef(rows, asIdentifier(project.identifier)).map((t) => ({
    id: t.id,
    taskRef: t.taskRef,
    title: t.title,
    status: t.status,
    tags: t.tags,
    category: t.category,
    order: t.order,
  }));
}

// ---------------------------------------------------------------------------
// Tag aggregation
// ---------------------------------------------------------------------------

/** Project tag with usage count. */
export type ProjectTag = { tag: string; count: number };

/**
 * Aggregate distinct tags for a project with usage counts.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @returns Tags sorted by count desc, tie-broken alphabetically.
 */
export async function getProjectTags(
  ctx: AuthContext,
  projectId: string,
): Promise<ProjectTag[]> {
  await assertProjectAccess(projectId, ctx);
  const rows = await db.execute(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM ${tasks}, LATERAL jsonb_array_elements_text(${tasks.tags}) AS tag
    WHERE ${tasks.projectId} = ${projectId}
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);
  return (rows as unknown as { tag: string; count: number }[]).map((r) => ({
    tag: r.tag,
    count: Number(r.count),
  }));
}

// ---------------------------------------------------------------------------
// Edge queries
// ---------------------------------------------------------------------------

/**
 * Fetch all edges where a task is source or target.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task.
 * @returns Array of edges.
 */
export async function getTaskEdges(ctx: AuthContext, taskId: string) {
  await assertTaskAccess(taskId, ctx);
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
 * Fetch all projects in the caller's active team, with task progress stats.
 * Filters via JOIN through `member` so users only see projects of orgs they
 * belong to AND that match the active team.
 * @param ctx - Resolved auth context.
 * @returns Array of projects with task counts and progress.
 */
export async function getProjectList(ctx: AuthContext) {
  const allProjects = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      title: projects.title,
      identifier: projects.identifier,
      description: projects.description,
      status: projects.status,
      categories: projects.categories,
      history: projects.history,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.organizationId),
        eq(member.userId, ctx.userId),
      ),
    )
    .where(eq(projects.organizationId, ctx.activeOrgId))
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

    const cancelled = projTasks.filter((t) => t.status === "cancelled").length;
    const taskStats = {
      total: projTasks.length,
      done: projTasks.filter((t) => t.status === "done").length,
      inProgress: projTasks.filter((t) => t.status === "in_progress").length,
      cancelled,
    };
    const denominator = taskStats.total - cancelled;

    return {
      ...project,
      taskStats,
      progress:
        denominator > 0
          ? Math.round((taskStats.done / denominator) * 100)
          : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Task state derivation
// ---------------------------------------------------------------------------

/** Derived task state based on status + dependency readiness. */
export type TaskState =
  | "done"
  | "cancelled"
  | "in_progress"
  | "ready"
  | "plannable"
  | "blocked"
  | "draft";

/**
 * Derive the actionable state for a single task using effective deps.
 *
 * Cancelled tasks short-circuit. For active tasks, dep readiness is checked
 * against the *effective* dependency set — cancelled middles are walked
 * through, and the wall is the next active prerequisite.
 *
 * @param task - Task with status, description, and acceptanceCriteria.
 * @param graph - Effective dependency graph for the project.
 * @returns Derived TaskState.
 */
function deriveTaskState(
  task: {
    id: string;
    status: string;
    description: string;
    acceptanceCriteria: unknown;
  },
  graph: {
    activeTasks: Map<string, { status: string }>;
    effectiveDeps: Map<string, Set<string>>;
  },
): TaskState {
  if (task.status === "done") return "done";
  if (task.status === "cancelled") return "cancelled";
  if (task.status === "in_progress") return "in_progress";

  const deps = graph.effectiveDeps.get(task.id) ?? new Set<string>();
  let allDepsDone = true;
  for (const depId of deps) {
    if (graph.activeTasks.get(depId)?.status !== "done") {
      allDepsDone = false;
      break;
    }
  }

  if (task.status === "planned") {
    return allDepsDone ? "ready" : "blocked";
  }

  if (!allDepsDone) return "blocked";

  const hasDescription = task.description.trim().length > 0;
  const criteria = task.acceptanceCriteria as
    | { id: string; text: string; checked: boolean }[]
    | null;
  const hasCriteria = Array.isArray(criteria) && criteria.length > 0;

  return hasDescription && hasCriteria ? "plannable" : "draft";
}

/**
 * Derive states for a batch of tasks in one project. Internal helper —
 * caller is responsible for asserting project access first.
 *
 * Builds the effective dependency graph once and reuses it for every task in
 * the subset, so dep readiness reflects transitive blocking through cancelled
 * middles rather than just direct edges.
 *
 * @param projectId - UUID of the project.
 * @param taskSubset - Tasks to derive states for.
 * @returns Map of taskId → TaskState.
 */
export async function deriveTaskStates(
  projectId: string,
  taskSubset: {
    id: string;
    status: string;
    description: string;
    acceptanceCriteria: unknown;
  }[],
): Promise<Map<string, TaskState>> {
  const graph = await buildEffectiveDepGraph(projectId);
  const result = new Map<string, TaskState>();
  for (const task of taskSubset) {
    result.set(task.id, deriveTaskState(task, graph));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** A search result task. */
export type SearchResult = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  state: TaskState;
  tags: string[];
  category: string | null;
};

/** Match a full taskRef like "MYMR-83" (case-insensitive). */
const TASK_REF_PATTERN = /^([A-Z0-9]+)-(\d+)$/i;

/**
 * Search tasks by taskRef, title, or tags within a project.
 * @param ctx - Resolved auth context.
 * @param projectId - UUID of the project.
 * @param query - Optional search string.
 * @param tags - Optional exact tag filter (OR-within).
 * @returns Up to 20 matching tasks with derived state.
 */
export async function searchTasks(
  ctx: AuthContext,
  projectId: string,
  query?: string,
  tags?: string[],
): Promise<SearchResult[]> {
  const project = await assertProjectAccess(projectId, ctx);

  const trimmedQuery = query?.trim() ?? "";
  const tagFilter = normalizeTags(tags);
  if (trimmedQuery.length === 0 && tagFilter.length === 0) return [];

  const clauses = [eq(tasks.projectId, projectId)];

  if (trimmedQuery.length > 0) {
    const refMatch = trimmedQuery.match(TASK_REF_PATTERN);
    const seqClause =
      refMatch && refMatch[1].toUpperCase() === project.identifier
        ? eq(tasks.sequenceNumber, Number(refMatch[2]))
        : null;

    const pattern = `%${trimmedQuery}%`;
    const tagSubstring = sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${tasks.tags}) AS t WHERE t ILIKE ${pattern})`;
    const queryClause =
      seqClause ?? or(ilike(tasks.title, pattern), tagSubstring);
    if (queryClause) clauses.push(queryClause);
  }

  if (tagFilter.length > 0) {
    clauses.push(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${tasks.tags}) AS t WHERE t IN ${tagFilter})`,
    );
  }

  const matchingTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      category: tasks.category,
      description: tasks.description,
      acceptanceCriteria: tasks.acceptanceCriteria,
      sequenceNumber: tasks.sequenceNumber,
      order: tasks.order,
    })
    .from(tasks)
    .where(and(...clauses));

  if (trimmedQuery.length > 0) {
    const lower = trimmedQuery.toLowerCase();
    matchingTasks.sort((a, b) => {
      const aLower = a.title.toLowerCase();
      const bLower = b.title.toLowerCase();
      const aTitle =
        aLower === lower
          ? 0
          : aLower.startsWith(lower)
            ? 1
            : aLower.includes(lower)
              ? 2
              : 3;
      const bTitle =
        bLower === lower
          ? 0
          : bLower.startsWith(lower)
            ? 1
            : bLower.includes(lower)
              ? 2
              : 3;
      return aTitle - bTitle;
    });
  } else {
    matchingTasks.sort((a, b) => a.order - b.order);
  }

  const trimmed = matchingTasks.slice(0, 20);
  const stateMap = await deriveTaskStates(projectId, trimmed);

  const identifier = asIdentifier(project.identifier);
  return enrichWithTaskRef(trimmed, identifier).map((t) => ({
    id: t.id,
    taskRef: t.taskRef,
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
export type DetailedEdge = {
  edgeId: string;
  edgeType: EdgeType;
  direction: "outgoing" | "incoming";
  note: string;
  connectedTask: {
    id: string;
    taskRef: string;
    title: string;
    status: string;
  };
};

/**
 * Fetch all edges on a task with connected task titles and statuses.
 * @param ctx - Resolved auth context.
 * @param taskId - UUID of the task.
 * @returns Array of detailed edges.
 */
export async function getTaskEdgesDetailed(
  ctx: AuthContext,
  taskId: string,
): Promise<DetailedEdge[]> {
  await assertTaskAccess(taskId, ctx);

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

  const taskInfoMap = new Map<
    string,
    { taskRef: string; title: string; status: string }
  >();

  if (idsToFetch.size > 0) {
    const ids = [...idsToFetch];
    const taskRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        sequenceNumber: tasks.sequenceNumber,
        identifier: projects.identifier,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(sql`${tasks.id} IN ${ids}`);
    for (const t of taskRows) {
      taskInfoMap.set(t.id, {
        taskRef: composeTaskRef(asIdentifier(t.identifier), t.sequenceNumber),
        title: t.title,
        status: t.status,
      });
    }
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
// Edge notes — internal helpers (caller asserted access already)
// ---------------------------------------------------------------------------

/**
 * Fetch edge notes for outgoing depends_on edges from a task. Internal —
 * caller must assert task access before invoking. The `projectId` filter
 * guarantees the connected (target) task is in the same project, so a
 * stale or hand-crafted edge to a task in another project cannot leak a
 * note into context output.
 * @param projectId - UUID of the project the source task belongs to.
 * @param taskId - UUID of the source task.
 * @returns Map of target task ID to edge note.
 */
export async function fetchEdgeNotesBySource(
  projectId: string,
  taskId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ targetTaskId: taskEdges.targetTaskId, note: taskEdges.note })
    .from(taskEdges)
    .innerJoin(tasks, eq(tasks.id, taskEdges.targetTaskId))
    .where(
      and(
        eq(taskEdges.sourceTaskId, taskId),
        eq(taskEdges.edgeType, "depends_on"),
        eq(tasks.projectId, projectId),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.note) map.set(r.targetTaskId, r.note);
  }
  return map;
}

/**
 * Fetch edge notes for incoming depends_on edges to a task. Internal —
 * caller must assert task access before invoking. See `fetchEdgeNotesBySource`
 * for the projectId-filter rationale.
 * @param projectId - UUID of the project the target task belongs to.
 * @param taskId - UUID of the target task.
 * @returns Map of source task ID to edge note.
 */
export async function fetchEdgeNotesByTarget(
  projectId: string,
  taskId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ sourceTaskId: taskEdges.sourceTaskId, note: taskEdges.note })
    .from(taskEdges)
    .innerJoin(tasks, eq(tasks.id, taskEdges.sourceTaskId))
    .where(
      and(
        eq(taskEdges.targetTaskId, taskId),
        eq(taskEdges.edgeType, "depends_on"),
        eq(tasks.projectId, projectId),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.note) map.set(r.sourceTaskId, r.note);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Batch task summaries — internal helper
// ---------------------------------------------------------------------------

/**
 * Fetch taskRef, title, status, and description for multiple tasks by ID.
 * Internal — caller must have already asserted access on the originating task.
 * The `projectId` filter is defense in depth: if a future caller passes an
 * id list that crosses projects, the SQL ignores out-of-project rows.
 * @param projectId - UUID of the project the tasks belong to.
 * @param taskIds - Array of task UUIDs.
 * @returns Array of task summaries with composed taskRef.
 */
export async function fetchTaskSummaries(
  projectId: string,
  taskIds: string[],
) {
  if (taskIds.length === 0) return [];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      description: tasks.description,
      sequenceNumber: tasks.sequenceNumber,
      identifier: projects.identifier,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(eq(tasks.projectId, projectId), sql`${tasks.id} IN ${taskIds}`),
    );
  return rows.map((r) => ({
    id: r.id,
    taskRef: composeTaskRef(asIdentifier(r.identifier), r.sequenceNumber),
    title: r.title,
    status: r.status,
    description: r.description,
  }));
}
