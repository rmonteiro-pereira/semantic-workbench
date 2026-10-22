// Composes provider identity, durable sessions and the existing access boundary.
import { SignInError } from './sign-in-error';
import { hkdfSync } from 'node:crypto';
import { join } from 'node:path';
import type { ServerConfig } from '../config';
import type { Workspace } from '../projects/workspace';
import { createAccessControl } from './authorize';
import { openAdminRepository } from './admin-repo';
import { createAuditLog } from './audit';
import { createOidcClient, safeReturnTo, signInError, type OidcClient } from './oidc';
import { createAttemptStore, ATTEMPT_TTL_SECONDS } from './attempts';
import { createDirectoryClient, directoryGroupIds } from './directory';
import { resolvePrincipalGroups, type NormalizedPrincipal, type Principal } from './principal';
import {
  createSessionStore,
  cookieName,
  readCookie,
  sessionCookie,
  type Session,
} from './sessions';
import { requestAuditId, type AuditRequest } from '../request';

/** Opens validated server authentication only after the workspace lease has been acquired. */
/**
 * Adds the OAuth error code and description a provider returned to the server log line. Only
 * those two standard fields are read: other error messages can quote request data such as an
 * authorization code, so they never reach the log.
 */
export function providerDetail(cause: unknown) {
  if (!(cause instanceof Error)) return '';
  const body = cause as Error & { error?: unknown; error_description?: unknown };
  if (typeof body.error !== 'string') return '';
  const description =
    typeof body.error_description === 'string' ? `: ${body.error_description}` : '';
  return ` (${body.error}${description})`;
}

/** One audited sign-in, sign-out, session or directory event. */
type SignInEvent = {
  action: 'signIn' | 'signOut' | 'sessionEnded' | 'directoryLookup';
  principal: Principal | null;
  outcome: 'ok' | 'refused' | 'degraded';
  reason?: string;
  request?: Request;
};

