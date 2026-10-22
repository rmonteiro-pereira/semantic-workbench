// Creation recovery keeps access metadata and registered projects in agreement.
import { expect, spyOn, test } from 'bun:test';
import * as administration from '../../server/auth/admin-repo';
import * as cedar from '../../server/auth/cedar';
import { assignProjectDomain, assignProjectDomains } from '../../server/auth/project-creation';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createOidcClient } from '../../server/auth/oidc';
import type { CloneEvent } from '../../server/projects/clone';
import { bareRepository } from '../helpers/git-fixtures';
import { LOCAL_READER } from '../../server/projects/reader';
import { oidcTransport } from '../helpers/oidc-transport';
import { requestAccess, type AccessRequest } from '../../server/auth/request-scope';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from './access-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

function adminRequest(): AccessRequest {
  const access = createAccessControl(accessFixture());
  const request: AccessRequest = new Request('http://localhost/api/projects');
  request[requestAccess] = access.forRequest(access.principalFor(person('dave')));
  return request;
}

for (const failures of [1, 2]) {
  test(
    'domain assignment retries a stale version and compensates after ' + failures + ' failures',
    async () => {
      using fixture = await authWorkspace();
      const repository = administration.openAdminRepository({ root: fixture.root });
      await repository.ensure();
      const originalWrite = repository.write;
      const request = adminRequest();
      const project = await fixture.ws.createProject('Recovery');
      let attempts = 0;
      const write = spyOn(repository, 'write').mockImplementation(async (...args) => {
        attempts++;
        if (attempts <= failures) throw new administration.AdminStaleError();
        return originalWrite(...args);
      });
      const load = spyOn(repository, 'load');
      try {
        const result = assignProjectDomain(
          { ws: fixture.ws, administration: repository },
          request,
          project.slug,
          'sales',
        );
        if (failures === 1) {
          await result;
          expect(repository.load().projects.projects[project.slug].domain).toBe('sales');
          expect(
            fixture.ws.state.registry().projects.some(item => item.slug === project.slug),
          ).toBe(true);
        } else {
          await expect(result).rejects.toBeInstanceOf(administration.AdminStaleError);
          expect(
            fixture.ws.state.registry().projects.some(item => item.slug === project.slug),
          ).toBe(false);
          expect(fixture.ws.trash.list().some(entry => entry.project === project.slug)).toBe(true);
          expect(repository.load().projects.projects[project.slug]).toBeUndefined();
        }
        expect(attempts).toBe(2);
        expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);
      } finally {
        load.mockRestore();
        write.mockRestore();
      }
    },
  );
}

test('creation without a domain removes stale metadata for a reused slug', async () => {
  using fixture = await authWorkspace();
  const repository = administration.openAdminRepository({ root: fixture.root });
  await repository.ensure();
  const project = await fixture.ws.createProject('Reused');
  const config = repository.load();
  config.projects.projects[project.slug] = {
    domain: 'hr',
    stewards: [],
    restricted: [],
    protectedBranches: [],
  };
  await repository.write(
    { 'projects.json': JSON.stringify(config.projects) },
    {
      baseVersion: await repository.version(),
      author: { name: 'Test', email: 'test@example.invalid' },
      message: 'projects: old assignment',
    },
  );
  await assignProjectDomain(
    { ws: fixture.ws, administration: repository },
    adminRequest(),
    project.slug,
    undefined,
  );
  expect(repository.load().projects.projects[project.slug]).toBeUndefined();
});

test('a failed local clone never assigns a domain', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const origin = 'http://127.0.0.1:4310';
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('dave')),
  });
  const response = await handler(
    new Request(origin + '/api/clone', {
      method: 'POST',
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Failed clone',
        url: fixture.root + '/absent.git',
        domain: 'sales',
      }),
    }),
  );
  expect(response.status).toBe(200);
  const { op, slug } = await response.json();
  let failed = false;
  for (let attempt = 0; attempt < 200 && !failed; attempt++) {
    failed = fixture.ws.events.replay(0)!.some(event => {
      const data = event.data as { op?: string; phase?: string };
      return event.event === 'clone' && data.op === op && data.phase === 'failed';
    });
    if (!failed) await Bun.sleep(10);
  }
  expect(failed).toBe(true);
  expect(
    administration.openAdminRepository({ root: fixture.root }).load().projects.projects[slug],
  ).toBeUndefined();
});

