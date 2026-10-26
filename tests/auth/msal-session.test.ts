// Checks MSAL sign-in through the real handler: each session keeps its own token cache inside the
// encrypted session record, no token reaches a response or a log line, and group overage and
// group names use the application token MSAL acquired.
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createHandler } from '../../src/server/handler';
import { TEST_GROUPS, type TestUserName } from '../helpers/auth-identities';
import { authWorkspace } from '../helpers/auth-workspace';
import type { MockOidc } from '../helpers/mock-oidc';
import { entraConfig, withEntraProvider } from '../helpers/entra-provider';

const origin = 'http://127.0.0.1:4310';

/** Signs a person in through the handler and returns their session cookie and its id. */
async function browserSignIn(
  handler: ReturnType<typeof createHandler>,
  provider: MockOidc,
  username: TestUserName,
) {
  const start = await handler(new Request(origin + '/auth/login'));
  const attempt = start.headers.getSetCookie()[0].split(';')[0];
  const callback = await provider.authorizeAs(username, start.headers.get('location')!);
  const signedIn = await handler(new Request(callback, { headers: { Cookie: attempt } }));
  const cookie = signedIn.headers
    .getSetCookie()
    .find(value => value.startsWith('sw-session='))!
    .split(';')[0];
  return { cookie, id: cookie.slice('sw-session='.length) };
}

/** Collects every console line written while a step runs. */
async function captureConsole(step: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  const record = (...values: unknown[]) => {
    lines.push(values.map(value => String(value)).join(' '));
  };
  Object.assign(console, { log: record, error: record, warn: record });
  try {
    await step();
  } finally {
    Object.assign(console, original);
  }
  return lines.join('\n');
}

/** Every secret held in a serialized MSAL token cache. */
function cacheSecrets(serialized: string): string[] {
  const cache = JSON.parse(serialized) as Record<string, Record<string, { secret?: string }>>;
  return Object.values(cache).flatMap(entries =>
    Object.values(entries).flatMap(entry => (entry.secret ? [entry.secret] : [])),
  );
}

test('each session keeps its own MSAL cache, encrypted, and no token reaches a response or log', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
    const handler = createHandler(fixture.ws, auth);
    const responses: string[] = [];
    let alice = { cookie: '', id: '' };
    let bob = { cookie: '', id: '' };
    const logged = await captureConsole(async () => {
      alice = await browserSignIn(handler, provider, 'alice');
      bob = await browserSignIn(handler, provider, 'bob');
      for (const cookie of [alice.cookie, bob.cookie]) {
        const me = await handler(new Request(origin + '/api/me', { headers: { Cookie: cookie } }));
        expect(me.status).toBe(200);
        responses.push(await me.text());
      }
    });
    const aliceSession = (await auth.authentication.sessions.get(alice.id, false))!;
    const bobSession = (await auth.authentication.sessions.get(bob.id, false))!;
    const aliceCache = aliceSession.tokens.tokenCache!;
    const bobCache = bobSession.tokens.tokenCache!;
    expect(aliceCache).not.toBe(bobCache);
    expect(Object.keys(JSON.parse(aliceCache).Account)).toHaveLength(1);
    expect(Object.keys(JSON.parse(bobCache).Account)).toHaveLength(1);
    const secrets = [...cacheSecrets(aliceCache), ...cacheSecrets(bobCache)];
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    const sessionDir = join(fixture.ws.layout.state, 'sessions');
    const files = readdirSync(sessionDir).map(name => readFileSync(join(sessionDir, name), 'utf8'));
    // A base64-encoded copy would hide plain text from a text search, so decode it too.
    const decoded = files.map(text =>
      Buffer.from(JSON.parse(text).ciphertext, 'base64').toString('latin1'),
    );
    const stored = [...files, ...decoded];
    expect(files).toHaveLength(2);
    for (const text of [...stored, ...responses, logged]) {
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/RefreshToken|AccessToken|tokenCache/);
    }
    auth.close();
  }));

test('group overage and group names use the application token MSAL acquired', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
    const handler = createHandler(fixture.ws, auth);
    const olga = await browserSignIn(handler, provider, 'olga');
    const me = await handler(new Request(origin + '/api/me', { headers: { Cookie: olga.cookie } }));
    expect(me.status).toBe(200);
    const person = await me.json();
    expect(person.roleSources.some((source: { via: string }) => source.via === 'group')).toBe(true);
    expect(provider.calls.some(call => call.endpoint === 'graph-check')).toBe(true);
    const appToken = provider.calls.find(call => call.params.grant_type === 'client_credentials');
    expect(appToken?.endpoint).toBe('token');
    expect(appToken?.params.scope).toContain('https://graph.microsoft.com/.default');
    const group = TEST_GROUPS.salesEditors;
    expect(await auth.groupName(group.id)).toEqual({
      id: group.id,
      displayName: group.name,
      resolved: true,
    });
    auth.close();
  }));
