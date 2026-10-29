// Exercises authentication failure boundaries with an in-memory provider and disposable workspace.
import { beforeAll, expect, spyOn, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { oidcTransport } from '../helpers/oidc-transport';
import { authWorkspace } from '../helpers/auth-workspace';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createServerAuthentication, providerDetail } from '../../src/server/auth/authentication';
import { createSessionStore } from '../../src/server/auth/sessions';
import { SignInError } from '../../src/server/auth/sign-in-error';
import { createHandler } from '../../src/server/handler';

beforeAll(useDefaultBrand);

async function setup() {
  const transport = await oidcTransport();
  const fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const handler = createHandler(fixture.ws, { ...auth, staticRoot: join(fixture.root, 'static') });
  async function signIn(cookie = '', username = 'bob') {
    const first = await handler(new Request(transport.config.publicUrl + '/auth/login'));
    const callback = transport.authorize(first.headers.get('location')!, username);
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    return handler(new Request(callback, { headers: { Cookie: [attempt, cookie].join('; ') } }));
  }
  return {
    transport,
    fixture,
    client,
    auth,
    handler,
    signIn,
    [Symbol.dispose]() {
      auth.close();
      fixture.dispose();
    },
  };
}

function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find(value => value.startsWith('sw-session='))!
    .split(';')[0];
}

function auditEntries(root: string) {
  const dir = join(root, 'state/audit');
  return readdirSync(dir).flatMap(file =>
    readFileSync(join(dir, file), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line)),
  );
}

test('sign-in audit failure returns 503 before creating a session', async () => {
  using context = await setup();
  const append = spyOn(context.auth.audit, 'append').mockImplementation(() => {
    throw new Error('disk unavailable');
  });
  try {
    const response = await context.signIn();
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    const directory = join(context.fixture.root, 'state/sessions');
    expect(existsSync(directory) ? readdirSync(directory) : []).toEqual([]);
  } finally {
    append.mockRestore();
  }
});

test('directory degradation preserves successful sign-in and refresh request ids', async () => {
  using context = await setup();
  context.transport.changeClaims({ hasgroups: true });
  const token = spyOn(context.client, 'directoryToken').mockRejectedValue(new Error('secret token'));
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await context.signIn();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    const cookie = sessionCookie(response);
    const session = (await context.auth.authentication.sessions.get(cookie.split('=')[1]))!;
    session.tokens.expiresAt = 0;
    await context.auth.authentication.sessions.update(session);
    const refresh = await context.handler(
      new Request(context.transport.config.publicUrl + '/api/me', {
        headers: { Cookie: cookie },
      }),
    );
    expect(refresh.status).toBe(200);
    const entries = auditEntries(context.fixture.root);
    expect(entries.filter(entry => entry.action === 'signIn').map(entry => entry.decision)).toEqual(['allow']);
    const degraded = entries.filter(entry => entry.action === 'directoryLookup');
    expect(degraded.map(entry => entry.outcome)).toEqual(['degraded', 'degraded']);
    expect(degraded.map(entry => entry.requestId)).toEqual([response.headers.get('x-request-id'), refresh.headers.get('x-request-id')]);
    expect(log.mock.calls.flat().join('\n')).not.toContain('secret token');
    expect(log.mock.calls.flat().join('\n')).toContain('auth.failure requestId=' + refresh.headers.get('x-request-id'));
  } finally {
    token.mockRestore();
    log.mockRestore();
  }
});

test('callback replaces the browser session and root key cannot decrypt derived-key sessions', async () => {
  using context = await setup();
  const first = await context.signIn();
  const cookie = sessionCookie(first);
  const id = cookie.split('=')[1];
  const rootStore = createSessionStore({
    dir: join(context.fixture.root, 'state/sessions'),
    key: context.transport.config.sessionKey,
  });
  await expect(rootStore.get(id)).resolves.toBeNull();
  const rootSession = await rootStore.create({
    principal: (await context.auth.authentication.sessions.get(id))!.principal,
    tokens: { accessToken: 'root-token', expiresAt: Date.now() + 10000 },
  });
  await expect(context.auth.authentication.sessions.get(rootSession.id)).resolves.toBeNull();
  await rootStore.end(rootSession.id);
  const second = await context.signIn(cookie);
  expect(second.status).toBe(302);
  expect(await context.auth.authentication.sessions.get(id)).toBeNull();
  expect(sessionCookie(second)).not.toBe(cookie);
  expect(readdirSync(join(context.fixture.root, 'state/sessions'))).toHaveLength(1);
});