export async function createServerAuthentication(
  ws: Workspace,
  config: ServerConfig,
  suppliedClient?: OidcClient,
) {
  const client = suppliedClient ?? (await createOidcClient(config));
  // The process keeps one administration repository: its writes are serialized only within one
  // instance, and each commit replaces the policy every request decides with.
  const repository = openAdminRepository({
    root: ws.layout.root,
    committed: config => access.reload(config),
  });
  await repository.ensure();
  const policy = repository.load();
  const settings = repository.settings();
  const access = createAccessControl({
    mode: 'server',
    config: policy,
    bootstrap: config.bootstrapAdmins,
    groupMatch: config.oidc.provider === 'entra' ? 'case-insensitive' : 'exact',
    knownProjects: () => ws.state.registry().projects.map(project => project.slug),
    context: () => ({ hour: new Date().getUTCHours() }),
  });
  const audit = createAuditLog({ dir: join(ws.layout.state, 'audit'), mirror: console.log });
  function record({ action, principal, outcome, reason, request }: SignInEvent) {
    audit.append({
      requestId: (request as AuditRequest | undefined)?.[requestAuditId] ?? crypto.randomUUID(),
      principal: principal ?? { id: 'anonymous', kind: 'anonymous' },
      action,
      resource: { type: 'workspace' },
      rules: [],
      decision: outcome === 'refused' ? 'deny' : 'allow',
      outcome,
      reason,
    });
  }
  const sessions = createSessionStore({
    dir: join(ws.layout.state, 'sessions'),
    key: new Uint8Array(hkdfSync('sha256', config.sessionKey, '', 'sw-session', 32)),
    idleHours: settings.session.idleHours,
    absoluteHours: settings.session.absoluteHours,
    ended: (session, reason) =>
      record({ action: 'sessionEnded', principal: session.principal, outcome: 'ok', reason }),
  });
  const attempts = createAttemptStore(
    new Uint8Array(hkdfSync('sha256', config.sessionKey, '', 'sw-attempt', 32)),
    join(ws.layout.state, 'auth-attempts'),
  );
  function logFailure(request: Request | undefined, error: Error) {
    const requestId = (request as AuditRequest | undefined)?.[requestAuditId] ?? 'startup';
    console.error(`[auth] ${requestId} ${error.message}${providerDetail(error.cause)}`);
  }
  function recordOrRefuse(event: SignInEvent): Response | undefined {
    try {
      record(event);
    } catch {
      logFailure(event.request, new Error('audit-unavailable'));
      return Response.json({ error: 'Audit unavailable' }, { status: 503 });
    }
  }
  async function principalFor(identity: NormalizedPrincipal, request?: Request) {
    if (identity.groupOverage) {
      const directory = createDirectoryClient({
        graphUrl: config.directory.graphUrl,
        token: () => client.directoryToken(),
        failure: reason => logFailure(request, new Error(reason)),
      });
      identity = await resolvePrincipalGroups(identity, oid =>
        config.directory.overage === 'directory'
          ? directory.groups(oid, directoryGroupIds(access.snapshot().config))
          : Promise.resolve(null),
      );
      if (identity.groupsResolved === 'failed') {
        record({
          action: 'directoryLookup',
          principal: access.principalFor(identity),
          outcome: 'degraded',
          reason: 'directory-unavailable',
          request,
        });
      }
    }
    const principal = access.principalFor(identity);
    ws.state.recordUser(principal, new Date().toISOString());
    return principal;
  }
  const refreshing = new Map<string, Promise<Session | null>>();
  async function refresh(session: Session, request: Request): Promise<Session | null> {
    try {
      const renewed = await client.refresh(session.tokens);
      if (renewed.principal.id !== session.principal.id)
        throw new Error('Refresh identity changed.');
      session.principal = await principalFor(renewed.principal, request);
      session.tokens = renewed.tokens;
      if (!(await sessions.update(session))) return null;
      return session;
    } catch (error) {
      logFailure(request, signInError(error));
      await sessions.end(session.id, 'refresh-failed');
      return null;
    }
  }
  const requests = new WeakMap<Request, Promise<Session | null>>();
  async function resolve(request: Request) {
    const id = readCookie(request, cookieName(config.publicUrl));
    if (!id) return null;
    let session = await sessions.get(id);
    if (!session) return null;
    if (Date.now() >= session.tokens.expiresAt) {
      let pending = refreshing.get(id);
      if (!pending) {
        pending = refresh(session, request).finally(() => refreshing.delete(id));
        refreshing.set(id, pending);
      }
      session = await pending;
    }
    if (session) {
      session.principal = access.principalFor({ ...session.principal, deactivated: false });
    }
    return session;
  }
  function session(request: Request) {
    let pending = requests.get(request);
    if (!pending) {
      pending = resolve(request);
      requests.set(request, pending);
    }
    return pending;
  }
  async function login(returnTo: string, request?: Request): Promise<Response> {
    try {
      const started = await client.login(returnTo);
      return new Response(null, {
        status: 302,
        headers: {
          Location: started.url,
          'Set-Cookie': sessionCookie(
            attempts.encode(started.attempt),
            config.publicUrl,
            'auth',
            ATTEMPT_TTL_SECONDS,
          ),
        },
      });
    } catch (error) {
      const failure = signInError(error);
      logFailure(request, failure);
      const refused = recordOrRefuse({
        action: 'signIn',
        principal: null,
        outcome: 'refused',
        reason: failure.reason,
        request,
      });
      if (refused) return refused;
      throw new SignInError(failure.reason, returnTo, failure.cause);
    }
  }
  async function callback(request: Request): Promise<Response> {
    let returnTo = '/';
    let response: Response;
    try {
      const attempt = attempts.consume(readCookie(request, cookieName(config.publicUrl, 'auth')));
      returnTo = safeReturnTo(attempt.returnTo);
      const url = new URL(request.url);
      const callbackUrl = new URL('/auth/callback' + url.search, config.publicUrl);
      const identity = await client.callback(callbackUrl, attempt);
      const principal = await principalFor(identity.principal, request);
      const denied = principal.deactivated || !principal.grants.length;
      const refused = recordOrRefuse({
        action: 'signIn',
        principal,
        outcome: denied ? 'refused' : 'ok',
        reason: denied ? 'no-grant' : undefined,
        request,
      });
      if (refused) return refused;
      const existing = readCookie(request, cookieName(config.publicUrl));
      if (existing) await sessions.end(existing, 'replaced');
      const created = await sessions.create({ principal, tokens: identity.tokens });
      response = new Response(null, {
        status: 302,
        headers: {
          Location: denied ? '/auth/no-access' : returnTo,
          'Set-Cookie': sessionCookie(created.id, config.publicUrl),
        },
      });
    } catch (error) {
      const failure = signInError(error);
      logFailure(request, failure);
      const refused = recordOrRefuse({
        action: 'signIn',
        principal: null,
        outcome: 'refused',
        reason: failure.reason,
        request,
      });
      if (refused) return refused;
      throw new SignInError(failure.reason, returnTo, failure.cause);
    }
    response.headers.append('Set-Cookie', sessionCookie('', config.publicUrl, 'auth', 0));
    return response;
  }
  async function logout(request: Request, current: Session | null): Promise<Response> {
    if (current) {
      const refused = recordOrRefuse({
        action: 'signOut',
        principal: current.principal,
        outcome: 'ok',
        request,
      });
      if (refused) return refused;
      await sessions.end(current.id);
    }
    const redirect = client.logout();
    const response =
      request.headers.get('X-SW-Request') === '1'
        ? Response.json({ redirect })
        : new Response(null, { status: 303, headers: { Location: redirect } });
    response.headers.set('Set-Cookie', sessionCookie('', config.publicUrl, 'session', 0));
    return response;
  }
  const groupDirectory = createDirectoryClient({
    graphUrl: config.directory.graphUrl,
    token: () => client.directoryToken(),
    failure: reason => console.error(`[auth] group name lookup ${reason}`),
  });
  // Keycloak puts group names in the token, so the name is the identifier itself.
  async function groupName(id: string) {
    if (config.oidc.provider === 'keycloak') return { id, displayName: id, resolved: true };
    return groupDirectory.group(id);
  }
  const signOutTarget = client.logout();
  const providerOrigin = URL.canParse(signOutTarget) ? new URL(signOutTarget).origin : undefined;
  const timer = setInterval(() => {
    void sessions.sweep().catch(() => logFailure(undefined, new Error('session-sweep-failed')));
  }, 1000);
  timer.unref();
  return {
    groupName,
    providerStatus: {
      issuer: config.oidc.issuer,
      clientId: config.oidc.clientId,
      discovery: 'ok',
      groupClaimMode: config.directory.groupClaim,
      overage: config.directory.overage,
      get jwksRefreshedAt() {
        return client.jwksRefreshedAt;
      },
    },
    mode: 'server' as const,
    publicOrigin: config.publicUrl,
    providerOrigin,
    access,
    administration: repository,
    audit,
    principal: async (request: Request) => (await session(request))?.principal ?? null,
    authentication: { login, callback, logout, session, sessions },
    close: () => clearInterval(timer),
  };
}
/** Authentication services used by HTTP middleware and the live-update route. */
export type ServerAuthentication = Awaited<ReturnType<typeof createServerAuthentication>>;
