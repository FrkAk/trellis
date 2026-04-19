"use server";

import { eq, asc, sql, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks, taskEdges } from "@/lib/db/schema";
import type { EdgeType } from "@/lib/types";
import { asIdentifier, composeTaskRef, enrichWithTaskRef } from "@/lib/graph/identifier";
import { getProjectTags } from "@/lib/graph/queries";
import { compress } from "./format";

/** Task summary within a project overview. */
type TaskSummary = {
  id: string;
  taskRef: string;
  title: string;
  status: string;
  description: string;
  order: number;
  tags: string[];
  category: string | null;
};

/** Edge summary for project overview. */
type OverviewEdge = {
  sourceTaskRef: string;
  sourceTitle: string;
  targetTaskRef: string;
  targetTitle: string;
  edgeType: EdgeType;
  note: string;
};

/** Full project overview with progress stats. */
export type ProjectOverview = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  categories: string[];
  tagVocabulary: string[];
  tasks: TaskSummary[];
  edges: OverviewEdge[];
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  progress: number;
};

/**
 * Build a full project overview with flat task list, edges, and progress.
 * @param projectId - UUID of the project.
 * @returns ProjectOverview or undefined if project not found.
 */
export async function buildProjectOverview(
  projectId: string,
): Promise<ProjectOverview | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return undefined;

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.order));

  const projectTags = await getProjectTags(projectId);

  const identifier = asIdentifier(project.identifier);
  const taskSummaries: TaskSummary[] = enrichWithTaskRef(allTasks, identifier).map((t) => ({
    id: t.id,
    taskRef: t.taskRef,
    title: t.title,
    status: t.status,
    description: compress(t.description, 100),
    order: t.order,
    tags: t.tags,
    category: t.category,
  }));

  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").length;

  const taskIds = allTasks.map((t) => t.id);
  let edges: OverviewEdge[] = [];

  if (taskIds.length > 0) {
    const infoMap = new Map<string, { taskRef: string; title: string }>();
    for (const t of allTasks) {
      infoMap.set(t.id, {
        taskRef: composeTaskRef(identifier, t.sequenceNumber),
        title: t.title,
      });
    }

    const rawEdges = await db
      .select()
      .from(taskEdges)
      .where(
        or(
          sql`${taskEdges.sourceTaskId} IN ${taskIds}`,
          sql`${taskEdges.targetTaskId} IN ${taskIds}`,
        ),
      );

    edges = rawEdges.map((e) => {
      const source = infoMap.get(e.sourceTaskId);
      const target = infoMap.get(e.targetTaskId);
      return {
        sourceTaskRef: source?.taskRef ?? "",
        sourceTitle: source?.title ?? "Unknown",
        targetTaskRef: target?.taskRef ?? "",
        targetTitle: target?.title ?? "Unknown",
        edgeType: e.edgeType,
        note: e.note,
      };
    });
  }

  return {
    id: project.id,
    identifier: project.identifier,
    title: project.title,
    description: project.description,
    status: project.status,
    categories: project.categories,
    tagVocabulary: projectTags.map((t) => t.tag),
    tasks: taskSummaries,
    edges,
    totalTasks,
    doneTasks,
    inProgressTasks,
    progress: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
  };
}
