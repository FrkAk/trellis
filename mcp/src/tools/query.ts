import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleQuery } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_query tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    "mymir_query",
    {
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "list", "edges", "overview"])
          .describe("search=find by name or tag, list=all tasks, edges=task relationships, overview=project structure"),
        query: z.string().optional()
          .describe("Search string for type='search' — matches against task titles and tags"),
        taskId: z.string().optional()
          .describe("Task UUID for type='edges'"),
        projectId: z.string().optional()
          .describe("Project UUID (uses current if omitted)"),
      }),
      annotations: {
        title: "Query Tasks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ type, query, taskId, projectId }) => {
      try {
        const pid = type !== "edges" ? resolveProjectId(projectId) : projectId;
        const result = await handleQuery({ type, query, taskId, projectId: pid });
        return result.ok ? json(result.data) : error(result.error);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
