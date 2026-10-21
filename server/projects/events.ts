// Server-sent event hub (contracts/sse-events.md, research R4). Events only invalidate; clients
// refetch. Ids increase monotonically; the last RING_SIZE events can be replayed after a reconnect.
export const RING_SIZE = 1000;
export const HEARTBEAT_MS = 15_000;
export type WorkbenchEvent = { id: number; event: string; data: unknown };
const frame = (e: WorkbenchEvent) =>
  `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
export function createEvents(options: { ringSize?: number; heartbeatMs?: number } = {}) {
  const ringSize = options.ringSize ?? RING_SIZE;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const ring: WorkbenchEvent[] = [];
  let lastId = 0;
  const clients = new Set<(chunk: string) => void>();
  // Events after `since`, or null when they are no longer in the ring (the client must resync).
  function replay(since: number): WorkbenchEvent[] | null {
    if (since === lastId) return [];
    if (
      since > lastId ||
      (ring.length && since < ring[0].id - 1) ||
      (!ring.length && since < lastId)
    )
      return null;
    return ring.filter(e => e.id > since);
  }
  return {
    emit(event: string, data: unknown) {
      const e = { id: ++lastId, event, data };
      ring.push(e);
      if (ring.length > ringSize) ring.shift();
      for (const send of clients) send(frame(e));
      return e;
    },
    get lastId() {
      return lastId;
    },
    get clientCount() {
      return clients.size;
    },
    replay,
    stream(req: Request) {
      const header = req.headers.get('last-event-id');
      const since = header !== null && /^\d+$/.test(header) ? Number(header) : null;
      let send: ((chunk: string) => void) | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      const cleanup = () => {
        if (send) clients.delete(send);
        if (timer) clearInterval(timer);
      };
      const body = new ReadableStream<Uint8Array>({
        start: controller => {
          const encoder = new TextEncoder();
          send = chunk => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              cleanup();
            }
          };
          send(`retry: 2000\n: connected ${lastId}\n\n`);
          if (since !== null) {
            const missed = replay(since);
            if (missed === null) send(frame({ id: lastId, event: 'resync', data: {} }));
            else for (const e of missed) send(frame(e));
          }
          clients.add(send);
          timer = setInterval(() => send!(': ping\n\n'), heartbeatMs);
          req.signal?.addEventListener('abort', () => {
            cleanup();
            try {
              controller.close();
            } catch {}
          });
        },
        cancel: cleanup,
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    },
  };
}
export type Events = ReturnType<typeof createEvents>;
