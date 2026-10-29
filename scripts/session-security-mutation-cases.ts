// Runs socketless assertions against a candidate module of the authentication, session and HTTP
// boundary code, so a deliberate fault in it fails the case.
import assert from 'node:assert/strict';
import * as nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import { hkdfSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spyOn } from 'bun:test';
import { ANONYMOUS_AUDIT_BURST } from '../src/server/auth/rate-limit';
import { allowEveryRemote } from '../tests/helpers/remote-credentials-fixture';

const month = () => new Date().toISOString().slice(0, 7);
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost' + path, { headers });

async function sessionsCase(candidate: any) {
  const { localPrincipal } = await import('../src/server/auth/principal');
  const dir = mkdtempSync(join(tmpdir(), 'sec-sessions-'));
  const identity = {
    principal: localPrincipal(),
    tokens: {
      accessToken: 'secret',
      expiresAt: Date.now() + 100000,
      providerSession: { issuer: 'https://idp.example', sid: 'provider-session' },
    },
  };
  const messages: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => void messages.push(parts.join(' '));
  const hmac = spyOn(nodeCrypto, 'createHmac');
  try {
    const key = new Uint8Array(32).fill(7);
    const writer = candidate.createSessionStore({ dir, key });
    const session = await writer.create(identity);
    const usedKeys = hmac.mock.calls.map(call => Buffer.from(call[1] as Uint8Array));
    assert(usedKeys.length > 0);
    for (const used of usedKeys) assert(!used.equals(Buffer.from(key)));
    const expected = Buffer.from(hkdfSync('sha256', key, '', 'sw-provider-index', 32));
    assert(Buffer.from(candidate.providerIndexKey(key)).equals(expected));
    const rotated = candidate.createSessionStore({ dir, key: new Uint8Array(32).fill(8) });
    assert.equal(await rotated.get(session.id), null);
    assert.deepEqual(readdirSync(dir), []);
    assert(messages.join('\n').includes('session-unreadable'));
    const again = await candidate.createSessionStore({ dir, key }).create(identity);
    const readFailure = spyOn(nodeFs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('EIO'), { code: 'EIO' });
    });
    try {
      await assert.rejects(candidate.createSessionStore({ dir, key }).get(again.id), /EIO/);
    } finally {
      readFailure.mockRestore();
    }
    assert.equal(readdirSync(dir).length, 1);
    writeFileSync(join(dir, readdirSync(dir)[0]), 'not json');
    const restarted = candidate.createSessionStore({ dir, key });
    await restarted.indexStored();
    assert.equal(await restarted.get(again.id), null);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    hmac.mockRestore();
    console.error = original;
    rmSync(dir, { recursive: true, force: true });
  }
}

function rateLimitCase(candidate: any) {
  let milliseconds = 1_000_000;
  const now = () => milliseconds;
  const limiter = candidate.createRateLimiter({ burst: 3, perSecond: 0.5 }, now);
  assert.deepEqual(
    [1, 2, 3].map(() => limiter.take('a').allowed),
    [true, true, true],
  );
  const refused = limiter.take('a');
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 2);
  milliseconds += 3600_000;
  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.take('a').allowed),
    [true, true, true, false],
  );
  const hammered = candidate.createRateLimiter({ burst: 1, perSecond: 1 }, now);
  hammered.take('b');
  const outcomes = [] as boolean[];
  for (let step = 0; step < 4; step++) {
    milliseconds += 500;
    outcomes.push(hammered.take('b').allowed);
  }
  assert.deepEqual(outcomes, [false, true, false, true]);
  const soon = candidate.createRateLimiter({ burst: 1, perSecond: 1000 }, now);
  soon.take('c');
  assert(soon.take('c').retryAfterSeconds >= 1);
  const small = candidate.createRateLimiter({ burst: 1, perSecond: 0.0001 }, now);
  assert.equal(small.take('victim').allowed, true);
  assert.equal(small.take('victim').allowed, false);
  for (let source = 0; source < 10_001; source++) small.take('source-' + source);
  assert.equal(small.take('victim').allowed, true);
  const gate = candidate.createAnonymousAuditGate(now);
  let recorded = 0;
  for (let refusal = 0; refusal < ANONYMOUS_AUDIT_BURST + 10; refusal++) {
    if (gate('10.0.0.1', 'sign-in-required').record) recorded++;
  }
  assert.equal(recorded, ANONYMOUS_AUDIT_BURST);
  assert.equal(gate('10.0.0.2', 'sign-in-required').record, true);
  assert.equal(gate('10.0.0.1', 'token-invalid').record, true);
  milliseconds += 61_000;
  assert.deepEqual(gate('10.0.0.1', 'sign-in-required'), { record: true, suppressed: 10 });
  assert.equal(gate('10.0.0.1', 'sign-in-required').record, false);
  const lines: string[] = [];
  const report = candidate.createRateLimitReport(now, (source: string, refused: number) =>
    lines.push(`${source} ${refused}`),
  );
  for (let refusal = 0; refusal < 5; refusal++) report('10.0.0.9');
  assert.deepEqual(lines, ['10.0.0.9 1']);
  milliseconds += 60_000;
  report('10.0.0.9');
  assert.equal(lines[1], '10.0.0.9 5');
}

