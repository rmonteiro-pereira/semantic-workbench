// Composes provider identity, durable sessions and the existing access boundary.
import { asSignInError, SignInError } from './sign-in-error';
import { hkdfSync } from 'node:crypto';
import { join } from 'node:path';
import type { ServerConfig } from '../config';
import type { Workspace } from '../projects/workspace';
import { createAccessControl } from './authorize';
import { openAdminRepository } from './admin-repo';
import { createAuditLog } from './audit';
import { safeReturnTo } from './attempts';
import { createSignInProvider, type SignInProvider } from './sign-in-provider';
import { createAttemptStore, ATTEMPT_TTL_SECONDS } from './attempts';
import { createDirectoryClient, directoryGroupIds } from './directory';
import { resolvePrincipalGroups, type NormalizedPrincipal, type Principal } from './principal';
import { createSessionStore, cookieName, readCookie, sessionCookie, type Session, type SessionStore } from './sessions';
import { requestAuditId, requestSourceIp, type AuditRequest } from '../request';
import { createAnonymousAuditGate } from './rate-limit';
import { createRemoteCredentials, type RemoteCredentialOptions } from './remote-credentials';
import { log } from '../observability/log';
import { recordAuthFailure } from '../observability/metrics';
import { withSpan } from '../observability/tracing';

/** How often expired entries leave the sign-in replay ledger. */
const ATTEMPT_PRUNE_INTERVAL_MS = 60_000;

/** Opens validated server authentication only after the workspace lease has been acquired. */
/**
 * Adds the provider's OAuth error to the server log line. Only the code each provider stores on
 * the sign-in error is read: other error messages can quote request data such as an
 * authorization code, so they never reach the log.
 */
export function providerDetail(error: unknown) {
  return error instanceof SignInError && error.providerCode ? ` (${error.providerCode})` : '';
}

/** Browser authentication services the routes and the access middleware use. */
export type AuthenticationServices = {
  login: (returnTo: string, request?: Request) => Promise<Response>;
  callback: (request: Request) => Promise<Response>;
  logout: (request: Request, current: Session | null) => Promise<Response>;
  frontChannelLogout: (request: Request) => Promise<Response>;
  session: (request: Request) => Promise<Session | null>;
  sessions: SessionStore;
};

/** One audited sign-in, sign-out, session or directory event. */
type SignInEvent = {
  action: 'signIn' | 'signOut' | 'sessionEnded' | 'directoryLookup';
  principal: Principal | null;
  outcome: 'ok' | 'refused' | 'degraded';
  reason?: string;
  request?: Request;
  /** Refusals of this kind left out of the audit log since its last record. */
  suppressed?: number;
};

