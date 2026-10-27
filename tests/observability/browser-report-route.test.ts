// The report route: closed when telemetry is off, open only to signed-in people, and bounded.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { addLogSink, configureLogging, type LogRecord } from '../../src/server/observability/log';
import { MAX_REPORT_BODY_BYTES } from '../../src/shared/observability/browser-report';
import { accessFixture, person } from '../auth/access-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';
import { useQuietLogging } from '../helpers/quiet-logging';

const REPORT = {
  reports: [{ kind: 'error', name: 'TypeError', message: 'x is not a function' }],
};
const records: LogRecord[] = [];
let removeSink: () => void;

beforeEach(() => {
  records.length = 0;
  configureLogging({ level: 'debug', format: 'json', write: () => {} });
  removeSink = addLogSink(record => records.push(record));
});

afterEach(() => {
  removeSink();
  useQuietLogging();
});

async function app(options: { enabled: boolean; signedIn?: boolean; mode?: 'local' | 'server' }) {
  const workspace = await testWorkspace();
  const access = createAccessControl(accessFixture());
  const signedIn = options.signedIn ?? true;
  const handler = createHandler(workspace.ws, {
    mode: options.mode ?? 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    principal: signedIn ? () => access.principalFor(person('alice')) : () => null,
    browserReports: options.enabled,
    now: () => 0,
  });
  const origin = options.mode === 'local' ? 'http://127.0.0.1:4310' : 'http://localhost';
  const send = (body: unknown, raw?: string) =>
    handler(
      new Request(`${origin}/api/telemetry/browser`, {
        method: 'POST',
        headers: { Origin: origin, 'X-SW-Request': '1' },
        body: raw ?? JSON.stringify(body),
      }),
    );
  return { send, [Symbol.dispose]: () => workspace.dispose() };
}

test('a signed-in person can send a report, which is logged without their text', async () => {
  using server = await app({ enabled: true });
  const response = await server.send({
    reports: [{ kind: 'error', name: 'SyntaxError', message: 'Unexpected "salary: 90000"' }],
  });
  expect(response.status).toBe(204);
  const logged = records.find(record => record.event === 'browser.error')!;
  expect(logged.fields.errorName).toBe('SyntaxError');
  expect(JSON.stringify(logged)).not.toContain('salary');
});

test('the route does not exist when telemetry is off', async () => {
  using server = await app({ enabled: false });
  expect((await server.send(REPORT)).status).toBe(404);
  expect(records.filter(record => record.event.startsWith('browser.'))).toEqual([]);
});

test('local mode never takes reports', async () => {
  using server = await app({ enabled: false, mode: 'local' });
  expect((await server.send(REPORT)).status).toBe(404);
});

test('someone who is not signed in is refused', async () => {
  using server = await app({ enabled: true, signedIn: false });
  expect((await server.send(REPORT)).status).toBe(401);
  expect(records.filter(record => record.event.startsWith('browser.'))).toEqual([]);
});

test('an invalid report is answered 400 and recorded nowhere', async () => {
  using server = await app({ enabled: true });
  const bad = { reports: [{ kind: 'error', name: 'E', message: 'm', fileContent: 'text' }] };
  const response = await server.send(bad);
  expect(response.status).toBe(400);
  expect(records.filter(record => record.event.startsWith('browser.'))).toEqual([]);
});

test('malformed JSON is answered 400', async () => {
  using server = await app({ enabled: true });
  expect((await server.send(undefined, '{not json')).status).toBe(400);
});

test('a body over the size limit is refused even when every report is valid', async () => {
  using server = await app({ enabled: true });
  const heavy = {
    kind: 'error',
    name: 'E',
    message: '\u0001'.repeat(200),
    frames: '\u0001'.repeat(1000),
  };
  const body = JSON.stringify({ reports: Array.from({ length: 20 }, () => heavy) });
  expect(body.length).toBeGreaterThan(MAX_REPORT_BODY_BYTES);
  expect((await server.send(undefined, body)).status).toBe(400);
  const tooLong = JSON.stringify({ reports: [{ ...heavy, message: 'm'.repeat(5000) }] });
  expect((await server.send(undefined, tooLong)).status).toBe(400);
});

test('the largest batch of plain text fits the body limit', async () => {
  using server = await app({ enabled: true });
  const largest = {
    kind: 'error',
    name: 'n'.repeat(80),
    message: 'm'.repeat(200),
    frames: 'f'.repeat(1000),
  };
  const body = JSON.stringify({ reports: Array.from({ length: 20 }, () => largest) });
  expect(body.length).toBeLessThan(MAX_REPORT_BODY_BYTES);
  expect((await server.send(undefined, body)).status).toBe(204);
});

test('a person who sends too many is answered 429 with a retry time', async () => {
  using server = await app({ enabled: true });
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt++) statuses.push((await server.send(REPORT)).status);
  expect(statuses.slice(0, 10).every(status => status === 204)).toBe(true);
  expect(statuses.slice(10)).toEqual([429, 429]);
  const refused = await server.send(REPORT);
  expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
});

test('an over-budget operation is logged and a fast one is only measured', async () => {
  using server = await app({ enabled: true });
  await server.send({
    reports: [
      { kind: 'operation', operation: 'save', durationMs: 150 },
      { kind: 'operation', operation: 'graph-layout', durationMs: 4000 },
    ],
  });
  const slow = records.filter(record => record.event === 'browser.slow-operation');
  expect(slow).toHaveLength(1);
  expect(slow[0].fields).toMatchObject({
    operation: 'graph-layout',
    durationMs: 4000,
    budgetMs: 2000,
  });
});
