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
} from "@/lib/graph/tool-handlers";
import type { ToolResult } from "@/lib/graph/tool-handlers";
import { identifierSchema } from "@/lib/graph/identifier";
import type { AuthContext } from "@/lib/auth/context";

/**
 * Format a successful tool result as MCP content.
 * @param data - Result data from a tool handler.
 * @returns MCP content response.
 */
function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

/**
 * Format an error as MCP content.
 * @param message - Error message.
 * @returns MCP error response.
 */
function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

/**
 * Convert a ToolResult to MCP response format.
 * Handles string results (context depths) as raw text.
 * @param result - Tool handler result.
 * @returns MCP content response.
 */
function toMcp(result: ToolResult) {
  if (!result.ok) return err(result.error);
  if (typeof result.data === "string") {
    return { content: [{ type: "text" as const, text: result.data }] };
  }
  return json(result.data);
}

const INSTRUCTIONS = [
  "Mymir is a persistent context network for coding projects. Tracks tasks, dependencies, decisions, and execution records across sessions.",
  "",
  "## Multi-Team Awareness",
  "Account spans every membership. No 'active' team. Read tools span all teams; writes name `organizationId` or auto-resolve when there's only one membership.",
  "- `mymir_project action='teams'` → every membership (id, name, slug, role, projectCount). Canonical team-discovery call. Includes empty teams.",
  "- `mymir_project action='list'` → projects with `organization.id`/`name`. Skips teams with zero projects — pair with `teams` for the full set.",
  "- Cross-team probes (an id you don't own) return 404-shaped. Only trust ids returned by list/teams/search/context.",
  "",
  "## Session Start",
  "1. `mymir_project action='list'` → projects across every team you belong to.",
  "2. `mymir_project action='teams'` → every membership (run when `list` is empty, before `create`, or when the user mentions a team you haven't seen).",
  "3. `mymir_project action='select' projectId='...'` → confirm the working project. Pass projectId on every subsequent call.",
  "4. No server-side session state.",
  "",
  "## Find Work",
  "- `mymir_analyze type='ready'` → unblocked tasks (pick from these first).",
  "- If none ready: `mymir_analyze type='plannable'` → draft tasks ready for planning.",
  "- `mymir_analyze type='critical_path'` → prioritize tasks on the bottleneck chain.",
  "",
  "## Implement a Task",
  "1. Claim: `mymir_task action='update' taskId='...' status='in_progress'` (prevents double-assignment).",
  "2. Get context: `mymir_context taskId='...' depth='agent'` (multi-hop deps + execution records).",
  "3. Do the work.",
  "4. Record: `mymir_task action='update' taskId='...' status='done'` with ALL of:",
  "   - `executionRecord`: 3-5 sentences on what was built (function names, file paths, endpoints).",
  "   - `decisions`: one-liner per technical choice (CHOICE + WHY).",
  "   - `files`: every file created or modified.",
  "   These feed downstream tasks — skipping them breaks the context chain.",
  "",
  "## Plan a Draft Task",
  "1. `mymir_context taskId='...' depth='planning'` → spec, prerequisites, related work.",
  "2. Write detailed plan (file paths, line numbers, specific changes, verification steps).",
  "3. `mymir_task action='update' taskId='...' implementationPlan='<full plan>' status='planned'`.",
  "",
  "## Create a Project",
  "1. `mymir_project action='teams'` → every membership with role + projectCount (covers empty teams `list` misses).",
  "2. Multi-team account + user didn't pick → ASK BEFORE CREATING. Server rejects ambiguous creates with the team list inline; don't default.",
  "3. `mymir_project action='create' title='...' description='...' organizationId='<team-uuid>'` (omit `organizationId` only when single-team).",
  "4. Then run the create-a-task workflow to populate the project.",
  "",
  "## Create a Task",
  "1. `mymir_task action='create' projectId='...' title='<verb+noun>' description='<2-4 sentences>' acceptanceCriteria=[...] tags=[...]`.",
  "2. `mymir_edge action='create' sourceTaskId='...' targetTaskId='...' edgeType='depends_on|relates_to' note='<why>'` to wire dependencies.",
  "3. `mymir_query type='edges' taskId='...'` to verify edges look correct.",
  "",
  "## Edges (Dependencies & Relationships)",
  "Edges drive ready/blocked analysis, critical path, and agent context propagation.",
  "- `depends_on`: source CANNOT start without target done first (source needs target's code, APIs, or decisions).",
  "- `relates_to`: tasks share context but neither blocks the other.",
  "- When in doubt: removing target makes source impossible → depends_on. Just harder → relates_to.",
  "- Always include a `note` explaining WHY the relationship exists — notes propagate to downstream agent context.",
  "- After completing a task: `mymir_query type='edges'` + `mymir_analyze type='downstream'` → check whether downstream descriptions, edge notes, or dependencies need updating based on decisions made.",
  "",
  "## Hints & Errors",
  "Tool responses may include `_hints` with contextual guidance — always read and follow them. Errors are token-dense and self-correcting: when an action is rejected, the message names the next tool to call (often with the team or task list inline). Re-read the error and act on it before falling back to asking the user for help.",
  "",
  "## Full Workflows",
  "Invoke `/mymir` skill for: dispatching to multiple agents, propagating changes through the graph, resuming sessions, refining tasks, and complex dependency management.",
  "",
  "## Remote Mode",
  "This is a stateless HTTP endpoint. No session state is persisted server-side. The `select` action on `mymir_project` returns a confirmation but does not set server state — always pass projectId explicitly on subsequent calls.",
].join("\n");