async function requestLimitsCase(candidate: any) {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { createAuditLog } = await import('../src/server/auth/audit');
  using workspace = await testWorkspace();
  const noRefill = (burst: number) => ({ burst, perSecond: 0.0001 });
  let source = '203.0.113.7';
  let auditCount = 0;
  function build(requests: number, signIn: number, mode: 'server' | 'local' = 'server') {
    const audit = createAuditLog({ dir: join(workspace.root, 'audit-' + auditCount++) });
    const handler = candidate.createAccessMiddleware(
      workspace.ws,
      {
        mode,
        audit,
        publicOrigin: 'http://localhost',
        sourceIp: () => source,
        requestLimits: { requests: noRefill(requests), signIn: noRefill(signIn) },
        ...(mode === 'server' ? { principal: () => null } : {}),
      },
      () => null,
      async () => new Response('ran'),
      (_error: unknown, requestId: string) => Response.json({ requestId }, { status: 500 }),
    );
    return { audit, handler };
  }
  const protectedCalls = async (handler: any, count: number) => {
    const statuses: number[] = [];
    for (let call = 0; call < count; call++) {
      statuses.push((await handler(get('/api/projects'))).status);
    }
    return statuses;
  };
  const limited = build(5, 100);
  assert.deepEqual(await protectedCalls(limited.handler, 7), [401, 401, 401, 401, 401, 429, 429]);
  const refused = await limited.handler(get('/api/projects'));
  assert(Number(refused.headers.get('Retry-After')) > 0);
  source = '203.0.113.8';
  assert.equal((await limited.handler(get('/api/projects'))).status, 401);
  source = '203.0.113.7';
  const signIn = build(100, 3);
  for (let call = 0; call < 3; call++)
    assert.equal((await signIn.handler(get('/auth/login'))).status, 200);
  assert.equal((await signIn.handler(get('/auth/login'))).status, 429);
  assert.equal((await signIn.handler(get('/auth/callback?code=x'))).status, 429);
  assert.equal((await signIn.handler(get('/api/projects'))).status, 401);
  const separate = build(100, 1);
  await protectedCalls(separate.handler, 20);
  assert.equal((await separate.handler(get('/auth/login'))).status, 200);
  const anonymous = build(1000, 1000);
  await protectedCalls(anonymous.handler, ANONYMOUS_AUDIT_BURST * 2);
  const denied = () =>
    anonymous.audit.entries(month()).filter((entry: any) => entry.reason === 'sign-in-required');
  assert.equal(denied().length, ANONYMOUS_AUDIT_BURST);
  source = '203.0.113.9';
  await protectedCalls(anonymous.handler, 1);
  assert.equal(denied().length, ANONYMOUS_AUDIT_BURST + 1);
  source = '203.0.113.7';
  const bearer = build(1000, 1000);
  for (let call = 0; call < ANONYMOUS_AUDIT_BURST * 2; call++) {
    const response = await bearer.handler(get('/api/projects', { Authorization: 'Bearer x' }));
    assert.equal(response.status, 401);
  }
  const scoped = bearer.audit
    .entries(month())
    .filter((entry: any) => entry.reason === 'bearer-scope');
  assert.equal(scoped.length, ANONYMOUS_AUDIT_BURST);
  await personAndAddressChecks(candidate, workspace);
  const local = build(5, 5, 'local');
  assert.deepEqual(await protectedCalls(local.handler, 8), Array(8).fill(200));
  const failing = candidate.createAccessMiddleware(
    workspace.ws,
    { mode: 'server', publicOrigin: 'http://localhost' },
    () => null,
    async () => {
      throw new Error('boom');
    },
    (_error: unknown, requestId: string) => Response.json({ requestId }, { status: 500 }),
  );
  const crashed = await failing(get('/auth/login'));
  assert.equal((await crashed.json()).requestId, crashed.headers.get('X-Request-Id'));
}

