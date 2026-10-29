// Assertions that must fail when a deliberate fault is put into the logging, telemetry or browser
// report code. `loadedModule` is the candidate module (faulty or not) for the named category.
import assert from 'node:assert/strict';
import net from 'node:net';
import { requestAccess } from '../src/server/auth/request-scope';

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl';
const KEY = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';

/** Runs the assertions of one category; categories of other suites are ignored. */
export async function observabilityCase(category: string, loadedModule: any) {
  if (category === 'observability-redaction') redactionCase(loadedModule);
  if (category === 'observability-sensitive-fields') sensitiveFieldsCase(loadedModule);
  if (category === 'observability-telemetry-settings') telemetrySettingsCase(loadedModule);
  if (category === 'observability-telemetry-start') await telemetryStartCase(loadedModule);
  if (category === 'observability-report-schema') reportSchemaCase(loadedModule);
  if (category === 'observability-report-route') await reportRouteCase(loadedModule);
  if (category === 'observability-reporter') await reporterCase(loadedModule);
  if (category === 'observability-unaudited') unauditedCase(loadedModule);
  if (category === 'observability-export-fields') exportFieldsCase(loadedModule);
  if (category === 'observability-azure-backends') await azureBackendsCase(loadedModule);
}

function redactionCase(loadedModule: any) {
  assert(!loadedModule.redactText('Authorization: Bearer abc123def456ghi').includes('abc123'));
  assert(!loadedModule.redactText('author ana.lopes@example.org pushed').includes('ana.lopes'));
  assert(!loadedModule.redactText(`failed ${JWT}`).includes('eyJ'));
  assert.equal(loadedModule.redactText('fetch https://deploy:s3cr3t@git.example.org/r.git'), 'fetch https://***@git.example.org/r.git');
  assert(!loadedModule.redactText('GET https://x.example.org/cb?code=abc&state=xyz').includes('code=abc'));
  assert(!loadedModule.redactText('client_secret=hunter2').includes('hunter2'));
  assert.equal(loadedModule.redactText('ENOENT /data/projects/a/b.yaml'), 'ENOENT <path>');
  assert(!loadedModule.redactText('open C:\\Users\\ana\\hr.yaml').includes('ana'));
  assert(loadedModule.redactText('x'.repeat(1000)).length < 310);
}

function sensitiveFieldsCase(loadedModule: any) {
  const dropped = loadedModule.redactFields({
    accessToken: 'a',
    password: 'b',
    cookie: 'c',
    source: 'd',
    body: 'e',
    diff: 'f',
    path: '/data/x',
    query: '?code=1',
    session: 's',
  });
  for (const [key, value] of Object.entries(dropped)) {
    assert.equal(value, loadedModule.REDACTED, `${key} must be redacted`);
  }
  assert.equal(loadedModule.redactFields({ exitCode: 0, status: 200 }).status, 200);
  assert.equal(loadedModule.redactFields({ route: '/api/projects/:slug' }).route, '/api/projects/:slug');
  const nested = JSON.stringify(loadedModule.redactFields({ outer: { token: 'leak' } }));
  assert(!nested.includes('leak'));
  const deep = loadedModule.redactFields({ a: { b: { c: { d: { e: 'too-deep' } } } } });
  assert(!JSON.stringify(deep).includes('too-deep'));
  assert.equal((loadedModule.redactFields({ list: Array.from({ length: 50 }, (_, i) => i) }).list as []).length, 10);
}

function telemetrySettingsCase(loadedModule: any) {
  const problems: unknown[] = [];
  const key = `InstrumentationKey=${KEY}`;
  const env = { APPLICATIONINSIGHTS_CONNECTION_STRING: key };
  assert.deepEqual(loadedModule.readTelemetry(env, false, problems), {
    enabled: false,
    reason: 'local-mode',
  });
  assert.deepEqual(loadedModule.readTelemetry({}, true, problems), {
    enabled: false,
    reason: 'no-connection-string',
  });
  assert.equal(loadedModule.readTelemetry(env, true, problems).enabled, true);
  assert.equal(problems.length, 0);
  const foreign = `${key};IngestionEndpoint=https://collector.example.net/`;
  assert.notEqual(loadedModule.connectionStringProblem(foreign), null);
  assert.notEqual(loadedModule.connectionStringProblem(`${key};IngestionEndpoint=http://a.in.applicationinsights.azure.com/`), null);
  assert.notEqual(loadedModule.connectionStringProblem('InstrumentationKey=nope'), null);
  assert.notEqual(loadedModule.connectionStringProblem(`${key};IngestionEndpoint=https://evilapplicationinsights.azure.com/`), null);
  const bad: { variable: string }[] = [];
  loadedModule.readTelemetry({ ...env, SW_TRACE_SAMPLE_RATIO: '3' }, true, bad);
  assert.equal(bad[0]?.variable, 'SW_TRACE_SAMPLE_RATIO');
}

