import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/lib/auth/authorization";
import { ok, error } from "@/lib/api/response";
import { buildAgentContext } from "@/lib/context/_core/agent";
import { buildPlanningContext } from "@/lib/context/_core/planning";

/**
 * POST handler for fetching task context (agent + planning).
 * @param req - Request with { taskId } as JSON body.
 * @returns JSON { agent, planning } with context strings.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch {
    return error("Unauthorized", 401);
  }

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
      buildAgentContext(ctx, taskId),
      buildPlanningContext(ctx, taskId),
    ]);
    return ok({ agent, planning });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return error("Task not found", 404);
    }
    console.error("[context] error:", err);
    return error("Internal server error", 500);
  }
}