export async function createServerAuthentication(ws: Workspace, config: ServerConfig, suppliedClient?: SignInProvider, remoteOptions: RemoteCredentialOptions = {}) {
  const client = suppliedClient ?? (await createSignInProvider(config));
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
  function record({ action, principal, outcome, reason, request, suppressed }: SignInEvent) {
    audit.append({
      requestId: (request as AuditRequest | undefined)?.[requestAuditId] ?? crypto.randomUUID(),
      principal: principal ?? { id: 'anonymous', kind: 'anonymous' },
      action,
      resource: { type: 'workspace' },
      rules: [],
      decision: outcome === 'refused' ? 'deny' : 'allow',
      outcome,
      reason,
      suppressed,
    });
  }
  const sessions = createSessionStore({
    dir: join(ws.layout.state, 'sessions'),
    key: new Uint8Array(hkdfSync('sha256', config.sessionKey, '', 'sw-session', 32)),
    idleHours: settings.session.idleHours,
    absoluteHours: settings.session.absoluteHours,
    ended: (session, reason) => record({ action: 'sessionEnded', principal: session.principal, outcome: 'ok', reason }),
  });
  await sessions.indexStored();
  const attempts = createAttemptStore(new Uint8Array(hkdfSync('sha256', config.sessionKey, '', 'sw-attempt', 32)), join(ws.layout.state, 'auth-attempts'));
  function logFailure(request: Request | undefined, error: Error) {
    const requestId = (request as AuditRequest | undefined)?.[requestAuditId] ?? 'startup';
    log.error('auth.failure', {
      requestId,
      detail: error.message,
      providerCode: error instanceof SignInError ? error.providerCode : undefined,
    });
  }
  // Failed sign-ins name nobody, so a loop of them could fill the audit log; past its first
  // few, each source address and failure is recorded once a minute.
  const auditAnonymous = createAnonymousAuditGate();
  function recordOrRefuse(event: SignInEvent): Response | undefined {
    let suppressed: number | undefined;
    if (!event.principal) {
      const source = (event.request as AuditRequest | undefined)?.[requestSourceIp];
      const admission = auditAnonymous(source, `${event.action}:${event.reason}`);
      if (!admission.record) return undefined;
      suppressed = admission.suppressed;
    }
    try {
      record({ ...event, suppressed });
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
      identity = await resolvePrincipalGroups(identity, oid => (config.directory.overage === 'directory' ? directory.groups(oid, directoryGroupIds(access.snapshot().config)) : Promise.resolve(null)));
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
    let renewed: Awaited<ReturnType<typeof client.refresh>>;
    try {
      renewed = await withSpan('auth.refresh', {}, () => client.refresh(session.tokens));
    } catch (error) {
      const failure = asSignInError(error);
      recordAuthFailure(failure.reason);
      logFailure(request, failure);
      // An outage of the provider says nothing about the session, so it stays and the request
      // is answered 503. Ending it would sign everyone out whenever the provider is down.
      if (failure.reason === 'provider-unreachable') throw failure;
      // A session from before an update that changed its token format ends with its own reason.
      const upgraded = failure.reason === 'session-upgraded';
      await sessions.end(session.id, upgraded ? 'session-upgraded' : 'refresh-failed');
      return null;
    }
    if (renewed.principal.id !== session.principal.id) {
      logFailure(request, new Error('Refresh identity changed.'));
      await sessions.end(session.id, 'refresh-failed');
      return null;
    }
    // A failure from here on is ours, not the provider's, and answers as an internal error.
    session.principal = await principalFor(renewed.principal, request);
    session.tokens = renewed.tokens;
    if (!(await sessions.update(session))) return null;
    return session;
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
      const started = await withSpan('auth.login.start', {}, () => client.login(returnTo));
      return new Response(null, {
        status: 302,
        headers: {
          Location: started.url,
          'Set-Cookie': sessionCookie(attempts.encode(started.attempt), config.publicUrl, 'auth', ATTEMPT_TTL_SECONDS),
        },
      });
    } catch (error) {
      const failure = asSignInError(error);
      recordAuthFailure(failure.reason);
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
      const identity = await withSpan('auth.callback.token-exchange', {}, () => client.callback(callbackUrl, attempt));
      const principal = await withSpan('auth.callback.resolve-principal', {}, () => principalFor(identity.principal, request));
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
      const created = await withSpan('auth.callback.create-session', {}, () => sessions.create({ principal, tokens: identity.tokens }));
      response = new Response(null, {
        status: 302,
        headers: {
          Location: denied ? '/auth/no-access' : returnTo,
          'Set-Cookie': sessionCookie(created.id, config.publicUrl),
        },
      });
    } catch (error) {
      const failure = asSignInError(error);
      recordAuthFailure(failure.reason);
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
      await withSpan('auth.logout', {}, () => sessions.end(current.id));
    }
    const redirect = client.logout(current?.tokens);
    const response = request.headers.get('X-SW-Request') === '1' ? Response.json({ redirect }) : new Response(null, { status: 303, headers: { Location: redirect } });
    response.headers.set('Set-Cookie', sessionCookie('', config.publicUrl, 'session', 0));
    return response;
  }
  /**
   * Ends the sessions the provider's session started, when the provider signs the person out
   * elsewhere. The request carries no cookie: whoever knows the issuer and a session id can end
   * that session, which the provider keeps private. The answer is always the same empty 200.
   */
  async function frontChannelLogout(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sid = url.searchParams.get('sid') ?? '';
    const issuer = url.searchParams.get('iss');
    // Entra may leave the issuer out; one that is present must be the configured provider.
    const accepted = sid !== '' && (issuer === null || issuer === config.oidc.issuer);
    try {
      if (accepted) await endProviderSession(sid, request);
    } catch {
      // The answer never tells the caller whether anything ended, so a failure is only logged.
      logFailure(request, new Error('front-channel-logout-failed'));
    }
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  async function endProviderSession(sid: string, request: Request) {
    const reason = 'provider-signed-out';
    const ended = await sessions.endByProviderSession(config.oidc.issuer, sid, reason);
    for (const session of ended) {
      record({ action: 'signOut', principal: session.principal, outcome: 'ok', request });
    }
  }
  const groupDirectory = createDirectoryClient({
    graphUrl: config.directory.graphUrl,
    token: () => client.directoryToken(),
    failure: reason => log.warn('auth.group-name-lookup-failed', { reason }),
  });
  // Keycloak puts group names in the token, so the name is the identifier itself.
  async function groupName(id: string) {
    if (config.oidc.provider === 'keycloak') return { id, displayName: id, resolved: true };
    return groupDirectory.group(id);
  }
  const remoteCredentials = createRemoteCredentials({
    ...remoteOptions,
    config,
    client,
    session,
    sessions,
    settings: () => repository.settings(),
    log: message => logFailure(undefined, new Error(message)),
  });
  const signOutTarget = client.logout();
  const providerOrigin = URL.canParse(signOutTarget) ? new URL(signOutTarget).origin : undefined;
  const timer = setInterval(() => {
    void sessions.sweep().catch(() => logFailure(undefined, new Error('session-sweep-failed')));
  }, 1000);
  timer.unref();
  attempts.prune();
  const pruneTimer = setInterval(attempts.prune, ATTEMPT_PRUNE_INTERVAL_MS);
  pruneTimer.unref();
  const authentication: AuthenticationServices = {
    login,
    callback,
    logout,
    frontChannelLogout,
    session,
    sessions,
  };
  return {
    bearer: client.bearer,
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
    issuerOrigin: new URL(config.oidc.issuer).origin,
    access,
    administration: repository,
    audit,
    principal: async (request: Request) => (await session(request))?.principal ?? null,
    remoteCredentials,
    authentication,
    close: () => {
      clearInterval(timer);
      clearInterval(pruneTimer);
    },
  };
}
/** Authentication services used by HTTP middleware and the live-update route. */
export type ServerAuthentication = Awaited<ReturnType<typeof createServerAuthentication>>;
