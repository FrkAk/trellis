import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleProject } from "@/lib/ai/tool-handlers";
import { setProjectId, resolveProjectId } from "../state.js";
import { json, error } from "./helpers.js";

/**
 * Register the mymir_project tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerProjectTool(server: McpServer): void {
  server.registerTool(
    "mymir_project",
    {
      description: DESCRIPTIONS.mymir_project,
      inputSchema: z.object({
        action: z.enum(["list", "create", "select", "update"])
          .describe("list=get all, create=new, select=set current, update=modify"),
        projectId: z.string().optional()
          .describe("Project UUID. Required for select. For update: uses current if omitted"),
        title: z.string().optional()
          .describe("Project name (2-5 words). Required for create"),
        description: z.string().optional()
          .describe("3-5 sentence brief: problem, user, features, tech direction, constraints"),
        status: z.enum(["brainstorming", "decomposing", "active", "archived"]).optional()
          .describe("Lifecycle: brainstorming → decomposing → active → archived"),
        categories: z.array(z.string()).optional()
          .describe("Task categories for this project (e.g. ['backend', 'frontend', 'mcp']). Determines drawer grouping in the UI."),
      }),
      annotations: {
        title: "Manage Project",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action, projectId, title, description, status, categories }) => {
      try {
        // select is MCP-only (session state)
        if (action === "select") {
          if (!projectId) return error("projectId required for select. Call with action='list' first to get IDs.");
          setProjectId(projectId);
          return json({ selected: projectId });
        }

        const pid = action === "update" ? resolveProjectId(projectId) : projectId;
        const result = await handleProject({ action, projectId: pid, title, description, status, categories });
        if (!result.ok) return error(result.error);

        // Auto-select after create
        if (action === "create") {
          const data = result.data as { id: string };
          setProjectId(data.id);
          return json({ ...data, _selected: true });
        }

        return json(result.data);
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
