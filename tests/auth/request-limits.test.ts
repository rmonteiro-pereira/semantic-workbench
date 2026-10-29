// The HTTP boundary bounds what one source address can cost: requests, sign-in attempts and
// audit records.
import { expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { ANONYMOUS_AUDIT_BURST } from '../../src/server/auth/rate-limit';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { localPrincipal } from '../../src/server/auth/principal';
import { accessFixture } from './access-fixture';
import { createHandler } from '../../src/server/handler';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';
import { configureLogging } from '../../src/server/observability/log';
import { useQuietLogging } from '../helpers/quiet-logging';

const month = () => new Date().toISOString().slice(0, 7);
const noRefill = { burst: 5, perSecond: 0.0001 };

async function serverHandler(
  sourceIp: () => string | undefined,
  limits = { requests: noRefill, signIn: noRefill },
) {
  const workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    audit,
    sourceIp,
    requestLimits: limits,
  });
  return { workspace, audit, handler, [Symbol.dispose]: () => workspace.dispose() };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost' + path, { headers });

test('a source address that exceeds its request allowance is answered 429', async () => {
  using app = await serverHandler(() => '203.0.113.7');
  const statuses: number[] = [];
  for (let request = 0; request < 7; request++) {
    statuses.push((await app.handler(get('/api/projects'))).status);
  }
  expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
  const refused = await app.handler(get('/api/projects'));
  expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(await refused.json()).toEqual({ error: 'Too many requests.' });
});

test('another address is not affected by a limited one', async () => {
  let source = '203.0.113.7';
  using app = await serverHandler(() => source);
  for (let request = 0; request < 7; request++) await app.handler(get('/api/projects'));
  source = '203.0.113.8';
  expect((await app.handler(get('/api/projects'))).status).toBe(401);
});

test('sign-in routes have their own, tighter allowance per address', async () => {
  const limits = { requests: { burst: 100, perSecond: 0.0001 }, signIn: noRefill };
  using app = await serverHandler(() => '203.0.113.7', limits);
  for (let attempt = 0; attempt < noRefill.burst; attempt++) {
    expect((await app.handler(get('/auth/login'))).status).not.toBe(429);
  }
  expect((await app.handler(get('/auth/login'))).status).toBe(429);
  expect((await app.handler(get('/auth/callback?code=x'))).status).toBe(429);
  expect((await app.handler(get('/api/projects'))).status).toBe(401);
});

test('only the sign-in routes spend the sign-in allowance', async () => {
  const limits = { requests: { burst: 100, perSecond: 0.0001 }, signIn: noRefill };
  using app = await serverHandler(() => '203.0.113.7', limits);
  for (let request = 0; request < 20; request++) await app.handler(get('/api/projects'));
  expect((await app.handler(get('/auth/login'))).status).not.toBe(429);
});

test('anonymous requests to a protected route leave a bounded number of audit records', async () => {
  const limits = { requests: { burst: 1000, perSecond: 1000 }, signIn: noRefill };
  using app = await serverHandler(() => '203.0.113.7', limits);
  for (let request = 0; request < ANONYMOUS_AUDIT_BURST * 3; request++) {
    expect((await app.handler(get('/api/projects'))).status).toBe(401);
  }
  const denials = app.audit.entries(month()).filter(entry => entry.reason === 'sign-in-required');
  expect(denials).toHaveLength(ANONYMOUS_AUDIT_BURST);
  expect(denials[0].principal).toMatchObject({ id: 'anonymous' });
});

test('anonymous audit records are counted per source address', async () => {
  let source = '203.0.113.7';
  const limits = { requests: { burst: 1000, perSecond: 1000 }, signIn: noRefill };
  using app = await serverHandler(() => source, limits);
  for (let request = 0; request < ANONYMOUS_AUDIT_BURST + 5; request++) {
    await app.handler(get('/api/projects'));
  }
  source = '203.0.113.8';
  await app.handler(get('/api/projects'));
  const denials = app.audit.entries(month()).filter(entry => entry.reason === 'sign-in-required');
  expect(denials).toHaveLength(ANONYMOUS_AUDIT_BURST + 1);
});

test('refused bearer tokens from one address leave a bounded number of audit records', async () => {
  const limits = { requests: { burst: 1000, perSecond: 1000 }, signIn: noRefill };
  using app = await serverHandler(() => '203.0.113.7', limits);
  for (let request = 0; request < ANONYMOUS_AUDIT_BURST * 2; request++) {
    const response = await app.handler(
      new Request('http://localhost/api/projects', { headers: { Authorization: 'Bearer x' } }),
    );
    expect(response.status).toBe(401);
  }
  const refusals = app.audit.entries(month()).filter(entry => entry.reason === 'bearer-scope');
  expect(refusals).toHaveLength(ANONYMOUS_AUDIT_BURST);
});

