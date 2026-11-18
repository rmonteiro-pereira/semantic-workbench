// Checks the unauthenticated surface of agent connections: the rows that answer without a principal are exactly the planned ones, they set no cookie and disclose no client, and a flood of bad requests is limited and audited in bounded numbers.
import { afterEach, expect, test } from 'bun:test';
import { ANONYMOUS_AUDIT_BURST } from '../../src/server/auth/rate-limit';
import { ROUTE_ACTIONS } from '../../src/server/auth/route-actions';
import { openConnectionServer, type ConnectionServer } from '../helpers/connection-server';
import { routeExamples } from './route-actions';

const servers: ConnectionServer[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));
async function open(options: Parameters<typeof openConnectionServer>[0] = {}) {
  const server = await openConnectionServer(options);
  servers.push(server);
  return server;
}

/** The rows this feature added. Everything else about the public rows is another test's concern. */
const CONNECTION_ROWS = /^(GET|POST|PUT|DELETE) (\/\.well-known\/|\/oauth\/|\/api\/connections|\/api\/admin\/connections|\/api\/admin\/programs|\/api\/mcp)/;

/** The only answers given without a principal: two discovery documents (one under two addresses) and the token endpoint. The endpoint's own challenge joins them with the endpoint itself. */
const PUBLIC_ANSWERS = [
  'GET /.well-known/oauth-protected-resource',
  'GET /.well-known/oauth-protected-resource/api/mcp',
  'GET /.well-known/oauth-authorization-server',
  'POST /oauth/token',
  'POST /api/mcp',
];

test('among the connection rows exactly the planned answers are public', () => {
  const rows = ROUTE_ACTIONS.filter(row => CONNECTION_ROWS.test(row.path));
  expect(rows.length).toBeGreaterThan(PUBLIC_ANSWERS.length);
  expect(
    rows
      .filter(row => row.public)
      .map(row => row.path)
      .sort(),
  ).toEqual([...PUBLIC_ANSWERS].sort());
});

test('without a session every other connection route sends the browser to sign in or answers 401, and shows no content', async () => {
  const server = await open();
  const others = routeExamples.filter(example => CONNECTION_ROWS.test(`${example.method} ${example.path}`) && !PUBLIC_ANSWERS.includes(`${example.method} ${example.path}`));
  expect(others.length).toBeGreaterThan(8);
  for (const example of others) {
    const response = await server.handler(
      new Request(server.origin + example.path, {
        method: example.method,
        headers: { 'Content-Type': 'application/json', Origin: server.origin, 'X-SW-Request': '1' },
        body: example.method === 'GET' ? undefined : '{}',
      }),
    );
    expect([302, 401], `${example.method} ${example.path}`).toContain(response.status);
    const text = response.status === 302 ? '' : await response.text();
    expect(text).not.toMatch(/reference-client|Protocol reference/);
  }
});

test('the public answers set no cookie, hold no client data and are limited in size', async () => {
  const server = await open();
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp', '/.well-known/oauth-authorization-server']) {
    const response = await server.get(path);
    const text = await response.text();
    expect(response.status, path).toBe(200);
    expect(response.headers.get('set-cookie'), path).toBeNull();
    expect(text.length, path).toBeLessThan(4096);
    expect(text, path).not.toContain('reference-client');
  }
  const token = await server.token({ grant_type: 'refresh_token', refresh_token: 'x', client_id: 'reference-client', resource: server.resource });
  expect(token.headers.get('set-cookie')).toBeNull();
});

test('a known and an unknown client get byte-identical answers at the token endpoint', async () => {
  const server = await open();
  const answer = async (clientId: string) => {
    const response = await server.token({
      grant_type: 'authorization_code',
      code: 'c',
      client_id: clientId,
      redirect_uri: 'http://127.0.0.1:8765/callback',
      code_verifier: 'v'.repeat(43),
      resource: server.resource,
    });
    return JSON.stringify({ status: response.status, headers: [...response.headers].filter(([name]) => !['x-request-id', 'date'].includes(name)), body: await response.text() });
  };
  expect(await answer('reference-client')).toBe(await answer('never-registered'));
});

test('a flood of bad token requests is limited by source address and audited a bounded number of times', async () => {
  const server = await open({ handlerOptions: { requestLimits: { requests: { burst: 1000, perSecond: 200 }, signIn: { burst: 30, perSecond: 0.001 } } } });
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 120; attempt++) {
    statuses.push((await server.token({ grant_type: 'refresh_token', refresh_token: 'x' + attempt, client_id: 'reference-client', resource: server.resource })).status);
  }
  expect(statuses.filter(status => status === 400)).toHaveLength(30);
  expect(statuses.filter(status => status === 429)).toHaveLength(90);
  const month = new Date().toISOString().slice(0, 7);
  const refusals = server.auth.audit.entries(month).filter(entry => entry.action === 'connection.refused');
  expect(refusals.length).toBeGreaterThan(0);
  expect(refusals.length).toBeLessThanOrEqual(ANONYMOUS_AUDIT_BURST);
  expect(JSON.stringify(refusals)).not.toContain('reference-client');
});

test('only the four paths are rate limited like a sign-in, so the general limit does not apply to them', async () => {
  const server = await open({ handlerOptions: { requestLimits: { requests: { burst: 1, perSecond: 0.001 }, signIn: { burst: 50, perSecond: 1 } } } });
  for (let attempt = 0; attempt < 5; attempt++) expect((await server.get('/.well-known/oauth-authorization-server')).status).toBe(200);
});