test('creation decisions never recompile the policy and follow a policy reload', () => {
  const options = accessFixture();
  const access = createAccessControl(options);
  const policyLoads = spyOn(cedar, 'loadPolicySet');
  try {
    const principal = access.principalFor(person('bob'));
    const first = access.forRequest(principal).creationDomains();
    expect(first.map(domain => domain.id)).toEqual(['sales']);
    const firstLoads = policyLoads.mock.calls.length;
    expect(firstLoads).toBe(0);
    expect(access.forRequest(principal).creationDomains()).toEqual(first);
    expect(policyLoads.mock.calls.length).toBe(firstLoads);
    options.config.grants = options.config.grants.filter(grant => grant.roleId !== 'steward');
    access.reload(options.config);
    expect(access.forRequest(principal).creationDomains()).toEqual([]);
    expect(policyLoads.mock.calls.length).toBeGreaterThan(firstLoads);
  } finally {
    policyLoads.mockRestore();
  }
});

const origin = 'http://127.0.0.1:4310';

async function cloneOutcome(
  fixture: { ws: { events: { replay(from: number): unknown } } },
  op: string,
) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const events = fixture.ws.events.replay(0) as { event: string; data: unknown }[];
    const finished = events.find(event => {
      const data = event.data as CloneEvent;
      return event.event === 'clone' && data.op === op && ['done', 'failed'].includes(data.phase);
    });
    if (finished) return (finished.data as CloneEvent).phase;
    await Bun.sleep(10);
  }
  return 'running';
}

test('a domain assignment and a grant written together through one repository both survive', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl({
    ...accessFixture(),
    knownProjects: () => fixture.ws.state.registry().projects.map(project => project.slug),
  });
  const repository = administration.openAdminRepository({
    root: fixture.root,
    committed: config => access.reload(config),
  });
  await repository.ensure();
  const write = spyOn(repository, 'write');
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    administration: repository,
    principal: () => access.principalFor(person('bob')),
  });
  async function grantCarol() {
    // An administration editor retries a stale proposal on the newer version.
    for (;;) {
      const config = repository.load();
      config.grants.push({
        id: 'g-carol-sales',
        roleId: 'viewer',
        member: { kind: 'email', email: 'carol@example.org' },
        scope: { kind: 'domains', domains: ['sales'] },
        addedBy: 'test',
        addedAt: '2026-10-22T00:00:00Z',
      } as never);
      try {
        return await repository.write(
          { 'grants.json': JSON.stringify({ formatVersion: 1, grants: config.grants }) },
          {
            baseVersion: await repository.version(),
            author: { name: 'Admin', email: 'admin@example.org' },
            message: 'grants: add Carol',
          },
        );
      } catch (error) {
        if (!(error instanceof administration.AdminStaleError)) throw error;
      }
    }
  }
  try {
    const [created] = await Promise.all([
      handler(
        new Request(origin + '/api/projects', {
          method: 'POST',
          headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Concurrent' }),
        }),
      ),
      grantCarol(),
    ]);
    expect(created.status).toBe(200);
    const { slug } = await created.json();
    const saved = repository.load();
    expect(saved.projects.projects[slug].domain).toBe('sales');
    expect(saved.grants.some(grant => grant.id === 'g-carol-sales')).toBe(true);
    const assignments = write.mock.calls.filter(([files]) => 'projects.json' in files);
    // A stale proposal is retried once, so the assignment may take a second write.
    expect(assignments.length).toBeGreaterThanOrEqual(1);
  } finally {
    write.mockRestore();
  }
});

