"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, projects } from "@/lib/db/schema";
import type { AcceptanceCriterion } from "@/lib/types";
import { getAncestors } from "@/lib/graph/traversal";
import { fetchTask, getTaskEdgesDetailed } from "@/lib/graph/queries";
import { asIdentifier, composeTaskRef } from "@/lib/graph/identifier";
import { section, formatCriteria } from "./format";

/** Full working context for AI assistant (1-hop). */
type WorkingContext = {
  node: Record<string, unknown>;
  taskRef: string;
  ancestors: { id: string; type: "project"; title: string }[];
  edges: {
    id: string;
    taskRef: string;
    edgeType: string;
    direction: "outgoing" | "incoming";
    title: string;
    status: string;
    note: string;
  }[];
  siblings: { id: string; taskRef: string; title: string; status: string }[];
};

/**
 * Build full working context for a task. 1-hop traversal with token budgeting.
 * Used by MCP for `mymir_context depth='working'`.
 * @param taskId - UUID of the task.
 * @param projectId - UUID of the project (for taskRef and sibling lookup).
 * @returns Working context with task data, ancestors, edges, and siblings.
 */
export async function buildWorkingContext(
  taskId: string,
  projectId: string,
): Promise<WorkingContext> {
  const task = await fetchTask(taskId);
  if (!task) {
    return { node: {}, taskRef: "", ancestors: [], edges: [], siblings: [] };
  }

  const [projectRow, ancestors, detailedEdges, siblings] = await Promise.all([
    db.select({ identifier: projects.identifier }).from(projects).where(eq(projects.id, projectId)).then(r => r[0]),
    getAncestors(taskId),
    getTaskEdgesDetailed(taskId),
    fetchSiblings(taskId, projectId),
  ]);

  if (!projectRow) {
    console.error('Task has no joinable project', { taskId: task.id, projectId: task.projectId });
  }
  const taskRef = projectRow
    ? composeTaskRef(asIdentifier(projectRow.identifier), task.sequenceNumber)
    : "";

  const edges = detailedEdges.map((e) => ({
    id: e.connectedTask.id,
    taskRef: e.connectedTask.taskRef,
    edgeType: e.edgeType as string,
    direction: e.direction,
    title: e.connectedTask.title,
    status: e.connectedTask.status,
    note: e.note,
  }));

  return {
    node: task as unknown as Record<string, unknown>,
    taskRef,
    ancestors,
    edges,
    siblings,
  };
}

/**
 * Format working context as structured markdown for AI consumption.
 * Sections ordered by U-shaped attention: header+description+criteria at start,
 * edges+siblings in middle.
 * No token budget — all content included as-is.
 * @param ctx - The raw working context object.
 * @returns Human-readable markdown string.
 */
export async function formatWorkingContext(
  ctx: WorkingContext,
): Promise<string> {
  const node = ctx.node;
  const title = (node.title as string) ?? "Untitled";
  const status = (node.status as string) ?? "draft";
  const description = (node.description as string) ?? "";

  // --- START: highest recall (primacy) ---
  const parts: string[] = [
    `# ${ctx.taskRef ? `\`${ctx.taskRef}\` ` : ""}"${title}" (${status})`,
  ];

  if (description) parts.push(`\n## Description\n${description}`);

  const tags = formatTagsSection(node);
  if (tags) parts.push(tags);

  const criteria = formatCriteriaSection(node);
  if (criteria) parts.push(criteria);

  const hierarchy = formatHierarchySection(ctx, title);
  if (hierarchy) parts.push(hierarchy);

  // --- MIDDLE: lowest recall ---
  const decisions = formatDecisionsSection(node);
  if (decisions) parts.push(decisions);

  const edges = formatEdgesSection(ctx.edges);
  if (edges) parts.push(edges);

  const siblings = formatSiblingsSection(ctx.siblings);
  if (siblings) parts.push(siblings);

  return parts.join("\n");
}

/**
 * Format tags section.
 * @param node - Raw node data.
 * @returns Formatted tags section or empty string.
 */
function formatTagsSection(node: Record<string, unknown>): string {
  const tags = (node.tags as string[]) ?? [];
  if (tags.length === 0) return "";
  return `\n## Tags\n${tags.map((t) => `\`${t}\``).join(", ")}`;
}

/**
 * Format acceptance criteria section using the shared grouped-by-state helper.
 * @param node - Raw node data.
 * @returns Formatted criteria section or empty string.
 */
function formatCriteriaSection(node: Record<string, unknown>): string {
  const criteria = (node.acceptanceCriteria as AcceptanceCriterion[]) ?? [];
  if (criteria.length === 0) return "";
  return section("Acceptance Criteria") + "\n" + formatCriteria(criteria);
}

/**
 * Format decisions section.
 * @param node - Raw node data.
 * @returns Formatted decisions section or empty string.
 */
function formatDecisionsSection(node: Record<string, unknown>): string {
  const decisions = (node.decisions as { text: string; source: string; date: string }[]) ?? [];
  if (decisions.length === 0) return "";
  const lines = ["\n## Decisions"];
  for (const d of decisions) {
    lines.push(`- [${d.source}] ${d.text} (${d.date})`);
  }
  return lines.join("\n");
}

/**
 * Format hierarchy section from ancestors.
 * @param ctx - Working context.
 * @param title - Title of the current task.
 * @returns Formatted hierarchy section or empty string.
 */
function formatHierarchySection(ctx: WorkingContext, title: string): string {
  if (ctx.ancestors.length === 0) return "";
  const path = [...ctx.ancestors].reverse().map((a) => `${a.type}: "${a.title}"`).join(" > ");
  return `\n## Hierarchy\n${path} > task: "${title}"`;
}

/**
 * Format connected edges section.
 * @param edges - Array of edge data with notes.
 * @returns Formatted edges section or empty string.
 */
function formatEdgesSection(edges: WorkingContext["edges"]): string {
  if (edges.length === 0) return "";
  const lines = ["\n## Connected Tasks"];
  for (const e of edges) {
    const arrow = e.direction === "outgoing" ? "\u2192" : "\u2190";
    let line = `- ${e.edgeType} ${arrow} \`${e.taskRef}\` "${e.title}" (${e.status})`;
    if (e.note) line += ` \u2014 ${e.note}`;
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Format siblings section.
 * @param siblings - Array of sibling task summaries.
 * @returns Formatted siblings section or empty string.
 */
function formatSiblingsSection(siblings: WorkingContext["siblings"]): string {
  if (siblings.length === 0) return "";
  const lines = ["\n## Siblings"];
  for (const s of siblings) {
    lines.push(`- \`${s.taskRef}\` "${s.title}" (${s.status})`);
  }
  return lines.join("\n");
}

/**
 * Fetch other tasks in the same project (siblings).
 * @param taskId - UUID of the current task.
 * @param projectId - UUID of the project.
 * @returns Array of siblings with id, title, and status.
 */
async function fetchSiblings(taskId: string, projectId: string) {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      sequenceNumber: tasks.sequenceNumber,
      identifier: projects.identifier,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(sql`${tasks.projectId} = ${projectId} AND ${tasks.id} != ${taskId}`);
  return rows.map((r) => ({
    id: r.id,
    taskRef: composeTaskRef(asIdentifier(r.identifier), r.sequenceNumber),
    title: r.title,
    status: r.status,
  }));
}
