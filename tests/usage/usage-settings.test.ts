// Tests how the two usage counter variables are read in both modes.
import { describe, expect, test } from 'bun:test';
import { ConfigError, readConfig } from '../../src/server/config';
import { readUsageSettings } from '../../src/server/usage/usage-settings';

const sessionKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64');
const serverEnvironment = {
  SW_MODE: 'server',
  SW_PUBLIC_URL: 'https://workbench.example.org',
  SW_OIDC_ISSUER: 'https://login.example.org/realms/workbench',
  SW_OIDC_CLIENT_ID: 'semantic-workbench',
  SW_OIDC_CLIENT_SECRET: 'client-secret',
  SW_OIDC_PROVIDER: 'keycloak',
  SW_SESSION_KEY: sessionKey,
  SW_BOOTSTRAP_ADMINS: 'dave@example.org',
};

function problemsFor(env: Record<string, string>) {
  const problems: { variable: string; message: string }[] = [];
  readUsageSettings(env, problems);
  return problems.map(problem => problem.variable);
}

describe('usage settings', () => {
  test('absent variables leave counters off with thirty days of retention', () => {
    expect(readUsageSettings({}, [])).toEqual({ enabled: false, retentionDays: 30 });
  });

  test('"on" enables counters', () => {
    expect(readUsageSettings({ SW_USAGE_COUNTERS: 'on' }, []).enabled).toBe(true);
  });

  test('any other switch value is a named problem and leaves counters off', () => {
    for (const value of ['yes', 'true', '1', 'ON', 'off']) {
      const problems: { variable: string; message: string }[] = [];
      expect(readUsageSettings({ SW_USAGE_COUNTERS: value }, problems).enabled).toBe(false);
      expect(problems.map(problem => problem.variable)).toEqual(['SW_USAGE_COUNTERS']);
    }
  });

  test('retention accepts whole days from 1 to 365', () => {
    expect(readUsageSettings({ SW_USAGE_RETENTION_DAYS: '1' }, []).retentionDays).toBe(1);
    expect(readUsageSettings({ SW_USAGE_RETENTION_DAYS: '365' }, []).retentionDays).toBe(365);
    expect(readUsageSettings({ SW_USAGE_RETENTION_DAYS: ' 90 ' }, []).retentionDays).toBe(90);
  });

  test('retention outside the range or not a whole number is a named problem', () => {
    for (const value of ['0', '366', '-1', '1.5', 'thirty', '1e2']) {
      expect(problemsFor({ SW_USAGE_RETENTION_DAYS: value })).toEqual(['SW_USAGE_RETENTION_DAYS']);
    }
  });
});

describe('usage settings in the configuration', () => {
  test('local mode reads them', () => {
    const config = readConfig({ SW_USAGE_COUNTERS: 'on', SW_USAGE_RETENTION_DAYS: '7' });
    expect(config.usage).toEqual({ enabled: true, retentionDays: 7 });
  });

  test('server mode reads them', () => {
    const config = readConfig({ ...serverEnvironment, SW_USAGE_COUNTERS: 'on' });
    expect(config.usage).toEqual({ enabled: true, retentionDays: 30 });
  });

  test('a bad value stops the start in both modes and names the variable', () => {
    for (const env of [{ SW_USAGE_RETENTION_DAYS: '0' }, { ...serverEnvironment, SW_USAGE_COUNTERS: 'maybe' }]) {
      let named: string[] = [];
      try {
        readConfig(env);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        named = (error as ConfigError).problems.map(problem => problem.variable);
      }
      expect(named.some(variable => variable.startsWith('SW_USAGE_'))).toBe(true);
    }
  });
});
