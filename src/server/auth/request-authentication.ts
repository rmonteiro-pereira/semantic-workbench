// Authenticates network requests before operation routing and policy evaluation.
import type { BearerValidator } from './bearer';
import type { ServerAuthentication } from './authentication';
import type { RequestLimits } from './rate-limit';
import { localPrincipal, type Principal } from './principal';
import { acceptsBearer, BearerError } from './bearer';
import { validCsrf } from './csrf';
import type { RouteAction } from './route-actions';
import type { AccessRequest } from './request-scope';
import { requestSourceIp } from '../request';
import type { AuditLog } from './audit';
import { auditDenial, agentRefusal } from './refusal';
import { createAnonymousAuditGate, createRateLimitReport, createRateLimiter, DEFAULT_REQUEST_LIMITS, SIGN_IN_PATHS } from './rate-limit';
import { recordAuthFailure } from '../observability/metrics';

/** Program endpoints authenticate their own grants or tokens and never use browser cookies or CSRF markers. */
const GRANT_ENDPOINT_PATHS: ReadonlySet<string> = new Set(['/oauth/token', '/api/mcp']);
/** Browser forms that carry the session's request token in their own body, which the route checks. The request must still come from this origin. */
const FORM_POST_PATHS: ReadonlySet<string> = new Set(['/oauth/consent', '/oauth/setup']);

/** Dependencies read by network authentication and request admission. */
export type RequestAuthenticationOptions = {
  mode?: 'local' | 'server';
  principal?: (request: Request) => Principal | null | Promise<Principal | null>;
  requestLimits?: RequestLimits;
  now?: () => number;
  bearer?: BearerValidator;
  publicOrigin?: string;
  authentication?: ServerAuthentication['authentication'];
};

/** The 429 answer for a source address that used up its allowance. */
function tooManyRequests(retryAfterSeconds: number): Response {
  const headers = { 'Retry-After': String(retryAfterSeconds) };
  return Response.json({ error: 'Too many requests.' }, { status: 429, headers });
}

