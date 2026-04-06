import { getProject } from '@/lib/graph/queries';
import { ok, error } from '@/lib/api/response';

/**
 * GET handler for fetching the full project graph.
 * @param _req - Incoming request (unused).
 * @param params - Route params with projectId.
 * @returns JSON response with full project graph.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const graph = await getProject(projectId);

    if (!graph) {
      return error('Project not found', 404);
    }

    return ok(graph);
  } catch (err) {
    console.error("[graph] error:", err);
    return error(err instanceof Error ? err.message : "Internal error", 500);
  }
}
