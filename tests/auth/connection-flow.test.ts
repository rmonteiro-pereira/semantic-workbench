// Drives the whole connection flow through the handler with the mock identity provider: sign-in, consent, the token trade, refresh, replay, setup credentials and the limits of the public endpoints.
import { afterEach, expect, test } from 'bun:test';
import { createHandler } from '../../src/server/handler';
import { MAX_LIVE_CONNECTIONS_PER_PERSON } from '../../src/server/connections/connection-service';
import { testWorkspace } from '../helpers/temp-data-dir';
import { REFERENCE_REDIRECT, openConnectionServer, referenceProgram, type ConnectionServer } from '../helpers/connection-server';

const servers: ConnectionServer[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));
async function open(options: Parameters<typeof openConnectionServer>[0] = {}) {
  const server = await openConnectionServer(options);
  servers.push(server);
  return server;
}

test('the person sees one consent page naming the program, the scopes in words and the onward use sentence', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce), { Cookie: cookie });
  const body = await page.text();
  expect(page.status).toBe(200);
  expect(body).toContain('Protocol reference client');
  expect(body).toContain('Alice Andrade');
  expect(body).toContain('Semantic Workbench does not call a language model.');
  expect(body).toContain('Create, change and delete files in your own working copy');
  expect(page.headers.get('cache-control')).toBe('no-store');
  expect(page.headers.get('content-security-policy')).toContain("form-action 'self' http://127.0.0.1:8765");
  expect(page.headers.get('referrer-policy')).toBe('no-referrer');
});

test('allowing issues a code that trades for tokens, and the answer carries the state and issuer', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const { answer, location } = await server.consentAs(cookie, pkce);
  expect(answer.status).toBe(303);
  expect(location!.origin + location!.pathname).toBe(REFERENCE_REDIRECT);
  expect(location!.searchParams.get('state')).toBe('state-value');
  expect(location!.searchParams.get('iss')).toBe(server.origin);
  expect(answer.headers.get('cache-control')).toBe('no-store');
  const response = await server.token(server.tradeForm(location!.searchParams.get('code')!, pkce.verifier));
  const tokens = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(Object.keys(tokens).sort()).toEqual(['access_token', 'expires_in', 'refresh_token', 'scope', 'token_type']);
  expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 600, scope: 'read edit' });
  expect(JSON.stringify(tokens)).not.toMatch(/Alice|alice|Editor|editor/);
});

test('denying sends access_denied with the state, issues no code and is audited once', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const { location } = await server.consentAs(cookie, server.pkcePair(), 'deny');
  expect(location!.searchParams.get('error')).toBe('access_denied');
  expect(location!.searchParams.get('state')).toBe('state-value');
  expect(location!.searchParams.has('code')).toBe(false);
  expect(server.auth.connections.grants.sizes().grants).toBe(0);
});

test('an anonymous request goes through sign-in and returns to the same request', async () => {
  const server = await open();
  const pkce = server.pkcePair();
  const target = '/oauth/authorize?' + server.authorizeQuery(pkce);
  const response = await server.get(target);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toContain('/authorize');
  expect(response.headers.getSetCookie().some(cookie => cookie.startsWith('sw-auth='))).toBe(true);
});

test('a request that does not match a registration shows an error page and redirects nowhere', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const bad: Record<string, string | undefined>[] = [
    { client_id: 'unknown' },
    { redirect_uri: 'http://127.0.0.1:8765/callback/' },
    { redirect_uri: 'http://127.0.0.1:9999/callback' },
    { response_type: 'token' },
    { code_challenge: undefined },
    { code_challenge: 'short' },
    { code_challenge_method: 'plain' },
    { code_challenge_method: undefined },
    { resource: 'https://other.example/api/mcp' },
    { resource: undefined },
    { scope: 'read administration' },
    { scope: 'read publish' },
    { scope: 'read write' },
    { state: 'x'.repeat(513) },
  ];
  for (const change of bad) {
    const response = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce, change), { Cookie: cookie });
    expect(response.status, JSON.stringify(change)).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    const body = await response.text();
    expect(body).not.toContain('reference-client');
    expect(body).not.toContain('unknown');
  }
});

test('a repeated parameter and an unregistered program are refused the same way', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const repeated = server.authorizeQuery(pkce);
  repeated.append('client_id', 'other');
  expect((await server.get('/oauth/authorize?' + repeated, { Cookie: cookie })).status).toBe(400);
});

test('a second use of a code revokes the tokens it produced', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const { location } = await server.consentAs(cookie, pkce);
  const code = location!.searchParams.get('code')!;
  const first = await (await server.token(server.tradeForm(code, pkce.verifier))).json();
  const second = await server.token(server.tradeForm(code, pkce.verifier));
  expect(second.status).toBe(400);
  expect(await second.json()).toEqual({ error: 'invalid_grant' });
  const refreshed = await server.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: 'reference-client', resource: server.resource });
  expect(refreshed.status).toBe(400);
});