async function personAndAddressChecks(candidate: any, workspace: any) {
  const { createAuditLog } = await import('../src/server/auth/audit');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { localPrincipal } = await import('../src/server/auth/principal');
  const { accessFixture } = await import('../tests/auth/access-fixture');
  let milliseconds = Date.now();
  let peer = '10.0.0.1';
  let client = '203.0.113.7';
  const audit = createAuditLog({ dir: join(workspace.root, 'audit-person') });
  const lines: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => void lines.push(parts.join(' '));
  try {
    const handler = candidate.createAccessMiddleware(
      workspace.ws,
      {
        mode: 'server',
        publicOrigin: 'http://localhost',
        audit,
        access: createAccessControl({ ...accessFixture(), mode: 'local' }),
        principal: (request: Request) => {
          const name = request.headers.get('x-person');
          return name ? { ...localPrincipal(), id: name } : null;
        },
        sourceIp: () => peer,
        clientAddress: () => client,
        now: () => milliseconds,
        requestLimits: {
          requests: { burst: 1000, perSecond: 1 },
          signIn: { burst: 5, perSecond: 0.0001 },
        },
      },
      () => null,
      async () => new Response('ran'),
    );
    for (let call = 0; call < 1000; call++) await handler(get('/api/projects'));
    // The address bucket is spent, yet a signed-in person has their own.
    assert.equal((await handler(get('/api/projects'))).status, 429);
    assert.equal((await handler(get('/api/projects', { 'x-person': 'alice' }))).status, 200);
    assert(lines.some(line => /http\.rate-limited .*client=203\.0\.113\.7 refused=1$/.test(line)));
    // Policies keep the peer; only the limits follow the client address.
    client = '203.0.113.8';
    assert.equal((await handler(get('/api/projects'))).status, 401);
    peer = '10.0.0.2';
    client = '203.0.113.7';
    assert.equal((await handler(get('/api/projects'))).status, 429);
    const denials = () =>
      audit.entries(month()).filter((entry: any) => entry.reason === 'sign-in-required');
    milliseconds += 3_600_000;
    await handler(get('/api/projects'));
    const left = denials().at(-1);
    assert.equal(left.suppressed, 1000 - ANONYMOUS_AUDIT_BURST);
  } finally {
    console.error = original;
  }
}

async function errorMappingCase(candidate: any) {
  const { BadRequestError } = await import('../src/server/projects/errors');
  const messages: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => void messages.push(parts.join(' '));
  try {
    const server = { serverMode: true, requestId: 'req-1' };
    const unexpected = candidate.errorResponse(
      new Error('/srv/secret'),
      'https://x.example',
      server,
    );
    assert.equal(unexpected.status, 500);
    assert.deepEqual(await unexpected.json(), { error: 'Internal error.' });
    assert(messages.join('\n').includes('http.unexpected-error requestId=req-1'));
    assert(!messages.join('\n').includes('/srv/secret'));
    const typed = candidate.errorResponse(
      new BadRequestError('Bad body.'),
      'https://x.example',
      server,
    );
    assert.equal(typed.status, 400);
    assert.deepEqual(await typed.json(), { error: 'Bad body.' });
    const { GitError } = await import('../src/server/projects/git');
    const git = new GitError('git push failed', {
      code: 1,
      stdout: '',
      stderr: 'fatal: /srv/secret denied',
      bytes: new Uint8Array(),
    });
    const hidden = candidate.errorResponse(git, 'https://x.example', server);
    assert.deepEqual(await hidden.json(), { error: 'Git failed.' });
    assert(messages.join('\n').includes('http.git-failed requestId=req-1'));
    assert(messages.join('\n').includes('fatal: <path> denied'));
    const shown = candidate.errorResponse(git);
    assert.deepEqual(await shown.json(), { error: 'git push failed' });
    const local = candidate.errorResponse(new Error('plain'));
    assert.equal(local.status, 400);
    assert.deepEqual(await local.json(), { error: 'plain' });
  } finally {
    console.error = original;
  }
}

