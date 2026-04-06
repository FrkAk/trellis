import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleAnalyze } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_analyze tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerAnalyzeTool(server: McpServer): void {
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
          .describe("Project UUID (uses current if omitted). For ready/blocked/critical_path"),
      }),
      annotations: {
        title: "Analyze Graph",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ type, taskId, projectId }) => {
      try {
        const pid = type !== "downstream" ? resolveProjectId(projectId) : projectId;
        const result = await handleAnalyze({ type, taskId, projectId: pid });
        return result.ok ? json(result.data) : error(result.error);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
