// A server-sent event response that can be written to later, with a comment line at a steady pace so proxies keep it open.

/** How often a comment line is written, in milliseconds. */
export const KEEP_ALIVE_MS = 15_000;

/** One open stream. `send` writes an event, `close` ends the response. */
export type EventStream = { response: Response; send(event: { id?: number; name?: string; data: string }): void; close(): void };

/** Opens a stream that closes by itself when the request is aborted. `onClose` runs once, whoever closed it. */
export function openEventStream(signal: AbortSignal, onClose: () => void, keepAliveMs: number = KEEP_ALIVE_MS): EventStream {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let finished = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function write(text: string): void {
    if (finished) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      close();
    }
  }
  function close(): void {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    signal.removeEventListener('abort', close);
    try {
      controller.close();
    } catch {
      /* The reader already went away. */
    }
    onClose();
  }

  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
      // A first line makes the response headers leave at once, so the reader sees the stream open before any event.
      started.enqueue(encoder.encode(': open\n\n'));
    },
    cancel: close,
  });
  timer = setInterval(() => write(': keep-alive\n\n'), keepAliveMs);
  signal.addEventListener('abort', close);
  const response = new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  return {
    response,
    send({ id, name, data }) {
      // Event data is one JSON value or one protocol line, so it holds no line break.
      write(`${id === undefined ? '' : `id: ${id}\n`}${name ? `event: ${name}\n` : ''}data: ${data}\n\n`);
    },
    close,
  };
}
