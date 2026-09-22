const encoder = new TextEncoder();
const clients = new Set<EventClient>();
const MAX_CLIENTS = 1_000;
const HEARTBEAT_MS = 15_000;

interface EventClient {
  closed: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
}

let eventVersion = 0;

function encodeEvent(event: string, data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function publishCurrentUpdate(reason: string): void {
  eventVersion += 1;
  const payload = {
    version: eventVersion,
    reason,
    updated_at: new Date().toISOString(),
  };

  for (const client of clients) {
    if (client.closed) {
      clients.delete(client);
      continue;
    }

    try {
      client.controller.enqueue(encodeEvent("current", payload));
    } catch {
      client.closed = true;
      clearInterval(client.heartbeat);
      clients.delete(client);
    }
  }
}

export function handleCurrentEvents(req: Request): Response {
  if (clients.size >= MAX_CLIENTS) {
    return Response.json({ error: "Too many event connections" }, { status: 503 });
  }

  let client: EventClient | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeat = setInterval(() => {
        if (!client || client.closed) return;
        try {
          client.controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          client.closed = true;
          clearInterval(client.heartbeat);
          clients.delete(client);
        }
      }, HEARTBEAT_MS);

      client = { closed: false, controller, heartbeat };
      clients.add(client);

      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      controller.enqueue(
        encodeEvent("ready", { version: eventVersion, connected_at: new Date().toISOString() }),
      );

      req.signal.addEventListener("abort", () => {
        if (!client || client.closed) return;
        client.closed = true;
        clearInterval(client.heartbeat);
        clients.delete(client);
        try {
          client.controller.close();
        } catch {
          // Stream is already closed.
        }
      }, { once: true });
    },
    cancel() {
      if (!client || client.closed) return;
      client.closed = true;
      clearInterval(client.heartbeat);
      clients.delete(client);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
