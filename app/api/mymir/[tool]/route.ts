import {
  handleProject,
  handleTask,
  handleEdge,
  handleQuery,
  handleContext,
  handleAnalyze,
} from "@/lib/ai/tool-handlers";
import type { ToolResult } from "@/lib/ai/tool-handlers";
import { ok, error } from "@/lib/api/response";

/* eslint-disable @typescript-eslint/no-explicit-any */
const HANDLERS: Record<string, (params: any) => Promise<ToolResult>> = {
  project: handleProject,
  task: handleTask,
  edge: handleEdge,
  query: handleQuery,
  context: handleContext,
  analyze: handleAnalyze,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * POST handler for mymir tool operations.
 * Routes to one of 6 tool handlers based on the [tool] segment.
 * @param req - Request with tool params as JSON body.
 * @param params - Route params with tool name.
 * @returns JSON response with handler result.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  const { tool } = await params;
  const handler = HANDLERS[tool];
  if (!handler) {
    return error(`Unknown tool: ${tool}`, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  try {
    const result = await handler(body);
    if (!result.ok) {
      return error(result.error, 400);
    }
    return ok(result.data);
  } catch (err) {
    console.error(`[mymir/${tool}] error:`, err);
    return error("Internal server error", 500);
  }
}
