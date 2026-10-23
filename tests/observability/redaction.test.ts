// Nothing secret, personal or document-shaped may reach a log line or an exported record.
import { describe, expect, test } from 'bun:test';
import {
  describeError,
  isSensitiveKey,
  redactFields,
  redactText,
  REDACTED,
} from '../../server/observability/redaction';

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl';

describe('free text', () => {
  test('bearer and basic credentials are removed', () => {
    expect(redactText('sent Authorization: Bearer abc123def456ghi')).not.toContain('abc123');
    expect(redactText('Basic dXNlcjpwYXNzd29yZA==')).toBe(`Basic ${REDACTED}`);
  });

  test('a signed token is removed wherever it appears', () => {
    const text = redactText(`failed to verify ${JWT} for the caller`);
    expect(text).not.toContain('eyJ');
    expect(text).toContain(REDACTED);
  });

  test('user information in an address is masked', () => {
    expect(redactText('fetch https://deploy:s3cr3t-token@git.example.org/team/repo.git')).toBe(
      'fetch https://***@git.example.org/team/repo.git',
    );
  });

  test('the whole query string of an address is dropped', () => {
    const text = redactText('GET https://login.example.org/cb?code=abc&state=xyz&note=hello');
    expect(text).toBe(`GET https://login.example.org/cb?${REDACTED}`);
  });

  test('secret-looking assignments keep their name and lose their value', () => {
    expect(redactText('client_secret=hunter2 password: "p w" other=1')).toBe(
      `client_secret=${REDACTED} password: ${REDACTED} other=1`,
    );
    expect(redactText('sw_session=0123456789abcdef; Path=/')).toContain(`sw_session=${REDACTED}`);
  });

  test('file locations are replaced, on POSIX and Windows', () => {
    expect(redactText('ENOENT /data/projects/payroll/salaries.odcs.yaml')).toBe('ENOENT <path>');
    expect(redactText('cannot open C:\\Users\\ana\\contracts\\hr.yaml now')).toBe(
      'cannot open <path> now',
    );
  });

  test('long text is cut', () => {
    expect(redactText('x'.repeat(1000)).length).toBeLessThan(310);
  });
});

describe('fields', () => {
  test('secrets, content and locations are dropped by field name', () => {
    const safe = redactFields({
      accessToken: 'a',
      clientSecret: 'b',
      cookie: 'c',
      authorization: 'Bearer d',
      password: 'e',
      session: 'f',
      code: 'g',
      state: 'h',
      fileContent: 'i',
      source: 'j',
      body: 'k',
      path: '/data/x',
      query: '?code=1',
      url: 'https://x.test/?a=b',
      diff: 'l',
    });
    expect(Object.values(safe).every(value => value === REDACTED)).toBe(true);
  });

  test('ordinary operational fields pass through', () => {
    const safe = redactFields({ status: 200, durationMs: 12, exitCode: 0, reason: 'refused' });
    expect(safe).toEqual({ status: 200, durationMs: 12, exitCode: 0, reason: 'refused' });
  });

  test('values are scanned even under harmless names', () => {
    const safe = redactFields({ detail: `rejected ${JWT} at /data/state/sessions/x.json` });
    expect(JSON.stringify(safe)).not.toContain('eyJ');
    expect(JSON.stringify(safe)).not.toContain('/data/state');
  });

  test('nested objects and arrays are redacted and bounded', () => {
    const safe = redactFields({
      outer: { inner: { token: 'x', fine: 'ok', deeper: { deepest: { gone: 1 } } } },
      list: Array.from({ length: 50 }, (_, index) => index),
    });
    const text = JSON.stringify(safe);
    expect(text).not.toContain('"x"');
    expect(text).toContain('"fine":"ok"');
    expect((safe.list as unknown[]).length).toBe(10);
  });

  test('the route and request id the logger writes are kept as they are', () => {
    const safe = redactFields({ route: '/api/projects/:slug/files/*', requestId: 'a-b-c' });
    expect(safe.route).toBe('/api/projects/:slug/files/*');
    expect(safe.requestId).toBe('a-b-c');
  });

  test('an error keeps its name and redacted message only', () => {
    const safe = redactFields({ error: new Error('boom at /data/projects/a/b.yaml') });
    expect(safe.error).toBe('Error: boom at <path>');
    const described = describeError(new TypeError(`bad ${JWT}`));
    expect(described.errorName).toBe('TypeError');
    expect(described.errorMessage).not.toContain('eyJ');
  });

  test('which names count as sensitive', () => {
    expect(isSensitiveKey('refresh_token')).toBe(true);
    expect(isSensitiveKey('connectionString')).toBe(true);
    expect(isSensitiveKey('durationMs')).toBe(false);
    expect(isSensitiveKey('exitCode')).toBe(false);
  });
});
