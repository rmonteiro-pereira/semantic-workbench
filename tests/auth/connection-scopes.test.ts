import { afterEach, expect, test } from 'bun:test';
import { mintCaller } from '../../src/server/auth/caller';
import { operationById } from '../../src/server/auth/operation-inventory';
import { scopeAllows } from '../../src/server/auth/connection-scope';
import { effectsOf, offeredScopes, type OfferedScope } from '../../src/server/connections/scopes';
import { openConnectionServer, referenceProgram, type ConnectionServer } from '../helpers/connection-server';

const servers: ConnectionServer[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));

async function open() {
  const server = await openConnectionServer();
  servers.push(server);
  return server;
}

test('consent refuses scopes beyond the registration and shows role restrictions', async () => {
  const server = await open();
  const cookie = await server.signIn('carol');
  const pkce = server.pkcePair();
  const page = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce, { scope: 'read commit' }), { Cookie: cookie });
  const fields = await server.consentFields(page);
  expect(fields.body).toContain('Your roles do not allow this');
  expect(fields.body).toMatch(/name="scope" value="commit"[^>]*disabled/);
  const refused = await server.postForm('/oauth/consent', { pending: fields.pending, csrf: fields.csrf, decision: 'allow', scope: 'commit' }, { Cookie: cookie });
  expect(refused.status).toBe(400);
  for (const scope of ['administration', 'publish']) {
    const invalid = await server.get('/oauth/authorize?' + server.authorizeQuery(pkce, { scope }), { Cookie: cookie });
    expect(invalid.status).toBe(400);
  }
}, 30000);

test('connection effects narrow current roles across every offered scope combination', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice');
  const resolved = await server.auth.connections.service.resolve(tokens.access_token);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error('Connection did not resolve');
  const boundary = server.handler.boundary;
  const principal = resolved.caller.principal;
  const unrestricted = new Set(boundary.availableOperations(mintCaller({ principal, origin: 'mcp' })));
  const scopes = offeredScopes();
  for (let mask = 0; mask < 2 ** scopes.length; mask++) {
    const chosen: OfferedScope[] = scopes.filter((_, index) => (mask & (1 << index)) !== 0);
    const effects = effectsOf(chosen);
    const actual = boundary.availableOperations(mintCaller({ principal, origin: 'mcp', scope: effects }));
    const expected = [...unrestricted].filter(id => scopeAllows(effects, operationById(id)!.entry.effects));
    expect(actual, chosen.join(' ')).toEqual(expected);
    for (const id of actual) {
      expect(operationById(id)!.entry.effects).not.toContain('destroy');
      expect(operationById(id)!.entry.effects.every(effect => effects.includes(effect))).toBe(true);
    }
  }
  expect(resolved.caller.scope).toEqual(['read', 'localWrite']);
  expect(referenceProgram.scopes).not.toContain('administration');
}, 30000);