test('local mode applies no request limit', async () => {
  const workspace = await testWorkspace();
  using _cleanup = { [Symbol.dispose]: () => workspace.dispose() };
  const handler = createHandler(workspace.ws, {
    requestLimits: { requests: noRefill, signIn: noRefill },
  });
  for (let request = 0; request < 12; request++) {
    expect((await handler(get('/api/projects'))).status).toBe(200);
  }
});

async function personApp(requests: { burst: number; perSecond: number }, now = Date.now) {
  const workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    audit,
    publicOrigin: 'http://localhost',
    access: createAccessControl({ ...accessFixture(), mode: 'local' }),
    principal: request => {
      const name = request.headers.get('x-person');
      return name ? { ...localPrincipal(), id: name } : null;
    },
    clientAddress: () => '203.0.113.7',
    requestLimits: { requests, signIn: noRefill },
    now,
  });
  return { audit, handler, [Symbol.dispose]: () => workspace.dispose() };
}

test('one anonymous visitor behind a shared address cannot lock out a signed-in person', async () => {
  using app = await personApp(noRefill);
  const statuses: number[] = [];
  for (let request = 0; request < 7; request++) {
    statuses.push((await app.handler(get('/api/projects'))).status);
  }
  expect(statuses.slice(-2)).toEqual([429, 429]);
  const alice = await app.handler(get('/api/projects', { 'x-person': 'alice' }));
  expect(alice.status).toBe(200);
  const bob = await app.handler(get('/api/projects', { 'x-person': 'bob' }));
  expect(bob.status).toBe(200);
});

test('a signed-in person is limited as themselves, whatever address they come from', async () => {
  using app = await personApp(noRefill);
  for (let request = 0; request < 5; request++) {
    expect((await app.handler(get('/api/projects', { 'x-person': 'alice' }))).status).toBe(200);
  }
  expect((await app.handler(get('/api/projects', { 'x-person': 'alice' }))).status).toBe(429);
  expect((await app.handler(get('/api/projects', { 'x-person': 'bob' }))).status).toBe(200);
});

test('left out anonymous refusals are counted on the next record', async () => {
  let milliseconds = Date.now();
  using app = await personApp({ burst: 5000, perSecond: 1 }, () => milliseconds);
  for (let request = 0; request < 1000; request++) await app.handler(get('/api/projects'));
  const denials = () =>
    app.audit.entries(month()).filter(entry => entry.reason === 'sign-in-required');
  expect(denials()).toHaveLength(ANONYMOUS_AUDIT_BURST);
  expect(denials().every(entry => entry.suppressed === undefined)).toBe(true);
  milliseconds += 60_000;
  await app.handler(get('/api/projects'));
  expect(denials().at(-1)!.suppressed).toBe(1000 - ANONYMOUS_AUDIT_BURST);
});

test('rate-limited sources are logged once per minute, not once per request', async () => {
  configureLogging({ level: 'warn', format: 'text' });
  let milliseconds = Date.now();
  using app = await personApp(noRefill, () => milliseconds);
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (let request = 0; request < 20; request++) await app.handler(get('/api/projects'));
    const lines = log.mock.calls.flat().filter(line => String(line).includes('rate-limited'));
    expect(lines).toHaveLength(1);
    expect(String(lines[0])).toMatch(/http.rate-limited .*client=203.0.113.7 refused=1/);
    milliseconds += 60_000;
    await app.handler(get('/api/projects'));
    const later = log.mock.calls.flat().filter(line => String(line).includes('rate-limited'));
    expect(String(later.at(-1))).toMatch(/http.rate-limited .*client=203.0.113.7 refused=15/);
  } finally {
    log.mockRestore();
    useQuietLogging();
  }
});

test('requests are limited by the client address when one is supplied, not by the peer', async () => {
  let client = '203.0.113.7';
  const workspace = await testWorkspace();
  using _cleanup = { [Symbol.dispose]: () => workspace.dispose() };
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    sourceIp: () => '10.0.0.1',
    clientAddress: () => client,
    requestLimits: { requests: noRefill, signIn: noRefill },
  });
  for (let request = 0; request < 5; request++) await handler(get('/api/projects'));
  expect((await handler(get('/api/projects'))).status).toBe(429);
  client = '203.0.113.8';
  expect((await handler(get('/api/projects'))).status).toBe(401);
});
