// Telemetry is off unless the server runs in server mode with a valid connection string, and the
// connection string can only point at Application Insights.
import { describe, expect, test } from 'bun:test';
import { ConfigError, readConfig } from '../../src/server/config';
import {
  connectionStringProblem,
  DEFAULT_SAMPLE_RATIO,
  readTelemetry,
} from '../../src/server/observability/settings';

const KEY = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
const GOOD = `InstrumentationKey=${KEY};IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/`;
const sessionKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64');

function serverEnvironment(extra: Record<string, string> = {}): Record<string, string> {
  return {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://workbench.example.org',
    SW_OIDC_ISSUER: 'https://sso.example.org/realms/workbench',
    SW_OIDC_CLIENT_ID: 'semantic-workbench',
    SW_OIDC_CLIENT_SECRET: 'client-secret',
    SW_SESSION_KEY: sessionKey,
    SW_BOOTSTRAP_ADMINS: 'dave@example.org',
    ...extra,
  };
}

describe('whether telemetry is on', () => {
  test('it is off by default', () => {
    expect(readConfig({}).observability.telemetry).toEqual({
      enabled: false,
      reason: 'local-mode',
    });
    expect(readConfig(serverEnvironment()).observability.telemetry).toEqual({
      enabled: false,
      reason: 'no-connection-string',
    });
  });

  test('local mode stays off even with a connection string', () => {
    const config = readConfig({ APPLICATIONINSIGHTS_CONNECTION_STRING: GOOD });
    expect(config.observability.telemetry).toEqual({ enabled: false, reason: 'local-mode' });
  });

  test('local mode does not even look at a malformed connection string', () => {
    const config = readConfig({ APPLICATIONINSIGHTS_CONNECTION_STRING: 'nonsense' });
    expect(config.observability.telemetry.enabled).toBe(false);
  });

  test('server mode with a connection string turns it on with the default sampling', () => {
    const config = readConfig(serverEnvironment({ APPLICATIONINSIGHTS_CONNECTION_STRING: GOOD }));
    expect(config.observability.telemetry).toEqual({
      enabled: true,
      connectionString: GOOD,
      sampleRatio: DEFAULT_SAMPLE_RATIO,
    });
  });

  test('the sampling ratio is configurable and checked', () => {
    const env = serverEnvironment({ APPLICATIONINSIGHTS_CONNECTION_STRING: GOOD });
    const sampled = readConfig({ ...env, SW_TRACE_SAMPLE_RATIO: '0.5' });
    expect(sampled.observability.telemetry).toMatchObject({ enabled: true, sampleRatio: 0.5 });
    for (const bad of ['2', '-1', 'half']) {
      expect(() => readConfig({ ...env, SW_TRACE_SAMPLE_RATIO: bad })).toThrow(ConfigError);
    }
  });
});

describe('the connection string', () => {
  test('a string for another host is refused without being repeated', () => {
    const evil = `InstrumentationKey=${KEY};IngestionEndpoint=https://collector.example.net/`;
    const env = serverEnvironment({ APPLICATIONINSIGHTS_CONNECTION_STRING: evil });
    try {
      readConfig(env);
      throw new Error('Expected a refusal.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const text = (error as ConfigError).message;
      expect(text).toContain('APPLICATIONINSIGHTS_CONNECTION_STRING');
      expect(text).not.toContain('collector.example.net');
      expect(text).not.toContain(KEY);
    }
  });

  test('http, a missing key and a malformed key are refused', () => {
    expect(
      connectionStringProblem(
        `InstrumentationKey=${KEY};IngestionEndpoint=http://a.applicationinsights.azure.com/`,
      ),
    ).not.toBeNull();
    expect(
      connectionStringProblem('IngestionEndpoint=https://a.in.applicationinsights.azure.com/'),
    ).not.toBeNull();
    expect(connectionStringProblem('InstrumentationKey=abc')).not.toBeNull();
  });

  test('a key alone, the global endpoint and the regional endpoints are accepted', () => {
    expect(connectionStringProblem(`InstrumentationKey=${KEY}`)).toBeNull();
    expect(connectionStringProblem(GOOD)).toBeNull();
    const global = `InstrumentationKey=${KEY};IngestionEndpoint=https://dc.services.visualstudio.com/`;
    expect(connectionStringProblem(global)).toBeNull();
  });

  test('a lookalike host that only ends in the right letters is refused', () => {
    const lookalike = `InstrumentationKey=${KEY};IngestionEndpoint=https://evilapplicationinsights.azure.com/`;
    expect(connectionStringProblem(lookalike)).not.toBeNull();
  });
});

describe('log settings', () => {
  test('the level defaults to info and reads SW_LOG_LEVEL', () => {
    expect(readConfig({}).observability.logLevel).toBe('info');
    expect(readConfig({ SW_LOG_LEVEL: 'debug' }).observability.logLevel).toBe('debug');
    expect(() => readConfig({ SW_LOG_LEVEL: 'loud' })).toThrow(ConfigError);
  });

  test('server mode writes JSON and local mode readable lines', () => {
    expect(readConfig(serverEnvironment()).observability.logFormat).toBe('json');
    expect(readConfig({}).observability.logFormat).toBe('text');
  });

  test('readTelemetry is a pure function of mode and environment', () => {
    const problems: { variable: string; message: string }[] = [];
    expect(readTelemetry({}, true, problems).enabled).toBe(false);
    expect(problems).toEqual([]);
  });
});