test('server authentication owns the administration repository and reloads after each commit', async () => {
  const transport = await oidcTransport();
  using fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  try {
    const bob = auth.access.principalFor(person('bob'));
    const scope = auth.access.forRequest(bob);
    expect('reload' in scope).toBe(false);
    const hr = { type: 'project' as const, project: 'hr-people' };
    expect(auth.access.authorize(bob, 'read', hr).allow).toBe(false);
    const config = auth.administration.load();
    config.grants.push({
      id: 'g-bob-hr',
      roleId: 'viewer',
      member: { kind: 'email', email: 'bob@example.org' },
      scope: { kind: 'domains', domains: ['hr'] },
      addedBy: 'test',
      addedAt: '2026-10-22T00:00:00Z',
    } as never);
    await auth.administration.write(
      { 'grants.json': JSON.stringify({ formatVersion: 1, grants: config.grants }) },
      {
        baseVersion: await auth.administration.version(),
        author: { name: 'Admin', email: 'admin@example.org' },
        message: 'grants: let Bob read HR',
      },
    );
    const refreshed = auth.access.principalFor(person('bob'));
    expect(auth.access.authorize(refreshed, 'read', hr).allow).toBe(true);
  } finally {
    auth.close();
  }
});

test('every project of a clone gets its domain in one administration commit', async () => {
  using fixture = await authWorkspace();
  const repository = administration.openAdminRepository({ root: fixture.root });
  await repository.ensure();
  const first = await fixture.ws.createProject('First of two');
  const second = await fixture.ws.createProject('Second of two');
  const before = (await repository.history()).length;
  await assignProjectDomains(
    { ws: fixture.ws, administration: repository },
    adminRequest(),
    [first.slug, second.slug],
    'sales',
  );
  const history = await repository.history();
  expect(history).toHaveLength(before + 1);
  const projects = repository.load().projects.projects;
  expect(projects[first.slug].domain).toBe('sales');
  expect(projects[second.slug].domain).toBe('sales');
});

test('a clone whose domain commit fails trashes all of its projects and reports failure', async () => {
  const remote = bareRepository('monorepo');
  using fixture = await authWorkspace();
  try {
    const repository = administration.openAdminRepository({ root: fixture.root });
    await repository.ensure();
    const write = spyOn(repository, 'write').mockImplementation(async () => {
      throw new Error('administration disk full');
    });
    const before = fixture.ws.state.registry().projects.map(project => project.slug);
    try {
      const started = fixture.ws.clone(remote.bare, undefined, LOCAL_READER, slugs =>
        assignProjectDomains(
          { ws: fixture.ws, administration: repository },
          adminRequest(),
          slugs,
          'sales',
        ),
      );
      expect(await cloneOutcome(fixture, started.op)).toBe('failed');
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
    }
    const after = fixture.ws.state.registry().projects.map(project => project.slug);
    expect(after).toEqual(before);
    // Both projects share one repository, so the trash keeps them as one restorable entry.
    expect(fixture.ws.trash.list()).toHaveLength(1);
  } finally {
    remote.dispose();
  }
});

test('creating a project without a domain makes no administration commit', async () => {
  using fixture = await authWorkspace();
  const repository = administration.openAdminRepository({ root: fixture.root });
  await repository.ensure();
  const project = await fixture.ws.createProject('No domain');
  const before = await repository.version();
  const write = spyOn(repository, 'write');
  try {
    await assignProjectDomain(
      { ws: fixture.ws, administration: repository },
      adminRequest(),
      project.slug,
      undefined,
    );
    expect(write).not.toHaveBeenCalled();
    expect(await repository.version()).toBe(before);
  } finally {
    write.mockRestore();
  }
});

test('re-assigning the domain a project already has makes no administration commit', async () => {
  using fixture = await authWorkspace();
  const repository = administration.openAdminRepository({ root: fixture.root });
  await repository.ensure();
  const project = await fixture.ws.createProject('Same domain');
  const deps = { ws: fixture.ws, administration: repository };
  await assignProjectDomain(deps, adminRequest(), project.slug, 'sales');
  const before = await repository.version();
  const write = spyOn(repository, 'write');
  try {
    await assignProjectDomain(deps, adminRequest(), project.slug, 'sales');
    expect(write).not.toHaveBeenCalled();
    expect(await repository.version()).toBe(before);
  } finally {
    write.mockRestore();
  }
});
