// Runs in its own process: starts telemetry in every way that must leave it off, exercises the
// instrumented code, and reports whether the SDK was loaded or any network call was tried.
import net from 'node:net';
import tls from 'node:tls';
import { readConfig } from '../../server/config';
import { startTelemetry } from '../../server/observability/telemetry';

const attempts: string[] = [];
function forbid(name: string, owner: object, method: string) {
  (owner as Record<string, unknown>)[method] = () => {
    attempts.push(name);
    throw new Error(`${name} is not allowed when telemetry is off`);
  };
}
forbid('net.connect', net, 'connect');
forbid('net.Socket.connect', net.Socket.prototype, 'connect');
forbid('tls.connect', tls, 'connect');
forbid('fetch', globalThis, 'fetch');

const connectionString = 'InstrumentationKey=4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
const service = { version: '1', commit: 'abc', mode: 'local' as const, revision: null };
const environments = [
  {},
  { APPLICATIONINSIGHTS_CONNECTION_STRING: connectionString },
  {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://w.example.org',
    SW_OIDC_ISSUER: 'https://sso.example.org/r',
    SW_OIDC_CLIENT_ID: 'c',
    SW_OIDC_CLIENT_SECRET: 's',
    SW_SESSION_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64'),
    SW_BOOTSTRAP_ADMINS: 'a@example.org',
  },
];

const { withSpan } = await import('../../server/observability/tracing');
const { recordRequest, recordGitCommand } = await import('../../server/observability/metrics');
const { log } = await import('../../server/observability/log');
for (const environment of environments) {
  const config = readConfig(environment);
  const telemetry = await startTelemetry({ settings: config.observability.telemetry, service });
  await withSpan('probe', {}, () => recordRequest('/x', 'GET', 200, 1));
  recordGitCommand('status', 3, false);
  log.info('probe');
  await telemetry.shutdown();
}
if (process.env.PROBE_CONTROL === '1') await import('@opentelemetry/sdk-trace-base');
const loaded = Object.keys(require.cache).filter(path =>
  /@opentelemetry\/(sdk-|resources|context-async-hooks)|@azure\/monitor/.test(path),
);
console.log(JSON.stringify({ attempts, loaded }));
