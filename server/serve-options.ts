// Builds the options of the HTTP listener, so what the production server does at its edge is
// plain data that tests can read.

/** What the listener needs from the process that starts it. */
export type ListenerSettings = {
  hostname: string;
  port: number;
  fetch: (request: Request) => Response | Promise<Response>;
};

/**
 * Seconds a connection may sit idle before Bun closes it. This is Bun's longest setting. Remote
 * Git commands (fetch, pull, push, sync) can send nothing for longer, so their routes ask the
 * server to keep the connection open.
 */
export const IDLE_TIMEOUT_SECONDS = 255;

/**
 * Production listener options: no development mode, so a failure never renders a debug page,
 * and an error handler that answers every failure the same way. Long-lived responses opt out of
 * the idle timeout one by one instead of the whole server disabling it.
 */
export function serveOptions(settings: ListenerSettings) {
  return {
    ...settings,
    development: false,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    error: (error: Error) => {
      console.error(`[http] listener ${error.name}: ${error.message}`);
      return Response.json({ error: 'Internal error.' }, { status: 500 });
    },
  };
}
