// Receives error and performance reports from the signed-in browser. It is the only way browser
// data reaches telemetry: the browser never calls an outside service, and the report is checked,
// size-limited and rate-limited here before the server records it.
import { requestScope } from '../auth/request-scope';
import { createRateLimiter, type RateLimit } from '../auth/rate-limit';
import { BadRequestError } from '../projects/errors';
import { recordBrowserReports } from '../observability/browser-report-recorder';
import { readJson } from '../request';
import { checkReportBatch, MAX_REPORT_BODY_BYTES } from '../../observability/browser-report';
import type { Route } from './http';

/** Reports per person: a short burst after a page load, then a trickle. */
export const BROWSER_REPORT_LIMIT: RateLimit = { burst: 10, perSecond: 0.5 };

/** The path browsers send reports to. */
export const BROWSER_REPORT_PATH = '/api/telemetry/browser';

/** What the route needs: whether reporting is on, and a clock for the limiter. */
export type BrowserReportOptions = { enabled: boolean; now?: () => number };

/** Handles `POST /api/telemetry/browser`; answers 404 when telemetry is off. */
export function browserReportRoutes(options: BrowserReportOptions): Route {
  const limiter = createRateLimiter(BROWSER_REPORT_LIMIT, options.now);
  return async (_ws, request, url) => {
    if (url.pathname !== BROWSER_REPORT_PATH || request.method !== 'POST') return null;
    if (!options.enabled) return Response.json({ error: 'Not found.' }, { status: 404 });
    const person = requestScope(request).principal;
    const allowance = limiter.take(person.key);
    if (!allowance.allowed) {
      const headers = { 'Retry-After': String(allowance.retryAfterSeconds) };
      return Response.json({ error: 'Too many reports.' }, { status: 429, headers });
    }
    const checked = checkReportBatch(await readJson(request, MAX_REPORT_BODY_BYTES));
    if (!checked.ok) throw new BadRequestError(checked.error);
    recordBrowserReports(checked.reports);
    return new Response(null, { status: 204 });
  };
}
