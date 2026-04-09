import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { ok, error } from "@/lib/api/response";

/**
 * Build the WHERE condition for a conversation lookup.
 * @param projectId - UUID of the project.
 * @param taskId - Optional UUID of the task (null for project-level).
 * @returns Drizzle SQL condition.
 */
function buildCondition(projectId: string, taskId: string | null) {
  return taskId
    ? and(eq(conversations.projectId, projectId), eq(conversations.taskId, taskId))
    : and(eq(conversations.projectId, projectId), sql`${conversations.taskId} IS NULL`);
}

/**
 * GET handler to fetch persisted conversation messages.
 * @param req - Incoming request with optional taskId query param.
 * @param params - Route params containing projectId.
 * @returns JSON with messages array.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return error("Unauthorized", 401);

    const { projectId } = await params;
    const taskId = new URL(req.url).searchParams.get("taskId");
    const [conv] = await db.select().from(conversations).where(buildCondition(projectId, taskId));
    return ok({ messages: conv?.messages ?? [] });
  } catch (err) {
    console.error("[conversations] error:", err);
    return error(err instanceof Error ? err.message : "Internal error", 500);
  }
}

/**
 * DELETE handler to clear a conversation's messages.
 * @param req - Incoming request with optional taskId query param.
 * @param params - Route params containing projectId.
 * @returns 204 No Content on success.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return error("Unauthorized", 401);

    const { projectId } = await params;
    const taskId = new URL(req.url).searchParams.get("taskId");
    await db.delete(conversations).where(buildCondition(projectId, taskId));
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[conversations] error:", err);
    return error(err instanceof Error ? err.message : "Internal error", 500);
  }
}
