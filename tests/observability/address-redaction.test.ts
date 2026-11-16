/** Checks real address operations against captured log, span and metric exports. */
import { expect, test } from 'bun:test';
import { AlwaysOnSampler, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { configureLogging } from '../../src/server/observability/log';
import { startTelemetry } from '../../src/server/observability/telemetry';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { readAddressMigrations } from '../../src/server/projects/address-migrations';
import { dataLayout } from '../../src/server/projects/paths';
import { testWorkspace } from '../helpers/temp-data-dir';
import { useQuietLogging } from '../helpers/quiet-logging';

test('declared saves, caller resolution and history reads export no locator content', async () => {
  using workspace = await testWorkspace();
  const source = 'name: PrivateScope\nontology: [{concept: PrivateBefore}]';
  const project = await workspace.seed([{ path: 'private-definition.yaml', source }], 'PrivateProject');
  const before = `sw1:${project.slug}/private-definition.yaml#ontology:PrivateScope/concept:PrivateBefore`;
  const after = before.replace('PrivateBefore', 'PrivateAfter');
  const lines: string[] = [];
  const spans: ReadableSpan[] = [];
  const metrics: ResourceMetrics[] = [];
  const logs: ReadableLogRecord[] = [];
  const telemetry = await startTelemetry({
    settings: { enabled: true, connectionString: 'unused', sampleRatio: 1 },
    service: { version: '1', commit: 'test', mode: 'local', revision: null },
    backends: async () => ({
      sampler: new AlwaysOnSampler(),
      spanExporter: {
        export: (batch, done) => {
          spans.push(...batch);
          done({ code: 0 });
        },
        shutdown: async () => {},
      },
      metricExporter: {
        export: (batch, done) => {
          metrics.push(batch);
          done({ code: 0 });
        },
        shutdown: async () => {},
        forceFlush: async () => {},
      },
      logExporter: {
        export: (batch, done) => {
          logs.push(...batch);
          done({ code: 0 });
        },
        shutdown: async () => {},
      },
    }),
    metricIntervalMs: 3_600_000,
  });
  configureLogging({ level: 'debug', format: 'json', write: line => lines.push(line) });
  try {
    const file = workspace.ws.readFile(project.slug, 'private-definition.yaml');
    const response = await workspace.handler(
      new Request(`http://localhost/api/projects/${project.slug}/files/private-definition.yaml`, {
        method: 'PUT',
        body: JSON.stringify({ baseHash: file.hash, source: source.replace('PrivateBefore', 'PrivateAfter'), declaredMigrations: [{ kind: 'item', from: before, to: after }] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(workspace.ws.resolveAddress(before, LOCAL_READER)).toMatchObject({ status: 'found', address: after });
    expect(readAddressMigrations(dataLayout(workspace.root), project.slug, LOCAL_READER)).toHaveLength(1);
  } finally {
    await telemetry.shutdown();
    useQuietLogging();
  }
  expect(lines.length).toBeGreaterThan(0);
  expect(spans.length).toBeGreaterThan(0);
  expect(metrics.length).toBeGreaterThan(0);
  const exported = JSON.stringify({
    lines,
    spans: spans.map(span => ({ name: span.name, attributes: span.attributes })),
    metrics,
    logs: logs.map(record => ({ body: record.body, attributes: record.attributes })),
  });
  for (const forbidden of ['sw1:', project.slug, 'private-definition.yaml', 'PrivateScope', 'PrivateBefore', 'PrivateAfter']) expect(exported).not.toContain(forbidden);
});