async function internalErrorCase(candidate: any) {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => void messages.push(parts.join(' '));
  try {
    const response = candidate.internalErrorResponse(new TypeError('/srv/secret'), 'req-2');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal error.' });
    assert.equal(messages.length, 1);
    assert(messages[0].includes('http.unexpected-error requestId=req-2'));
    assert(messages[0].includes('errorName=TypeError'));
    assert(!messages[0].includes('/srv/secret'));
  } finally {
    console.error = original;
  }
}

async function legacyErrorsCase(candidate: any) {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { localPrincipal } = await import('../src/server/auth/principal');
  const { accessFixture } = await import('../tests/auth/access-fixture');
  const { createAuditLog } = await import('../src/server/auth/audit');
  using workspace = await testWorkspace();
  const options = {
    mode: 'server' as const,
    remoteCredentials: allowEveryRemote(),
    audit: createAuditLog({ dir: join(workspace.root, 'audit') }),
    publicOrigin: 'http://localhost',
    principal: localPrincipal,
    access: createAccessControl({ ...accessFixture(), mode: 'local' }),
  };
  const handler = candidate.createHandler(workspace.ws, options);
  const original = console.error;
  console.error = () => {};
  try {
    workspace.ws.documentsFor = () => {
      throw new Error('/srv/secret');
    };
    const unexpected = await handler(get('/api/documents'));
    assert.equal(unexpected.status, 500);
    assert.deepEqual(await unexpected.json(), { error: 'Internal error.' });
    const mistaken = await handler(
      new Request('http://localhost/api/documents', {
        method: 'POST',
        headers: { 'X-SW-Request': '1', Origin: 'http://localhost' },
        body: '{"filename": 3}',
      }),
    );
    assert.equal(mistaken.status, 400);
    assert.deepEqual(await mistaken.json(), { error: 'Expected filename and source strings.' });
  } finally {
    console.error = original;
  }
}

function principalCase(candidate: any) {
  const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
  const mapping = { provider: 'entra', groupClaim: 'groups', tenantId: tenant };
  const email = (extra: Record<string, unknown>) =>
    candidate.normalizeClaims(
      { iss: `https://login.microsoftonline.com/${tenant}/v2.0`, oid: 'a1', tid: tenant, ...extra },
      mapping,
    ).verifiedEmail;
  const other = 'https://sts.windows.net/0b8e6c2a-1f3d-4e5a-9c7b-2d4f6a8b0c1e/';
  assert.equal(email({ idp: other, preferred_username: 'ceo@example.org' }), null);
  assert.equal(email({ idp: other, upn: 'ceo@example.org' }), null);
  assert.equal(email({ upn: 'ceo@example.org#EXT#@tenant.onmicrosoft.com' }), null);
  assert.equal(email({ idp: other, email: 'p@other.example', xms_edov: true }), 'p@other.example');
  assert.equal(email({ preferred_username: 'Alice@Example.org' }), 'alice@example.org');
}

async function csrfBodyCase(candidate: any) {
  const origin = 'https://workbench.example';
  const counted = (chunkBytes: number, chunks: number) => {
    const pulled = { chunks: 0 };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled.chunks >= chunks) return controller.close();
        pulled.chunks++;
        controller.enqueue(new TextEncoder().encode('a'.repeat(chunkBytes)));
      },
    });
    return { body, pulled };
  };
  const logout = (body: BodyInit, extra: Record<string, string> = {}) =>
    new Request(origin + '/auth/logout', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...extra },
      body,
      duplex: 'half',
    } as RequestInit);
  const declared = counted(1000, 10);
  const declaredRequest = logout(declared.body, { 'Content-Length': '10000' });
  assert.equal(await candidate.validCsrf(declaredRequest, origin, 'secret'), false);
  assert(declared.pulled.chunks <= 1);
  const unbounded = counted(1000, 1000);
  assert.equal(await candidate.validCsrf(logout(unbounded.body), origin, 'secret'), false);
  assert(unbounded.pulled.chunks < 20);
  const form = new URLSearchParams({ csrf: 'secret' }).toString();
  assert.equal(await candidate.validCsrf(logout(form), origin, 'secret'), true);
  const wrong = new URLSearchParams({ csrf: 'nope' }).toString();
  assert.equal(await candidate.validCsrf(logout(wrong), origin, 'secret'), false);
  const padded = 'p='.padEnd(4096 - '&csrf=secret'.length, 'x') + '&csrf=secret';
  assert.equal(await candidate.validCsrf(logout(padded), origin, 'secret'), true);
  assert.equal(await candidate.validCsrf(logout(padded + 'x'), origin, 'secret'), false);
}

