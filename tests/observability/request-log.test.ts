// Every request gets an id that appears in the response header and on every log line written
// while it is handled, and one finished-request line with the route template and a pseudonymous
// actor.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { createLogger, addLogSink, configureLogging, log, type LogRecord } from '../../src/server/observability/log';
import { levelForStatus, methodLabel } from '../../src/server/observability/http-request';
import { routeTemplate } from '../../src/server/auth/route-actions';
import { configureActorSalt } from '../../src/server/observability/request-context';
import { accessFixture, person } from '../auth/access-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';
import { useQuietLogging } from '../helpers/quiet-logging';

const lines: string[] = [];
const records: LogRecord[] = [];
let removeSink: () => void;

beforeEach(() => {
  lines.length = 0;
  records.length = 0;
  configureLogging({ level: 'debug', format: 'json', write: line => lines.push(line) });
  removeSink = addLogSink(record => records.push(record));
});

afterEach(() => {
  removeSink();
  configureActorSalt(null);
  useQuietLogging();
});

async function serverApp() {
  const workspace = await testWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    principal: () => access.principalFor(person('alice')),
  });
  return { workspace, handler, [Symbol.dispose]: () => workspace.dispose() };
}

const request = (path: string) =>
  new Request('http://localhost' + path, {
    headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
  });

test('the id in the response header is the id on the request log line', async () => {
  using app = await serverApp();
  const response = await app.handler(request('/api/projects'));
  const requestId = response.headers.get('X-Request-Id')!;
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  const finished = records.find(record => record.event === 'http.request')!;
  expect(finished.fields.requestId).toBe(requestId);
});

test('the finished-request line has method, route template, status, duration and actor', async () => {
  using app = await serverApp();
  await app.handler(request('/api/projects/sales-metrics/files/secret-folder/payroll.yaml?code=abc'));
  const finished = records.find(record => record.event === 'http.request')!;
  expect(finished.fields).toMatchObject({
    method: 'GET',
    route: '/api/projects/:slug/files/*',
  });
  expect(typeof finished.fields.status).toBe('number');
  expect(typeof finished.fields.durationMs).toBe('number');
  expect(String(finished.fields.actor)).toMatch(/^user-[0-9a-f]{16}$/);
  const written = lines.join('\n');
  expect(written).not.toContain('secret-folder');
  expect(written).not.toContain('payroll');
  expect(written).not.toContain('code=abc');
  expect(written).not.toContain('sales-metrics');
});

test('a log line written deep inside a handler carries the same request id', async () => {
  using app = await serverApp();
  const failing = app.workspace.ws.state;
  const original = failing.registry.bind(failing);
  failing.registry = () => {
    log.warn('deep.inside', { step: 'registry' });
    return original();
  };
  const response = await app.handler(request('/api/projects'));
  const deep = records.find(record => record.event === 'deep.inside')!;
  expect(deep.fields.requestId).toBe(response.headers.get('X-Request-Id')!);
  expect(String(deep.fields.actor)).toMatch(/^user-/);
});

test('two requests get two different ids', async () => {
  using app = await serverApp();
  const first = await app.handler(request('/api/me'));
  const second = await app.handler(request('/api/me'));
  expect(first.headers.get('X-Request-Id')).not.toBe(second.headers.get('X-Request-Id'));
});

test('an unexpected failure is logged with the id and without its file path', async () => {
  using app = await serverApp();
  app.workspace.ws.state.registry = () => {
    throw new Error('EACCES: cannot read /srv/workbench/data/state/registry.json');
  };
  const response = await app.handler(request('/api/projects'));
  expect(response.status).toBe(500);
  const failure = records.find(record => record.event === 'http.unexpected-error')!;
  expect(failure.fields.requestId).toBe(response.headers.get('X-Request-Id')!);
  expect(lines.join('\n')).not.toContain('/srv/workbench');
});

test('the same person has the same actor within a run and a different one after a new salt', async () => {
  using app = await serverApp();
  configureActorSalt('salt-one');
  await app.handler(request('/api/me'));
  await app.handler(request('/api/me'));
  const [first, second] = records.filter(record => record.event === 'http.request');
  expect(first.fields.actor).toBe(second.fields.actor);
  configureActorSalt('salt-two');
  await app.handler(request('/api/me'));
  const third = records.filter(record => record.event === 'http.request')[2];
  expect(third.fields.actor).not.toBe(first.fields.actor);
});

test('local mode logs the actor as local and readable lines are produced', async () => {
  const workspace = await testWorkspace();
  const texts: string[] = [];
  configureLogging({ level: 'debug', format: 'text', write: line => texts.push(line) });
  await workspace.handler(new Request('http://127.0.0.1:4310/api/me'));
  workspace.dispose();
  const line = texts.find(text => text.includes('http.request'))!;
  expect(line).toContain('actor=local');
  expect(line).toContain('route=/api/me');
});

test('route templates are low-cardinality and unknown paths are grouped', () => {
  expect(routeTemplate('GET', '/api/projects/abc/files/x/y.yaml', 'server')).toBe('/api/projects/:slug/files/*');
  expect(routeTemplate('GET', '/api/nope/123', 'server')).toBe('unmatched');
  expect(routeTemplate('GET', '/some/page', 'server')).toBe('pages');
});

test('an unusual method is grouped so it cannot create metric series', () => {
  expect(methodLabel('GET')).toBe('GET');
  expect(methodLabel('X-RANDOM-1')).toBe('OTHER');
});

test('statuses map to levels', () => {
  expect(levelForStatus(200)).toBe('info');
  expect(levelForStatus(404)).toBe('warn');
  expect(levelForStatus(503)).toBe('error');
});

test('a separate logger does not disturb the configured one', () => {
  const own: string[] = [];
  createLogger({ level: 'info', format: 'json', write: line => own.push(line) }).info('x');
  expect(own).toHaveLength(1);
  expect(lines).toHaveLength(0);
});
