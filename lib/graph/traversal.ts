"use server";

import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tasks,
  projects,
  taskEdges,
} from "@/lib/db/schema";
import { asIdentifier, composeTaskRef, type Identifier } from "./identifier";

/**
 * Fetch a project's identifier prefix for composing taskRefs.
 *
 * @param projectId - UUID of the project.
 * @returns Identifier string, or null if project not found.
 */
async function getProjectIdentifier(projectId: string): Promise<Identifier | null> {
  const [row] = await db
    .select({ identifier: projects.identifier })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row ? asIdentifier(row.identifier) : null;
}

// ---------------------------------------------------------------------------
// Ancestor traversal
// ---------------------------------------------------------------------------

/** Ancestor node (always the project for a task). */
type Ancestor = { id: string; type: "project"; title: string };

/**
 * Get the parent project for a task.
 * @param taskId - UUID of the task.
 * @returns Array with the project ancestor, or empty if not found.
 */
export async function getAncestors(taskId: string): Promise<Ancestor[]> {
  const [task] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) return [];

  const [project] = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  if (!project) return [];

  return [{ id: project.id, type: "project", title: project.title }];
}

// ---------------------------------------------------------------------------
// Dependency chain (recursive CTE)
// ---------------------------------------------------------------------------

/** A task in a dependency chain with depth. */
type DependencyNode = {
  id: string;
  depth: number;
};

/**
 * Follow `depends_on` edges recursively up to maxDepth.
 * @param taskId - UUID of the starting task.
 * @param maxDepth - Maximum traversal depth (default 10).
 * @returns Array of dependency tasks with depth.
 */
export async function getDependencyChain(
  taskId: string,
  maxDepth = 10,
): Promise<DependencyNode[]> {
  const rows = await db.execute<{
    id: string;
    depth: number;
  }>(sql`
    WITH RECURSIVE dep_chain AS (
      SELECT
        ${taskEdges.targetTaskId} AS id,
        1 AS depth
      FROM ${taskEdges}
      WHERE ${taskEdges.sourceTaskId} = ${taskId}
        AND ${taskEdges.edgeType} = 'depends_on'

      UNION ALL

      SELECT
        e.target_task_id AS id,
        dc.depth + 1 AS depth
      FROM ${taskEdges} e
      INNER JOIN dep_chain dc ON e.source_task_id = dc.id
      WHERE e.edge_type = 'depends_on'
        AND dc.depth < ${maxDepth}
    )
    SELECT DISTINCT id, MIN(depth) AS depth
    FROM dep_chain
    GROUP BY id
    ORDER BY depth ASC
  `);

  return (rows as unknown as { id: string; depth: number }[]).map((row) => ({
    id: row.id,
    depth: Number(row.depth),
  }));
}

// ---------------------------------------------------------------------------
// Connected tasks (1-hop neighbors)
// ---------------------------------------------------------------------------

/** A 1-hop neighbor connected via an edge. */
type ConnectedTask = {
  id: string;
  edgeType: string;
  direction: "outgoing" | "incoming";
};

/**
 * Fetch all tasks connected by exactly one edge hop.
 * @param taskId - UUID of the task.
 * @returns Array of connected tasks with edge info.
 */
