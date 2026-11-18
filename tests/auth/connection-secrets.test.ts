// Scans everything a full connection flow leaves behind (state files, the audit log, the console and metric labels) for any token, code, setup credential, verifier or stored hash.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resetMetrics } from '../../src/server/observability/metrics';
import { openConnectionServer, pkcePair, type ConnectionServer } from '../helpers/connection-server';

const servers: ConnectionServer[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? (name === '.git' ? [] : filesUnder(path)) : [path];
  });
}

class CollectedMetrics implements PushMetricExporter {
  batches: ResourceMetrics[] = [];
  export(batch: ResourceMetrics, done: (result: { code: number }) => void) {
    this.batches.push(batch);
    done({ code: 0 });
  }
  forceFlush = async () => {};
  shutdown = async () => {};
}

test('after a complete flow no durable or logged value holds a credential, a verifier or a hash', async () => {
  const exporter = new CollectedMetrics();
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  resetMetrics();
  const lines: string[] = [];
  const capture = (...parts: unknown[]) => void lines.push(parts.map(String).join(' '));
  const logSpy = spyOn(console, 'log').mockImplementation(capture);
  const errorSpy = spyOn(console, 'error').mockImplementation(capture);
  const warnSpy = spyOn(console, 'warn').mockImplementation(capture);
  try {
    const server = await openConnectionServer();
    servers.push(server);
    const cookie = await server.signIn('alice');
    const pkce = pkcePair();
    const secrets: string[] = [pkce.verifier];
    const { location } = await server.consentAs(cookie, pkce);
    const code = location!.searchParams.get('code')!;
    secrets.push(code);
    const first = await (await server.token(server.tradeForm(code, pkce.verifier))).json();
    secrets.push(first.access_token, first.refresh_token);
    const refresh = (value: string) => server.token({ grant_type: 'refresh_token', refresh_token: value, client_id: 'reference-client', resource: server.resource });
    const second = await (await refresh(first.refresh_token)).json();
    secrets.push(second.access_token, second.refresh_token);
    expect((await refresh(first.refresh_token)).status).toBe(400);
    expect((await server.token(server.tradeForm(code, pkce.verifier))).status).toBe(400);
    const setupFields = await server.consentFields(await server.get('/oauth/setup', { Cookie: cookie }));
    const setupPage = await (await server.postForm('/oauth/setup', { csrf: setupFields.csrf, client: 'reference-client', scope: 'read' }, { Cookie: cookie })).text();
    const credential = /swsetup_[A-Za-z0-9_-]+/.exec(setupPage)![0];
    secrets.push(credential);
    const setup = await (await server.token({ grant_type: 'urn:semantic-workbench:grant-type:setup', setup_credential: credential, client_id: 'reference-client', resource: server.resource })).json();
    secrets.push(setup.access_token, setup.refresh_token);
    for (const record of server.auth.connections.service.listAll()) server.auth.connections.service.end(record.id, 'revoked-by-person');
    const storedHashes = new Set<string>();
    for (const file of filesUnder(join(server.fixture.root, 'state', 'connections'))) {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      for (const value of [record.access?.hash, record.refresh, ...record.retiredRefresh]) if (value) storedHashes.add(value);
    }
    await reader.forceFlush();
    const everything = [
      ...filesUnder(server.fixture.root)
        .filter(file => !file.includes('/sessions/'))
        .map(file => readFileSync(file, 'utf8')),
      ...lines,
    ];
    const text = everything.join('\n');
    for (const secret of secrets) expect(text, secret.slice(0, 12)).not.toContain(secret);
    expect(storedHashes.size).toBe(0);
    const metricText = JSON.stringify(exporter.batches);
    for (const secret of secrets) expect(metricText).not.toContain(secret);
    const labelled = exporter.batches.flatMap(batch => batch.scopeMetrics.flatMap(scope => scope.metrics)).filter(metric => metric.descriptor.name === 'sw.connection.events');
    expect(labelled.length).toBe(1);
    const labels = labelled[0].dataPoints.map(point => point.attributes);
    expect(labels.length).toBeGreaterThan(3);
    for (const attributes of labels) {
      expect(Object.keys(attributes).sort()).toEqual(['endpoint', 'grant', 'outcome']);
      expect(['token', 'authorize', 'consent', 'setup', 'metadata']).toContain(attributes.endpoint as string);
      expect(['authorization_code', 'refresh_token', 'setup', 'none']).toContain(attributes.grant as string);
      expect(['ok', 'refused']).toContain(attributes.outcome as string);
    }
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    metrics.disable();
    resetMetrics();
  }
});

test('every audit record of the flow names the connection and holds no hash while a connection is live', async () => {
  const server = await openConnectionServer();
  servers.push(server);
  const { tokens } = await server.connect('alice');
  const [record] = server.auth.connections.service.listAll();
  const stored = JSON.parse(readFileSync(join(server.fixture.root, 'state', 'connections', `${record.id}.json`), 'utf8'));
  const hashes = [stored.access.hash, stored.refresh];
  const month = new Date().toISOString().slice(0, 7);
  const entries = server.auth.audit.entries(month).filter(entry => String(entry.action).startsWith('connection.'));
  expect(entries.map(entry => entry.action)).toEqual(['connection.consent', 'connection.issued']);
  expect(entries[1]).toMatchObject({ connection: record.id, origin: 'mcp', principal: { kind: 'person', clientId: 'reference-client' } });
  const text = JSON.stringify(entries);
  for (const value of [...hashes, tokens.access_token, tokens.refresh_token]) expect(text).not.toContain(value);
  expect(text).not.toContain('sessionReference');
});