/** Builds the network authentication stage with request-local limit and audit state. */
export function createRequestAuthentication(options: RequestAuthenticationOptions, audit: AuditLog, localCheck: (request: Request) => Response | null) {
  const mode = options.mode ?? 'local';
  const resolve = options.principal ?? (() => (mode === 'local' ? localPrincipal() : null));
  const limits = options.requestLimits ?? DEFAULT_REQUEST_LIMITS;
  const clock = options.now ?? Date.now;
  const requestLimiter = createRateLimiter(limits.requests, clock);
  const signInLimiter = createRateLimiter(limits.signIn, clock);
  const auditAnonymous = createAnonymousAuditGate(clock);
  const reportRateLimited = createRateLimitReport(clock);
  const sourceOf = (request: Request) => (request as AccessRequest)[requestSourceIp];
  /** Answers 429 for a caller over an allowance and reports the source to the log. */
  function refuseRateLimited(request: Request, retryAfterSeconds: number): Response {
    reportRateLimited(sourceOf(request) ?? 'unknown');
    recordAuthFailure('rate-limited');
    return tooManyRequests(retryAfterSeconds);
  }
  /**
   * Refuses a caller that used up its allowance; null lets the request proceed. A signed-in
   * person is limited as themselves, so one anonymous visitor behind the same address cannot
   * use up their allowance. Everyone else, and the sign-in routes, are limited by address.
   */
  async function limitedResponse(request: Request): Promise<Response | null> {
    const address = sourceOf(request) ?? 'unknown';
    if (SIGN_IN_PATHS.has(new URL(request.url).pathname) || GRANT_ENDPOINT_PATHS.has(new URL(request.url).pathname)) {
      const signIn = signInLimiter.take(address);
      return signIn.allowed ? null : refuseRateLimited(request, signIn.retryAfterSeconds);
    }
    const person = await resolve(request);
    const key = person ? `person:${person.id}` : address;
    const general = requestLimiter.take(key);
    return general.allowed ? null : refuseRateLimited(request, general.retryAfterSeconds);
  }
  /**
   * Resolves a bearer header into a client principal. Returns nothing when the request carries no
   * bearer header, and an audited 401 when the header cannot be trusted on this route.
   */
  async function bearerIdentity(request: Request, requestId: string): Promise<Principal | Response | undefined> {
    const authorization = request.headers.get('Authorization') ?? '';
    if (mode !== 'server' || !/^Bearer(\s|$)/i.test(authorization)) return undefined;
    const refuse = (reason: string) => {
      recordAuthFailure(reason);
      const status = reason === 'provider-unreachable' ? 503 : 401;
      // Nobody is identified yet, so a loop of bad tokens must not fill the audit log.
      const admission = auditAnonymous(sourceOf(request), reason);
      const { record, suppressed } = admission;
      return agentRefusal(audit, { requestId, reason, status, audited: record, suppressed });
    };
    // Outside the agent API the token is not even validated, so nothing in it is trusted.
    if (!acceptsBearer(new URL(request.url).pathname)) return refuse('bearer-scope');
    if (!options.bearer) return refuse('token-invalid');
    try {
      return await options.bearer(authorization);
    } catch (error) {
      if (!(error instanceof BearerError)) throw error;
      return refuse(error.reason);
    }
  }
  /** Audits a visitor who is not signed in, at most once a minute per source address. */
  function auditAnonymousDenial(request: Request, requestId: string, action: RouteAction['action']): Response | null {
    const { record, suppressed } = auditAnonymous(sourceOf(request), 'sign-in-required');
    if (!record) return null;
    return auditDenial(audit, {
      requestId,
      principal: { id: 'anonymous', kind: 'anonymous' },
      action,
      resource: { type: 'workspace' },
      decision: 'deny',
      rules: [],
      reason: 'sign-in-required',
      suppressed,
    });
  }
  /** The cross-site check of a cookie request: a marker header, the logout form's token, or for the connection forms the right origin. */
  async function crossSiteCheckPasses(request: Request, url: URL): Promise<boolean> {
    if (request.method === 'POST' && FORM_POST_PATHS.has(url.pathname)) return request.headers.get('Origin') === options.publicOrigin;
    const logoutToken = url.pathname === '/auth/logout' ? (await options.authentication?.session(request))?.csrf : undefined;
    return validCsrf(request, options.publicOrigin, logoutToken);
  }
  async function authenticate(request: AccessRequest, requestId: string): Promise<Principal | Response | undefined> {
    // Relay routes authenticate their own bearer, then invoke the operation boundary.
    if (/^\/api\/acp\/relay\/[A-Za-z0-9_-]{1,64}\/(hello|frames|stream|bye)$/.test(new URL(request.url).pathname)) return undefined;
    if (mode === 'server') {
      const limited = await limitedResponse(request);
      if (limited) return limited;
    }
    if (mode === 'local') {
      const refused = localCheck(request);
      if (refused) return refused;
    }
    const url = new URL(request.url);
    // The token endpoint answers by its grant alone; neither a cookie nor a bearer header means anything there.
    if (mode === 'server' && GRANT_ENDPOINT_PATHS.has(url.pathname)) return undefined;
    // A bearer token replaces the session cookie, so a signed-in browser cannot widen a client.
    const client = await bearerIdentity(request, requestId);
    if (client instanceof Response) return client;
    // The cross-site check protects cookies a browser sends on its own. A validated bearer token
    // is never sent that way, so a client skips it.
    if (!client && mode === 'server' && !(await crossSiteCheckPasses(request, url))) {
      recordAuthFailure('csrf-invalid');
      return new Response('Forbidden', { status: 403 });
    }
    return client;
  }
  return { authenticate, resolve, auditAnonymousDenial };
}