test('handler preserves asset and auth stylesheet caching', async () => {
  using context = await setup();
  const staticRoot = join(context.fixture.root, 'static');
  mkdirSync(join(staticRoot, 'assets'), { recursive: true });
  writeFileSync(join(staticRoot, 'assets/app-abcd1234.js'), 'export {};');
  const response = await context.signIn();
  const cookie = sessionCookie(response);
  for (const [path, cache] of [
    ['/assets/app-abcd1234.js', 'private, max-age=31536000, immutable'],
    ['/auth/style.css', 'public, max-age=3600'],
    ['/api/me', 'no-store'],
  ]) {
    const result = await context.handler(
      new Request(context.transport.config.publicUrl + path, {
        headers: { Cookie: cookie },
      }),
    );
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe(cache);
  }
});

test('login and callback errors are logged safely with their request ids', async () => {
  using context = await setup();
  const login = spyOn(context.client, 'login').mockRejectedValue(new Error('secret-code token'));
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const path of ['/auth/login', '/catalog', '/auth/callback?code=secret-code']) {
      const response = await context.handler(new Request(context.transport.config.publicUrl + path));
      expect(await response.text()).toContain('Try again');
      expect(log.mock.calls.flat().join('\n')).toContain('auth.failure requestId=' + response.headers.get('x-request-id'));
    }
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/secret-code| token/);
    expect(
      auditEntries(context.fixture.root)
        .filter(entry => entry.action === 'signIn')
        .map(entry => entry.reason),
    ).toEqual(['provider-unreachable', 'provider-unreachable', 'attempt-invalid']);
  } finally {
    login.mockRestore();
    log.mockRestore();
  }
});

test('failed sign-out audit preserves the session and returns 503', async () => {
  using context = await setup();
  const signedIn = await context.signIn();
  const cookie = sessionCookie(signedIn);
  const id = cookie.split('=')[1];
  const session = (await context.auth.authentication.sessions.get(id))!;
  const append = spyOn(context.auth.audit, 'append').mockImplementation(() => {
    throw new Error('disk unavailable');
  });
  try {
    const response = await context.auth.authentication.logout(new Request(context.transport.config.publicUrl + '/auth/logout', { method: 'POST' }), session);
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await context.auth.authentication.sessions.get(id)).not.toBeNull();
  } finally {
    append.mockRestore();
  }
});

test('sign-out audit precedes session termination with explicit outcomes', async () => {
  using context = await setup();
  const cookie = sessionCookie(await context.signIn());
  const session = (await context.auth.authentication.sessions.get(cookie.split('=')[1]))!;
  await context.auth.authentication.logout(new Request(context.transport.config.publicUrl), session);
  const entries = auditEntries(context.fixture.root);
  const signOut = entries.findIndex(entry => entry.action === 'signOut');
  const ended = entries.findIndex(entry => entry.action === 'sessionEnded');
  expect(signOut).toBeGreaterThan(-1);
  expect(ended).toBeGreaterThan(signOut);
  expect(entries[signOut].outcome).toBe('ok');
});

test('the sign-in log names the provider error code but never other error text', () => {
  const cause = new Error('response body error with code=abc');
  const providerCode = 'not_allowed: Offline tokens not allowed';
  const refused = new SignInError('attempt-invalid', '/', cause, providerCode);
  expect(providerDetail(refused)).toBe(' (not_allowed: Offline tokens not allowed)');
  expect(providerDetail(new SignInError('attempt-invalid', '/', cause))).toBe('');
  expect(providerDetail(new Error('secret-code token'))).toBe('');
  expect(providerDetail('not an error')).toBe('');
});
