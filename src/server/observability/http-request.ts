// Wraps the handling of one HTTP request: gives it a request context for logs, a server span, a
// duration metric and one finished-request log line. The route is logged as its template, never
// as the raw path, so identifiers and file names stay out of logs and metric labels.
import type { Span } from '@opentelemetry/api';
import { log } from './log';
import { recordRequest } from './metrics';
import { runInRequest, type RequestContext } from './request-context';
import { SpanKind, withSpan } from './tracing';

/** The log level a finished request deserves: failures are loud, successes are routine. */
export function levelForStatus(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

const STANDARD_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** The method as a label: a client can send any token, so unusual ones are grouped. */
export function methodLabel(method: string): string {
  return STANDARD_METHODS.has(method) ? method : 'OTHER';
}

/** What {@link observeRequest} needs to know about the request. */
export type ObservedRequest = {
  request: Request;
  requestId: string;
  /** The route template, decided by the caller from the route inventory. */
  route: string;
  /** Produces the response; it runs inside the request context and the span. */
  handle: () => Promise<Response>;
};

/** Handles a request under its context and span, then records how it went. */
export async function observeRequest(observed: ObservedRequest): Promise<Response> {
  const { request, requestId, route } = observed;
  const context: RequestContext = { requestId };
  const method = methodLabel(request.method);
  return runInRequest(context, () =>
    withSpan(`${method} ${route}`, { kind: SpanKind.SERVER }, async span => {
      const started = performance.now();
      let status = 500;
      try {
        const response = await observed.handle();
        status = response.status;
        return response;
      } finally {
        const durationMs = Math.round(performance.now() - started);
        finishRequest(span, { method, route, status, durationMs, actor: context.actor });
      }
    }),
  );
}

type Finished = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  actor?: string;
};

function finishRequest(span: Span, finished: Finished): void {
  const { method, route, status, durationMs } = finished;
  const actor = finished.actor ?? 'anonymous';
  span.setAttributes({
    'http.request.method': method,
    'http.route': route,
    'http.response.status_code': status,
    'sw.actor': actor,
  });
  recordRequest(route, method, status, durationMs);
  log[levelForStatus(status)]('http.request', { method, route, status, durationMs, actor });
}
