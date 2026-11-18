// The browser pages of the connection flow: the authorization request and its consent page, the consent decision, and the setup credential for a headless program. Each one needs the person's session; none of them reads or writes anything the person could not already see.
import { timingSafeEqual } from 'node:crypto';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { Session } from '../auth/sessions';
import { parseAuthorizationRequest } from '../connections/authorization-request';
import { MAX_LIVE_CONNECTIONS_PER_PERSON, sessionReferenceOf, type ConnectionService } from '../connections/connection-service';
import { consentPage, errorPage, setupFormPage, setupResultPage, type ErrorKind, type ScopeRow } from '../connections/consent-pages';
import { readForm } from '../connections/form-body';
import type { PendingGrants, PendingRequest } from '../connections/pending-grants';
import { findProgram, type Program, type ProgramsFile } from '../connections/programs';
import { scopeAvailability, type ScopeAvailability } from '../connections/scope-availability';
import { DEFAULT_SCOPES, isOfferedScope, offeredScopes, type OfferedScope } from '../connections/scopes';
import { AUTHORIZE_PATH, issuerOf, mcpResource } from '../connections/server-metadata';
import { recordConnectionEvent } from '../observability/metrics';
import type { Route } from './http';

export type OAuthPageDependencies = {
  publicUrl: string;
  service: ConnectionService;
  grants: PendingGrants;
  programs: () => ProgramsFile;
  session: (request: Request) => Promise<Session | null>;
  boundary: () => OperationBoundary;
};

const CONSENT_PATH = '/oauth/consent';
const SETUP_PATH = '/oauth/setup';

/** Compares the form's session token with the session's own in constant time. */
function sameToken(supplied: string | undefined, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied ?? '');
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

/** The scope rows of a form: the scopes in play, checked by default when they are defaults, and disabled when the person's roles could never use them. */
function scopeRows(shown: readonly OfferedScope[], availability: ScopeAvailability): ScopeRow[] {
  return shown.map(scope => ({ scope, checked: (DEFAULT_SCOPES as readonly string[]).includes(scope), available: availability[scope] }));
}

