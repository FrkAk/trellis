import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTool } from "./project.js";
import { registerTaskTool } from "./task.js";
import { registerEdgeTool } from "./edge.js";
import { registerQueryTool } from "./query.js";
import { registerContextTool } from "./context.js";
import { registerAnalyzeTool } from "./analyze.js";

/**
 * Register all Mymir MCP tools on the server.
 * @param server - The MCP server instance.
 */
export function registerAllTools(server: McpServer): void {
  registerProjectTool(server);
  registerTaskTool(server);
  registerEdgeTool(server);
  registerQueryTool(server);
  registerContextTool(server);
  registerAnalyzeTool(server);
}
