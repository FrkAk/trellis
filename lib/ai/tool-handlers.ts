/**
 * Shared tool handlers for the 6 Mymir tools.
 * Single source of truth — called by both web app (AI SDK) and MCP server.
 * All business logic lives in lib/graph/*; handlers do validation + routing.
 */

import {
  createProject,
  updateProject,
  createTask,
  updateTask,
  deleteTask,
  deleteTaskPreview,
  reorderTask,
  createEdge,
  updateEdge,
  removeEdge,
  removeEdgeByNodes,
} from "@/lib/graph/mutations";
import {
  getProjectList,
  searchTasks,
  getProjectTasksSlim,
  getTaskEdgesDetailed,
  getProjectTags,
  fetchTask,
  projectExists,
  taskExists,
  edgeExists,
} from "@/lib/graph/queries";
import type { TaskState } from "@/lib/graph/queries";
import { buildProjectOverview } from "@/lib/context/overview";
import { buildSummaryContext } from "@/lib/context/summary";
import {
  buildWorkingContext,
  formatWorkingContext,
} from "@/lib/context/working";
import { buildAgentContext } from "@/lib/context/agent";
import { buildPlanningContext } from "@/lib/context/planning";
import {
  getReadyTasks,
  getBlockedTasks,
  getDownstream,
  getCriticalPath,
  getPlannableTasks,
} from "@/lib/graph/traversal";
import type { EdgeType, Decision } from "@/lib/types";
import { parseIdentifier } from "@/lib/graph/identifier";
import type { ProjectUpdate } from "@/lib/graph/mutations";
import {
  formatSummary,
  formatSearchResults,
  formatTaskList,
  formatDetailedEdges,
  formatOverview,
  formatReadyTasks,
  formatBlockedTasks,
  formatDownstream,
  formatCriticalPath,
  formatPlannableTasks,
} from "./format-responses";
import { findVariant } from "./tag-similarity";

/**
 * Build variant-warning hints for proposed tags against existing project tags.
 * @param proposed - Proposed tag strings.
 * @param existing - Current project tag list.
 * @returns Hint strings for tags that look like variants of existing ones.
 */
