// Runs real requests through the handler with in-memory exporters standing in for Azure Monitor,
// and checks which spans, metrics and logs come out, with which attributes, and that no secret,
// document text or personal detail is among them.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  AlwaysOnSampler,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import type { PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { configureLogging, log } from '../../src/server/observability/log';
import { withSpan } from '../../src/server/observability/tracing';
import { actorPseudonym } from '../../src/server/observability/request-context';
import { startTelemetry, type Telemetry } from '../../src/server/observability/telemetry';
import { accessFixture, person } from '../auth/access-fixture';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { TEST_USERS } from '../helpers/auth-identities';
import { useQuietLogging } from '../helpers/quiet-logging';
import { recordRequest } from '../../src/server/observability/metrics';

const SUCCESS = { code: 0 };
const SECRET_TOKEN = 'SECRETBEARERTOKEN0123456789';
const SECRET_CODE = 'SECRETAUTHCODE987';
const DOCUMENT_TEXT = 'TOPSECRETDOCUMENTTEXT';

class CollectedSpans implements SpanExporter {
  spans: ReadableSpan[] = [];
  export(spans: ReadableSpan[], done: (result: { code: number }) => void) {
    this.spans.push(...spans);
    done(SUCCESS);
  }
  shutdown = async () => {};
}
class CollectedMetrics implements PushMetricExporter {
  batches: ResourceMetrics[] = [];
  export(metrics: ResourceMetrics, done: (result: { code: number }) => void) {
    this.batches.push(metrics);
    done(SUCCESS);
  }
  forceFlush = async () => {};
  shutdown = async () => {};
}
class CollectedLogs implements LogRecordExporter {
  records: ReadableLogRecord[] = [];
  export(records: ReadableLogRecord[], done: (result: { code: number }) => void) {
    this.records.push(...records);
    done(SUCCESS);
  }
  shutdown = async () => {};
}

const spans = new CollectedSpans();
const metrics = new CollectedMetrics();
const logRecords = new CollectedLogs();
let telemetry: Telemetry;
let dave: ReturnType<typeof person>;

/** Every data point of one metric across the exported batches. */
function points(name: string) {
  const found = [];
  for (const batch of metrics.batches) {
    for (const scope of batch.scopeMetrics) {
      for (const metric of scope.metrics) {
        if (metric.descriptor.name === name) found.push(...metric.dataPoints);
      }
    }
  }
  return found;
}

const spanNamed = (name: string) => spans.spans.find(span => span.name === name);

