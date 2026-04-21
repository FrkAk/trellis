"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, projects } from "@/lib/db/schema";
import { getDependencyChain, getDownstream } from "@/lib/graph/traversal";
import {
  fetchEdgeNotesBySource,
  fetchEdgeNotesByTarget,
  fetchTaskSummaries,
} from "@/lib/graph/queries";
import { asIdentifier, composeTaskRef } from "@/lib/graph/identifier";
import { section, formatCriteria, formatDecisions } from "./format";

/**
 * Build planning-optimized context for a task.
 * Supplies the project-level breadth a planner can't derive from reading code alone:
 * project description, upstream execution records, and downstream task specs.
 * Sections ordered by U-shaped attention. No token budget — all content included as-is.
 * @param taskId - UUID of the task.
 * @returns Formatted planning context string.
 */
export async function buildPlanningContext(taskId: string): Promise<string> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return "# Task not found";

  const [project] = await db
    .select({
      title: projects.title,
      description: projects.description,
      identifier: projects.identifier,
    })
    .from(projects)
    .where(eq(projects.id, task.projectId));

  if (!project) {
    console.error('Task has no joinable project', { taskId: task.id, projectId: task.projectId });
  }
  const tags = (task.tags as string[] | null) ?? [];
  const taskRef = project
    ? composeTaskRef(asIdentifier(project.identifier), task.sequenceNumber)
    : "";

  // --- START: highest recall zone (primacy) — big picture + task spec ---

  const headerLines: string[] = [`# ${taskRef ? `\`${taskRef}\` ` : ""}${task.title}`];
  if (tags.length > 0) {
    headerLines.push(`Tags: ${tags.map((t) => `\`${t}\``).join(", ")}`);
  }

  const parts: string[] = [headerLines.join("\n")];

  if (project) {
    const projectLines = [`Project: ${project.title}`];
    if (project.description) {
      projectLines.push(project.description);
    }
    parts.push(section("Project Context") + "\n" + projectLines.join("\n"));
  }

  parts.push(section("Description") + "\n" + task.description);
  parts.push(section("Acceptance Criteria") + "\n" + formatCriteria(task.acceptanceCriteria));

  if (task.implementationPlan) {
    parts.push(section("Existing Implementation Plan") + "\n" + task.implementationPlan);
  }

  // --- MIDDLE: lowest recall zone — prerequisites + what's been built ---

  const [deps, downstream, upstreamEdgeNotes] = await Promise.all([
    getDependencyChain(taskId, 2),
    getDownstream(taskId, 2),
    fetchEdgeNotesBySource(taskId),
  ]);

  if (deps.length > 0) {
    const prereqLines: string[] = [];
    const execLines: string[] = [];

    const depIds = deps.map((d) => d.id);
    const depTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        executionRecord: tasks.executionRecord,
        sequenceNumber: tasks.sequenceNumber,
        identifier: projects.identifier,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(sql`${tasks.id} IN ${depIds}`);

    const depMap = new Map(depTasks.map((dt) => [dt.id, {
      ...dt,
      taskRef: composeTaskRef(asIdentifier(dt.identifier), dt.sequenceNumber),
    }]));

    for (const dep of deps) {
      const info = depMap.get(dep.id);
      if (!info) continue;
      const note = upstreamEdgeNotes.get(dep.id);
      let line = `- \`${info.taskRef}\` **${info.title}** [${info.status}]`;
      if (note) line += ` — ${note}`;
      prereqLines.push(line);

      if (info.status === "done" && info.executionRecord) {
        execLines.push(`### \`${info.taskRef}\` ${info.title}`);
        execLines.push(info.executionRecord);
      }
    }

    if (prereqLines.length > 0) {
      parts.push(
        section("Prerequisites (context only — do NOT implement these)") +
          "\n" +
          prereqLines.join("\n"),
      );
    }

    if (execLines.length > 0) {
      parts.push(
        section("What's Been Built (from done prerequisites)") +
          "\n" +
          execLines.join("\n"),
      );
    }
  }

  if (task.decisions.length > 0) {
    parts.push(section("Decisions") + "\n" + formatDecisions(task.decisions));
  }

  // --- END: second-highest recall zone (recency) — downstream ---

  if (downstream.length > 0) {
    const [downstreamEdgeNotes, downstreamSummaries] = await Promise.all([
      fetchEdgeNotesByTarget(taskId),
      fetchTaskSummaries(downstream.map((d) => d.id)),
    ]);
    const summaryMap = new Map(downstreamSummaries.map((s) => [s.id, s]));
    const downLines: string[] = [];

    for (const d of downstream) {
      const info = summaryMap.get(d.id);
      if (!info) continue;
      const note = downstreamEdgeNotes.get(d.id);
      let line = `- \`${info.taskRef}\` **${info.title}** [${info.status}]`;
      if (note) line += ` — ${note}`;
      if (info.description) line += `\n  ${info.description}`;
      downLines.push(line);
    }

    if (downLines.length > 0) {
      parts.push(
        section("Downstream (tasks that depend on this task's output)") +
          "\n" +
          downLines.join("\n"),
      );
    }
  }

  return parts.join("\n");
}