function tagVariantHints(proposed: string[], existing: string[]): string[] {
  const hints: string[] = [];
  for (const tag of proposed) {
    const variant = findVariant(tag, existing);
    if (variant) hints.push(`Tag "${tag}" looks like a variant of existing "${variant}" — reuse or confirm.`);
  }
  return hints;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Discriminated result from a tool handler. */
export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** @returns Success result wrapping data. */
function ok(data: unknown): ToolResult {
  return { ok: true, data };
}

/** @returns Failure result with actionable message. */
function fail(msg: string): ToolResult {
  return { ok: false, error: msg };
}

const STATE_HINTS: Record<TaskState, string> = {
  plannable: "Task is plannable. Fetch context with depth='planning' to write an implementation plan.",
  ready: "Task is ready to implement. Fetch context with depth='agent' to get implementation context.",
  blocked: "Task is blocked by dependencies. Fetch context with depth='working' to see what's blocking it.",
  in_progress: "Task is claimed (in progress). Fetch context with depth='working' to review — avoid duplicating work.",
  done: "Task is complete. Fetch context with depth='working' to review what was built.",
  draft: "Task is a draft (needs description/criteria before planning). Fetch context with depth='working'.",
};

/**
 * Get a context-depth hint for a task's derived state.
 * @param state - The derived TaskState.
 * @returns Hint string telling the agent which context depth to fetch.
 */
function stateHint(state: TaskState): string {
  return STATE_HINTS[state];
}

// ---------------------------------------------------------------------------
// Existence guards — return actionable error or null (pass)
// ---------------------------------------------------------------------------

/**
 * Verify a project exists. Returns a fail result with recovery hint, or null.
 * @param id - Project UUID to check.
 */
async function requireProject(id: string): Promise<ToolResult | null> {
  if (await projectExists(id)) return null;
  return fail(`Project '${id}' not found. Run mymir_project action='list' to see available projects.`);
}

/**
 * Verify a task exists. Returns a fail result with recovery hint, or null.
 * @param id - Task UUID to check.
 */
async function requireTask(id: string): Promise<ToolResult | null> {
  if (await taskExists(id)) return null;
  return fail(`Task '${id}' not found. Run mymir_query type='search' to find tasks, or type='list' with your projectId.`);
}

/**
 * Verify an edge exists. Returns a fail result with recovery hint, or null.
 * @param id - Edge UUID to check.
 */
async function requireEdge(id: string): Promise<ToolResult | null> {
  if (await edgeExists(id)) return null;
  return fail(`Edge '${id}' not found. Run mymir_query type='edges' with a taskId to see current edges.`);
}

// ---------------------------------------------------------------------------
// Shared descriptions (MCP tools are ground truth)
// ---------------------------------------------------------------------------

/** Tool descriptions shared between MCP and web app. */
export const DESCRIPTIONS = {
  mymir_project:
    "Manage projects. " +
    "'list': all projects with task counts and progress. " +
    "'create': new project. " +
    "'select': confirm which project to work on (returns projectId — pass it explicitly on all subsequent calls). " +
    "'update': change title, description, status, or categories. " +
    "Always 'list' then 'select' at session start. Always pass projectId explicitly on every call.",
  mymir_task:
    "Create, update, delete, or reorder tasks. " +
    "Status lifecycle: draft → planned → in_progress → done (see `status` field for per-state expectations). " +
    "Before marking done, follow the skill's Completion Protocol. " +
    "For delete: preview defaults to true (shows impact without deleting). Set preview=false to execute. " +
    "Update accepts any combination of fields — pass only what changed. " +
    "Array fields (decisions, acceptanceCriteria, files) APPEND by default. Set overwriteArrays=true to replace entirely.",
  mymir_edge:
    "Manage dependency edges between tasks. " +
    "'create': link two tasks (depends_on = source needs target done first, relates_to = informational). " +
    "'update': change edge type or note by edgeId. " +
    "'remove': delete by edgeId OR by sourceTaskId+targetTaskId+edgeType. " +
    "Validates against self-edges, duplicates, and circular dependencies.",
  mymir_query:
    "Search and browse project data. " +
    "'search': find tasks by name or tags (case-insensitive, up to 20 results). " +
    "'list': all tasks ordered by position. " +
    "'edges': all relationships on a task with connected task title, status, direction, and note. " +
    "'overview': full project structure — all tasks, dependencies, and progress stats.",
  mymir_context:
    "Retrieve task context at varying depth for different use cases. " +
    "'summary': quick — title, status, edge counts. " +
    "'working': full details — criteria, decisions, neighbors (~4K tokens). " +
    "'agent': multi-hop dependency chains with execution records — for coding agents starting implementation. " +
    "'planning': spec-focused — prerequisites, related work, acceptance criteria — for writing implementation plans. " +
    "Always fetch context before reasoning about a task.",
  mymir_analyze:
    "Analyze the project dependency graph. " +
    "'ready': tasks with all dependencies done — what to work on next. " +
    "'plannable': draft tasks with description and acceptance criteria — ready for planning when nothing is ready to code. " +
    "'blocked': tasks waiting on unfinished dependencies with blocker details. " +
    "'downstream': all tasks that transitively depend on a given task — impact analysis before changes. " +
    "'critical_path': longest dependency chain — the project bottleneck to prioritize.",
} as const;

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

/** Params for mymir_project (handler covers list/create/update; MCP handles select separately). */
export type ProjectParams = {
  action: "list" | "create" | "update";
  projectId?: string;
  title?: string;
  description?: string;
  status?: "brainstorming" | "decomposing" | "active" | "archived";
  categories?: string[];
  identifier?: string;
};

/** Params for mymir_task. */
export type TaskParams = {
  action: "create" | "update" | "delete" | "reorder";
  projectId?: string;
  taskId?: string;
  title?: string;
  description?: string;
  status?: "draft" | "planned" | "in_progress" | "done";
  acceptanceCriteria?: unknown[];
  decisions?: unknown[];
  tags?: string[];
  category?: string;
  files?: string[];
  implementationPlan?: string;
  executionRecord?: string;
  order?: number;
  preview?: boolean;
  overwriteArrays?: boolean;
};

/** Params for mymir_edge. */
export type EdgeParams = {
  action: "create" | "update" | "remove";
  edgeId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
  edgeType?: "depends_on" | "relates_to";
  note?: string;
};

/** Params for mymir_query. */
export type QueryParams = {
  type: "search" | "list" | "edges" | "overview";
  projectId?: string;
  query?: string;
  taskId?: string;
};

/** Params for mymir_context. */
export type ContextParams = {
  taskId: string;
  depth: "summary" | "working" | "agent" | "planning";
  projectId?: string;
};

/** Params for mymir_analyze. */
export type AnalyzeParams = {
  type: "ready" | "blocked" | "downstream" | "critical_path" | "plannable";
  projectId?: string;
  taskId?: string;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle mymir_project actions (list/create/update).
 * MCP handles `select` separately before calling this.
 * @param p - Validated project params.
 * @returns Tool result with project data.
 */
export async function handleProject(p: ProjectParams): Promise<ToolResult> {
  try {
    switch (p.action) {
      case "list":
        return ok(await getProjectList());
      case "create": {
        if (!p.title) return fail("title required for create");
        let parsedIdentifier;
        if (p.identifier !== undefined) {
          const parsed = parseIdentifier(p.identifier);
          if (!parsed.ok) return fail(parsed.error);
          parsedIdentifier = parsed.value;
        }
        const project = await createProject({
          title: p.title,
          description: p.description ?? "",
          categories: p.categories,
          identifier: parsedIdentifier,
        });
        const createHints: string[] = [];
        if (p.identifier === undefined) {
          createHints.push(`Auto-derived identifier '${project.identifier}' from title. Pass identifier='...' on create to override (2-12 chars, uppercase alphanumeric).`);
        }
        return ok(createHints.length > 0 ? { ...project, _hints: createHints } : project);
      }
      case "update": {
        if (!p.projectId) return fail("projectId required for update");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        const changes: ProjectUpdate = {};
        if (p.title !== undefined) changes.title = p.title;
        if (p.description !== undefined) changes.description = p.description;
        if (p.status !== undefined) changes.status = p.status;
        if (p.categories !== undefined) changes.categories = p.categories;
        if (p.identifier !== undefined) {
          const parsed = parseIdentifier(p.identifier);
          if (!parsed.ok) return fail(parsed.error);
          changes.identifier = parsed.value;
        }
        const project = await updateProject(p.projectId, changes);
        const updateHints: string[] = [];
        if (p.identifier !== undefined) {
          updateHints.push(`Renamed all task refs to '${p.identifier}-N'. External references (GitHub PRs, docs, commit messages) to the old prefix no longer resolve.`);
        }
        return ok(updateHints.length > 0 ? { ...project, _hints: updateHints } : project);
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle mymir_task actions.
 * @param p - Validated task params. projectId required for create.
 * @returns Tool result with task data.
 */
export async function handleTask(p: TaskParams): Promise<ToolResult> {
  try {
    switch (p.action) {
      case "create": {
        if (!p.projectId) return fail("projectId required for create");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        if (!p.title) return fail("title required for create");
        if (!p.description) return fail("description required for create (2-4 sentences: what, why, how)");
        const preExistingTags =
          p.tags && p.tags.length > 0
            ? (await getProjectTags(p.projectId)).map((t) => t.tag)
            : [];
        const task = await createTask({
          projectId: p.projectId,
          title: p.title,
          description: p.description,
          status: p.status,
          order: p.order ?? 0,
          acceptanceCriteria: (p.acceptanceCriteria ?? []) as unknown as { id: string; text: string; checked: boolean }[],
          tags: p.tags,
          category: p.category,
          files: p.files,
          implementationPlan: p.implementationPlan,
          executionRecord: p.executionRecord,
          decisions: p.decisions as unknown as Decision[],
        });
        const createHints: string[] = [];
        createHints.push("No edges. Add dependencies with mymir_edge.");
        if (!p.category) {
          createHints.push("No category. Use mymir_project to see project categories, then set one with mymir_task action='update'.");
        }
        if (!p.acceptanceCriteria || p.acceptanceCriteria.length === 0) {
          createHints.push("No acceptance criteria. Add testable done conditions with mymir_task action='update'.");
        }
        if (p.tags && p.tags.length > 0) {
          createHints.push(...tagVariantHints(p.tags, preExistingTags));
        }
        return ok({ ...task, _hints: createHints });
      }
      case "update": {
        if (!p.taskId) return fail("taskId required for update. Use mymir_query type='search' to find it.");
        const notFound = await requireTask(p.taskId);
        if (notFound) return notFound;
        let preExistingTags: string[] = [];
        if (p.tags && p.tags.length > 0) {
          const existing = await fetchTask(p.taskId);
          if (existing) preExistingTags = (await getProjectTags(existing.projectId)).map((t) => t.tag);
        }
        const changes: Record<string, unknown> = {};
        if (p.title !== undefined) changes.title = p.title;
        if (p.description !== undefined) changes.description = p.description;
        if (p.status !== undefined) changes.status = p.status;
        if (p.acceptanceCriteria !== undefined) changes.acceptanceCriteria = p.acceptanceCriteria;
        if (p.decisions !== undefined) changes.decisions = p.decisions;
        if (p.tags !== undefined) changes.tags = p.tags;
        if (p.category !== undefined) changes.category = p.category;
        if (p.files !== undefined) changes.files = p.files;
        if (p.implementationPlan !== undefined) changes.implementationPlan = p.implementationPlan;
        if (p.executionRecord !== undefined) changes.executionRecord = p.executionRecord;
        const result = await updateTask(p.taskId, changes, !!p.overwriteArrays);
        const updateHints: string[] = [];
        if (p.tags && p.tags.length > 0) {
          updateHints.push(...tagVariantHints(p.tags, preExistingTags));
        }
        if (p.status === "planned") {
          updateHints.push("Task planned. Claim with status='in_progress' when ready to implement.");
        }
        if (p.status === "in_progress") {
          updateHints.push("Run mymir_context depth='agent' to get implementation context before starting.");
          updateHints.push("Before marking done: confirm with the user (single-agent mode) or return to the orchestrator (dispatched mode). See Completion Protocol in the skill.");
        }
        if (p.status === "done") {
          if (!p.executionRecord && !result.executionRecord) {
            updateHints.push("Missing executionRecord. Add it — downstream tasks depend on this for context.");
          }
          if (!p.decisions && (!result.decisions || result.decisions.length === 0)) {
            updateHints.push("Missing decisions. Record technical choices (CHOICE + WHY) — downstream tasks need them.");
          }
          if (!p.files && (!result.files || result.files.length === 0)) {
            updateHints.push("Missing files. Record every path touched during implementation (empty only if the task genuinely touched no files).");
          }
          updateHints.push("Run mymir_analyze type='downstream' to propagate changes and update any edges made stale by this completion.");
          const criteria = result.acceptanceCriteria as { checked: boolean }[] | null;
          if (
            result.executionRecord &&
            criteria &&
            criteria.length > 0 &&
            criteria.every((c) => !c.checked)
          ) {
            updateHints.push(
              "Acceptance criteria are all unchecked. Evaluate each against your executionRecord and re-submit with acceptanceCriteria updated (checked: true/false).",
            );
          }
        }
        return ok(updateHints.length > 0 ? { ...result, _hints: updateHints } : result);
      }
      case "delete": {
        if (!p.taskId) return fail("taskId required for delete");
        const notFound = await requireTask(p.taskId);
        if (notFound) return notFound;
        if (p.preview !== false) {
          const result = await deleteTaskPreview(p.taskId);
          return ok({ ...result, _hint: "Preview only. Run again with preview=false to delete." });
        }
        return ok(await deleteTask(p.taskId));
      }
      case "reorder": {
        if (!p.taskId) return fail("taskId required for reorder");
        const notFound = await requireTask(p.taskId);
        if (notFound) return notFound;
        if (p.order === undefined) return fail("order required for reorder (0-based position)");
        return ok(await reorderTask(p.taskId, p.order));
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle mymir_edge actions.
 * @param p - Validated edge params.
 * @returns Tool result with edge data.
 */
export async function handleEdge(p: EdgeParams): Promise<ToolResult> {
  try {
    switch (p.action) {
      case "create": {
        if (!p.sourceTaskId || !p.targetTaskId)
          return fail("sourceTaskId and targetTaskId required for create");
        if (!p.edgeType)
          return fail("edgeType required for create (depends_on or relates_to)");
        const edge = await createEdge({
          sourceTaskId: p.sourceTaskId,
          targetTaskId: p.targetTaskId,
          edgeType: p.edgeType as EdgeType,
          note: p.note ?? "",
        });
        const edgeHints: string[] = [];
        if (!p.note) {
          edgeHints.push("Missing edge note. Add one — notes propagate to downstream agent context.");
        }
        return ok(edgeHints.length > 0 ? { ...edge, _hints: edgeHints } : edge);
      }
      case "update": {
        if (!p.edgeId)
          return fail("edgeId required for update. Use mymir_query type='edges' to find edge IDs.");
        const notFound = await requireEdge(p.edgeId);
        if (notFound) return notFound;
        return ok(await updateEdge(p.edgeId, {
          edgeType: p.edgeType as EdgeType | undefined,
          note: p.note,
        }));
      }
      case "remove": {
        if (p.edgeId) {
          const notFound = await requireEdge(p.edgeId);
          if (notFound) return notFound;
          await removeEdge(p.edgeId);
          return ok({ removed: p.edgeId });
        }
        if (p.sourceTaskId && p.targetTaskId && p.edgeType) {
          const removed = await removeEdgeByNodes(
            p.sourceTaskId,
            p.targetTaskId,
            p.edgeType as EdgeType,
          );
          return ok(removed ? { removed: removed.id } : { removed: null, _hint: "No matching edge found" });
        }
        return fail(
          "Provide edgeId OR sourceTaskId+targetTaskId+edgeType. " +
          "Use mymir_query type='edges' to find edge details.",
        );
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle mymir_query actions.
 * @param p - Validated query params. projectId required for search/list/overview.
 * @returns Tool result with query data.
 */
export async function handleQuery(p: QueryParams): Promise<ToolResult> {
  try {
    switch (p.type) {
      case "search": {
        if (!p.query) return fail("query string required for search");
        if (!p.projectId) return fail("projectId required for search");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        const results = await searchTasks(p.projectId, p.query);
        const hint = results.length === 1 ? stateHint(results[0].state) : undefined;
        return ok(formatSearchResults(results, hint));
      }
      case "list": {
        if (!p.projectId) return fail("projectId required for list");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        return ok(formatTaskList(await getProjectTasksSlim(p.projectId)));
      }
      case "edges": {
        if (!p.taskId)
          return fail("taskId required for edges. Use type='search' to find task IDs.");
        const notFound = await requireTask(p.taskId);
        if (notFound) return notFound;
        return ok(formatDetailedEdges(await getTaskEdgesDetailed(p.taskId)));
      }
      case "overview": {
        if (!p.projectId) return fail("projectId required for overview");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        const overview = await buildProjectOverview(p.projectId);
        return ok(overview ? formatOverview(overview) : "Project not found.");
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle mymir_context actions.
 * Returns structured data for summary, formatted string for other depths.
 * @param p - Validated context params. projectId required for working depth.
 * @returns Tool result — data is object (summary) or string (working/agent/planning).
 */
export async function handleContext(p: ContextParams): Promise<ToolResult> {
  try {
    const notFound = await requireTask(p.taskId);
    if (notFound) return notFound;
    switch (p.depth) {
      case "summary":
        return ok(formatSummary(await buildSummaryContext(p.taskId)));
      case "working": {
        if (!p.projectId) return fail("projectId required for working depth");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        const ctx = await buildWorkingContext(p.taskId, p.projectId);
        return ok(await formatWorkingContext(ctx));
      }
      case "agent":
        return ok(await buildAgentContext(p.taskId));
      case "planning":
        return ok(await buildPlanningContext(p.taskId));
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Handle mymir_analyze actions.
 * @param p - Validated analyze params. projectId for ready/blocked/critical_path; taskId for downstream.
 * @returns Tool result with analysis data.
 */
export async function handleAnalyze(p: AnalyzeParams): Promise<ToolResult> {
  try {
    switch (p.type) {
      case "ready": {
        if (!p.projectId) return fail("projectId required for ready");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        return ok(formatReadyTasks(await getReadyTasks(p.projectId)));
      }
      case "blocked": {
        if (!p.projectId) return fail("projectId required for blocked");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        return ok(formatBlockedTasks(await getBlockedTasks(p.projectId)));
      }
      case "downstream": {
        if (!p.taskId)
          return fail("taskId required for downstream analysis. Use mymir_query type='search' to find it.");
        const notFound = await requireTask(p.taskId);
        if (notFound) return notFound;
        return ok(formatDownstream(await getDownstream(p.taskId)));
      }
      case "critical_path": {
        if (!p.projectId) return fail("projectId required for critical_path");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        return ok(formatCriticalPath(await getCriticalPath(p.projectId)));
      }
      case "plannable": {
        if (!p.projectId) return fail("projectId required for plannable");
        const notFound = await requireProject(p.projectId);
        if (notFound) return notFound;
        return ok(formatPlannableTasks(await getPlannableTasks(p.projectId)));
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
