import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleContext } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_context tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerContextTool(server: McpServer): void {
  server.registerTool(
    "mymir_context",
    {
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.object({
        taskId: z.string().describe("Task UUID"),
        depth: z.enum(["summary", "working", "agent", "planning"]).default("working")
          .describe("summary=quick, working=detailed, agent=multi-hop for coding, planning=spec for pre-implementation"),
        projectId: z.string().optional()
          .describe("Project UUID (uses current if omitted, needed for 'working' depth)"),
      }),
      annotations: {
        title: "Get Task Context",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ taskId, depth, projectId }) => {
      try {
        const pid = depth === "working" ? resolveProjectId(projectId) : projectId;
        const result = await handleContext({ taskId, depth, projectId: pid });
        if (!result.ok) return error(result.error);
        // Text depths return pre-formatted strings; summary returns JSON
        if (typeof result.data === "string") {
          return { content: [{ type: "text" as const, text: result.data }] };
        }
        return json(result.data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
