import { getSession } from "@/lib/auth/session";
import { ok, error } from "@/lib/api/response";
import { buildAgentContext } from "@/lib/context/agent";
import { buildPlanningContext } from "@/lib/context/planning";

/**
 * POST handler for fetching task context (agent + planning).
 * Uses session auth (cookie-based), unlike the MCP tool endpoint.
 * @param req - Request with { taskId } as JSON body.
 * @returns JSON { agent, planning } with context strings.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return error("Unauthorized", 401);

  let body: { taskId?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { taskId } = body;
  if (!taskId) return error("taskId is required", 400);

  try {
    const [agent, planning] = await Promise.all([
      buildAgentContext(taskId),
      buildPlanningContext(taskId),
    ]);
    return ok({ agent, planning });
  } catch (err) {
    console.error("[context] error:", err);
    return error("Internal server error", 500);
  }
}
