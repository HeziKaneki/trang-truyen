import { currentUser, rateLimit } from '@/server/security';
import { redis } from '@/server/redis';
import { errorResponse } from '@/server/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    await rateLimit(`sse:${user.id}`, 20);
  } catch (error) {
    return errorResponse(error);
  }
  const sub = redis().duplicate();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const interval = setInterval(() => push(': heartbeat\n\n'), 20000);
      const expiry = setTimeout(() => cleanup(), 5 * 60_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearTimeout(expiry);
        sub.disconnect();
        request.signal.removeEventListener('abort', cleanup);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener('abort', cleanup);
      sub.on('message', (_channel, message) => push(`data: ${message}\n\n`));
      sub.on('error', cleanup);
      try {
        await sub.subscribe(`notifications:${user.id}`);
        push('data: {"type":"connected"}\n\n');
      } catch {
        cleanup();
      }
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