beforeAll(async () => {
  configureLogging({ level: 'silent', format: 'json' });
  // Metrics recorded before telemetry starts, as other tests in the same process do, must not
  // leave dead instruments behind.
  recordRequest('/warm-up', 'GET', 200, 1);
  telemetry = await startTelemetry({
    settings: { enabled: true, connectionString: 'unused', sampleRatio: 1 },
    service: { version: '9.9.9', commit: 'deadbeef', mode: 'server', revision: 'rev-1' },
    backends: async () => ({
      spanExporter: spans,
      metricExporter: metrics,
      logExporter: logRecords,
      sampler: new AlwaysOnSampler(),
    }),
    metricIntervalMs: 3_600_000,
  });
  configureLogging({ level: 'debug', format: 'json', write: () => {} });
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  dave = person('dave');
  // The administration save refuses to remove the last active Admin, so the users must be known.
  for (const name of ['dave', 'erin', 'hank', 'bob', 'alice'] as const) {
    fixture.ws.state.recordUser(access.principalFor(person(name)), new Date().toISOString());
  }
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    principal: () => access.principalFor(dave),
    browserReports: true,
  });
  const call = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    handler(
      new Request('http://localhost' + path, {
        method,
        headers: { Origin: 'http://localhost', 'X-SW-Request': '1', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  await call(`/api/me?code=${SECRET_CODE}`);
  await call('/api/projects');
  await call('/api/projects/sales-metrics/git/status');
  const file = fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml');
  await call('/api/projects/sales-metrics/files/sales.semantic.yaml', 'PUT', {
    baseHash: file.hash,
    source: `# ${DOCUMENT_TEXT}\n${file.source}`,
  });
  await fixture.ws.rescan('sales-metrics');
  const settings = await (await call('/api/admin/settings')).json();
  const { version: baseVersion, ...document } = settings;
  const saved = await call('/api/admin/settings', 'PUT', { ...document, baseVersion });
  expect(saved.status, JSON.stringify(await saved.clone().json())).toBe(200);
  await call('/api/agent/catalog?project=sales-metrics', 'GET', undefined, {
    Authorization: `Bearer ${SECRET_TOKEN}`,
  });
  await call('/api/telemetry/browser', 'POST', {
    reports: [
      { kind: 'error', name: 'TypeError', message: `bad "${DOCUMENT_TEXT}"` },
      { kind: 'operation', operation: 'validation', durationMs: 900 },
    ],
  });
  await withSpan('probe.failure', {}, () => {
    throw new Error('cannot open sales/payroll.yaml for ana@example.org');
  }).catch(() => {});
  log.warn('probe.leaky', {
    project: 'sales-metrics',
    owner: 'owner-key-123',
    client: '203.0.113.7',
    gitOutput: 'fatal: sales/payroll.yaml',
    reason: 'allowed-field',
  });
  const stream = await call('/api/events');
  const open = metrics.batches.length;
  await stream.body!.cancel();
  expect(open).toBeGreaterThanOrEqual(0);
  await telemetry.shutdown();
});

afterAll(async () => {
  await telemetry.shutdown();
  useQuietLogging();
});

describe('spans', () => {
  test('a request span carries the route template, the status and a pseudonymous actor', () => {
    const span = spanNamed('GET /api/me')!;
    expect(span.attributes['http.route']).toBe('/api/me');
    expect(span.attributes['http.response.status_code']).toBe(200);
    expect(span.attributes['sw.actor']).toBe(actorPseudonym({ kind: 'person', key: access(dave) }));
    expect(String(span.attributes['sw.actor'])).toMatch(/^user-[0-9a-f]{16}$/);
  });

  test('a file save is named by its template, not its path', () => {
    const span = spanNamed('PUT /api/projects/:slug/files/*')!;
    expect(span.attributes['http.route']).toBe('/api/projects/:slug/files/*');
  });

  test('Git commands, scans, validation and policy reloads each have a span', () => {
    expect(spanNamed('git status')!.attributes['sw.git.subcommand']).toBe('status');
    expect(spanNamed('workspace.scan')!.attributes['sw.scan.changed_files']).toBeDefined();
    expect(spanNamed('validation')!.attributes['sw.validation.trigger']).toBe('save');
    expect(spanNamed('admin.policy.reload')).toBeDefined();
  });

  test('a Git span sits under the request that caused it', () => {
    const request = spanNamed('GET /api/projects/:slug/git/status')!;
    const git = spans.spans.find(
      span =>
        span.name.startsWith('git ') &&
        span.spanContext().traceId === request.spanContext().traceId,
    );
    expect(git).toBeDefined();
    expect(git!.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
  });

  test('the resource names the service, version, commit and mode', () => {
    const resource = spanNamed('GET /api/me')!.resource.attributes;
    expect(resource['service.name']).toBe('semantic-workbench');
    expect(resource['service.version']).toBe('9.9.9');
    expect(resource['sw.commit']).toBe('deadbeef');
    expect(resource['sw.mode']).toBe('server');
  });
});

describe('metrics', () => {
  test('requests are counted by route template, method and status', () => {
    const data = points('sw.http.server.requests');
    const me = data.find(point => point.attributes.route === '/api/me');
    expect(me!.attributes).toMatchObject({ method: 'GET', status: 200 });
    expect(data.some(point => point.attributes.status === 401)).toBe(true);
    expect(points('sw.http.server.duration').length).toBeGreaterThan(0);
  });

  test('Git duration, scan duration and validation duration are recorded', () => {
    expect(points('sw.git.command.duration').some(p => p.attributes.subcommand === 'status')).toBe(
      true,
    );
    expect(points('sw.workspace.scan.duration').length).toBeGreaterThan(0);
    const triggers = points('sw.validation.duration').map(point => point.attributes.trigger);
    expect(triggers).toContain('save');
  });

  test('a refused bearer token counts as an authentication failure by reason', () => {
    const failure = points('sw.auth.failures').find(point => point.attributes.reason);
    expect(failure!.attributes.reason).toBe('token-invalid');
  });

  test('the active stream count returns to zero after the stream closes', () => {
    const streams = points('sw.sse.active_streams');
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.reduce((sum, point) => sum + Number(point.value), 0)).toBe(0);
  });

  test('browser reports become counters and an over-budget count', () => {
    expect(points('sw.browser.errors')[0].attributes.kind).toBe('error');
    expect(points('sw.browser.over_budget')[0].attributes.operation).toBe('validation');
  });
});

describe('logs', () => {
  test('log records reach the exporter with the trace and span of their request', () => {
    const requestLog = logRecords.records.find(
      record => record.body === 'http.request' && record.attributes.route === '/api/me',
    )!;
    const span = spanNamed('GET /api/me')!;
    expect(requestLog.attributes.traceId).toBe(span.spanContext().traceId);
    expect(requestLog.attributes.requestId).toBeDefined();
    expect(requestLog.severityText).toBe('INFO');
  });
});

describe('what never leaves the server', () => {
  test('a failed span exports the error name and not its message', () => {
    const span = spanNamed('probe.failure')!;
    expect(span.status.message).toBe('Error');
    expect(JSON.stringify(span.status)).not.toContain('payroll');
    expect(JSON.stringify(span.status)).not.toContain('ana@');
  });

  test('a log record exports only allow-listed fields', () => {
    const record = logRecords.records.find(entry => entry.body === 'probe.leaky')!;
    const allowed = ['reason', 'requestId', 'traceId', 'spanId', 'actor'];
    expect(Object.keys(record.attributes).every(name => allowed.includes(name))).toBe(true);
    expect(record.attributes.reason).toBe('allowed-field');
    const text = JSON.stringify(record.attributes);
    for (const secret of ['sales-metrics', 'owner-key-123', '203.0.113.7', 'payroll']) {
      expect(text).not.toContain(secret);
    }
  });

  test('no span, metric or log holds a token, an auth code, document text or personal details', () => {
    const everything = JSON.stringify([
      spans.spans.map(span => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
      })),
      metrics.batches.map(batch =>
        batch.scopeMetrics.flatMap(scope => scope.metrics.map(metric => metric.dataPoints)),
      ),
      logRecords.records.map(record => ({ body: record.body, attributes: record.attributes })),
    ]);
    const user = TEST_USERS.dave;
    for (const secret of [
      SECRET_TOKEN,
      SECRET_CODE,
      DOCUMENT_TEXT,
      user.name,
      user.email,
      user.upn,
      user.oid,
      'sales-metrics',
      'sales.semantic.yaml',
    ]) {
      expect(everything).not.toContain(secret);
    }
  });
});

function access(principal: ReturnType<typeof person>) {
  return createAccessControl(accessFixture()).principalFor(principal).key;
}