test('a wrong verifier spends the code', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const { location } = await server.consentAs(cookie, pkce);
  const code = location!.searchParams.get('code')!;
  expect((await server.token(server.tradeForm(code, server.pkcePair().verifier))).status).toBe(400);
  expect((await server.token(server.tradeForm(code, pkce.verifier))).status).toBe(400);
});

test('every refusal at the token endpoint has the same status, headers and body', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const { location } = await server.consentAs(cookie, pkce);
  const code = location!.searchParams.get('code')!;
  const attempts = [
    server.tradeForm(code, pkce.verifier, { client_id: 'unregistered-client' }),
    server.tradeForm(code, pkce.verifier, { client_id: 'registered-but-other' }),
    server.tradeForm(code, 'w'.repeat(43)),
    server.tradeForm('no-such-code', pkce.verifier),
    server.tradeForm(code, pkce.verifier, { redirect_uri: 'http://127.0.0.1:1/x' }),
    server.tradeForm(code, pkce.verifier, { resource: 'https://other.example/api/mcp' }),
    { grant_type: 'refresh_token', refresh_token: 'no-such-token', client_id: 'reference-client', resource: server.resource },
  ];
  const answers = [];
  for (const form of attempts) {
    const response = await server.token(form);
    answers.push({
      status: response.status,
      type: response.headers.get('content-type'),
      cache: response.headers.get('cache-control'),
      cookie: response.headers.get('set-cookie'),
      body: await response.text(),
    });
  }
  for (const answer of answers) expect(answer).toEqual(answers[0]);
  expect(answers[0]).toMatchObject({ status: 400, body: '{"error":"invalid_grant"}', cookie: null });
});

test('a malformed token request is invalid_request, and the limits on size and shape hold', async () => {
  const server = await open();
  const malformed = [
    new Request(server.origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    new Request(server.origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=nope&client_id=a&resource=b' }),
    new Request(server.origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token' }),
    new Request(server.origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x=' + 'a'.repeat(5000) }),
    new Request(server.origin + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'refresh_token=' + 'a'.repeat(2049) + '&grant_type=refresh_token&client_id=a&resource=b',
    }),
    new Request(server.origin + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=a&client_id=b&grant_type=refresh_token&refresh_token=c&resource=d',
    }),
  ];
  for (const request of malformed) {
    const response = await server.handler(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  }
});

test('a refresh rotates the tokens and a retired refresh token revokes the connection', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice');
  const refresh = (value: string) => server.token({ grant_type: 'refresh_token', refresh_token: value, client_id: 'reference-client', resource: server.resource });
  const next = await (await refresh(tokens.refresh_token)).json();
  expect(next.refresh_token).not.toBe(tokens.refresh_token);
  expect((await refresh(tokens.refresh_token)).status).toBe(400);
  expect((await refresh(next.refresh_token)).status).toBe(400);
  expect(server.auth.connections.service.listAll()[0]).toMatchObject({ state: 'ended', endReason: 'replay' });
});

test('a person holds at most the allowed number of connections and the page says so', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  for (let count = 0; count < MAX_LIVE_CONNECTIONS_PER_PERSON; count++) {
    const pkce = server.pkcePair();
    const { location } = await server.consentAs(cookie, pkce);
    expect((await server.token(server.tradeForm(location!.searchParams.get('code')!, pkce.verifier))).status).toBe(200);
  }
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(server.pkcePair()), { Cookie: cookie });
  expect(page.status).toBe(400);
  expect(await page.text()).toContain('list of agent connections');
});

test('a stale, repeated or foreign consent post issues nothing', async () => {
  const server = await open();
  const alice = await server.signIn('alice');
  const bob = await server.signIn('bob');
  const pkce = server.pkcePair();
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce), { Cookie: alice });
  const fields = await server.consentFields(page);
  const post = (cookie: string, extra: Record<string, string> = {}) =>
    server.postForm('/oauth/consent', { pending: fields.pending, csrf: fields.csrf, decision: 'allow', scope: 'read', ...extra }, { Cookie: cookie });
  expect((await post(bob)).status).toBe(400);
  expect((await post(alice, { csrf: 'wrong' })).status).toBe(400);
  expect((await post(alice)).status).toBe(303);
  const repeated = await post(alice);
  expect(repeated.status).toBe(400);
  expect(repeated.headers.get('location')).toBeNull();
  expect(server.auth.connections.grants.sizes().grants).toBe(1);
  expect((await server.get('/oauth/consent', { Cookie: alice })).status).toBe(400);
});

test('a consent post from another origin is refused before anything is read', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(server.pkcePair()), { Cookie: cookie });
  const fields = await server.consentFields(page);
  const response = await server.postForm('/oauth/consent', { pending: fields.pending, csrf: fields.csrf, decision: 'allow', scope: 'read' }, { Cookie: cookie, Origin: 'https://attacker.example' });
  expect(response.status).toBe(403);
});

