// Serves a loopback OpenID provider and Graph stand-in for isolated authentication tests.
import { TEST_GROUPS, TEST_TENANT_ID, TEST_WORKBENCH_CLIENT, type TestGroup, type TestUser } from './auth-identities';
import { tokenEndpoint } from './mock-oidc-grants';
import { createProviderState, readAccessToken, userClaims, type MockEndpoint, type MockOidcOptions, type ProviderState } from './mock-oidc-state';

export type { ClaimShape, ClientCertificate, MockEndpoint, MockOidcOptions } from './mock-oidc-state';

/** Running provider endpoints, request history and isolated test controls. */
export type MockOidc = {
  origin: string;
  issuer: string;
  /** Prefix of the authorize, token and logout endpoints: the issuer, or Entra's layout. */
  endpointBase: string;
  graphUrl: string;
  apiAudience: string;
  calls: { endpoint: string; params: Record<string, string> }[];
  stop(): Promise<void>;
  setUserGroups(username: string, groups: TestGroup[]): void;
  setUserEmail(username: string, change: Partial<Pick<TestUser, 'email' | 'emailDomainVerified' | 'emailVerified' | 'upn'>>): void;
  setLifetimes(seconds: { idToken?: number; accessToken?: number; refreshToken?: number }): void;
  setClockOffset(seconds: number): void;
  fail(endpoint: MockEndpoint, mode: 'error' | 'hang' | null): void;
  rotateKeys(): void;
  /**
   * Signs a user out at the provider as another application would, calling the workbench's
   * front-channel logout URL for each of the user's provider sessions. Returns the status codes.
   */
  signOutAtProvider(username: string): Promise<number[]>;
  /** Completes authorization as a chosen user and returns the browser redirect URL. */
  authorizeAs(username: string, authorizeUrl: string): Promise<string>;
};

// Entra publishes its endpoints under these paths of the tenant rather than under the issuer.
const ENTRA_ENDPOINTS = `/${TEST_TENANT_ID}/oauth2/v2.0`;
const ENTRA_KEYS = `/${TEST_TENANT_ID}/discovery/v2.0/keys`;

function entraLayout(state: ProviderState): boolean {
  return state.options.layout === 'entra';
}

