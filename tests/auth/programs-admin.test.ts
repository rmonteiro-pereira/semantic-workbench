// Checks what the Admin sees before confirming a change to the registered programs: added, changed and removed programs and the connections each change would end.
import { afterEach, expect, test } from 'bun:test';
import { connectionFixture, program } from '../connections/connection-fixture';
import { openConnectionServer, referenceProgram, type ConnectionServer } from '../helpers/connection-server';

const fixtures: ReturnType<typeof connectionFixture>[] = [];
const servers: ConnectionServer[] = [];
afterEach(() => {
  fixtures.splice(0).forEach(fixture => fixture.cleanup());
  servers.splice(0).forEach(server => server.close());
});
function open() {
  const fixture = connectionFixture();
  fixtures.push(fixture);
  return fixture;
}
async function connect(fixture: ReturnType<typeof open>, sessionId: string) {
  const session = fixture.signIn(sessionId);
  const outcome = await fixture.trade(fixture.codeFor(session));
  if (!outcome.ok) throw new Error('trade refused');
  return outcome;
}

test('the preview counts what a registration change would end', async () => {
  const fixture = open();
  await connect(fixture, 'session-one');
  await connect(fixture, 'session-two');
  const none = { formatVersion: 1 as const, programs: [] };
  expect(fixture.service.preview(none)).toMatchObject({ removed: [{ clientId: program.clientId }], endings: [{ clientId: program.clientId, connections: 2 }] });
  const renamed = { formatVersion: 1 as const, programs: [{ ...program, name: 'Renamed' }] };
  expect(fixture.service.preview(renamed)).toMatchObject({ changed: [{ clientId: program.clientId }], endings: [] });
  const narrowed = { formatVersion: 1 as const, programs: [{ ...program, scopes: ['read' as const] }] };
  expect(fixture.service.preview(narrowed).endings).toEqual([{ clientId: program.clientId, name: program.name, connections: 2 }]);
  const redirectGone = { formatVersion: 1 as const, programs: [{ ...program, redirectUris: ['http://127.0.0.1:1/other'] }] };
  expect(fixture.service.preview(redirectGone).endings[0].connections).toBe(2);
  const added = { formatVersion: 1 as const, programs: [program, { ...program, clientId: 'second-client' }] };
  expect(fixture.service.preview(added)).toMatchObject({ added: [{ clientId: 'second-client' }], endings: [] });
});

async function openServer() {
  const server = await openConnectionServer({ programs: [] });
  servers.push(server);
  return server;
}

const proposal = (programs: unknown[]) => ({ formatVersion: 1, programs });

test('an Admin previews, confirms and one commit lands; then the program can start the flow', async () => {
  const server = await openServer();
  const admin = await server.signIn('dave');
  const before = await (await server.json('/api/admin/programs', 'GET', admin)).json();
  expect(before.programs).toEqual([]);
  const body = proposal([referenceProgram]);
  const preview = await server.json('/api/admin/programs/preview', 'POST', admin, body);
  expect(preview.status, await preview.clone().text()).toBe(200);
  const review = await preview.json();
  expect(review.programs).toMatchObject({ added: [{ clientId: 'reference-client' }], removed: [], endings: [] });
  const commits = (await server.auth.administration.history()).length;
  const saved = await server.json('/api/admin/programs', 'PUT', admin, { ...body, baseVersion: before.version, dryRunId: review.dryRunId });
  expect(saved.status).toBe(200);
  expect((await server.auth.administration.history()).length).toBe(commits + 1);
  expect((await server.auth.administration.history())[0].message).toBe('programs: Add agent program reference-client');
  const alice = await server.signIn('alice');
  const pkce = server.pkcePair();
  expect((await server.get('/oauth/authorize?' + server.authorizeQuery(pkce), { Cookie: alice })).status).toBe(200);
  const after = await (await server.json('/api/admin/programs', 'GET', admin)).json();
  expect(after.programs[0].clientId).toBe('reference-client');
}, 30000);

test('a save needs the matching preview and the current version', async () => {
  const server = await openServer();
  const admin = await server.signIn('dave');
  const { version } = await (await server.json('/api/admin/programs', 'GET', admin)).json();
  const body = proposal([referenceProgram]);
  expect((await server.json('/api/admin/programs', 'PUT', admin, { ...body, baseVersion: version })).status).toBe(400);
  const review = await (await server.json('/api/admin/programs/preview', 'POST', admin, body)).json();
  const changed = proposal([{ ...referenceProgram, name: 'Another name' }]);
  expect((await server.json('/api/admin/programs', 'PUT', admin, { ...changed, baseVersion: version, dryRunId: review.dryRunId })).status).toBe(400);
  expect((await server.json('/api/admin/programs', 'PUT', admin, { ...body, baseVersion: 'f'.repeat(40), dryRunId: review.dryRunId })).status).toBeGreaterThanOrEqual(400);
  expect((await server.auth.connections.service.listAll()).length).toBe(0);
}, 30000);