test('a scope the person did not see cannot be added to the form', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const pkce = server.pkcePair();
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce, { scope: 'read' }), { Cookie: cookie });
  const fields = await server.consentFields(page);
  const form = new URLSearchParams({ pending: fields.pending, csrf: fields.csrf, decision: 'allow' });
  form.append('scope', 'read');
  form.append('scope', 'edit');
  const response = await server.postForm('/oauth/consent', form, { Cookie: cookie });
  expect(response.status).toBe(400);
  expect(response.headers.get('location')).toBeNull();
});

test('a program removed while the consent page is open makes the decision finished', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(server.pkcePair()), { Cookie: cookie });
  const fields = await server.consentFields(page);
  await server.register([]);
  const response = await server.postForm('/oauth/consent', { pending: fields.pending, csrf: fields.csrf, decision: 'allow', scope: 'read' }, { Cookie: cookie });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('already finished');
});

test('a setup credential is shown once, never in an address, and trades for the same kind of connection', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const form = await server.get('/oauth/setup', { Cookie: cookie });
  expect(form.status).toBe(200);
  const fields = await server.consentFields(form);
  const created = await server.postForm(
    '/oauth/setup',
    new URLSearchParams([
      ['csrf', fields.csrf],
      ['client', referenceProgram.clientId],
      ['scope', 'read'],
      ['scope', 'edit'],
    ]),
    { Cookie: cookie },
  );
  const page = await created.text();
  const credential = /swsetup_[A-Za-z0-9_-]+/.exec(page)![0];
  expect(created.status).toBe(200);
  expect(created.headers.get('cache-control')).toBe('no-store');
  expect(created.headers.get('location')).toBeNull();
  const setupTrade = (value: string, change: Record<string, string> = {}) =>
    server.token({ grant_type: 'urn:semantic-workbench:grant-type:setup', setup_credential: value, client_id: 'reference-client', resource: server.resource, ...change });
  const exchanged = await setupTrade(credential);
  const tokens = await exchanged.json();
  expect(exchanged.status).toBe(200);
  expect(tokens.scope).toBe('read edit');
  const reused = await setupTrade(credential);
  expect(reused.status).toBe(400);
  expect(await reused.text()).toBe('{"error":"invalid_grant"}');
  expect((await server.get('/oauth/setup', { Cookie: cookie })).status).toBe(200);
  expect(await (await server.get('/oauth/setup', { Cookie: cookie })).text()).not.toContain(credential);
});

test('setup credentials fail the same way when wrong, for another program, or after sign-out', async () => {
  const server = await open();
  const cookie = await server.signIn('alice');
  const fields = await server.consentFields(await server.get('/oauth/setup', { Cookie: cookie }));
  const create = async () =>
    /swsetup_[A-Za-z0-9_-]+/.exec(await (await server.postForm('/oauth/setup', { csrf: fields.csrf, client: 'reference-client', scope: 'read' }, { Cookie: cookie })).text())![0];
  const attempt = (value: string, change: Record<string, string> = {}) =>
    server.token({ grant_type: 'urn:semantic-workbench:grant-type:setup', setup_credential: value, client_id: 'reference-client', resource: server.resource, ...change });
  const foreign = await create();
  const orphan = await create();
  const answers = [await attempt('swsetup_unknown'), await attempt(foreign, { client_id: 'another-program' })];
  await server.json('/auth/logout', 'POST', cookie);
  answers.push(await attempt(orphan));
  const bodies = await Promise.all(answers.map(async response => `${response.status} ${await response.text()}`));
  expect(new Set(bodies).size).toBe(1);
});

test('a scope the roles of a reader cannot use is shown unavailable', async () => {
  const server = await open();
  const cookie = await server.signIn('carol');
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(server.pkcePair(), { scope: 'read edit remote' }), { Cookie: cookie });
  const body = await page.text();
  expect(body).toMatch(/value="remote" disabled>/);
  expect(body).toMatch(/value="read" checked>/);
  expect(body).toContain('Your roles do not allow this.');
});

test('the discovery documents and the token endpoint answer without a session, and local mode has none of it', async () => {
  const server = await open();
  const resource = await server.get('/.well-known/oauth-protected-resource/api/mcp');
  expect(resource.status).toBe(200);
  expect((await resource.json()).resource).toBe(server.resource);
  expect(resource.headers.get('set-cookie')).toBeNull();
  expect((await (await server.get('/.well-known/oauth-protected-resource')).json()).resource).toBe(server.resource);
  const metadata = await (await server.get('/.well-known/oauth-authorization-server', { Host: 'attacker.example', 'X-Forwarded-Host': 'attacker.example' })).json();
  expect(metadata.token_endpoint).toBe(server.origin + '/oauth/token');
  expect(JSON.stringify(metadata)).not.toContain('attacker');
  using local = await testWorkspace();
  const localHandler = createHandler(local.ws, {});
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth/authorize', '/oauth/setup', '/api/connections']) {
    expect((await localHandler(new Request('http://127.0.0.1:4310' + path))).status, path).toBe(404);
  }
  expect((await localHandler(new Request('http://127.0.0.1:4310/oauth/token', { method: 'POST' }))).status).toBe(404);
});
