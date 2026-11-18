// A server-mode handler over the mock identity provider with agent programs registered, for tests of the whole connection flow. People sign in as the fixture users; a program is driven by plain requests.
import { createHash, randomBytes } from 'node:crypto';
import { createServerAuthentication, type ServerAuthentication } from '../../src/server/auth/authentication';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createHandler } from '../../src/server/handler';
import type { Program } from '../../src/server/connections/programs';
import { authWorkspace } from './auth-workspace';
import { oidcTransport } from './oidc-transport';
import { useDefaultBrand } from './brand-fixture';

export const REFERENCE_REDIRECT = 'http://127.0.0.1:8765/callback';

export const referenceProgram: Program = {
  clientId: 'reference-client',
  name: 'Protocol reference client',
  description: 'Used in acceptance runs.',
  redirectUris: [REFERENCE_REDIRECT],
  scopes: ['read', 'validate', 'edit', 'commit', 'remote'],
  setupNote: '',
};

const administrator = { name: 'Test Admin', email: 'admin@example.org' };

/** What a program holds while it runs the flow: a verifier and its challenge. */
export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Opens an isolated authenticated server with registered agent programs and a controllable public address. */
export async function openConnectionServer(
  options: { publicUrl?: string; programs?: Program[]; authenticationOptions?: Parameters<typeof createServerAuthentication>[3]; handlerOptions?: Parameters<typeof createHandler>[1] } = {},
) {
  useDefaultBrand();
  const transport = await oidcTransport('keycloak');
  if (options.publicUrl) transport.config.publicUrl = options.publicUrl;
  const fixture = await authWorkspace({ keycloak: true });
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client, options.authenticationOptions);
  const handler = createHandler(fixture.ws, { ...auth, ...options.handlerOptions });
  const origin = transport.config.publicUrl;
  const resource = origin + '/api/mcp';

  async function register(programs: Program[]) {
    await auth.administration.ensure();
    const version = await auth.administration.version();
    await auth.administration.write({ 'programs.json': JSON.stringify({ formatVersion: 1, programs }) }, { author: administrator, baseVersion: version, message: 'programs: Register programs' });
  }
  await register(options.programs ?? [referenceProgram]);

  async function signIn(username: string): Promise<string> {
    const start = await handler(new Request(origin + '/auth/login'));
    const response = await handler(new Request(transport.authorize(start.headers.get('location')!, username), { headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } }));
    return response.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('sw-session='))!
      .split(';')[0];
  }
  const get = (path: string, headers: Record<string, string> = {}) => handler(new Request(origin + path, { headers }));
  /** A form post as a browser sends it from the workbench's own page. */
  const postForm = (path: string, form: URLSearchParams | Record<string, string>, headers: Record<string, string> = {}) =>
    handler(new Request(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, ...headers }, body: new URLSearchParams(form).toString() }));
  /** A form post as a program sends it to the token endpoint: no cookie, no origin. */
  const token = (form: Record<string, string>) =>
    handler(new Request(origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }));
  const json = (path: string, method: string, cookie: string, body?: unknown) =>
    handler(
      new Request(origin + path, {
        method,
        headers: { Cookie: cookie, Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );

  /** The query of an authorization request for the reference program. */
  function authorizeQuery(pkce: { challenge: string }, change: Record<string, string | undefined> = {}) {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: referenceProgram.clientId,
      redirect_uri: REFERENCE_REDIRECT,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      resource,
      scope: 'read edit',
      state: 'state-value',
    });
    for (const [name, value] of Object.entries(change)) {
      if (value === undefined) query.delete(name);
      else query.set(name, value);
    }
    return query;
  }

  /** Reads the hidden fields of a consent page. */
  async function consentFields(response: Response) {
    const body = await response.text();
    const field = (name: string) => new RegExp(`name="${name}" value="([^"]*)"`).exec(body)?.[1] ?? '';
    return { body, pending: field('pending'), csrf: field('csrf') };
  }

  /** Runs the browser part for a person and returns the redirect the program receives. */
  async function consentAs(cookie: string, pkce: { challenge: string }, decision: 'allow' | 'deny' = 'allow', query: URLSearchParams = authorizeQuery(pkce)) {
    const page = await get('/oauth/authorize?' + query, { Cookie: cookie });
    const fields = await consentFields(page);
    const form = new URLSearchParams({ pending: fields.pending, csrf: fields.csrf, decision });
    for (const scope of (query.get('scope') ?? '').split(' ').filter(Boolean)) form.append('scope', scope);
    const answer = await postForm('/oauth/consent', form, { Cookie: cookie });
    return { page, answer, location: answer.headers.get('location') ? new URL(answer.headers.get('location')!) : null };
  }

  function tradeForm(code: string, verifier: string, change: Record<string, string> = {}) {
    return { grant_type: 'authorization_code', code, client_id: referenceProgram.clientId, redirect_uri: REFERENCE_REDIRECT, code_verifier: verifier, resource, ...change };
  }

  /** The full flow for one person: consent and the first token trade. */
  async function connect(username: string, scope = 'read edit') {
    const cookie = await signIn(username);
    const pkce = pkcePair();
    const { location } = await consentAs(cookie, pkce, 'allow', authorizeQuery(pkce, { scope }));
    const response = await token(tradeForm(location!.searchParams.get('code')!, pkce.verifier));
    const tokens = await response.json();
    return { cookie, tokens, response };
  }

  return {
    auth: auth as ServerAuthentication,
    fixture,
    transport,
    handler,
    origin,
    resource,
    register,
    signIn,
    get,
    postForm,
    token,
    json,
    authorizeQuery,
    consentFields,
    consentAs,
    tradeForm,
    connect,
    pkcePair,
    close() {
      auth.close();
      fixture[Symbol.dispose]();
    },
  };
}

export type ConnectionServer = Awaited<ReturnType<typeof openConnectionServer>>;