test('a proposal with a bad or non-exact redirect address is refused with the field named', async () => {
  const server = await openServer();
  const admin = await server.signIn('dave');
  const attempts: [string, string][] = [
    ['http://example.com/cb', 'programs[0].redirectUris[0]'],
    ['https://example.com/cb#x', 'programs[0].redirectUris[0]'],
    ['https://*.example.com/cb', 'programs[0].redirectUris[0]'],
    ['http://127.0.0.1/cb', 'programs[0].redirectUris[0]'],
    ['myapp://callback', 'programs[0].redirectUris[0]'],
  ];
  for (const [address, field] of attempts) {
    const response = await server.json('/api/admin/programs/preview', 'POST', admin, proposal([{ ...referenceProgram, redirectUris: [address] }]));
    expect(response.status, address).toBe(400);
    const refusal = await response.json();
    expect(
      refusal.issues.map((issue: { field: string }) => issue.field),
      address,
    ).toContain(field);
  }
  const reserved = await server.json('/api/admin/programs/preview', 'POST', admin, proposal([{ ...referenceProgram, scopes: ['read', 'administration'] }]));
  expect(reserved.status).toBe(400);
  expect((await reserved.json()).issues[0].message).toContain('not available yet');
}, 30000);

test('removing a program ends its connections and the next trade or call fails', async () => {
  const server = await openServer();
  const admin = await server.signIn('dave');
  await server.register([referenceProgram]);
  const { tokens } = await server.connect('alice');
  const { version } = await (await server.json('/api/admin/programs', 'GET', admin)).json();
  const body = proposal([]);
  const review = await (await server.json('/api/admin/programs/preview', 'POST', admin, body)).json();
  expect(review.programs.removed).toEqual([{ clientId: 'reference-client', name: 'Protocol reference client' }]);
  expect(review.programs.endings).toEqual([{ clientId: 'reference-client', name: 'Protocol reference client', connections: 1 }]);
  const saved = await (await server.json('/api/admin/programs', 'PUT', admin, { ...body, baseVersion: version, dryRunId: review.dryRunId })).json();
  expect(saved.ended).toBe(1);
  expect((await server.auth.connections.service.resolve(tokens.access_token)).ok).toBe(false);
  expect((await server.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'reference-client', resource: server.resource })).status).toBe(400);
  expect(server.auth.connections.service.listAll()[0]).toMatchObject({ state: 'ended', endReason: 'program-removed' });
}, 30000);

test('narrowing a scope or removing a redirect address ends the connections that used it, and a rename ends nothing', async () => {
  const server = await openServer();
  const admin = await server.signIn('dave');
  await server.register([referenceProgram]);
  await server.connect('alice', 'read edit');
  const { version } = await (await server.json('/api/admin/programs', 'GET', admin)).json();
  const renamed = proposal([{ ...referenceProgram, name: 'Renamed' }]);
  expect((await (await server.json('/api/admin/programs/preview', 'POST', admin, renamed)).json()).programs).toMatchObject({ changed: [{ clientId: 'reference-client' }], endings: [] });
  const narrowed = proposal([{ ...referenceProgram, scopes: ['read'] }]);
  const review = await (await server.json('/api/admin/programs/preview', 'POST', admin, narrowed)).json();
  expect(review.programs.endings).toHaveLength(1);
  const saved = await server.json('/api/admin/programs', 'PUT', admin, { ...narrowed, baseVersion: version, dryRunId: review.dryRunId });
  expect(saved.status).toBe(200);
  expect(server.auth.connections.service.listAll()[0]).toMatchObject({ state: 'ended', endReason: 'scope-removed' });
}, 30000);

test('only an Admin may read, preview or save registrations', async () => {
  const server = await openServer();
  const alice = await server.signIn('alice');
  for (const [path, method] of [
    ['/api/admin/programs', 'GET'],
    ['/api/admin/programs', 'PUT'],
    ['/api/admin/programs/preview', 'POST'],
  ] as const) {
    expect((await server.json(path, method, alice, proposal([]))).status, `${method} ${path}`).toBe(403);
  }
}, 30000);

test('an unregistered client and an invalid one for a registered program get byte-identical answers', async () => {
  const server = await openServer();
  await server.register([referenceProgram]);
  const answer = async (form: Record<string, string>) => {
    const response = await server.token(form);
    return `${response.status} ${[...response.headers].filter(([name]) => name !== 'x-request-id' && name !== 'date').join('|')} ${await response.text()}`;
  };
  const unregistered = await answer({
    grant_type: 'authorization_code',
    code: 'c',
    client_id: 'nobody',
    redirect_uri: 'http://127.0.0.1:8765/callback',
    code_verifier: 'v'.repeat(43),
    resource: server.resource,
  });
  const invalid = await answer({
    grant_type: 'authorization_code',
    code: 'c',
    client_id: 'reference-client',
    redirect_uri: 'http://127.0.0.1:8765/callback',
    code_verifier: 'v'.repeat(43),
    resource: server.resource,
  });
  expect(unregistered).toBe(invalid);
}, 30000);
