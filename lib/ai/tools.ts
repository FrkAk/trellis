/**
 * AI SDK tool definitions for the Mymir web app.
 * 6 consolidated tools matching MCP design. Each scope function restricts
 * which actions are available via narrowed Zod enums.
 */

import { z } from "zod/v4";
import { tool } from "ai";
import {
  DESCRIPTIONS,
  handleProject,
  handleTask,
  handleEdge,
  handleQuery,
  handleContext,
  handleAnalyze,
  type ToolResult,
} from "./tool-handlers";
import { identifierSchema } from "@/lib/graph/identifier";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Unwrap a ToolResult for AI SDK — return data on success, throw on failure.
 * @param result - Handler result.
 * @returns The result data.
 * @throws Error with the failure message.
 */
function unwrap(result: ToolResult): unknown {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

// ---------------------------------------------------------------------------
// Shared Zod field schemas (reused across scopes)
// ---------------------------------------------------------------------------

const taskFields = {
  taskId: z.string().uuid().optional().describe("Task UUID. Required for update/delete/reorder"),
  title: z.string().optional().describe("Short task name. Required for create"),
  description: z.string().optional().describe("2-4 sentences: what to build, why it matters, key technical approach. Required for create"),
  status: z.enum(["draft", "planned", "in_progress", "done"]).optional().describe("Task lifecycle status"),
  acceptanceCriteria: z.array(z.string()).optional().describe("2-4 testable done conditions"),
  decisions: z.array(z.string()).optional().describe("Key technical decisions and constraints"),
  tags: z.array(z.string()).optional().describe("Kebab-case. Every task carries exactly 1 work-type (bug/feature/refactor/docs/test/chore/perf), >=1 cross-cutting concern (open: quality attribute or feature cluster), at most 2 tech tags (most important stack pieces the task touches), and exactly 1 priority (release-blocker/core/normal/backlog). Do NOT tag codebase area (use category) or status. Check mymir_query type='overview' before coining new."),
  category: z.string().optional().describe("Drawer group for this task. Should match a project category."),
  files: z.array(z.string()).optional().describe("File paths this task touches"),
  implementationPlan: z.string().optional().describe("Implementation plan written during planning phase"),
  executionRecord: z.string().optional().describe("Summary of what was built during implementation"),
  order: z.number().int().optional().describe("0-based position"),
  preview: z.boolean().optional().default(true).describe("For delete only: true=show impact (default), false=actually delete"),
  overwriteArrays: z.boolean().optional().default(false).describe("For update only: true=replace decisions/acceptanceCriteria/files entirely. Default false=append to existing"),
};

const edgeFields = {
  edgeId: z.string().optional().describe("Edge UUID. Required for update. For remove: use this OR source+target+type"),
  sourceTaskId: z.string().optional().describe("Source task UUID. Required for create"),
  targetTaskId: z.string().optional().describe("Target task UUID. Required for create"),
  edgeType: z.enum(["depends_on", "relates_to"]).optional().describe("depends_on = source needs target done first. relates_to = informational link"),
  note: z.string().optional().describe("Why this relationship exists"),
};

// ---------------------------------------------------------------------------
// Brainstorm scope
// ---------------------------------------------------------------------------

/**
 * Build tools for the brainstorm scope.
 * @param projectId - UUID of the project being brainstormed.
 * @returns Tool set with project update and brainstorm completion signal.
 */
export function brainstormTools(projectId: string) {
  return {
    mymir_project: tool({
      description:
        "Update the project's name and description after brainstorming is complete. " +
        "Description should be 3-5 sentences covering: problem, target user, core features, tech direction, constraints.",
      inputSchema: z.object({
        action: z.literal("update").describe("Only 'update' is available in brainstorm scope"),
        title: z.string().optional().describe("Short project name (2-5 words)"),
        description: z.string().optional().describe("3-5 sentence comprehensive brief"),
        status: z.enum(["brainstorming", "decomposing", "active", "archived"]).optional().describe("Project lifecycle status"),
        categories: z.array(z.string()).optional().describe("Task categories for drawer grouping (e.g. ['backend', 'frontend'])"),
        identifier: identifierSchema.optional().describe("Project prefix for task refs (e.g. 'MYM' yields MYM-1, MYM-2, ...). 2-12 chars, uppercase alphanumeric, unique. Renames all existing task refs — external references (PR titles, docs) no longer resolve."),
      }),
      execute: async (params) =>
        unwrap(await handleProject({ ...params, projectId })),
    }),
    signalBrainstormComplete: tool({
      description:
        "Signal that brainstorming is complete and the project is ready for decomposition. " +
        "Call this ONLY after you have explored all 6 topics and named the project via mymir_project. " +
        "This activates the 'Proceed' button in the UI.",
      inputSchema: z.object({
        summary: z.string().describe("Brief summary of what was decided during brainstorming"),
      }),
      execute: async ({ summary }) => ({ ready: true, summary }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Decompose scope
// ---------------------------------------------------------------------------

/**
 * Build tools for the decompose scope.
 * @param projectId - UUID of the project.
 * @returns Tool set for creating tasks and edges.
 */
export function decomposeTools(projectId: string) {
  return {
    mymir_task: tool({
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.object({
        action: z.enum(["create", "update"]).describe("create=new task, update=modify fields"),
        ...taskFields,
      }),
      execute: async (params) =>
        unwrap(await handleTask({ ...params, projectId })),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.object({
        action: z.enum(["create", "update"]).describe("create=new edge, update=modify"),
        ...edgeFields,
      }),
      execute: async (params) =>
        unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "overview"]).describe("search=find by name or tag, overview=project structure"),
        query: z.string().optional().describe("Search string for type='search'"),
        taskId: z.string().optional().describe("Task UUID for type='edges'"),
      }),
      execute: async (params) =>
        unwrap(await handleQuery({ ...params, projectId })),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.object({
        taskId: z.string().uuid().describe("Task UUID"),
        depth: z.enum(["working"]).default("working").describe("Context depth"),
      }),
      execute: async (params) =>
        unwrap(await handleContext({ ...params, projectId })),
    }),
  };
}

// ---------------------------------------------------------------------------
// Refine scope (scoped to a single task)
// ---------------------------------------------------------------------------

/**
 * Build tools for the refine scope. mymir_task is hardwired to the selected task.
 * @param taskId - UUID of the task being refined.
 * @param projectId - UUID of the project.
 * @returns Tool set with scoped task update and graph exploration.
 */
export function refineScopedTools(taskId: string, projectId: string) {
  return {
    mymir_task: tool({
      description:
        `Update fields on the currently selected task (ID: ${taskId}). ` +
        "Pass only the fields you want to change. " +
        "Use this to refine descriptions, add acceptance criteria, record decisions, or change status. " +
        "Array fields (decisions, acceptanceCriteria, files) APPEND by default. Set overwriteArrays=true to replace entirely.",
      inputSchema: z.object({
        title: taskFields.title,
        description: taskFields.description,
        status: taskFields.status,
        acceptanceCriteria: taskFields.acceptanceCriteria,
        decisions: taskFields.decisions,
        tags: taskFields.tags,
        category: taskFields.category,
        files: taskFields.files,
        implementationPlan: taskFields.implementationPlan,
        executionRecord: taskFields.executionRecord,
        overwriteArrays: taskFields.overwriteArrays,
      }),
      execute: async (params) =>
        unwrap(await handleTask({ action: "update", taskId, projectId, ...params })),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.object({
        action: z.enum(["create", "remove"]).describe("create=new edge, remove=delete"),
        ...edgeFields,
      }),
      execute: async (params) =>
        unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "edges", "overview"]).describe("search=find by name or tag, edges=task relationships, overview=project structure"),
        query: z.string().optional().describe("Search string for type='search'"),
        taskId: z.string().optional().describe("Task UUID for type='edges'"),
      }),
      execute: async (params) =>
        unwrap(await handleQuery({ ...params, projectId })),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.object({
        taskId: z.string().uuid().describe("Task UUID"),
        depth: z.enum(["working"]).default("working").describe("Context depth"),
      }),
      execute: async (params) =>
        unwrap(await handleContext({ ...params, projectId })),
    }),
    mymir_analyze: tool({
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.object({
        type: z.enum(["ready", "blocked", "downstream", "plannable"]).describe("ready=unblocked work, blocked=waiting tasks, downstream=impact, plannable=draft tasks ready for planning"),
        taskId: z.string().optional().describe("Task UUID for 'downstream'"),
      }),
      execute: async (params) =>
        unwrap(await handleAnalyze({ ...params, projectId })),
    }),
  };
}

