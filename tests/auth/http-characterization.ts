// Captures the public response and audit contract with isolated fixture identities.
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { clientPrincipal, localPrincipal } from '../../src/server/auth/principal';
import { authWorkspace } from '../helpers/auth-workspace';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { accessFixture, person } from './access-fixture';
import { routeExamples } from './route-actions';

const fixedTime = new Date('2026-09-15T12:00:00.000Z');
const callerNames = ['local', ...Object.keys(TEST_USERS), 'anonymous', 'deactivated', 'client'] as const;
type CallerName = (typeof callerNames)[number];

function normalize(value: unknown, root: string): unknown {
  if (typeof value === 'string') {
    return value.replaceAll(root, '<data-root>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
  }
  if (Array.isArray(value)) return value.map(item => normalize(item, root));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (['at', 'createdAt', 'updatedAt', 'updated', 'timestamp', 'lastScanAt', 'requestId', 'prev'].includes(key)) return [key, '<volatile>'];
      return [key, normalize(item, root)];
    }),
  );
}

function callerHandler(caller: CallerName, fixture: Awaited<ReturnType<typeof authWorkspace>>) {
  const configuration = accessFixture();
  if (caller === 'deactivated') {
    configuration.config.deactivated.principals.push({ id: person('alice').id, at: fixedTime.toISOString(), by: 'admin', reason: 'disabled' });
  }
  const mode = caller === 'local' ? 'local' : 'server';
  const access = createAccessControl({ ...configuration, mode });
  const audit = createAuditLog({ dir: join(fixture.root, 'characterization-audit'), now: () => fixedTime });
  let principal = caller === 'local' ? localPrincipal() : null;
  if (caller === 'client') principal = clientPrincipal('sw-agent');
  else if (caller === 'deactivated') principal = access.principalFor(person('alice'));
  else if (caller !== 'anonymous' && caller !== 'local') principal = access.principalFor(person(caller as TestUserName));
  const handler = createHandler(fixture.ws, {
    mode,
    access,
    audit,
    principal: () => principal,
    port: 5312,
    staticRoot: join(fixture.root, 'characterization-static'),
    publicOrigin: 'http://localhost:5312',
    remoteCredentials: allowEveryRemote(),
    bearer: async () => clientPrincipal('sw-agent'),
    now: () => fixedTime.getTime(),
  });
  return { handler, audit };
}

async function responseBody(response: Response, controller: AbortController): Promise<unknown> {
  if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
    controller.abort();
    await response.body?.cancel();
    return '<event-stream>';
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function captureCaller(caller: CallerName) {
  using fixture = await authWorkspace();
  const { handler, audit } = callerHandler(caller, fixture);
  const captures = [];
  for (const example of routeExamples) {
    const controller = new AbortController();
    const headers: Record<string, string> = { Origin: 'http://localhost:5312', 'X-SW-Request': '1', 'Content-Type': 'application/json' };
    if (caller === 'client') headers.Authorization = 'Bearer characterization';
    const response = await handler(
      new Request('http://localhost:5312' + example.path, {
        method: example.method,
        headers,
        signal: controller.signal,
        ...(example.method === 'GET' ? {} : { body: JSON.stringify(example.body ?? {}) }),
      }),
    );
    const body = await responseBody(response, controller);
    const requestId = response.headers.get('X-Request-Id');
    const records = audit.entries('2026-09').filter(entry => entry.requestId === requestId);
    captures.push({
      caller,
      method: example.method,
      path: example.path,
      status: response.status,
      body: normalize(body, fixture.root),
      headers: {
        requestId: /^[0-9a-f-]{36}$/.test(requestId ?? ''),
        contentType: response.headers.get('Content-Type'),
        authenticate: response.headers.get('WWW-Authenticate'),
        retryAfter: response.headers.get('Retry-After'),
      },
      audit: records.map(({ at: _at, requestId: _id, prev: _prev, ...record }) => normalize(record, fixture.root)),
    });
  }
  return captures;
}

/** Replays every inventory example for local, person, anonymous and application callers. */
export async function characterizeHttp() {
  useDefaultBrand();
  const previousAuthorDate = process.env.GIT_AUTHOR_DATE;
  const previousCommitterDate = process.env.GIT_COMMITTER_DATE;
  process.env.GIT_AUTHOR_DATE = fixedTime.toISOString();
  process.env.GIT_COMMITTER_DATE = fixedTime.toISOString();
  try {
    const captures = [];
    for (const caller of callerNames) captures.push(...(await captureCaller(caller)));
    return captures;
  } finally {
    if (previousAuthorDate === undefined) delete process.env.GIT_AUTHOR_DATE;
    else process.env.GIT_AUTHOR_DATE = previousAuthorDate;
    if (previousCommitterDate === undefined) delete process.env.GIT_COMMITTER_DATE;
    else process.env.GIT_COMMITTER_DATE = previousCommitterDate;
  }
}
