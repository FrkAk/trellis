import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleEdge } from "@/lib/ai/tool-handlers";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_edge tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerEdgeTool(server: McpServer): void {
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
          .describe("Source task UUID. Required for create. For remove: alternative to edgeId"),
        targetTaskId: z.string().optional()
          .describe("Target task UUID. Required for create. For remove: alternative to edgeId"),
        edgeType: z.enum(["depends_on", "relates_to"]).optional()
          .describe("depends_on = source needs target done first. relates_to = informational link"),
        note: z.string().optional()
          .describe("Why this relationship exists — propagates to agent context for downstream tasks"),
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
        const result = await handleEdge(params);
        return result.ok ? json(result.data) : error(result.error);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
