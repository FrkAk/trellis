import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  DESCRIPTIONS,
  handleProject,
  handleTask,
  handleEdge,
  handleQuery,
  handleContext,
  handleAnalyze,
} from "@/lib/ai/tool-handlers";
import type {
  ToolResult,
  SearchResult,
  TaskSlim,
  DetailedEdge,
  ProjectOverview,
  SummaryContext,
  ReadyTask,
  BlockedTask,
  DownstreamNode,
  CriticalPathTask,
} from "@/lib/ai/tool-handlers";
import {
  formatSearchResults,
  formatTaskList,
  formatEdges,
  formatOverview,
  formatSummary,
  formatReadyTasks,
  formatPlannableTasks,
  formatBlockedTasks,
  formatDownstream,
  formatCriticalPath,
} from "@/mcp/src/tools/formatters";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function text(str: string) {
  return { content: [{ type: "text" as const, text: str }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function toMcp(result: ToolResult) {
  if (!result.ok) return err(result.error);
  if (typeof result.data === "string") return text(result.data);
  return json(result.data);
}

function extractTasksWithHints<T>(data: unknown): { tasks: T[]; hints: string[] } {
  if (Array.isArray(data)) return { tasks: data as T[], hints: [] };
  const obj = data as { tasks: T[]; _hints?: string[] };
  return { tasks: obj.tasks, hints: obj._hints ?? [] };
}

const INSTRUCTIONS = [
  "Mymir is a persistent context network for coding projects.",
  "It tracks tasks, dependencies, decisions, and implementation records across sessions.",
  "",
  "This is a remote stateless endpoint — no session state.",
  "Always pass projectId explicitly on every call.",
  "The `select` action on mymir_project is not supported in remote mode.",
].join("\n");

/**
 * Create a stateless MCP server with all 6 Mymir tools registered.
 * No session state — callers must always pass projectId explicitly.
 * @returns Configured McpServer instance.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "mymir", version: "0.2.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "mymir_project",
    {
      description: DESCRIPTIONS.mymir_project,
      inputSchema: z.object({
        action: z.enum(["list", "create", "update"])
          .describe("list=get all, create=new, update=modify"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for update"),
        title: z.string().optional()
          .describe("Project name (2-5 words). Required for create"),
        description: z.string().optional()
          .describe("3-5 sentence brief: problem, user, features, tech direction, constraints"),
        status: z.enum(["brainstorming", "decomposing", "active", "archived"]).optional()
          .describe("Lifecycle: brainstorming → decomposing → active → archived"),
        categories: z.array(z.string()).optional()
          .describe("Task categories for drawer grouping"),
      }),
    },
    async (params) => {
      try {
        const result = await handleProject(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_task",
    {
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.object({
        action: z.enum(["create", "update", "delete", "reorder"])
          .describe("create=new task, update=modify fields, delete=remove, reorder=change position"),
        taskId: z.string().optional()
          .describe("Task UUID. Required for update/delete/reorder"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for create"),
        title: z.string().optional()
          .describe("Short task name. Required for create"),
        description: z.string().optional()
          .describe("2-4 sentences: what to build, why it matters, key technical approach"),
        status: z.enum(["draft", "planned", "in_progress", "done"]).optional()
          .describe("Task lifecycle status"),
        acceptanceCriteria: z.array(z.string()).optional()
          .describe("2-4 testable done conditions"),
        decisions: z.array(z.string()).optional()
          .describe("Key technical decisions and constraints"),
        tags: z.array(z.string()).optional()
          .describe("Tags for grouping"),
        category: z.string().optional()
          .describe("Drawer group for this task"),
        files: z.array(z.string()).optional()
          .describe("File paths this task touches"),
        implementationPlan: z.string().optional()
          .describe("Implementation plan written during planning phase"),
        executionRecord: z.string().optional()
          .describe("Summary of what was built during implementation"),
        order: z.number().int().optional()
          .describe("0-based position"),
        preview: z.boolean().optional().default(true)
          .describe("For delete only: true=show impact, false=actually delete"),
        overwriteArrays: z.boolean().optional().default(false)
          .describe("For update: true=replace arrays entirely, false=append"),
      }),
    },
    async (params) => {
      try {
        const result = await handleTask(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_edge",
    {
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.object({
        action: z.enum(["create", "update", "remove"])
          .describe("create=new edge, update=modify, remove=delete"),
        edgeId: z.string().optional()
          .describe("Edge UUID. Required for update. For remove: use this OR source+target+type"),
        sourceTaskId: z.string().optional()
          .describe("Source task UUID. Required for create"),
        targetTaskId: z.string().optional()
          .describe("Target task UUID. Required for create"),
        edgeType: z.enum(["depends_on", "relates_to"]).optional()
          .describe("depends_on = source needs target done first. relates_to = informational link"),
        note: z.string().optional()
          .describe("Why this relationship exists — propagates to agent context"),
      }),
    },
    async (params) => {
      try {
        const result = await handleEdge(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_query",
    {
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "list", "edges", "overview"])
          .describe("search=find by name or tag, list=all tasks, edges=task relationships, overview=project structure"),
        query: z.string().optional()
          .describe("Search string for type='search'"),
        taskId: z.string().optional()
          .describe("Task UUID for type='edges'"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for search/list/overview"),
      }),
    },
    async ({ type, query, taskId, projectId }) => {
      try {
        const result = await handleQuery({ type, query, taskId, projectId });
        if (!result.ok) return err(result.error);

        switch (type) {
          case "search": {
            const { results, _hints } = result.data as { results: SearchResult[]; _hints?: string[] };
            return text(formatSearchResults(results, _hints));
          }
          case "list":
            return text(formatTaskList(result.data as TaskSlim[]));
          case "edges":
            return text(formatEdges(result.data as DetailedEdge[]));
          case "overview":
            return text(formatOverview(result.data as ProjectOverview));
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_context",
    {
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.object({
        taskId: z.string().describe("Task UUID"),
        depth: z.enum(["summary", "working", "agent", "planning"]).default("working")
          .describe("summary=quick, working=detailed, agent=multi-hop for coding, planning=spec for pre-implementation"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for 'working' depth"),
      }),
    },
    async ({ taskId, depth, projectId }) => {
      try {
        const result = await handleContext({ taskId, depth, projectId });
        if (!result.ok) return err(result.error);
        if (typeof result.data === "string") return text(result.data);
        return text(formatSummary(result.data as SummaryContext));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_analyze",
    {
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.object({
        type: z.enum(["ready", "blocked", "downstream", "critical_path", "plannable"])
          .describe("ready=unblocked work, blocked=waiting tasks, downstream=impact, critical_path=bottleneck, plannable=draft tasks ready for planning"),
        taskId: z.string().optional()
          .describe("Task UUID. Required for 'downstream'"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for ready/blocked/critical_path/plannable"),
      }),
    },
    async ({ type, taskId, projectId }) => {
      try {
        const result = await handleAnalyze({ type, taskId, projectId });
        if (!result.ok) return err(result.error);

        switch (type) {
          case "ready": {
            const { tasks, hints } = extractTasksWithHints<ReadyTask>(result.data);
            return text(formatReadyTasks(tasks, hints));
          }
          case "blocked":
            return text(formatBlockedTasks(result.data as BlockedTask[]));
          case "downstream":
            return text(formatDownstream(result.data as DownstreamNode[]));
          case "critical_path":
            return text(formatCriticalPath(result.data as CriticalPathTask[]));
          case "plannable": {
            const { tasks, hints } = extractTasksWithHints<ReadyTask>(result.data);
            return text(formatPlannableTasks(tasks, hints));
          }
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}