function discoveryEndpoint(state: ProviderState): Response {
  const authMethods = ['client_secret_basic', 'client_secret_post'];
  return Response.json({
    issuer: state.issuer,
    authorization_endpoint: `${state.endpointBase}/authorize`,
    token_endpoint: `${state.endpointBase}/token`,
    jwks_uri: entraLayout(state) ? state.origin + ENTRA_KEYS : `${state.issuer}/keys`,
    end_session_endpoint: `${state.endpointBase}/logout`,
    userinfo_endpoint: `${state.issuer}/userinfo`,
    response_types_supported: ['code'],
    subject_types_supported: ['pairwise'],
    code_challenge_methods_supported: ['S256'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: entraLayout(state) ? [...authMethods, 'private_key_jwt'] : authMethods,
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
  });
}

function keysEndpoint(state: ProviderState): Response {
  return Response.json({ keys: state.keys.slice(0, state.activeKey + 1).map(key => key.jwk) });
}

function authorizeProblem(state: ProviderState, params: URLSearchParams): string | undefined {
  if (params.get('response_type') !== 'code') return 'response_type must be code';
  if (params.get('client_id') !== TEST_WORKBENCH_CLIENT.clientId) return 'Unknown client_id';
  if (!state.options.redirectUris.includes(params.get('redirect_uri') ?? '')) {
    return 'Unregistered redirect_uri';
  }
  if (!params.get('code_challenge')) return 'A code_challenge is required';
  if (params.get('code_challenge_method') !== 'S256') return 'PKCE requires S256';
  if (!params.get('state')) return 'A state is required';
  if (!params.get('nonce')) return 'A nonce is required';
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function authorizePage(state: ProviderState, params: URLSearchParams): Response {
  const hidden = [...params]
    .filter(([name]) => name !== 'username' && name !== 'login_hint')
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('\n');
  const buttons = Object.values(state.users)
    .map(user => `<button name="username" value="${escapeHtml(user.username)}">` + `${escapeHtml(user.name)}</button>`)
    .join('\n');
  const html =
    '<!doctype html><html><head><title>Mock sign-in</title></head><body>' +
    `<h1>Mock sign-in</h1><form method="post" action="${state.endpointBase}/authorize">` +
    `${hidden}${buttons}</form></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function authorizeRedirect(state: ProviderState, params: URLSearchParams, username: string) {
  if (!Object.hasOwn(state.users, username)) return new Response('Unknown user', { status: 400 });
  const code = crypto.randomUUID();
  const sid = crypto.randomUUID();
  state.providerSessions.set(sid, username);
  state.codes.set(code, {
    sid,
    username,
    clientId: params.get('client_id')!,
    redirectUri: params.get('redirect_uri')!,
    challenge: params.get('code_challenge')!,
    nonce: params.get('nonce')!,
    scope: params.get('scope') ?? 'openid profile email',
    expiresAt: Date.now() + 60_000,
  });
  const redirect = new URL(params.get('redirect_uri')!);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', params.get('state')!);
  return Response.redirect(redirect, 302);
}

function authorizeEndpoint(state: ProviderState, params: URLSearchParams, method: string) {
  const problem = authorizeProblem(state, params);
  if (problem) return new Response(problem, { status: 400 });
  const username = params.get(method === 'POST' ? 'username' : 'login_hint');
  if (username) return authorizeRedirect(state, params, username);
  if (method === 'POST') return new Response('A username is required', { status: 400 });
  return authorizePage(state, params);
}

function logoutEndpoint(state: ProviderState, params: URLSearchParams) {
  const uri = params.get('post_logout_redirect_uri') ?? '';
  if (!state.options.postLogoutRedirectUris.includes(uri)) {
    return new Response('You are signed out of the mock provider');
  }
  const redirect = new URL(uri);
  if (params.has('state')) redirect.searchParams.set('state', params.get('state')!);
  return Response.redirect(redirect, 302);
}

function bearerToken(request: Request): string {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
}

async function userinfoEndpoint(state: ProviderState, request: Request) {
  const identity = await readAccessToken(state, bearerToken(request));
  if (!identity?.username) return new Response('Invalid user access token', { status: 401 });
  return Response.json(userClaims(state, identity.username, identity.clientId));
}

function graphCheckEndpoint(state: ProviderState, oid: string, body: unknown) {
  const groupIds = (body as { groupIds?: unknown } | null)?.groupIds;
  if (!Array.isArray(groupIds) || groupIds.length > 20 || !groupIds.every(id => typeof id === 'string')) {
    return new Response('Expected at most 20 groupIds', { status: 400 });
  }
  const user = Object.values(state.users).find(person => person.oid.toLowerCase() === oid.toLowerCase());
  if (!user) return new Response('Unknown user', { status: 404 });
  const memberships = new Set(user.groups.map(group => group.id.toLowerCase()));
  return Response.json({ value: groupIds.filter(id => memberships.has(id.toLowerCase())) });
}

function graphGroupEndpoint(id: string) {
  const group = Object.values(TEST_GROUPS).find(entry => entry.id.toLowerCase() === id.toLowerCase());
  if (!group) return new Response('Unknown group', { status: 404 });
  return Response.json({ id: group.id, displayName: group.name });
}

async function graphEndpoint(state: ProviderState, request: Request, path: string, body: unknown) {
  const identity = await readAccessToken(state, bearerToken(request), 'https://graph.microsoft.com');
  if (path === '/graph/v1.0/me/checkMemberGroups' && request.method === 'POST') {
    const scopes = String(identity?.payload.scp ?? '').split(/\s+/);
    if (!identity?.username || !scopes.some(scope => scope === 'User.Read' || scope === 'https://graph.microsoft.com/User.Read')) {
      return new Response('Delegated User.Read is required', { status: 403 });
    }
    return graphCheckEndpoint(state, state.users[identity.username].oid, body);
  }
  if (!identity || identity.username || identity.clientId !== TEST_WORKBENCH_CLIENT.clientId || identity.payload.idtyp !== 'app') {
    return new Response('A workbench app-only Graph token is required', { status: 401 });
  }
  const userMatch = /^\/graph\/v1.0\/users\/([^/]+)\/checkMemberGroups$/.exec(path);
  if (userMatch && request.method === 'POST') {
    return graphCheckEndpoint(state, decodeURIComponent(userMatch[1]), body);
  }
  const groupMatch = /^\/graph\/v1.0\/groups\/([^/]+)$/.exec(path);
  if (groupMatch && request.method === 'GET') return graphGroupEndpoint(decodeURIComponent(groupMatch[1]));
  return new Response('Not found', { status: 404 });
}

function endpointName(state: ProviderState, path: string): string {
  if (path === '/graph/v1.0/me/checkMemberGroups') return 'graph-check';
  if (/^\/graph\/v1.0\/users\/[^/]+\/checkMemberGroups$/.test(path)) return 'graph-check';
  if (/^\/graph\/v1.0\/groups\/[^/]+$/.test(path)) return 'graph-group';
  if (entraLayout(state) && path === ENTRA_KEYS) return 'jwks';
  if (entraLayout(state) && path.startsWith(ENTRA_ENDPOINTS + '/')) {
    return path.slice(ENTRA_ENDPOINTS.length + 1);
  }
  const prefix = new URL(state.issuer).pathname.replace(/\/$/, '');
  if (!path.startsWith(`${prefix}/`)) return 'unknown';
  const relative = path.slice(prefix.length);
  if (relative === '/.well-known/openid-configuration') return 'discovery';
  if (relative === '/keys') return 'jwks';
  return relative.slice(1);
}

async function requestParameters(request: Request, url: URL) {
  const params = new URLSearchParams(url.search);
  let body: unknown;
  if (request.method === 'POST') {
    if (url.pathname.startsWith('/graph/')) {
      body = await request.json().catch(() => null);
      params.set('body', JSON.stringify(body));
    } else {
      const form = new URLSearchParams(await request.text());
      for (const [name, value] of form) params.set(name, value);
    }
  }
  return { params, body };
}

async function applyFailure(state: ProviderState, endpoint: MockEndpoint) {
  if (state.failures.get(endpoint) === 'hang') {
    await new Promise<void>(resolve => {
      const pending = state.pending.get(endpoint) ?? new Set();
      pending.add(resolve);
      state.pending.set(endpoint, pending);
    });
  }
  if (state.stopped) return new Response('Provider stopped', { status: 503 });
  if (state.failures.get(endpoint) === 'error') {
    return new Response('Injected endpoint failure', { status: 500 });
  }
}

async function handleRequest(state: ProviderState, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const endpoint = endpointName(state, url.pathname);
  const { params, body } = await requestParameters(request, url);
  const secrets = new Set(['client_secret', 'code_verifier', 'assertion', 'refresh_token']);
  state.calls.push({
    endpoint,
    params: Object.fromEntries([...params].filter(([key]) => !secrets.has(key))),
  });
  const failure = await applyFailure(state, endpoint as MockEndpoint);
  if (failure) return failure;
  if (endpoint.startsWith('graph-')) return graphEndpoint(state, request, url.pathname, body);
  if (endpoint === 'authorize' && ['GET', 'POST'].includes(request.method)) {
    return authorizeEndpoint(state, params, request.method);
  }
  if (endpoint === 'token' && request.method === 'POST') return tokenEndpoint(state, request, params);
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  switch (endpoint) {
    case 'discovery':
      return discoveryEndpoint(state);
    case 'jwks':
      return keysEndpoint(state);
    case 'logout':
      return logoutEndpoint(state, params);
    case 'userinfo':
      return userinfoEndpoint(state, request);
    default:
      return new Response('Not found', { status: 404 });
  }
}

function releasePending(state: ProviderState, endpoint: MockEndpoint) {
  for (const resolve of state.pending.get(endpoint) ?? []) resolve();
  state.pending.delete(endpoint);
}

function providerControls(state: ProviderState) {
  function getUser(username: string): TestUser {
    if (!Object.hasOwn(state.users, username)) throw new Error(`Unknown user: ${username}`);
    return state.users[username];
  }
  return {
    setUserGroups(username: string, groups: TestGroup[]) {
      getUser(username).groups = structuredClone(groups);
    },
    setUserEmail(username: string, change: Parameters<MockOidc['setUserEmail']>[1]) {
      Object.assign(getUser(username), change);
    },
    setLifetimes(seconds: Parameters<MockOidc['setLifetimes']>[0]) {
      Object.assign(state.lifetimes, seconds);
    },
    setClockOffset(seconds: number) {
      state.clockOffset = seconds;
    },
    fail(endpoint: MockEndpoint, mode: 'error' | 'hang' | null) {
      if (mode === null) state.failures.delete(endpoint);
      else state.failures.set(endpoint, mode);
      if (mode !== 'hang') releasePending(state, endpoint);
    },
    rotateKeys() {
      state.activeKey = 1;
    },
  };
}

async function signOutAtProvider(state: ProviderState, username: string) {
  const target = state.options.frontChannelLogoutUri;
  if (!target) throw new Error('No front-channel logout URL is registered');
  const sids = [...state.providerSessions].filter(([, user]) => user === username);
  const statuses: number[] = [];
  for (const [sid] of sids) {
    const url = new URL(target);
    url.searchParams.set('iss', state.issuer);
    url.searchParams.set('sid', sid);
    statuses.push((await fetch(url)).status);
    state.providerSessions.delete(sid);
  }
  return statuses;
}

async function authorizeAs(state: ProviderState, username: string, authorizeUrl: string) {
  const url = new URL(authorizeUrl);
  const expected = new URL(`${state.endpointBase}/authorize`);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
    throw new Error('Authorization URL does not belong to this provider');
  }
  url.searchParams.set('login_hint', username);
  const response = await fetch(url, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status !== 302 || !location) throw new Error(await response.text());
  return location;
}

/** Starts an isolated provider bound exclusively to the IPv4 loopback interface. */
export async function startMockOidc(options: MockOidcOptions = {}): Promise<MockOidc> {
  if (options.layout === 'entra' && (options.shape ?? 'entra') !== 'entra') {
    throw new Error("Entra's endpoint layout needs Entra-shaped claims.");
  }
  const state = await createProviderState(options);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: state.options.port,
    idleTimeout: 0,
    fetch: request => handleRequest(state, request),
  });
  state.origin = `http://127.0.0.1:${server.port}`;
  state.issuer = state.origin;
  if (state.options.shape === 'entra') state.issuer += `/${TEST_TENANT_ID}/v2.0`;
  if (state.options.shape === 'keycloak') state.issuer += '/realms/workbench';
  state.endpointBase = entraLayout(state) ? state.origin + ENTRA_ENDPOINTS : state.issuer;
  state.graphUrl = `${state.origin}/graph`;
  return {
    origin: state.origin,
    issuer: state.issuer,
    endpointBase: state.endpointBase,
    graphUrl: state.graphUrl,
    apiAudience: state.apiAudience,
    calls: state.calls,
    ...providerControls(state),
    authorizeAs: (username, url) => authorizeAs(state, username, url),
    signOutAtProvider: username => signOutAtProvider(state, username),
    async stop() {
      state.stopped = true;
      for (const endpoint of state.pending.keys()) releasePending(state, endpoint);
      await server.stop(true);
    },
  };
}
