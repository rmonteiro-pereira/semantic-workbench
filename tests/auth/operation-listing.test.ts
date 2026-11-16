// Listing uses effective permissions and never grants invocation access to an arbitrary target.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { TEST_USERS, TEST_CLIENTS, type TestUserName } from '../helpers/auth-identities';
import { ROUTE_ACTIONS } from '../../src/server/auth/route-actions';
import { routeVerdict, routeTargets } from '../../src/server/auth/route-verdict';
import { auditableProjects } from '../../src/server/auth/audit';
import { localPrincipal } from '../../src/server/auth/principal';
import type { Caller } from '../../src/server/auth/caller';
import { createHandler } from '../../src/server/handler';
import { createAccessControl, type AccessOptions } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { clientPrincipal } from '../../src/server/auth/principal';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import type { Conditions } from '../../src/server/auth/access-config';
import { operationById, operationInventory } from '../../src/server/auth/operation-inventory';
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

async function setup(options: AccessOptions = accessFixture(), mode: 'local' | 'server' = 'server') {
  const fixture = await authWorkspace();
  const access = createAccessControl(options);
  const audit = createAuditLog({ dir: join(fixture.root, 'listing-audit') });
  const handler = createHandler(fixture.ws, { mode, access, audit, remoteCredentials: allowEveryRemote() });
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
  expect(clientList).toContain('agent.projects.list');
  expect(clientList.every(id => ROUTE_ACTIONS.find(row => row.path === operationById(id)?.row)?.clientAction === 'agentRead')).toBe(true);
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

function assertAvailability(context: Awaited<ReturnType<typeof setup>>, caller: Caller, mode: 'local' | 'server') {
  const scope = context.access.forRequest(caller.principal, { sourceIp: caller.sourceIp });
  const projects = context.access.snapshot().knownProjects();
  const storedProjects = context.fixture.ws.state.registry().projects.map(project => project.slug);
  const auditProjects = scope.authorize('admin', { type: 'workspace' }).allow ? null : auditableProjects(scope, storedProjects);
  const ids = new Set(context.boundary.availableOperations(caller));
  for (const row of ROUTE_ACTIONS) {
    const targets = [...routeTargets(scope, row, projects, mode)];
    const admitted = targets.map(target => routeVerdict(scope, row, mode, { ...target, projects: () => projects, auditProjects, origin: caller.origin, connectionScope: caller.scope }));
    const listed = ids.has(operationInventory.operations[row.path].id);
    if (listed)
      expect(
        admitted.some(verdict => verdict.decision.allow),
        caller.principal.name + ': ' + row.path,
      ).toBe(true);
    else
      expect(
        admitted.every(verdict => !verdict.decision.allow),
        caller.principal.name + ': ' + row.path,
      ).toBe(true);
  }
}

test('listing and invocation admission agree for every fixture caller and inventory row', async () => {
  for (const mode of ['server', 'local'] as const) {
    const options: AccessOptions = { ...accessFixture(), mode };
    using context = await setup(options, mode);
    const principals = (Object.keys(TEST_USERS) as TestUserName[]).map(name => context.access.principalFor(person(name)));
    principals.push(...Object.values(TEST_CLIENTS).map(client => clientPrincipal(client.clientId)), localPrincipal());
    principals.push({ ...principals[0], deactivated: true });
    for (const principal of principals) {
      for (const scope of [undefined, ['read']] as const) assertAvailability(context, mintCaller({ principal, origin: 'mcp', scope }), mode);
    }
  }
  for (const conditions of [{ path: 'docs/**' }, { docType: ['ontology'] }]) {
    using context = await setup(customOptions(conditions));
    assertAvailability(context, mintCaller({ principal: context.access.principalFor(person('alice')), origin: 'mcp' }), 'server');
  }
}, 60_000);

test('listing keeps distinct grant scopes and project-specific administrator rules', async () => {
  for (const administratorRule of [false, true]) {
    const options: AccessOptions = accessFixture();
    const projects = Array.from({ length: 20 }, (_, index) => 'project-' + index);
    for (const project of projects) options.config.projects.projects[project] = { domain: 'sales', everyoneCanRead: true, stewards: [], restricted: [], protectedBranches: [] };
    options.knownProjects = () => projects;
    if (administratorRule) {
      options.config.adminRules = {
        'last-project': 'forbid (principal, action == SW::Action::"edit", resource) unless { resource.project == "project-19" };',
      };
    } else {
      const grant = options.config.grants.find(grant => grant.id === 'g-sales-editors')!;
      grant.scope = { kind: 'projects', projects: ['project-19'] };
    }
    using context = await setup(options);
    const principal = context.access.principalFor(person('alice'));
    const caller = mintCaller({ principal, origin: 'mcp' });
    const original = context.boundary.availableOperations(caller);
    expect(original).toContain('files.save');
    const revoked = structuredClone(options.config);
    revoked.grants = [];
    context.access.reload(revoked);
    expect(context.boundary.availableOperations(caller)).toEqual([]);
    context.access.reload(options.config);
    expect(context.boundary.availableOperations(caller)).toEqual(original);
  }
}, 30_000);

test('a project grant never admits a workspace-only operation', async () => {
  const options = customOptions({});
  options.config.roles[0].permissions = [{ actions: ['read', 'clear'] }];
  using context = await setup(options);
  const caller = mintCaller({ principal: context.access.principalFor(person('alice')), origin: 'mcp' });
  assertAvailability(context, caller, 'server');
  expect(context.boundary.availableOperations(caller)).not.toContain('workspace.clear');
  const result = await context.boundary.operate({ caller, request: buildTwinRequest('workspace.clear', { params: {}, body: {} }) });
  expect(result.response.status).toBe(403);
});
