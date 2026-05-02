import { getProject } from '@/lib/graph/_core/queries';
import { getAuthContext, NoActiveTeamError } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/auth/authorization';
import { ok, error } from '@/lib/api/response';

/**
 * GET handler for fetching the full project graph.
 * @param _req - Incoming request (unused).
 * @param params - Route params with projectId.
 * @returns JSON response with full project graph, 401, 403, or 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) {
      return error('No active team selected', 403);
    }
    return error('Unauthorized', 401);
  }

  try {
    const { projectId } = await params;
    const graph = await getProject(ctx, projectId);

    if (!graph) {
      return error('Project not found', 404);
    }

    return ok(graph);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return error('Project not found', 404);
    }
    console.error('[graph] error:', err);
    return error(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
