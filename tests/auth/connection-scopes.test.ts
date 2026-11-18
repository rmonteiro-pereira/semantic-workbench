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

import { operationInventory } from '../../src/server/auth/operation-inventory';
import { ROUTE_ACTIONS, routeResourceKind } from '../../src/server/auth/route-actions';
import { routeVerdict } from '../../src/server/auth/route-verdict';
import { createAccessControl } from '../../src/server/auth/authorize';
import { localPrincipal } from '../../src/server/auth/principal';
import { accessFixture } from './access-fixture';

const requiredScopes: Record<string, string[]> = {
  read: ['read', 'validate'],
  localWrite: ['edit'],
  commit: ['commit'],
  remote: ['remote'],
  credential: ['remote'],
  publish: ['publish'],
  administration: [],
  destroy: [],
};

test('the inventory refuses every operation with a missing effect, including destruction under every offered combination', () => {
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(localPrincipal());
  const offered = offeredScopes();
  for (const [path, entry] of Object.entries(operationInventory.operations)) {
    const row = ROUTE_ACTIONS.find(candidate => candidate.path === path)!;
    const kind = routeResourceKind(row);
    const resource = { type: kind, project: 'sales-contracts', path: 'orders.odcs.yaml' } as never;
    const baseline = routeVerdict(scope, row, 'server', { resource, origin: 'mcp' });
    for (let mask = 0; mask < 2 ** offered.length; mask++) {
      const chosen = offered.filter((_, index) => (mask & (1 << index)) !== 0);
      const expected = entry.effects.every(effect => requiredScopes[effect].some(required => chosen.includes(required as OfferedScope)));
      const verdict = routeVerdict(scope, row, 'server', { resource, origin: 'mcp', connectionScope: effectsOf(chosen) });
      expect(verdict.decision.allow, `${entry.id}: ${chosen.join(' ')}`).toBe(baseline.decision.allow && expected);
    }
  }
});