async function signInStatusCase(candidate: any) {
  const { SignInError } = await import('../src/server/auth/sign-in-error');
  const expected = {
    'attempt-invalid': 400,
    'token-invalid': 400,
    'tenant-mismatch': 400,
    'provider-unreachable': 503,
    'provider-unsupported': 200,
    'session-upgraded': 200,
  } as const;
  for (const [reason, status] of Object.entries(expected)) {
    const response = candidate.signInErrorResponse(new SignInError(reason as never));
    assert.equal(response.status, status, reason);
  }
}

function serveOptionsCase(candidate: any) {
  const options = candidate.serveOptions({ hostname: '127.0.0.1', port: 1, fetch: () => null });
  assert.equal(options.development, false);
  assert(options.idleTimeout > 0);
  const original = console.error;
  console.error = () => {};
  try {
    const response = options.error(new Error('/srv/secret'));
    assert.equal(response.status, 500);
    return response
      .json()
      .then((body: unknown) => assert.deepEqual(body, { error: 'Internal error.' }));
  } finally {
    console.error = original;
  }
}

async function keepOpenCase(candidate: any) {
  const { requestAccess } = await import('../src/server/auth/request-scope');
  const kept: string[] = [];
  const route = candidate.eventRoutes({ keepOpen: (request: Request) => kept.push(request.url) });
  const request = get('/api/events');
  Object.assign(request, { [requestAccess]: { principal: { kind: 'local', id: 'local' } } });
  const workspace = { events: { stream: () => new Response('stream') } };
  const response = await route(workspace, request, new URL(request.url));
  assert.equal(await response.text(), 'stream');
  assert.deepEqual(kept, [request.url]);
}

