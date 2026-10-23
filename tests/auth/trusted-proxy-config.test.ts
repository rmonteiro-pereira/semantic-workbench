// SW_TRUSTED_PROXY_HOPS says how many reverse proxies append to X-Forwarded-For.
import { expect, test } from 'bun:test';
import { ConfigError } from '../../server/config';
import { oidcConfig } from '../helpers/server-auth';

const configured = (extra: Record<string, string>) =>
  oidcConfig('http://127.0.0.1:4444/issuer', 'http://127.0.0.1:4444/graph', 'entra', extra);

const hops = (value?: string) =>
  configured(value === undefined ? {} : { SW_TRUSTED_PROXY_HOPS: value }).trustedProxyHops;

test('no proxy is trusted unless the setting says so', () => {
  expect(hops()).toBe(0);
  expect(hops('')).toBe(0);
  expect(hops('0')).toBe(0);
});

test('a whole number of proxies up to five is accepted', () => {
  expect(hops('1')).toBe(1);
  expect(hops(' 2 ')).toBe(2);
  expect(hops('5')).toBe(5);
});

test('anything else refuses start-up and names the variable', () => {
  for (const value of ['-1', '1.5', 'two', '6', '0x1']) {
    expect(() => hops(value)).toThrow(ConfigError);
    try {
      hops(value);
    } catch (error) {
      expect((error as ConfigError).problems.map(problem => problem.variable)).toEqual([
        'SW_TRUSTED_PROXY_HOPS',
      ]);
    }
  }
});
