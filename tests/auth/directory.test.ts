// Checks overage batching and fail-closed resolution using an injected HTTP edge.
import { expect, test } from 'bun:test';
import { createDirectoryClient, createGroupNameCache, validateDirectoryGroupIds } from '../../src/server/auth/directory';
import { accessFixture } from './access-fixture';

test('checks at most twenty candidate groups per call and drops unexpected groups', async () => {
  const batches: string[][] = [];
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => 'app-token',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      batches.push(body.groupIds);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer app-token');
      return Response.json({ value: [...body.groupIds, 'unrequested'] });
    },
  });
  const ids = Array.from({ length: 45 }, (_, index) => String(index));
  expect(await directory.groups('person', ids)).toEqual(ids);
  expect(batches.map(batch => batch.length)).toEqual([20, 20, 5]);
});

test('a directory failure removes all membership and reports a safe reason', async () => {
  const failures: string[] = [];
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => 'secret',
    fetch: async () => new Response('secret provider error', { status: 503 }),
    failure: reason => failures.push(reason),
  });
  expect(await directory.groups('person', ['group'])).toBeNull();
  expect(failures).toEqual(['directory-unavailable']);
});

test('group lookup confines the app token and degrades without losing the group ID', async () => {
  const calls: string[] = [];
  const directory = createDirectoryClient({
    graphUrl: 'https://graph.example',
    token: async () => 'app-token',
    fetch: async (url, init) => {
      calls.push(url);
      expect(init?.redirect).toBe('error');
      return Response.json({ displayName: 'Sales editors' });
    },
  });
  expect(await directory.group('group-id')).toEqual({
    id: 'group-id',
    displayName: 'Sales editors',
    resolved: true,
  });
  expect(calls).toEqual(['https://graph.example/v1.0/groups/group-id?$select=displayName']);
  const failed = createDirectoryClient({
    graphUrl: 'https://graph.example',
    token: async () => {
      throw new Error('token-secret');
    },
  });
  expect(await failed.group('group-id')).toEqual({
    id: 'group-id',
    displayName: null,
    resolved: false,
  });
});

test('Graph stand-in resolves group names through an app-only token', async () => {
  const { withProvider, graphToken } = await import('./mock-oidc-client');
  const { TEST_GROUPS } = await import('../helpers/auth-identities');
  await withProvider(async provider => {
    const directory = createDirectoryClient({
      graphUrl: provider.graphUrl,
      token: () => graphToken(provider),
    });
    expect(await directory.group(TEST_GROUPS.salesEditors.id)).toEqual({
      id: TEST_GROUPS.salesEditors.id,
      displayName: TEST_GROUPS.salesEditors.name,
      resolved: true,
    });
  });
});

test('directory aborts and malformed responses remain unresolved without returning secrets', async () => {
  for (const request of [
    async () => {
      throw new DOMException('secret endpoint', 'TimeoutError');
    },
    async () => Response.json({ accessToken: 'secret' }),
  ]) {
    const directory = createDirectoryClient({
      graphUrl: 'https://graph.example',
      token: async () => 'secret',
      fetch: request,
    });
    expect(await directory.group('id')).toEqual({ id: 'id', displayName: null, resolved: false });
  }
});

test('a stalled token acquisition has a bounded unresolved result', async () => {
  const directory = createDirectoryClient({
    graphUrl: 'https://graph.example',
    timeoutMs: 5,
    token: () => new Promise(() => {}),
  });
  expect(await directory.group('id')).toEqual({ id: 'id', displayName: null, resolved: false });
});