/**
 * Register all 6 Mymir tools on a server instance, bound to the caller's
 * auth context. Each tool handler receives `ctx` as its second arg so
 * authorization and team scoping happen inside the data layer.
 * @param server - Any object with a registerTool method (McpServer or mock).
 * @param ctx - Resolved auth context (user id only — team scope per call).
 */
export function registerAllTools(server: McpServer, ctx: AuthContext): void {
  server.registerTool(
    "mymir_project",
    {
      description: DESCRIPTIONS.mymir_project,
      inputSchema: z.object({
        action: z.enum(["list", "teams", "create", "select", "update"])
          .describe("list=projects across every team you belong to (skips empty teams). teams=every membership (id, name, slug, role, projectCount) — call before create or when list misses a team. create=new project (requires organizationId in multi-team accounts). select=confirm working project (returns projectId). update=modify fields."),
        projectId: z.uuid().optional()
          .describe("Project UUID. Required for select and update."),
        title: z.string().optional()
          .describe("Project name (2-5 words, verb-noun preferred). Required for create."),
        description: z.string().optional()
          .describe("3-5 sentence brief: problem, user, features, tech direction, constraints."),
        status: z.enum(["brainstorming", "decomposing", "active", "archived"]).optional()
          .describe("Lifecycle: brainstorming → decomposing → active → archived. Settable on create (defaults to 'brainstorming') or update."),
        categories: z.array(z.string()).optional()
          .describe("Task categories for this project (e.g. ['backend', 'frontend', 'mcp']). Drives drawer grouping in the UI."),
        identifier: identifierSchema.optional()
          .describe("Project prefix for task refs (e.g. 'MYM' yields MYM-1, MYM-2, …). 2-12 chars, uppercase alphanumeric, unique per team. Auto-derived from title on create when omitted. On update: renames every existing task ref — external references (PR titles, docs) no longer resolve."),
        organizationId: z.uuid().optional()
          .describe("Target team UUID for create. REQUIRED when you're a member of more than one team — the create is rejected with the team list inline otherwise. Auto-resolved when you belong to exactly one team. Membership is verified server-side; non-member targets return 'forbidden'."),
      }),
      annotations: {
        title: "Manage Project",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        if (params.action === "select") {
          if (!params.projectId) return err("projectId required for select. Call mymir_project action='list' first to enumerate your projects.");
          return json({ selected: params.projectId, _hints: ["Stateless mode — pass this projectId explicitly on every subsequent call."] });
        }
        const { action, ...rest } = params;
        const result = await handleProject(
          { action: action as "list" | "teams" | "create" | "update", ...rest },
          ctx,
        );
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
          .describe("create=new task. update=modify fields (pass only what changed). delete=remove (preview by default). reorder=change position."),
        taskId: z.uuid().optional()
          .describe("Task UUID. Required for update/delete/reorder."),
        projectId: z.uuid().optional()
          .describe("Project UUID. Required for create. Project's team scope is inherited."),
        title: z.string().optional()
          .describe("Verb+noun, short. Required for create (e.g. 'Implement JWT auth')."),
        description: z.string().optional()
          .describe("2-4 sentences: what to build, why it matters, key technical approach. Required for create."),
        status: z.enum(["draft", "planned", "in_progress", "done", "cancelled"]).optional()
          .describe("Lifecycle: draft → planned → in_progress → done. cancelled = terminal abandoned work; populate executionRecord with rationale. Cancelled deps are transparent — dependents stay blocked through the cancelled task's own unsatisfied deps. Excluded from progress and critical path."),
        acceptanceCriteria: z.array(
          z.union([
            z.string(),
            z.object({ id: z.string().optional(), text: z.string(), checked: z.boolean().optional() }),
          ]),
        ).optional()
          .describe("2-4 testable done conditions. Pass strings for new criteria, or objects with {text, checked} to set check state on existing rows."),
        decisions: z.array(z.string()).optional()
          .describe("Technical choices and constraints — one-liner per decision (CHOICE + WHY)."),
        tags: z.array(z.string()).optional()
          .describe("Kebab-case. Every task carries: exactly 1 work-type (bug/feature/refactor/docs/test/chore/perf), ≥1 cross-cutting concern (open: quality attribute or feature cluster), at most 2 tech tags (most important stack pieces touched), exactly 1 priority (release-blocker/core/normal/backlog). Do NOT tag codebase area (use category) or status. Run mymir_query type='overview' before coining new tags."),
        category: z.string().optional()
          .describe("Drawer group for this task. Should match a project category. Run mymir_project action='list' or mymir_query type='overview' to see available categories."),
        files: z.array(z.string()).optional()
          .describe("Every file path this task touches (relative to repo root)."),
        implementationPlan: z.string().optional()
          .describe("Implementation plan written during planning phase. Markdown."),
        executionRecord: z.string().optional()
          .describe("Summary of what was built during implementation. 3-5 sentences with concrete details (function names, file paths, endpoints). Markdown."),
        order: z.number().int().optional()
          .describe("0-based position. For create: initial order. For reorder: new position."),
        preview: z.boolean().optional().default(true)
          .describe("Delete only: true=show impact (default), false=actually delete."),
        overwriteArrays: z.boolean().optional().default(false)
          .describe("Update only: true=replace decisions/acceptanceCriteria/files entirely. Default false=append."),
      }),
      annotations: {
        title: "Manage Task",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleTask(params, ctx);
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
          .describe("create=new edge. update=modify type or note. remove=delete by edgeId or by source+target+type."),
        edgeId: z.uuid().optional()
          .describe("Edge UUID. Required for update. For remove: use this OR sourceTaskId+targetTaskId+edgeType."),
        sourceTaskId: z.uuid().optional()
          .describe("Source task UUID. Required for create. Alternative key for remove."),
        targetTaskId: z.uuid().optional()
          .describe("Target task UUID. Required for create. Alternative key for remove."),
        edgeType: z.enum(["depends_on", "relates_to"]).optional()
          .describe("depends_on = source needs target done first. relates_to = informational link, neither blocks the other. Required for create."),
        note: z.string().optional()
          .describe("Why this relationship exists — propagates to agent context for downstream tasks. Strongly recommended on create."),
      }),
      annotations: {
        title: "Manage Edge",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleEdge(params, ctx);
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
          .describe("search=find tasks by taskRef, title, or tag (case-insensitive, up to 20). list=all tasks ordered by position. edges=relationships on a task. overview=full project structure with progress + tag vocab."),
        query: z.string().optional()
          .describe("Search string for type='search'. Matches taskRef, title substring, or tag substring. Optional when `tags` is provided."),
        tags: z.array(z.string()).optional()
          .describe("Filter to tasks containing ANY of these exact tags (OR-within). Combine with `query` to narrow further. Pick from the Tag vocabulary in `type='overview'`."),
        taskId: z.uuid().optional()
          .describe("Task UUID for type='edges'."),
        projectId: z.uuid().optional()
          .describe("Project UUID. Required for search/list/overview."),
      }),
      annotations: {
        title: "Query Tasks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleQuery(params, ctx);
        return toMcp(result);
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
        taskId: z.uuid().describe("Task UUID."),
        depth: z.enum(["summary", "working", "agent", "planning"]).default("working")
          .describe("summary=quick (status, edge counts). working=detailed (criteria, decisions, 1-hop edges, siblings). agent=multi-hop deps + execution records (use BEFORE coding). planning=spec for pre-implementation (project description, prereqs, acceptance criteria, downstream specs)."),
        projectId: z.uuid().optional()
          .describe("Project UUID. Required for 'working' depth."),
      }),
      annotations: {
        title: "Get Task Context",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleContext(params, ctx);
        return toMcp(result);
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
          .describe("ready=unblocked work to start. blocked=waiting tasks with blocker details. downstream=transitive dependents (impact analysis before changes). critical_path=longest dep chain (project bottleneck). plannable=draft tasks with description+criteria, ready for planning."),
        taskId: z.uuid().optional()
          .describe("Task UUID. Required for 'downstream'."),
        projectId: z.uuid().optional()
          .describe("Project UUID. Required for ready/blocked/critical_path/plannable."),
      }),
      annotations: {
        title: "Analyze Graph",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleAnalyze(params, ctx);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

}

/**
 * Create a stateless MCP server bound to the caller's auth context.
 *
 * Read tools (`list`, queries, context) span every team the caller is a
 * member of. Writes either name an explicit `organizationId` (membership-
 * checked) or auto-resolve when the caller belongs to exactly one team.
 * Multi-team callers must pass `organizationId` on `mymir_project create`;
 * the server returns a hard error with the team list inline otherwise.
 *
 * @param ctx - Resolved auth context derived from the OAuth JWT.
 * @returns Configured McpServer instance.
 */
export function createMcpServer(ctx: AuthContext): McpServer {
  const server = new McpServer(
    { name: "mymir", version: "1.4.0" },
    { instructions: INSTRUCTIONS },
  );
  registerAllTools(server, ctx);
  return server;
}