function attemptLedgerCase(candidate: any) {
  const { sha256 } = require('../src/server/projects/atomic');
  const dir = mkdtempSync(join(tmpdir(), 'sec-ledger-'));
  try {
    const now = 10_000_000;
    const ttl = candidate.ATTEMPT_TTL_SECONDS * 1000;
    const store = candidate.createAttemptStore(new Uint8Array(32).fill(3), dir, () => now);
    const entry = (issuedAt: number) => `${issuedAt}-${sha256(String(issuedAt))}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, entry(now - ttl)), '');
    writeFileSync(join(dir, entry(now - ttl + 1)), '');
    store.prune();
    assert.deepEqual(readdirSync(dir), [entry(now - ttl + 1)]);
    const attempt = { state: 's', nonce: 'n', verifier: 'v', returnTo: '/', issuedAt: now - 1000 };
    const cookie = store.encode(attempt);
    store.consume(cookie);
    store.prune();
    assert.throws(() => store.consume(cookie));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function authenticationCase(candidate: any) {
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { oidcTransport } = await import('../tests/helpers/oidc-transport');
  const { createOidcClient } = await import('../src/server/auth/oidc');
  const { createHandler } = await import('../src/server/handler');
  const { SignInError } = await import('../src/server/auth/sign-in-error');
  const { sha256 } = await import('../src/server/projects/atomic');
  const transport = await oidcTransport();
  using fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const ledger = join(fixture.root, 'state/auth-attempts');
  mkdirSync(ledger, { recursive: true });
  const stale = `${Date.now() - 700_000}-${sha256('stale')}`;
  writeFileSync(join(ledger, stale), '');
  const intervals: number[] = [];
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((callback: () => void, milliseconds: number) => {
    intervals.push(milliseconds);
    return realSetInterval(callback, milliseconds);
  }) as typeof setInterval;
  const logged = console.error;
  console.error = () => {};
  let auth: any;
  try {
    auth = await candidate.createServerAuthentication(fixture.ws, transport.config, client);
  } finally {
    globalThis.setInterval = realSetInterval;
  }
  try {
    assert.deepEqual(readdirSync(ledger), []);
    assert(intervals.includes(60_000));
    let source = '203.0.113.7';
    const origin = transport.config.publicUrl;
    const handler = createHandler(fixture.ws, { ...auth, sourceIp: () => source });
    const first = await handler(new Request(origin + '/auth/login'));
    const callback = transport.authorize(first.headers.get('location')!, 'bob');
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    const signedIn = await handler(new Request(callback, { headers: { Cookie: attempt } }));
    const cookie = signedIn.headers
      .getSetCookie()
      .find(v => v.startsWith('sw-session='))!
      .split(';')[0];
    const id = cookie.split('=')[1];
    const expire = async () => {
      const session = (await auth.authentication.sessions.get(id))!;
      session.tokens.expiresAt = 0;
      await auth.authentication.sessions.update(session);
    };
    const me = () => handler(new Request(origin + '/api/me', { headers: { Cookie: cookie } }));
    await expire();
    client.refresh = async () => {
      throw new SignInError('provider-unreachable');
    };
    assert.equal((await me()).status, 503);
    assert.notEqual(await auth.authentication.sessions.get(id, false), null);
    client.refresh = async (tokens: unknown) => ({
      principal: (await auth.authentication.sessions.get(id, false)).principal,
      tokens,
    });
    const realUpdate = auth.authentication.sessions.update;
    auth.authentication.sessions.update = async () => {
      throw new Error('disk full');
    };
    assert.equal((await me()).status, 500);
    auth.authentication.sessions.update = realUpdate;
    assert.notEqual(await auth.authentication.sessions.get(id, false), null);
    client.refresh = async (tokens: unknown) => {
      const real = await auth.authentication.sessions.get(id, false);
      return { principal: { ...real.principal, id: 'someone-else' }, tokens };
    };
    assert.equal((await me()).status, 401);
    assert.equal(await auth.authentication.sessions.get(id, false), null);
    const failures = () =>
      auth.audit
        .entries(month())
        .filter((entry: any) => entry.action === 'signIn' && entry.reason === 'attempt-invalid');
    for (let call = 0; call < ANONYMOUS_AUDIT_BURST + 5; call++) {
      await handler(new Request(origin + '/auth/callback?code=x'));
    }
    assert.equal(failures().length, ANONYMOUS_AUDIT_BURST);
    source = '203.0.113.8';
    await handler(new Request(origin + '/auth/callback?code=x'));
    assert.equal(failures().length, ANONYMOUS_AUDIT_BURST + 1);
  } finally {
    console.error = logged;
    auth.close();
  }
}

function sourceAddressCase(candidate: any) {
  assert.equal(candidate.clientAddress('10.0.0.9', '203.0.113.5', 0), '10.0.0.9');
  assert.equal(candidate.clientAddress('10.0.0.9', '1.1.1.1, 203.0.113.5', 1), '203.0.113.5');
  assert.equal(
    candidate.clientAddress('10.0.0.9', '9.9.9.9, 203.0.113.5, 10.0.0.1', 2),
    '203.0.113.5',
  );
  assert.equal(candidate.clientAddress('10.0.0.9', 'bogus', 1), '10.0.0.9');
  assert.equal(candidate.clientAddress('10.0.0.9', '203.0.113.5:4000', 1), '203.0.113.5');
  assert.equal(candidate.clientAddress('10.0.0.9', null, 1), '10.0.0.9');
  assert.equal(
    candidate.addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'),
    candidate.addressKey('2001:db8:1:2:1:2:3:4'),
  );
  assert.notEqual(candidate.addressKey('2001:db8:1:3::1'), candidate.addressKey('2001:db8:1:2::1'));
  assert.equal(candidate.addressKey('::ffff:203.0.113.5'), '203.0.113.5');
}

async function trustedProxyConfigCase(candidate: any) {
  const { TEST_TENANT_ID } = await import('../tests/helpers/auth-identities');
  const env = {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://workbench.example',
    SW_OIDC_ISSUER: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
    SW_OIDC_CLIENT_ID: 'client',
    SW_OIDC_CLIENT_SECRET: 'secret',
    SW_OIDC_PROVIDER: 'entra',
    SW_ENTRA_TENANT_ID: TEST_TENANT_ID,
    SW_SESSION_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString(
      'base64',
    ),
    SW_BOOTSTRAP_ADMINS: 'admin@example.org',
  };
  assert.equal(candidate.readConfig(env).trustedProxyHops, 0);
  assert.equal(candidate.readConfig({ ...env, SW_TRUSTED_PROXY_HOPS: '' }).trustedProxyHops, 0);
  assert.equal(candidate.readConfig({ ...env, SW_TRUSTED_PROXY_HOPS: '2' }).trustedProxyHops, 2);
  for (const bad of ['-1', '1.5', 'two', '6']) {
    assert.throws(() => candidate.readConfig({ ...env, SW_TRUSTED_PROXY_HOPS: bad }), bad);
  }
}

async function auditSuppressedCase(candidate: any) {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const dir = tempDataDir();
  try {
    const log = candidate.createAuditLog({ dir: join(dir.root, 'audit') });
    const input = {
      requestId: 'r',
      principal: { id: 'anonymous', kind: 'anonymous' },
      action: 'read',
      resource: { type: 'workspace' },
      decision: 'deny' as const,
      rules: [],
    };
    assert.equal(log.append({ ...input, suppressed: 980 }).suppressed, 980);
    assert.equal('suppressed' in log.append(input), false);
  } finally {
    dir.cleanup();
  }
}

async function decodeCase(candidate: any) {
  const { PathError } = await import('../src/server/projects/paths');
  assert.equal(candidate.decodeSegment('a%20b'), 'a b');
  assert.throws(() => candidate.decodeSegment('%E0%A4%A'), PathError);
  assert.throws(() => candidate.decodePath('a/%E0%A4%A'), PathError);
}

async function routeActionsCase(candidate: any) {
  const { PathError } = await import('../src/server/projects/paths');
  const url = new URL('http://localhost/api/projects/%E0%A4%A/files/x.yaml');
  const found = candidate.routeFor('GET', url.pathname, 'server');
  assert.throws(() => found.row.resource(found.match, url), PathError);
  const projectUrl = new URL('http://localhost/api/projects/%E0%A4%A/git/status');
  const status = candidate.routeFor('GET', projectUrl.pathname, 'server');
  assert.throws(() => status.row.resource(status.match, projectUrl), PathError);
}

async function gitKeepOpenCase(candidate: any) {
  const opened = async (action: string) => {
    const kept: string[] = [];
    const route = candidate.createGitRoutes({
      keepOpen: (request: Request) => kept.push(request.url),
    });
    const request = new Request(`http://localhost/api/projects/sales/git/${action}`, {
      method: 'POST',
    });
    await Promise.resolve(route({}, request, new URL(request.url))).catch(() => undefined);
    return kept.length === 1;
  };
  for (const action of ['fetch', 'pull', 'push', 'sync', 'pull-default', 'push-default']) {
    assert.equal(await opened(action), true, action);
  }
  assert.equal(await opened('commit'), false);
}

/** Dispatches one authentication, session or HTTP boundary case by its category. */
export async function sessionSecurityCase(candidate: any, category: string) {
  const cases: Record<string, (candidate: any) => unknown> = {
    'sec-sessions': sessionsCase,
    'sec-rate-limit': rateLimitCase,
    'sec-request-limits': requestLimitsCase,
    'sec-error-mapping': errorMappingCase,
    'sec-internal-error': internalErrorCase,
    'sec-legacy-errors': legacyErrorsCase,
    'sec-principal': principalCase,
    'sec-csrf-body': csrfBodyCase,
    'sec-sign-in-status': signInStatusCase,
    'sec-serve-options': serveOptionsCase,
    'sec-keep-open': keepOpenCase,
    'sec-attempt-ledger': attemptLedgerCase,
    'sec-authentication': authenticationCase,
    'sec-source-address': sourceAddressCase,
    'sec-trusted-proxy-config': trustedProxyConfigCase,
    'sec-audit-suppressed': auditSuppressedCase,
    'sec-decode': decodeCase,
    'sec-route-actions': routeActionsCase,
    'sec-git-keep-open': gitKeepOpenCase,
  };
  const run = cases[category];
  if (!run) throw new Error('Unknown security case: ' + category);
  await run(candidate);
}
