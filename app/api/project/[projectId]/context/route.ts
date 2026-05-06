import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/lib/auth/authorization";
import { ok, error } from "@/lib/api/response";
import { buildAgentContext } from "@/lib/context/_core/agent";
import { buildPlanningContext } from "@/lib/context/_core/planning";
import {
  buildWorkingContext,
  formatWorkingContext,
} from "@/lib/context/_core/working";

/**
 * POST handler for fetching task context bundles.
 *
 * Returns the three formatted bundles the BundlePreview can surface so the
 * UI shows what the agent would actually receive at every lifecycle stage:
 * `agent` (in_progress), `planning` (draft/plannable/ready), `working`
 * (planned 1-hop). Authorization is anchored on the task — the URL
 * `projectId` is decorative; the project is derived from the authorized
 * task to prevent cross-project enumeration.
 *
 * @param req - Request with `{ taskId }` JSON body.
 * @returns JSON `{ agent, planning, working }` with markdown context strings.
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
    const [agent, planning, workingRaw] = await Promise.all([
      buildAgentContext(ctx, taskId),
      buildPlanningContext(ctx, taskId),
      buildWorkingContext(ctx, taskId),
    ]);
    const working = await formatWorkingContext(workingRaw);
    return ok({ agent, planning, working });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return error("Task not found", 404);
    }
    console.error("[context] error:", err);
    return error("Internal server error", 500);
  }
}
