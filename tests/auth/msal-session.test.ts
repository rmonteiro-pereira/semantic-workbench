// Checks MSAL sign-in through the real handler: each session keeps its own token cache inside the
// encrypted session record, no token reaches a response or a log line, and group overage and
// memberships use delegated Graph and group labels require no application permissions.
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createHandler } from '../../src/server/handler';
import { TEST_GROUPS, TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { authWorkspace } from '../helpers/auth-workspace';
import type { MockOidc } from '../helpers/mock-oidc';
import { entraConfig, withEntraProvider } from '../helpers/entra-provider';

const origin = 'http://127.0.0.1:4310';

/** Signs a person in through the handler and returns their session cookie and its id. */
async function browserSignIn(handler: ReturnType<typeof createHandler>, provider: MockOidc, username: TestUserName) {
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
  return Object.values(cache).flatMap(entries => Object.values(entries).flatMap(entry => (entry.secret ? [entry.secret] : [])));
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
    const decoded = files.map(text => Buffer.from(JSON.parse(text).ciphertext, 'base64').toString('latin1'));
    const stored = [...files, ...decoded];
    expect(files).toHaveLength(2);
    for (const text of [...stored, ...responses, logged]) {
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/RefreshToken|AccessToken|tokenCache/);
    }
    auth.close();
  }));

test('group overage uses delegated User.Read and labels require no application token', () =>
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
    expect(provider.calls.some(call => call.params.grant_type === 'client_credentials')).toBe(false);
    const obo = provider.calls.filter(call => call.params.requested_token_use === 'on_behalf_of');
    expect(obo).toHaveLength(1);
    expect(obo[0].params.scope.split(' ')).toContain('https://graph.microsoft.com/User.Read');
    const group = TEST_GROUPS.salesEditors;
    expect(await auth.groupName(group.id)).toEqual({
      id: group.id,
      displayName: group.name,
      resolved: false,
    });
    auth.close();
  }));

test(
  'configured internal groups work without token group claims and stay isolated across users and refresh',
  () =>
    withEntraProvider(
      async provider => {
        using fixture = await authWorkspace();
        const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
        try {
          const handler = createHandler(fixture.ws, auth);
          const [alice, carol] = await Promise.all([browserSignIn(handler, provider, 'alice'), browserSignIn(handler, provider, 'carol')]);
          const aliceSession = (await auth.authentication.sessions.get(alice.id, false))!;
          const carolSession = (await auth.authentication.sessions.get(carol.id, false))!;
          expect(aliceSession.principal.groupOverage).toBe(false);
          expect(aliceSession.principal.groupsResolved).toBe('directory');
          expect(aliceSession.principal.groups).toEqual([TEST_GROUPS.salesEditors.id]);
          expect(carolSession.principal.groups).toEqual([TEST_GROUPS.hrViewers.id]);
          expect(aliceSession.principal.grants.some(grant => grant.roleId === 'editor')).toBe(true);
          expect(carolSession.principal.grants.some(grant => grant.roleId === 'editor')).toBe(false);
          provider.setUserGroups('alice', [TEST_GROUPS.hrViewers]);
          aliceSession.tokens.expiresAt = 0;
          await auth.authentication.sessions.update(aliceSession);
          const refreshed = await handler(new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }));
          expect(refreshed.status).toBe(200);
          const current = (await auth.authentication.sessions.get(alice.id, false))!;
          expect(current.principal.groups).toEqual([TEST_GROUPS.hrViewers.id]);
          expect(current.principal.grants.some(grant => grant.roleId === 'editor')).toBe(false);
          provider.setUserGroups('alice', []);
          current.tokens.expiresAt = 0;
          await auth.authentication.sessions.update(current);
          expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }))).status).toBe(403);
          expect(provider.calls.some(call => call.params.grant_type === 'client_credentials')).toBe(false);
          expect(provider.calls.filter(call => call.endpoint === 'graph-check')).toHaveLength(4);
        } finally {
          auth.close();
        }
      },
      { groupClaims: false },
    ),
  60000,
);