test('Entra administration validates IDs and preserves local labels without application Graph lookups', async () => {
  const { startMockOidc } = await import('../helpers/mock-oidc');
  const { authWorkspace } = await import('../helpers/auth-workspace');
  const { oidcConfig } = await import('../helpers/server-auth');
  const { createServerAuthentication } = await import('../../src/server/auth/authentication');
  const { createHandler } = await import('../../src/server/handler');
  const { openAdminRepository } = await import('../../src/server/auth/admin-repo');
  const { TEST_GROUPS } = await import('../helpers/auth-identities');
  const provider = await startMockOidc();
  using fixture = await authWorkspace();
  const auth = await createServerAuthentication(fixture.ws, oidcConfig(provider.issuer, provider.graphUrl));
  const handler = createHandler(fixture.ws, auth);
  const origin = 'http://127.0.0.1:4310';
  try {
    const start = await handler(new Request(origin + '/auth/login'));
    const callback = await provider.authorizeAs('dave', start.headers.get('location')!);
    const signedIn = await handler(
      new Request(callback, {
        headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    const cookie = signedIn.headers
      .getSetCookie()
      .find(value => value.startsWith('sw-session='))!
      .split(';')[0];
    const request = (path: string, method = 'GET', body?: unknown) =>
      handler(
        new Request(origin + path, {
          method,
          headers: { Cookie: cookie, Origin: origin, 'X-SW-Request': '1' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const group = TEST_GROUPS.salesEditors;
    expect(await (await request('/api/admin/groups/' + group.id)).json()).toEqual({
      id: group.id,
      displayName: group.name,
      resolved: false,
    });
    const groupLookups = () => provider.calls.filter(call => call.endpoint === 'graph-group');
    const before = groupLookups().length;
    const users = await (await request('/api/admin/users')).json();
    const dave = users.find((user: any) => user.name === 'Dave Dias');
    expect(dave.groups).toEqual([
      {
        id: TEST_GROUPS.workbenchAdmins.id,
        displayName: TEST_GROUPS.workbenchAdmins.name,
        resolved: false,
      },
    ]);
    expect(groupLookups().length).toBe(before);

    provider.fail('graph-group', 'error');
    const uncached = TEST_GROUPS.hrViewers;
    expect(await (await request('/api/admin/groups/' + uncached.id)).json()).toEqual({
      id: uncached.id,
      displayName: uncached.name,
      resolved: false,
    });
    const repository = openAdminRepository({ root: fixture.root });
    const grants = [
      ...repository.load().grants,
      {
        id: 'unnamed-group',
        roleId: 'r_metric_reviewer',
        member: { kind: 'group', groupId: 'f0000000-0000-4000-8000-000000000001', displayName: 'Local HR label', resolvedAt: '2026-01-01T00:00:00Z' },
        scope: { kind: 'domains', domains: ['hr'] },
        addedBy: dave.id,
        addedAt: new Date().toISOString(),
      },
    ];
    const version = await repository.version();
    const invalid = await request('/api/admin/policies/dry-run', 'POST', {
      grants: [...grants, { ...grants.at(-1), id: 'invalid-entra-group', member: { kind: 'group', groupId: 'Sales Editors' } }],
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain('GUID object IDs');
    const projects = structuredClone(repository.load().projects);
    projects.projects['sales-metrics'].restricted.push({ pattern: '**', groups: ['not-a-guid'], emails: [] });
    const restricted = await request('/api/admin/policies/dry-run', 'POST', projects);
    expect(restricted.status).toBe(400);
    expect(await restricted.text()).toContain('GUID object IDs');
    expect(await repository.version()).toBe(version);
    const { dryRunId } = await (await request('/api/admin/policies/dry-run', 'POST', { grants })).json();
    const saved = await request('/api/admin/grants', 'PUT', {
      grants,
      dryRunId,
      baseVersion: await repository.version(),
    });
    expect(saved.status).toBe(200);
    const stored = repository.load().grants.find(grant => grant.id === 'unnamed-group');
    expect(stored?.member).toEqual({
      kind: 'group',
      groupId: 'f0000000-0000-4000-8000-000000000001',
      displayName: 'Local HR label',
    });
    const listed = await (await request('/api/admin/grants')).json();
    expect(listed.grants.find((grant: { id: string }) => grant.id === 'unnamed-group').member.displayName).toBe('Local HR label');
    expect(await (await request('/api/admin/groups/f0000000-0000-4000-8000-000000000001')).json()).toEqual({
      id: 'f0000000-0000-4000-8000-000000000001',
      displayName: 'Local HR label',
      resolved: false,
    });
    expect(await (await request('/api/admin/groups/f0000000-0000-4000-8000-000000000002')).json()).toEqual({
      id: 'f0000000-0000-4000-8000-000000000002',
      displayName: null,
      resolved: false,
    });
    const tokenRequests = provider.calls.filter(call => call.params.grant_type === 'client_credentials');
    expect(tokenRequests).toHaveLength(0);
    const graphCalls = provider.calls.filter(call => call.endpoint.startsWith('graph-'));
    expect(new Set(graphCalls.map(call => call.endpoint))).toEqual(new Set(['graph-check']));
    const roles = { roles: [] };
    const preview = await (await request('/api/admin/policies/dry-run', 'POST', roles)).json();
    expect(
      (
        await request('/api/admin/roles', 'PUT', {
          ...roles,
          dryRunId: preview.dryRunId,
          baseVersion: await repository.version(),
          confirmDeleteInUse: true,
        })
      ).status,
    ).toBe(200);
    expect(await (await request('/api/admin/groups/f0000000-0000-4000-8000-000000000001')).json()).toEqual({
      id: 'f0000000-0000-4000-8000-000000000001',
      displayName: null,
      resolved: false,
    });
  } finally {
    auth.close();
    await provider.stop();
  }
}, 60000);

test('Entra group validation rejects malformed grant and restricted IDs before a lookup', () => {
  const policy = accessFixture().config;
  expect(() => validateDirectoryGroupIds(policy)).not.toThrow();
  policy.grants.push({ ...policy.grants[0], id: 'uppercase-group', member: { kind: 'group', groupId: 'F0000000-0000-4000-8000-000000000001' } });
  expect(() => validateDirectoryGroupIds(policy)).not.toThrow();
  policy.grants.pop();
  policy.grants.push({ ...policy.grants[0], id: 'bad-group', member: { kind: 'group', groupId: 'Sales Editors' } });
  expect(() => validateDirectoryGroupIds(policy)).toThrow('GUID object IDs');
  policy.grants.pop();
  policy.projects.projects['sales-metrics'].restricted.push({ pattern: '**', groups: ['bad-id'], emails: [] });
  expect(() => validateDirectoryGroupIds(policy)).toThrow('GUID object IDs');
});

test('membership batches share a total deadline and abort the outstanding HTTP request', async () => {
  const failures: string[] = [];
  const signals: AbortSignal[] = [];
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    timeoutMs: 50,
    token: async () => 'delegated-token',
    failure: reason => failures.push(reason),
    fetch: async (_url, init) => {
      const signal = init!.signal!;
      signals.push(signal);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({ value: JSON.parse(String(init?.body)).groupIds })), 25);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
  });
  expect(await directory.myGroups(Array.from({ length: 41 }, (_, index) => String(index)))).toBeNull();
  expect(signals.length).toBeGreaterThan(0);
  expect(signals.every(signal => signal === signals[0] && signal.aborted)).toBe(true);
  expect(failures).toEqual(['directory-unavailable']);
});

test('caller cancellation bounds a stalled token lookup without making an HTTP request', async () => {
  const controller = new AbortController();
  let requests = 0;
  let finishToken: (token: string) => void = () => {
    throw new Error('Token acquisition has not started.');
  };
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    signal: controller.signal,
    token: () =>
      new Promise(resolve => {
        finishToken = resolve;
      }),
    fetch: async () => {
      requests++;
      return Response.json({ value: [] });
    },
  });
  const pending = directory.myGroups(['group']);
  controller.abort();
  expect(await pending).toBeNull();
  finishToken('late-token');
  await Promise.resolve();
  expect(requests).toBe(0);
});

test('group names are looked up a few at a time and cached briefly by group id', async () => {
  let inFlight = 0;
  let mostInFlight = 0;
  const calls: string[] = [];
  let time = 0;
  const cache = createGroupNameCache(
    async id => {
      calls.push(id);
      inFlight++;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return { id, displayName: 'Group ' + id, resolved: true };
    },
    { concurrency: 3, ttlMs: 1000, now: () => time },
  );
  const ids = Array.from({ length: 10 }, (_, index) => 'g' + index);
  const names = await cache.names([...ids, ...ids]);
  expect([...names.keys()]).toEqual(ids);
  expect(names.get('g4')).toEqual({ id: 'g4', displayName: 'Group g4', resolved: true });
  expect(mostInFlight).toBe(3);
  expect(calls).toHaveLength(10);
  await cache.name('g1');
  expect(calls).toHaveLength(10);
  time = 1000;
  await cache.name('g1');
  expect(calls).toHaveLength(11);
});

test('a failing group lookup is reported as unresolved instead of failing the caller', async () => {
  const cache = createGroupNameCache(async () => {
    throw new Error('directory down');
  });
  expect(await cache.names(['group'])).toEqual(new Map([['group', { id: 'group', displayName: null, resolved: false }]]));
});

test('delegated membership checks use only /me, batch candidates and discard every batch on failure', async () => {
  const calls: string[] = [];
  let tokenRequests = 0;
  const directory = createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => {
      tokenRequests++;
      return 'delegated-token';
    },
    fetch: async (url, init) => {
      calls.push(url);
      if (calls.length === 2) return new Response('unavailable', { status: 503 });
      return Response.json({ value: JSON.parse(String(init?.body)).groupIds });
    },
  });
  expect(await directory.myGroups([])).toEqual([]);
  expect(tokenRequests).toBe(0);
  expect(await directory.myGroups(Array.from({ length: 25 }, (_, index) => String(index)))).toBeNull();
  expect(calls).toEqual(['http://127.0.0.1/graph/v1.0/me/checkMemberGroups', 'http://127.0.0.1/graph/v1.0/me/checkMemberGroups']);
});

test('Graph /me requires a delegated User.Read token, not an API, app-only or differently scoped token', async () => {
  const { withEntraProvider, entraConfig, signInWith } = await import('../helpers/entra-provider');
  const { createMsalProvider } = await import('../../src/server/auth/msal-provider');
  const { TEST_GROUPS, TEST_USERS } = await import('../helpers/auth-identities');
  await withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const identity = await signInWith(client, provider, 'alice');
    const permitted = await client.onBehalfOf(identity.tokens.accessToken, ['https://graph.microsoft.com/User.Read']);
    const wrongScope = await client.onBehalfOf(identity.tokens.accessToken, ['https://graph.microsoft.com/profile']);
    for (const token of [identity.tokens.accessToken, await client.directoryToken(), wrongScope.token]) {
      const directory = createDirectoryClient({ graphUrl: provider.graphUrl, token: async () => token });
      expect(await directory.myGroups([TEST_GROUPS.salesEditors.id])).toBeNull();
    }
    const directory = createDirectoryClient({ graphUrl: provider.graphUrl, token: async () => permitted.token });
    expect(await directory.myGroups([TEST_GROUPS.salesEditors.id])).toEqual([TEST_GROUPS.salesEditors.id]);
    expect(await directory.groups(TEST_USERS.carol.oid, [TEST_GROUPS.hrViewers.id])).toBeNull();
  });
});