async function telemetryStartCase(loadedModule: any) {
  let factoryCalls = 0;
  const off = await loadedModule.startTelemetry({
    settings: { enabled: false, reason: 'local-mode' },
    service: { version: null, commit: null, mode: 'local', revision: null },
    backends: async () => {
      factoryCalls++;
      throw new Error('the off path must not build exporters');
    },
  });
  assert.equal(factoryCalls, 0);
  assert.equal(off.status.enabled, false);
  await off.shutdown();
}

function reportSchemaCase(loadedModule: any) {
  const error = { kind: 'error', name: 'TypeError', message: 'x is not a function' };
  const operation = { kind: 'operation', operation: 'save', durationMs: 2500 };
  assert.equal(loadedModule.checkReportBatch({ reports: [error, operation] }).ok, true);
  const refused = (body: unknown) => assert.equal(loadedModule.checkReportBatch(body).ok, false);
  refused({ reports: [error], extra: 1 });
  refused({ reports: [] });
  refused({ reports: [] });
  refused({ reports: Array.from({ length: loadedModule.MAX_REPORTS_PER_REQUEST + 1 }, () => error) });
  refused({ reports: [{ ...error, fileContent: 'secret' }] });
  refused({ reports: [{ ...operation, path: '/data/x' }] });
  refused({ reports: [{ ...error, message: 'm'.repeat(loadedModule.MAX_MESSAGE_LENGTH + 1) }] });
  refused({ reports: [{ ...error, name: 'n'.repeat(loadedModule.MAX_NAME_LENGTH + 1) }] });
  refused({ reports: [{ ...error, message: '' }] });
  refused({ reports: [{ ...error, frames: 'f'.repeat(loadedModule.MAX_FRAMES_LENGTH + 1) }] });
  refused({ reports: [{ ...operation, durationMs: -1 }] });
  refused({ reports: [{ ...operation, durationMs: loadedModule.MAX_DURATION_MS + 1 }] });
  refused({ reports: [{ ...operation, operation: 'typing' }] });
  refused({ reports: [{ ...error, kind: 'click' }] });
  assert.equal(loadedModule.isOverBudget('validation', 500), false);
  assert.equal(loadedModule.isOverBudget('validation', 501), true);
  assert.equal(loadedModule.isOverBudget('page-load', 99999), false);
  assert.equal(loadedModule.scrubErrorMessage('bad "salary: 1"'), 'bad "…"');
  assert.equal(loadedModule.scrubErrorMessage('a'.repeat(999)).length, loadedModule.MAX_MESSAGE_LENGTH);
}

async function reportRouteCase(loadedModule: any) {
  const report = { reports: [{ kind: 'error', name: 'Error', message: 'boom' }] };
  const post = (route: any, body: string) => {
    const request: any = new Request('http://localhost/api/telemetry/browser', {
      method: 'POST',
      body,
    });
    request[requestAccess] = { principal: { key: 'u1' } };
    return route({}, request, new URL(request.url));
  };
  const off = loadedModule.browserReportRoutes({ enabled: false, now: () => 0 });
  assert.equal((await post(off, JSON.stringify(report))).status, 404);
  const on = loadedModule.browserReportRoutes({ enabled: true, now: () => 0 });
  assert.equal((await post(on, JSON.stringify(report))).status, 204);
  const badRequest = (error: any) => error.name === 'BadRequestError';
  await assert.rejects(post(on, JSON.stringify({ reports: [{ kind: 'click' }] })), badRequest);
  // Valid by the schema, yet over the body limit once control characters are escaped.
  const heavy = {
    kind: 'error',
    name: 'E',
    message: '\u0001'.repeat(200),
    frames: '\u0001'.repeat(1000),
  };
  const oversize = JSON.stringify({ reports: Array.from({ length: 20 }, () => heavy) });
  assert(oversize.length > 32 * 1024);
  await assert.rejects(post(on, oversize), badRequest);
  const limited = loadedModule.browserReportRoutes({ enabled: true, now: () => 0 });
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    statuses.push((await post(limited, JSON.stringify(report))).status);
  }
  assert.deepEqual(statuses.slice(10), [429, 429]);
}

