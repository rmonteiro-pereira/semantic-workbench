// Checks the agent connection pages: escaping, headers, the fixed sentence, scope rows and that nothing from a request is echoed.
import { beforeAll, expect, test } from 'bun:test';
import { ONWARD_USE_SENTENCE, consentPage, errorPage, setupFormPage, setupResultPage, type ScopeRow } from '../../src/server/connections/consent-pages';
import type { Program } from '../../src/server/connections/programs';
import { offeredScopes } from '../../src/server/connections/scopes';
import { useDefaultBrand } from '../helpers/brand-fixture';

beforeAll(useDefaultBrand);

const program: Program = {
  clientId: 'reference-client',
  name: '<img src=x onerror=alert(1)>Evil & "quoted"',
  description: '<script>bad()</script>',
  redirectUris: ['http://127.0.0.1:8765/callback'],
  scopes: ['read', 'validate', 'edit', 'commit', 'remote'],
  setupNote: 'Use port <b>8765</b>',
};
const rows: ScopeRow[] = offeredScopes().map(scope => ({ scope, checked: ['read', 'validate', 'edit', 'commit'].includes(scope), available: scope !== 'publish' }));

async function consent() {
  const response = consentPage({ program, redirectUri: program.redirectUris[0], personName: 'Maria <Costa>', rows, pendingId: 'pending-id', csrf: 'csrf-token' });
  return { response, body: await response.text() };
}

test('every dynamic value is escaped and the page has no script', async () => {
  const { body } = await consent();
  expect(body).not.toContain('<img src=x');
  expect(body).not.toContain('<script');
  expect(body).not.toContain('<b>8765');
  expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;Evil &amp; &quot;quoted&quot;');
  expect(body).toContain('Maria &lt;Costa&gt;');
  expect(body).not.toMatch(/<[^>]*\son[a-z]+=/);
  expect(body).not.toContain('style="');
});

test('the sentence about onward use is present word for word', async () => {
  const { body } = await consent();
  expect(ONWARD_USE_SENTENCE).toBe(
    'Semantic Workbench does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.',
  );
  expect(body).toContain(ONWARD_USE_SENTENCE);
});

test('the page says what the connection can do, who it acts as, how long it lasts and where it returns', async () => {
  const { body } = await consent();
  expect(body).toContain('with your roles');
  expect(body).toContain('can read whatever you can read');
  expect(body).toContain('This connection ends when you sign out or your session expires, which can be as soon as the end of the day.');
  expect(body).toContain('The agent can push with your Git credential.');
  expect(body).toContain('Commit the files it names to your working branch, with your name as author.');
  expect(body).toContain('http://127.0.0.1:8765/callback');
  expect(body).toContain('name="decision" value="allow"');
  expect(body).toContain('name="decision" value="deny"');
});

test('scope rows keep their defaults and show what the roles do not allow', async () => {
  const { body } = await consent();
  expect(body).toMatch(/value="read" checked>/);
  expect(body).not.toMatch(/value="remote" checked/);
  expect(body).toMatch(/value="publish" disabled>/);
  expect(body.match(/Your roles do not allow this\./g)).toHaveLength(1);
  expect(body).not.toContain('administration');
});

test('the form carries the pending request and the session token', async () => {
  const { body } = await consent();
  expect(body).toContain('name="pending" value="pending-id"');
  expect(body).toContain('name="csrf" value="csrf-token"');
  expect(body).toContain('method="post" action="/oauth/consent"');
});

test('the headers forbid caching, framing and referrers, and allow the redirect origin to receive the form', async () => {
  const { response } = await consent();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  const policy = response.headers.get('content-security-policy')!;
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("form-action 'self' http://127.0.0.1:8765;");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('script-src');
  expect(response.headers.get('set-cookie')).toBeNull();
});

test('the setup form lists programs and scopes and posts to the setup address', async () => {
  const response = setupFormPage({ programs: [program, { ...program, clientId: 'second-client', name: 'Second' }], personName: 'Chen', rows, csrf: 'csrf-token' });
  const body = await response.text();
  expect(body).toContain('method="post" action="/oauth/setup"');
  expect(body.match(/name="client"/g)).toHaveLength(2);
  expect(body).toMatch(/value="reference-client" checked/);
  expect(body).toContain(ONWARD_USE_SENTENCE);
  expect(response.headers.get('content-security-policy')).toContain("form-action 'self';");
});

test('the setup result shows the credential once, with no cache and no link to it', async () => {
  const response = setupResultPage({ credential: 'swsetup_abc<def>', expiresAtIso: '2026-11-17T10:00:00.000Z', serverUrl: 'https://wb.example.org' });
  const body = await response.text();
  expect(body).toContain('swsetup_abc&lt;def&gt;');
  expect(body).toContain('SW_SERVER_URL=https://wb.example.org');
  expect(body).toContain('&lt;paste the setup credential here&gt;');
  expect(body.split('swsetup_abc').length - 1).toBe(1);
  expect(body).not.toMatch(/href="[^"]*swsetup_/);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body).toContain('This connection ends when you sign out');
});

test('the error page says one sentence from a closed list and echoes nothing', async () => {
  for (const kind of ['invalid', 'finished', 'limit', 'unavailable'] as const) {
    const response = errorPage(kind);
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).not.toMatch(/client_id|redirect_uri|reference-client|127\.0\.0\.1/);
    expect(body).toContain('href="/"');
  }
  expect(await errorPage('limit').text()).toContain('list of agent connections');
});