// ---------------------------------------------------------------------------
// Project chat scope (full access)
// ---------------------------------------------------------------------------

/**
 * Build the full tool set for project-level chat.
 * @param projectId - UUID of the project.
 * @returns All 6 tools with all actions.
 */
export function allTools(projectId: string) {
  return {
    mymir_project: tool({
      description: DESCRIPTIONS.mymir_project,
      inputSchema: z.object({
        action: z.enum(["update"]).describe("update=modify project fields"),
        title: z.string().optional().describe("Short project name (2-5 words)"),
        description: z.string().optional().describe("3-5 sentence brief"),
        status: z.enum(["brainstorming", "decomposing", "active", "archived"]).optional().describe("Project lifecycle status"),
        categories: z.array(z.string()).optional().describe("Task categories for drawer grouping (e.g. ['backend', 'frontend'])"),
        identifier: identifierSchema.optional().describe("Project prefix for task refs (e.g. 'MYM' yields MYM-1, MYM-2, ...). 2-12 chars, uppercase alphanumeric, unique. Renames all existing task refs — external references (PR titles, docs) no longer resolve."),
      }),
      execute: async (params) =>
        unwrap(await handleProject({ ...params, projectId })),
    }),
    mymir_task: tool({
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.object({
        action: z.enum(["create", "update", "delete", "reorder"]).describe("create=new task, update=modify, delete=remove, reorder=change position"),
        ...taskFields,
      }),
      execute: async (params) =>
        unwrap(await handleTask({ ...params, projectId })),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.object({
        action: z.enum(["create", "update", "remove"]).describe("create=new edge, update=modify, remove=delete"),
        ...edgeFields,
      }),
      execute: async (params) =>
        unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "list", "edges", "overview"]).describe("search=find by name or tag, list=all tasks, edges=task relationships, overview=project structure"),
        query: z.string().optional().describe("Search string for type='search'"),
        taskId: z.string().optional().describe("Task UUID for type='edges'"),
      }),
      execute: async (params) =>
        unwrap(await handleQuery({ ...params, projectId })),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.object({
        taskId: z.string().uuid().describe("Task UUID"),
        depth: z.enum(["summary", "working", "agent", "planning"]).default("working").describe("summary=quick, working=detailed, agent=multi-hop for coding, planning=spec for pre-implementation"),
      }),
      execute: async (params) =>
        unwrap(await handleContext({ ...params, projectId })),
    }),
    mymir_analyze: tool({
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.object({
        type: z.enum(["ready", "blocked", "downstream", "critical_path", "plannable"]).describe("ready=unblocked work, blocked=waiting tasks, downstream=impact, critical_path=bottleneck, plannable=draft tasks ready for planning"),
        taskId: z.string().optional().describe("Task UUID for 'downstream'"),
      }),
      execute: async (params) =>
        unwrap(await handleAnalyze({ ...params, projectId })),
    }),
  };
}
