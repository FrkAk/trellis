import { dbEvents } from '@/lib/events';
import { getAuthContext, NoActiveTeamError } from '@/lib/auth/context';
import { ForbiddenError, assertProjectAccess } from '@/lib/auth/authorization';
import { error } from '@/lib/api/response';
import { acquireSSESlot, releaseSSESlot } from '@/lib/api/sse-limiter';

/**
 * SSE endpoint — streams DB change notifications to the browser.
 * Keeps one HTTP connection open per tab. No DB queries beyond auth.
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

  const { projectId } = await params;

  try {
    await assertProjectAccess(projectId, ctx);
  } catch (err) {
    if (err instanceof ForbiddenError) return error('Project not found', 404);
    throw err;
  }

  const userId = ctx.userId;
  if (!acquireSSESlot(userId)) {
    return new Response(
      JSON.stringify({ error: 'Too many concurrent connections' }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
      },
    );
  }

  let slotReleased = false;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(pid: string) {
        if (pid === projectId || pid === '*') {
          controller.enqueue(encoder.encode(`data: changed\n\n`));
        }
      }

      dbEvents.on('change', send);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30_000);

      _req.signal.addEventListener('abort', () => {
        dbEvents.off('change', send);
        clearInterval(heartbeat);
        if (!slotReleased) {
          slotReleased = true;
          releaseSSESlot(userId);
        }
        controller.close();
      });
    },
    cancel() {
      if (!slotReleased) {
        slotReleased = true;
        releaseSSESlot(userId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