export async function getConnectedTasks(
  taskId: string,
): Promise<ConnectedTask[]> {
  const outgoing = await db
    .select({
      id: taskEdges.targetTaskId,
      edgeType: taskEdges.edgeType,
    })
    .from(taskEdges)
    .where(eq(taskEdges.sourceTaskId, taskId));

  const incoming = await db
    .select({
      id: taskEdges.sourceTaskId,
      edgeType: taskEdges.edgeType,
    })
    .from(taskEdges)
    .where(eq(taskEdges.targetTaskId, taskId));

  return [
    ...outgoing.map((e) => ({
      id: e.id,
      edgeType: e.edgeType as string,
      direction: "outgoing" as const,
    })),
    ...incoming.map((e) => ({
      id: e.id,
      edgeType: e.edgeType as string,
      direction: "incoming" as const,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Downstream (reverse dependency chain)
// ---------------------------------------------------------------------------

/** A task in a downstream chain with depth. */
export type DownstreamNode = {
  id: string;
  taskRef: string;
  title: string;
  depth: number;
};

/**
 * Follow `depends_on` edges in reverse: find tasks that depend on this task.
 * Edges are project-scoped so all downstream tasks share the root task's project.
 *
 * @param taskId - UUID of the starting task.
 * @param maxDepth - Maximum traversal depth (default 10).
 * @returns Array of downstream tasks with depth.
 */
export async function getDownstream(
  taskId: string,
  maxDepth = 10,
): Promise<DownstreamNode[]> {
  const rows = await db.execute<{
    id: string;
    depth: number;
  }>(sql`
    WITH RECURSIVE downstream AS (
      SELECT
        ${taskEdges.sourceTaskId} AS id,
        1 AS depth
      FROM ${taskEdges}
      WHERE ${taskEdges.targetTaskId} = ${taskId}
        AND ${taskEdges.edgeType} = 'depends_on'

      UNION ALL

      SELECT
        e.source_task_id AS id,
        ds.depth + 1 AS depth
      FROM ${taskEdges} e
      INNER JOIN downstream ds ON e.target_task_id = ds.id
      WHERE e.edge_type = 'depends_on'
        AND ds.depth < ${maxDepth}
    )
    SELECT DISTINCT id, MIN(depth) AS depth
    FROM downstream
    GROUP BY id
    ORDER BY depth ASC
  `);

  const raw = (rows as unknown as { id: string; depth: number }[]).map((row) => ({
    id: row.id,
    depth: Number(row.depth),
  }));
  if (raw.length === 0) return [];

  const ids = raw.map((r) => r.id);
  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      sequenceNumber: tasks.sequenceNumber,
      identifier: projects.identifier,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(sql`${tasks.id} IN ${ids}`);

  const infoMap = new Map<string, { taskRef: string; title: string }>();
  for (const t of taskRows) {
    infoMap.set(t.id, {
      taskRef: composeTaskRef(asIdentifier(t.identifier), t.sequenceNumber),
      title: t.title,
    });
  }

  return raw.map((r) => {
    const info = infoMap.get(r.id);
    return {
      id: r.id,
      taskRef: info?.taskRef ?? "",
      title: info?.title ?? "",
      depth: r.depth,
    };
  });
}

// ---------------------------------------------------------------------------
// Ready tasks
// ---------------------------------------------------------------------------

/** A task that is ready to be worked on. */
export type ReadyTask = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  tags: string[];
};

/**
 * Find all tasks whose dependencies are fully satisfied.
 * A task is ready when its status is "planned" and all
 * `depends_on` targets have status "done".
 * @param projectId - UUID of the project.
 * @returns Array of ready tasks.
 */
export async function getReadyTasks(
  projectId: string,
): Promise<ReadyTask[]> {
  const identifier = await getProjectIdentifier(projectId);
  if (!identifier) return [];

  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      sequenceNumber: tasks.sequenceNumber,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  if (allTasks.length === 0) return [];

  const taskIds = allTasks.map((t) => t.id);

  const dependsOnEdges = await db
    .select({
      sourceTaskId: taskEdges.sourceTaskId,
      targetTaskId: taskEdges.targetTaskId,
    })
    .from(taskEdges)
    .where(
      and(
        sql`${taskEdges.sourceTaskId} IN ${taskIds}`,
        eq(taskEdges.edgeType, "depends_on"),
      ),
    );

  const statusMap = new Map<string, string>();
  for (const t of allTasks) statusMap.set(t.id, t.status);

  const depsBySource = new Map<string, string[]>();
  for (const edge of dependsOnEdges) {
    const existing = depsBySource.get(edge.sourceTaskId) ?? [];
    existing.push(edge.targetTaskId);
    depsBySource.set(edge.sourceTaskId, existing);
  }

  const isReady = (id: string): boolean => {
    const deps = depsBySource.get(id) ?? [];
    return deps.every((depId) => statusMap.get(depId) === "done");
  };

  const ready: ReadyTask[] = [];
  for (const task of allTasks) {
    if (task.status !== "planned") continue;
    if (!isReady(task.id)) continue;
    ready.push({
      id: task.id,
      taskRef: composeTaskRef(identifier, task.sequenceNumber),
      title: task.title,
      status: task.status,
      tags: task.tags,
    });
  }

  return ready;
}

// ---------------------------------------------------------------------------
// Plannable tasks
// ---------------------------------------------------------------------------

/** A draft task with enough content to be planned. */
export type PlannableTask = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  tags: string[];
};

/**
 * Find draft tasks that have a description and at least one acceptance criterion.
 * These are ready for an agent to write an implementation plan.
 * @param projectId - UUID of the project.
 * @returns Array of plannable tasks.
 */
export async function getPlannableTasks(
  projectId: string,
): Promise<PlannableTask[]> {
  const identifier = await getProjectIdentifier(projectId);
  if (!identifier) return [];

  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      tags: tasks.tags,
      description: tasks.description,
      acceptanceCriteria: tasks.acceptanceCriteria,
      sequenceNumber: tasks.sequenceNumber,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  return allTasks.filter((task) => {
    if (task.status !== "draft") return false;
    if (!task.description || task.description.trim().length === 0) return false;
    const criteria = task.acceptanceCriteria as { id: string; text: string; checked: boolean }[];
    if (!criteria || criteria.length === 0) return false;
    return true;
  }).map((task) => ({
    id: task.id,
    taskRef: composeTaskRef(identifier, task.sequenceNumber),
    title: task.title,
    status: task.status,
    tags: task.tags,
  }));
}

// ---------------------------------------------------------------------------
// Blocked tasks
// ---------------------------------------------------------------------------

/** A task blocked by unsatisfied dependencies. */
export type BlockedTask = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  blockedBy: { id: string; taskRef: string; title: string; status: string }[];
};

/**
 * Find all tasks with at least one non-done dependency.
 * @param projectId - UUID of the project.
 * @returns Array of blocked tasks with their blockers.
 */
export async function getBlockedTasks(
  projectId: string,
): Promise<BlockedTask[]> {
  const identifier = await getProjectIdentifier(projectId);
  if (!identifier) return [];

  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      sequenceNumber: tasks.sequenceNumber,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  if (allTasks.length === 0) return [];

  const taskIds = allTasks.map((t) => t.id);

  const dependsOnEdges = await db
    .select({
      sourceTaskId: taskEdges.sourceTaskId,
      targetTaskId: taskEdges.targetTaskId,
    })
    .from(taskEdges)
    .where(
      and(
        sql`${taskEdges.sourceTaskId} IN ${taskIds}`,
        eq(taskEdges.edgeType, "depends_on"),
      ),
    );

  const taskInfoMap = new Map<string, { taskRef: string; title: string; status: string }>();
  for (const t of allTasks) {
    taskInfoMap.set(t.id, {
      taskRef: composeTaskRef(identifier, t.sequenceNumber),
      title: t.title,
      status: t.status,
    });
  }

  const blockedMap = new Map<string, { id: string; taskRef: string; title: string; status: string }[]>();

  for (const edge of dependsOnEdges) {
    const targetInfo = taskInfoMap.get(edge.targetTaskId);
    const targetStatus = targetInfo?.status ?? "draft";
    if (targetStatus === "done") continue;

    const existing = blockedMap.get(edge.sourceTaskId) ?? [];
    existing.push({
      id: edge.targetTaskId,
      taskRef: targetInfo?.taskRef ?? "",
      title: targetInfo?.title ?? "",
      status: targetStatus,
    });
    blockedMap.set(edge.sourceTaskId, existing);
  }

  const blocked: BlockedTask[] = [];
  for (const [taskId, blockers] of blockedMap) {
    const info = taskInfoMap.get(taskId);
    if (!info) continue;
    blocked.push({
      id: taskId,
      taskRef: info.taskRef,
      title: info.title,
      status: info.status,
      blockedBy: blockers,
    });
  }

  return blocked;
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

/** A task in the critical path. */
export type CriticalPathTask = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
};

/**
 * Find the longest chain of `depends_on` edges across the project.
 * @param projectId - UUID of the project.
 * @returns Ordered array of tasks forming the longest dependency chain.
 */
export async function getCriticalPath(
  projectId: string,
): Promise<CriticalPathTask[]> {
  const identifier = await getProjectIdentifier(projectId);
  if (!identifier) return [];

  const rows = await db.execute<{
    id: string;
    title: string;
    status: string;
    depth: number;
    path: string;
  }>(sql`
    WITH RECURSIVE project_tasks AS (
      SELECT t.id, t.title, t.status
      FROM ${tasks} t
      WHERE t.project_id = ${projectId}
    ),
    roots AS (
      SELECT pt.id, pt.title, pt.status
      FROM project_tasks pt
      WHERE NOT EXISTS (
        SELECT 1 FROM ${taskEdges} e
        WHERE e.source_task_id = pt.id AND e.edge_type = 'depends_on'
      )
    ),
    chains AS (
      SELECT
        r.id, r.title, r.status,
        1 AS depth,
        CAST(r.id AS TEXT) AS path
      FROM roots r

      UNION ALL

      SELECT
        pt.id, pt.title, pt.status,
        c.depth + 1 AS depth,
        c.path || ',' || CAST(pt.id AS TEXT) AS path
      FROM chains c
      INNER JOIN ${taskEdges} e
        ON e.target_task_id = c.id AND e.edge_type = 'depends_on'
      INNER JOIN project_tasks pt ON pt.id = e.source_task_id
      WHERE c.depth < 100
    )
    SELECT id, title, status, depth, path
    FROM chains
    ORDER BY depth DESC
    LIMIT 1
  `);

  const result = rows as unknown as { id: string; title: string; status: string; depth: number; path: string }[];
  if (result.length === 0) return [];

  const longestRow = result[0];
  const pathIds = longestRow.path.split(",");

  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      sequenceNumber: tasks.sequenceNumber,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  const taskMap = new Map<string, CriticalPathTask>();
  for (const t of allTasks) {
    taskMap.set(t.id, {
      id: t.id,
      taskRef: composeTaskRef(identifier, t.sequenceNumber),
      title: t.title,
      status: t.status,
    });
  }

  return pathIds
    .map((id) => taskMap.get(id))
    .filter((n): n is CriticalPathTask => n !== undefined);
}