/** The answer to the program: a redirect that carries the issuer and the program's own state, and never a token. */
function redirectToProgram(redirectUri: string, parameters: Record<string, string | undefined>): Response {
  const target = new URL(redirectUri);
  for (const [name, value] of Object.entries(parameters)) if (value !== undefined) target.searchParams.set(name, value);
  return new Response(null, { status: 303, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export function createOAuthPageRoutes(dependencies: OAuthPageDependencies): Route {
  const { service, grants, publicUrl } = dependencies;
  const resource = mcpResource(publicUrl);

  function failure(endpoint: 'authorize' | 'consent' | 'setup', kind: ErrorKind): Response {
    recordConnectionEvent(endpoint, 'none', 'refused');
    return errorPage(kind);
  }

  function availabilityOf(session: Session): ScopeAvailability {
    return scopeAvailability(dependencies.boundary(), session.principal);
  }

  async function authorize(request: Request, url: URL): Promise<Response> {
    const session = await dependencies.session(request);
    const parsed = parseAuthorizationRequest(url.searchParams, dependencies.programs(), resource);
    if (!session || !parsed.ok) return failure('authorize', 'invalid');
    if (service.liveConnections(session.principal.id) >= MAX_LIVE_CONNECTIONS_PER_PERSON) return failure('authorize', 'limit');
    const { program, redirectUri, scopes, state, codeChallenge } = parsed.request;
    const pending = grants.createRequest({ clientId: program.clientId, redirectUri, scopes, state, codeChallenge, resource, sessionReference: sessionReferenceOf(session.id) });
    recordConnectionEvent('authorize', 'none', 'ok');
    return consentPage({ program, redirectUri, personName: session.principal.name, rows: scopeRows(scopes, availabilityOf(session)), pendingId: pending.id, csrf: session.csrf });
  }

  /** The scopes the person kept, which may not exceed what was asked, what the program may have and what their roles allow. Null means the form asked for something outside those. */
  function chosenScopes(form: URLSearchParams, pending: PendingRequest, program: Program, availability: ScopeAvailability): OfferedScope[] | null {
    const chosen = form.getAll('scope');
    const allowed = chosen.every(name => isOfferedScope(name) && (pending.scopes as string[]).includes(name) && program.scopes.includes(name) && availability[name]);
    return allowed ? (chosen as OfferedScope[]) : null;
  }

  async function consent(request: Request): Promise<Response> {
    const session = await dependencies.session(request);
    const form = await readForm(request, ['scope']);
    if (!session || !form.ok || !sameToken(form.fields.single.get('csrf'), session.csrf)) return failure('consent', 'invalid');
    const reference = sessionReferenceOf(session.id);
    const pending = grants.peekRequest(form.fields.single.get('pending') ?? '', reference);
    const program = pending ? findProgram(dependencies.programs(), pending.clientId) : undefined;
    // A request whose program or redirect address was removed meanwhile counts as finished.
    if (!pending || !program || !program.redirectUris.includes(pending.redirectUri)) return failure('consent', 'finished');
    const decision = form.fields.single.get('decision');
    const person = { id: session.principal.id, name: session.principal.name };
    if (decision === 'deny') {
      grants.takeRequest(pending.id, reference);
      service.events.record({ action: 'connection.consent', origin: 'http', outcome: 'refused', person, program: program.clientId, scopes: pending.scopes, reason: 'deny' });
      recordConnectionEvent('consent', 'none', 'refused');
      return redirectToProgram(pending.redirectUri, { error: 'access_denied', state: pending.state, iss: issuerOf(publicUrl) });
    }
    const scopes = chosenScopes(form.fields.all, pending, program, availabilityOf(session));
    if (decision !== 'allow' || !scopes || scopes.length === 0) return failure('consent', 'unavailable');
    if (service.liveConnections(person.id) >= MAX_LIVE_CONNECTIONS_PER_PERSON) return failure('consent', 'limit');
    grants.takeRequest(pending.id, reference);
    const code = grants.issue({
      kind: 'code',
      clientId: program.clientId,
      redirectUri: pending.redirectUri,
      scopes,
      resource,
      codeChallenge: pending.codeChallenge,
      person: person.id,
      sessionReference: reference,
      origin: 'mcp',
    });
    service.events.record({ action: 'connection.consent', origin: 'http', outcome: 'ok', person, program: program.clientId, scopes, reason: 'allow' });
    recordConnectionEvent('consent', 'none', 'ok');
    return redirectToProgram(pending.redirectUri, { code: code.value, state: pending.state, iss: issuerOf(publicUrl) });
  }

  async function setupForm(request: Request): Promise<Response> {
    const session = await dependencies.session(request);
    const programs = dependencies.programs().programs;
    if (!session || programs.length === 0) return failure('setup', 'unavailable');
    recordConnectionEvent('setup', 'none', 'ok');
    return setupFormPage({ programs, personName: session.principal.name, rows: scopeRows(offeredScopes(), availabilityOf(session)), csrf: session.csrf });
  }

  async function createSetup(request: Request): Promise<Response> {
    const session = await dependencies.session(request);
    const form = await readForm(request, ['scope']);
    if (!session || !form.ok || !sameToken(form.fields.single.get('csrf'), session.csrf)) return failure('setup', 'invalid');
    const program = findProgram(dependencies.programs(), form.fields.single.get('client') ?? '');
    const chosen = form.fields.all.getAll('scope');
    const availability = availabilityOf(session);
    const allowed = program !== undefined && chosen.length > 0 && chosen.every(name => isOfferedScope(name) && program.scopes.includes(name) && availability[name]);
    if (!allowed) return failure('setup', 'unavailable');
    const created = service.createConnectionForSession({ session, clientId: program.clientId, scopes: chosen as OfferedScope[] });
    if (!created.ok) return failure('setup', created.reason === 'connection-limit' ? 'limit' : 'unavailable');
    recordConnectionEvent('setup', 'none', 'ok');
    return setupResultPage({ credential: created.credential, expiresAtIso: new Date(created.expiresAt).toISOString(), serverUrl: publicUrl });
  }

  return async (_workspace, request, url) => {
    if (request.method === 'GET' && url.pathname === AUTHORIZE_PATH) return authorize(request, url);
    if (request.method === 'POST' && url.pathname === CONSENT_PATH) return consent(request);
    if (request.method === 'GET' && url.pathname === CONSENT_PATH) return failure('consent', 'finished');
    if (request.method === 'GET' && url.pathname === SETUP_PATH) return setupForm(request);
    if (request.method === 'POST' && url.pathname === SETUP_PATH) return createSetup(request);
    return null;
  };
}
