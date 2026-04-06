import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleTask } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_task tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerTaskTool(server: McpServer): void {
  server.registerTool(
    "mymir_task",
    {
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.object({
        action: z.enum(["create", "update", "delete", "reorder"])
          .describe("create=new task, update=modify fields, delete=remove, reorder=change position"),
        taskId: z.string().optional()
          .describe("Task UUID. Required for update/delete/reorder"),
        title: z.string().optional()
          .describe("Short task name. Required for create"),
        description: z.string().optional()
          .describe("2-4 sentences: what to build, why it matters, key technical approach. Required for create"),
        status: z.enum(["draft", "planned", "in_progress", "done"]).optional()
          .describe("Task lifecycle status"),
        acceptanceCriteria: z.array(z.string()).optional()
          .describe("2-4 testable done conditions"),
        decisions: z.array(z.string()).optional()
          .describe("Key technical decisions and constraints"),
        tags: z.array(z.string()).optional()
          .describe("Tags for grouping (e.g. ['auth', 'backend'])"),
        category: z.string().optional()
          .describe("Drawer group for this task. Should match a project category. Run mymir_project to see available categories."),
        files: z.array(z.string()).optional()
          .describe("File paths this task touches"),
        implementationPlan: z.string().optional()
          .describe("Implementation plan written during planning phase"),
        executionRecord: z.string().optional()
          .describe("Summary of what was built during implementation"),
        order: z.number().int().optional()
          .describe("0-based position. For create: initial order. For reorder: new position"),
        preview: z.boolean().optional().default(true)
          .describe("For delete only: true=show impact (default), false=actually delete"),
        overwriteArrays: z.boolean().optional().default(false)
          .describe("For update only: true=replace decisions/acceptanceCriteria/files entirely. Default false=append to existing"),
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
        const projectId = params.action === "create" ? resolveProjectId(undefined) : undefined;
        const result = await handleTask({ ...params, projectId });
        return result.ok ? json(result.data) : error(result.error);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
