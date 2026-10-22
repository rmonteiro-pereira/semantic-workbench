// Creation must give scoped creators a readable project without widening their grants.
import { expect, spyOn, test } from 'bun:test';
import * as cedar from '../../server/auth/cedar';
import { newProjectIn } from '../../server/auth/resource';
import { authWorkspace } from '../helpers/auth-workspace';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';
import { accessFixture, person } from './access-fixture';
import { openAdminRepository } from '../../server/auth/admin-repo';

const origin = 'http://127.0.0.1:4310';

test('Steward creation assigns its single domain and remains readable after reload', async () => {
  using fixture = await authWorkspace();
  const options = accessFixture();
  const access = createAccessControl({
    ...options,
    knownProjects: () => fixture.ws.state.registry().projects.map(project => project.slug),
  });
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('bob')),
  });
  const response = await handler(
    new Request(origin + '/api/projects', {
      method: 'POST',
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Steward project' }),
    }),
  );
  expect(response.status).toBe(200);
  const project = await response.json();
  const config = openAdminRepository({ root: fixture.root }).load();
  expect(config.projects.projects[project.slug].domain).toBe('sales');
  expect(
    access.authorize(access.principalFor(person('bob')), 'read', {
      type: 'project',
      project: project.slug,
    }).allow,
  ).toBe(true);
});

test('creation refuses another domain, and Admin can choose no domain', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  for (const [name, domain, status] of [
    ['bob', 'hr', 404],
    ['alice', 'sales', 403],
    ['dave', undefined, 200],
  ] as const) {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person(name)),
    });
    const before = fixture.ws.state.registry().projects.length;
    const response = await handler(
      new Request(origin + '/api/projects', {
        method: 'POST',
        headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Domain choice', domain }),
      }),
    );
    expect(response.status).toBe(status);
    expect(fixture.ws.state.registry().projects.length).toBe(before + (status === 200 ? 1 : 0));
  }
});

test('several creation domains require an explicit selection, including an empty domain', async () => {
  using fixture = await authWorkspace();
  const options = accessFixture();
  options.config.projects.domains.push({ id: 'new-domain', name: 'New domain' });
  const grant = options.config.grants.find(grant => grant.roleId === 'steward')!;
  grant.scope = { kind: 'domains', domains: ['sales', 'new-domain'] };
  const access = createAccessControl(options);
  const scope = access.forRequest(access.principalFor(person('bob')));
  expect(scope.creationDomains().map(domain => domain.id)).toEqual(['sales', 'new-domain']);
  const before = fixture.ws.state.registry().projects.length;
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('bob')),
  });
  const response = await handler(
    new Request(origin + '/api/projects', {
      method: 'POST',
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Choose a domain' }),
    }),
  );
  expect(response.status).toBe(403);
  expect(fixture.ws.state.registry().projects.length).toBe(before);
});

test('imported projects receive the Steward domain and local creation stays unrestricted', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('bob')),
  });
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const response = await handler(
    new Request(origin + '/api/import', {
      method: 'POST',
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Scoped import', files: [{ path: 'orders.yaml', source }] }),
    }),
  );
  expect(response.status).toBe(200);
  const project = await response.json();
  expect(
    openAdminRepository({ root: fixture.root }).load().projects.projects[project.slug].domain,
  ).toBe('sales');
  const local = createHandler(fixture.ws);
  const created = await local(
    new Request(origin + '/api/projects', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Local without a domain' }),
    }),
  );
  expect(created.status).toBe(200);
});

test('a new project is judged by the domain the request names, with the loaded policy', () => {
  const access = createAccessControl(accessFixture());
  const bob = access.principalFor(person('bob'));
  const policyLoads = spyOn(cedar, 'loadPolicySet');
  const evaluators = spyOn(cedar, 'createPolicyEvaluator');
  try {
    expect(access.authorize(bob, 'createProject', newProjectIn('sales')).allow).toBe(true);
    const hidden = access.authorize(bob, 'createProject', newProjectIn('hr'));
    expect(hidden).toMatchObject({ allow: false, status: 404 });
    expect(policyLoads).not.toHaveBeenCalled();
    expect(evaluators).not.toHaveBeenCalled();
  } finally {
    policyLoads.mockRestore();
    evaluators.mockRestore();
  }
});

test('a real project slug never borrows the domain a request names', () => {
  const access = createAccessControl(accessFixture());
  const bob = access.principalFor(person('bob'));
  const unregistered = { type: 'project' as const, project: 'not-registered', domain: 'sales' };
  expect(access.authorize(bob, 'read', unregistered).allow).toBe(false);
  expect(access.authorize(bob, 'createProject', unregistered).allow).toBe(false);
  expect(access.authorize(bob, 'createProject', newProjectIn('sales')).allow).toBe(true);
});
