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
 * Build lean, position-optimized context for external coding agents.
 * Sections ordered by U-shaped attention: start/end get highest recall, middle lowest.
 * No token budget — controlled content is compact, implPlan is critical and never truncated.
 * @param taskId - UUID of the task.
 * @returns Formatted context string.
 */
export async function buildAgentContext(taskId: string): Promise<string> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return "# Task not found";

  const [project] = await db
    .select({ identifier: projects.identifier })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  if (!project) {
    console.error('Task has no joinable project', { taskId: task.id, projectId: task.projectId });
  }
  const taskRef = project
    ? composeTaskRef(asIdentifier(project.identifier), task.sequenceNumber)
    : "";

  const tags = (task.tags as string[] | null) ?? [];
  const files = (task.files as string[] | null) ?? [];
  const status = task.status as string;

  // --- START: highest recall zone (primacy) ---

  const headerLines: string[] = [`# ${taskRef ? `\`${taskRef}\` ` : ""}${task.title}`];
  if (tags.length > 0) {
    headerLines.push(`Tags: ${tags.map((t) => `\`${t}\``).join(", ")}`);
  }
  headerLines.push("");
  headerLines.push(task.description);

  const parts: string[] = [headerLines.join("\n")];

  if (task.implementationPlan && status !== "done") {
    parts.push(section("Implementation Plan") + "\n" + task.implementationPlan);
  }

  // --- MIDDLE: lowest recall zone ---

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

      if (info.executionRecord) {
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
        section("Upstream Execution Records") + "\n" + execLines.join("\n"),
      );
    }
  }

  if (task.decisions.length > 0) {
    parts.push(section("Constraints") + "\n" + formatDecisions(task.decisions));
  }

  // --- END: second-highest recall zone (recency) ---

  parts.push(section("Done Means") + "\n" + formatCriteria(task.acceptanceCriteria));

  if (files.length > 0) {
    parts.push(section("Files") + "\n" + files.map((f) => `- ${f}`).join("\n"));
  }

  if (task.executionRecord && status === "done") {
    parts.push(section("Execution Record") + "\n" + task.executionRecord);
  }

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
      downLines.push(line);
    }

    if (downLines.length > 0) {
      parts.push(
        section("Downstream (what depends on this task's output)") +
          "\n" +
          downLines.join("\n"),
      );
    }
  }

  return parts.join("\n\n");
}