test(
  'group grants are optional: email access needs no Graph, while login alone grants no role',
  () =>
    withEntraProvider(async provider => {
      using fixture = await authWorkspace();
      const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
      try {
        const policy = structuredClone(auth.access.snapshot().config);
        policy.grants = policy.grants.filter(grant => grant.member.kind !== 'group');
        for (const project of Object.values(policy.projects.projects)) {
          for (const rule of project.restricted) rule.groups = [];
        }
        auth.access.reload(policy);
        const handler = createHandler(fixture.ws, auth);
        const bob = await browserSignIn(handler, provider, 'bob');
        expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: bob.cookie } }))).status).toBe(200);
        const alice = await browserSignIn(handler, provider, 'alice');
        expect((await auth.authentication.sessions.get(alice.id, false))!.principal.grants).toEqual([]);
        expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }))).status).toBe(403);
        expect(provider.calls.filter(call => call.endpoint.startsWith('graph-'))).toHaveLength(0);
        expect(provider.calls.filter(call => call.params.requested_token_use === 'on_behalf_of')).toHaveLength(0);
      } finally {
        auth.close();
      }
    }),
  30000,
);

test(
  'Graph failure never retains token groups but preserves independent email grants',
  () =>
    withEntraProvider(async provider => {
      using fixture = await authWorkspace();
      const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
      try {
        provider.fail('graph-check', 'error');
        const handler = createHandler(fixture.ws, auth);
        const alice = await browserSignIn(handler, provider, 'alice');
        const principal = (await auth.authentication.sessions.get(alice.id, false))!.principal;
        expect(principal.groups).toEqual([]);
        expect(principal.groupsResolved).toBe('failed');
        expect(principal.grants).toEqual([]);
        const bob = await browserSignIn(handler, provider, 'bob');
        expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: bob.cookie } }))).status).toBe(200);
        expect((await auth.authentication.sessions.get(bob.id, false))!.principal.grants.every(grant => grant.via === 'email')).toBe(true);
        expect(provider.calls.some(call => call.params.grant_type === 'client_credentials')).toBe(false);
      } finally {
        auth.close();
      }
    }),
  30000,
);

test(
  'turning directory checks off retains token-only grants without OBO',
  () =>
    withEntraProvider(async provider => {
      using fixture = await authWorkspace();
      const config = entraConfig(provider);
      config.directory.overage = 'off';
      const auth = await createServerAuthentication(fixture.ws, config);
      try {
        const handler = createHandler(fixture.ws, auth);
        const alice = await browserSignIn(handler, provider, 'alice');
        expect((await auth.authentication.sessions.get(alice.id, false))!.principal.groupsResolved).toBe('token');
        const olga = await browserSignIn(handler, provider, 'olga');
        expect((await auth.authentication.sessions.get(olga.id, false))!.principal.groupsResolved).toBe('failed');
        expect(provider.calls.filter(call => call.endpoint === 'graph-check')).toHaveLength(0);
        expect(provider.calls.filter(call => call.params.requested_token_use === 'on_behalf_of')).toHaveLength(0);
      } finally {
        auth.close();
      }
    }),
  30000,
);

test(
  'multiple membership batches share one delegated token per user resolution',
  () =>
    withEntraProvider(async provider => {
      using fixture = await authWorkspace();
      const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
      try {
        const policy = structuredClone(auth.access.snapshot().config);
        const example = policy.grants.find(grant => grant.member.kind === 'group')!;
        for (let index = 0; index < 45; index++) {
          policy.grants.push({ ...example, id: `extra-${index}`, member: { kind: 'group', groupId: `bb000000-0000-4000-8000-${String(index).padStart(12, '0')}` } });
        }
        auth.access.reload(policy);
        const alice = await browserSignIn(createHandler(fixture.ws, auth), provider, 'alice');
        expect((await auth.authentication.sessions.get(alice.id, false))!.principal.groups).toEqual(TEST_USERS.alice.groups.map(group => group.id));
        const checks = provider.calls.filter(call => call.endpoint === 'graph-check');
        expect(checks).toHaveLength(3);
        expect(checks.map(call => JSON.parse(call.params.body).groupIds.length)).toEqual([20, 20, 10]);
        expect(provider.calls.filter(call => call.params.requested_token_use === 'on_behalf_of')).toHaveLength(1);
      } finally {
        auth.close();
      }
    }),
  30000,
);