async function reporterCase(loadedModule: any) {
  const batches: unknown[][] = [];
  const timers: (() => void)[] = [];
  const create = (limits = loadedModule.DEFAULT_REPORTER_LIMITS, status = 204) =>
    loadedModule.createReporter({
      send: async (reports: unknown[]) => {
        batches.push(reports);
        return status;
      },
      schedule: (work: () => void) => timers.push(work),
      limits,
    });
  const drain = async () => {
    while (timers.length) timers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
  };
  const waiting = create();
  waiting.reportError('error', new Error('held'));
  await drain();
  assert.equal(batches.length, 0);
  waiting.disable();
  assert.equal(waiting.queued, 0);
  waiting.enable();
  waiting.reportError('error', new Error('after'));
  await drain();
  assert.equal(batches.length, 0);
  const bounded = create({ ...loadedModule.DEFAULT_REPORTER_LIMITS, queued: 3, slowOperationGapMs: 0 });
  for (let index = 0; index < 10; index++) bounded.reportOperation('save', 9000 + index);
  assert.equal(bounded.queued, 3);
  const capped = create({ ...loadedModule.DEFAULT_REPORTER_LIMITS, perSession: 3, slowOperationGapMs: 0 });
  capped.enable();
  for (let index = 0; index < 10; index++) capped.reportOperation('save', 9000 + index);
  await drain();
  assert.equal(capped.queued, 0);
  capped.reportOperation('save', 9999);
  assert.equal(capped.queued, 0);
  batches.length = 0;
  const duplicate = create();
  duplicate.enable();
  duplicate.reportError('error', new Error('same'));
  duplicate.reportError('error', new Error('same'));
  await drain();
  assert.equal(batches.flat().length, 1);
  batches.length = 0;
  const quiet = create();
  quiet.enable();
  quiet.reportOperation('validation', 100);
  await drain();
  assert.equal(batches.flat().length, 0);
  batches.length = 0;
  const refusing = create(loadedModule.DEFAULT_REPORTER_LIMITS, 404);
  refusing.enable();
  refusing.reportError('error', new Error('first'));
  await drain();
  refusing.reportError('error', new Error('second'));
  await drain();
  assert.equal(batches.flat().length, 1);
  batches.length = 0;
  const scrubbed = create();
  scrubbed.enable();
  scrubbed.reportError('error', new Error('Unexpected "salary: 90000"'));
  await drain();
  assert(!JSON.stringify(batches.at(-1)).includes('salary'));
}

async function azureBackendsCase(loadedModule: any) {
  const attempts: string[] = [];
  net.Socket.prototype.connect = function () {
    attempts.push('connect');
    throw new Error('connections are forbidden here');
  } as never;
  const connectionString = `InstrumentationKey=${KEY};IngestionEndpoint=https://x.in.applicationinsights.azure.com/`;
  const backends = await loadedModule.azureBackends({ enabled: true, connectionString, sampleRatio: 0.1 });
  await new Promise(resolve => setTimeout(resolve, 1200));
  await Promise.all([backends.spanExporter.shutdown(), backends.metricExporter.shutdown(), backends.logExporter.shutdown()]);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.deepEqual(attempts, []);
}

function exportFieldsCase(loadedModule: any) {
  const exported = loadedModule.exportableFields({
    requestId: 'r',
    project: 'sales',
    owner: 'key',
    client: '203.0.113.7',
    gitOutput: 'fatal: x',
    reason: 'ok',
  });
  assert.deepEqual(exported, { requestId: 'r', reason: 'ok' });
}

function unauditedCase(loadedModule: any) {
  const quiet = { action: 'viewOwnState', unaudited: true };
  assert.equal(loadedModule.shouldAudit(quiet, 'POST', 'allow'), false);
  assert.equal(loadedModule.shouldAudit(quiet, 'POST', 'deny'), true);
  assert.equal(loadedModule.shouldAudit({ action: 'edit' }, 'PUT', 'allow'), true);
  assert.equal(loadedModule.shouldAudit({ action: 'read' }, 'GET', 'allow'), false);
}
