// Listing uses effective permissions and never grants invocation access to an arbitrary target.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { TEST_USERS, TEST_CLIENTS, type TestUserName } from '../helpers/auth-identities';
import listingBaseline from '../fixtures/characterization/operation-listing.json';
import { createHandler } from '../../src/server/handler';
import { createAccessControl, type AccessOptions } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { clientPrincipal } from '../../src/server/auth/principal';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import type { Conditions } from '../../src/server/auth/access-config';
import { operationById } from '../../src/server/auth/operation-inventory';
import { accessFixture, person } from './access-fixture';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

function customOptions(conditions: Conditions, roleName = 'Scoped writer') {
  const options = accessFixture();
  options.config.roles = [
    {
      id: 'r_scoped_writer',
      name: roleName,
      description: 'Scoped writer',
      createdBy: 'bootstrap',
      createdAt: '2026-10-01T00:00:00Z',
      permissions: [{ actions: ['read'] }, { actions: ['edit'], conditions }],
    },
  ];
  options.config.grants = [
    {
      id: 'scoped_grant',
      roleId: 'r_scoped_writer',
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'projects', projects: ['sales-contracts'] },
      addedBy: 'bootstrap',
      addedAt: '2026-10-01T00:00:00Z',
    },
  ];
  return options;
}

async function setup(options: AccessOptions = accessFixture()) {
  const fixture = await authWorkspace();
  const access = createAccessControl(options);
  const audit = createAuditLog({ dir: join(fixture.root, 'listing-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, remoteCredentials: allowEveryRemote() });
  return { fixture, access, audit, boundary: handler.boundary, [Symbol.dispose]: () => fixture.dispose() };
}

test('built-in roles, client identities, no grants and deactivation use effective permissions', async () => {
  using context = await setup();
  const lists = new Map<string, string[]>();
  for (const name of ['alice', 'bob', 'carol', 'dave', 'erin', 'gina'] as const) {
    const caller = mintCaller({ principal: context.access.principalFor(person(name)), origin: 'mcp' });
    const list = context.boundary.availableOperations(caller);
    lists.set(name, list);
    expect(list).toEqual([...new Set(list)].sort());
    expect(list.every(id => operationById(id)?.entry.dispatch === 'twin')).toBe(true);
    expect(JSON.stringify(list)).not.toContain('sales-contracts');
  }
  expect(lists.get('alice')).toContain('files.save');
  expect(lists.get('bob')).toContain('git.publish');
  expect(lists.get('carol')).not.toContain('files.save');
  expect(lists.get('dave')).toContain('git.remote.set');
  expect(lists.get('erin')).toEqual([]);
  const disabled = mintCaller({ principal: { ...context.access.principalFor(person('alice')), deactivated: true }, origin: 'mcp' });
  const config = context.access.snapshot().config;
  config.deactivated.principals.push({ id: disabled.principal.id, at: '2026-10-01T00:00:00Z', by: 'admin', reason: 'disabled' });
  context.access.reload(config);
  expect(context.boundary.availableOperations(disabled)).toEqual([]);
  const client = mintCaller({ principal: clientPrincipal('sw-agent'), origin: 'mcp' });
  const clientList = context.boundary.availableOperations(client);
  expect(clientList).toContain('agent.projects.read');
  expect(clientList.every(id => operationById(id)?.entry.clientAction === 'agentRead')).toBe(true);
  expect(context.audit.recent(10)).toEqual([]);
});

test('path and document-type conditions are sampled independently of role names', async () => {
  for (const conditions of [{ path: 'docs/**' }, { docType: ['ontology'] }]) {
    using context = await setup(customOptions(conditions));
    const caller = mintCaller({ principal: context.access.principalFor(person('alice')), origin: 'mcp' });
    const ids = context.boundary.availableOperations(caller);
    expect(ids).toContain('files.save');
    const renamed = customOptions(conditions, 'A different display name');
    context.access.reload(renamed.config);
    expect(context.boundary.availableOperations(caller)).toEqual(ids);
    const denied = await context.boundary.operate({
      caller,
      request: buildTwinRequest('files.save', { params: { slug: 'hr-people', '*': 'hidden.yaml' }, body: { baseHash: null, source: 'ontology: []' } }),
    });
    expect(denied.response.status).toBe(404);
  }
});

test('connection effects remove operations but never add one beyond policy', async () => {
  using context = await setup();
  const principal = context.access.principalFor(person('alice'));
  const unrestricted = context.boundary.availableOperations(mintCaller({ principal, origin: 'mcp' }));
  const scoped = context.boundary.availableOperations(mintCaller({ principal, origin: 'mcp', scope: ['read'] }));
  expect(scoped.length).toBeGreaterThan(0);
  expect(scoped).not.toContain('files.save');
  expect(scoped.every(id => unrestricted.includes(id))).toBe(true);
});

test('listing all operations across twenty projects reports its cost against the budget', async () => {
  const options: AccessOptions = accessFixture();
  const projects = Array.from({ length: 20 }, (_, index) => 'project-' + index);
  for (const project of projects) options.config.projects.projects[project] = { domain: 'sales', stewards: [], restricted: [], protectedBranches: [] };
  options.knownProjects = () => projects;
  using context = await setup(options);
  const caller = mintCaller({ principal: context.access.principalFor(person('alice')), origin: 'mcp' });
  const started = performance.now();
  const operations = context.boundary.availableOperations(caller);
  console.log('Operation listing ' + JSON.stringify({ projects: 20, operations: operations.length, milliseconds: performance.now() - started, goalMs: 50 }));
  expect(operations).toContain('files.save');
});

async function listingAnswers() {
  using context = await setup();
  const answers: Record<string, string[]> = {};
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const principal = context.access.principalFor(person(name));
    answers[name] = context.boundary.availableOperations(mintCaller({ principal, origin: 'mcp' }));
    answers[name + '/read'] = context.boundary.availableOperations(mintCaller({ principal, origin: 'mcp', scope: ['read'] }));
  }
  for (const client of Object.values(TEST_CLIENTS)) {
    const principal = clientPrincipal(client.clientId);
    answers[client.clientId] = context.boundary.availableOperations(mintCaller({ principal, origin: 'mcp' }));
  }
  const config = context.access.snapshot().config;
  config.deactivated.principals.push({ id: context.access.principalFor(person('alice')).id, at: '2026-10-01T00:00:00Z', by: 'admin', reason: 'disabled' });
  context.access.reload(config);
  answers.disabled = context.boundary.availableOperations(mintCaller({ principal: context.access.principalFor(person('alice')), origin: 'mcp' }));
  for (const conditions of [{ path: 'docs/**' }, { docType: ['ontology'] }]) {
    using conditional = await setup(customOptions(conditions));
    const principal = conditional.access.principalFor(person('alice'));
    answers[JSON.stringify(conditions)] = conditional.boundary.availableOperations(mintCaller({ principal, origin: 'mcp' }));
  }
  return answers;
}

test('listing exactly preserves the recorded answers for every fixture caller', async () => {
  const answers = await listingAnswers();
  expect(answers).toEqual(listingBaseline);
});
