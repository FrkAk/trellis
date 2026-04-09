import { dbEvents } from '@/lib/events';
import { getSession } from '@/lib/auth/session';
import { error } from '@/lib/api/response';

/**
 * SSE endpoint — streams DB change notifications to the browser.
 * Keeps one HTTP connection open per tab. No DB queries.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getSession();
  if (!session) return error("Unauthorized", 401);

  const { projectId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(pid: string) {
        if (pid === projectId || pid === '*') {
          controller.enqueue(encoder.encode(`data: changed\n\n`));
        }
      }

      dbEvents.on('change', send);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30_000);

      // Cleanup when client disconnects
      _req.signal.addEventListener('abort', () => {
        dbEvents.off('change', send);
        clearInterval(heartbeat);
        controller.close();
      });
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
