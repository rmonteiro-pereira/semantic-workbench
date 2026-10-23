// Shared state writes must resolve every hidden target before changing durable bytes.
import { expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from './access-fixture';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';
import { ROUTE_ACTIONS, routeFor } from '../../server/auth/route-actions';
import { routeExamples } from './route-actions';
import type { Workspace } from '../../server/projects/workspace';
import { LOCAL_READER } from '../../server/projects/reader';
import { projectFile } from '../../server/projects/paths';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

const origin = 'http://127.0.0.1:4310';
function request(path: string, method = 'POST', body: unknown = {}) {
  return new Request(origin + path, {
    method,
    headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
function snapshot(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
      const path = join(prefix, entry.name);
      if (path === 'state/audit' || path.startsWith('cache.sqlite')) return [];
      if (entry.isDirectory()) return Object.entries(snapshot(root, path));
      return [[path, readFileSync(join(root, path)).toString('base64')]];
    }),
  );
}
function server(ws: Workspace, name: Parameters<typeof person>[0] = 'alice') {
  const access = createAccessControl(accessFixture());
  return createHandler(ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person(name)),
  });
}
function auditLines(root: string, response: Response) {
  const directory = join(root, 'state/audit');
  return readdirSync(directory)
    .filter(name => name.endsWith('.jsonl'))
    .flatMap(name =>
      readFileSync(join(directory, name), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
    )
    .filter(line => line.requestId === response.headers.get('X-Request-Id'));
}

test('every URL-addressed project write refuses an Editor aimed at HR with one audit', async () => {
  using fixture = await authWorkspace();
  const handler = server(fixture.ws);
  const before = snapshot(fixture.root);
  for (const example of routeExamples) {
    if (['GET', 'HEAD'].includes(example.method)) continue;
    if (!example.path.includes('/missing')) continue;
    const path = example.path.replace('missing', 'hr-people');
    const found = routeFor(example.method, path)!;
    if (found.row.resource(found.match, new URL(origin + path)).type === 'workspace') continue;
    const response = await handler(
      request(path, example.method, {
        confirm: true,
        name: 'Hidden rename',
        path: 'people.odcs.yaml',
        source: 'name: Hidden',
        text: 'Hidden draft',
        baseHash: null,
        patches: [],
        paths: ['people.odcs.yaml'],
        files: [{ path: 'people.odcs.yaml', source: 'Hidden', baseHash: null }],
        toProject: 'sales-contracts',
        message: 'Hidden commit',
        branch: 'main',
        push: true,
        semanticPath: 'people.odcs.yaml',
        modelPath: 'people.odcs.yaml',
      }),
    );
    expect(response.status, example.path).toBe(404);
    expect(snapshot(fixture.root), example.path).toEqual(before);
    expect(auditLines(fixture.root, response), example.path).toHaveLength(1);
  }
});

test('each body target row refuses hidden files before mutation and audits exactly once', async () => {
  using fixture = await authWorkspace();
  const handler = server(fixture.ws);
  const deleted = await fixture.ws.trash.deleteFile(
    'hr-people',
    'people.odcs.yaml',
    undefined,
    LOCAL_READER,
  );
  const suggestion = {
    id: '00000000000000000000',
    file: { project: 'hr-people', path: 'people.odcs.yaml', hash: 'hidden' },
    targetProject: 'sales-contracts',
    reasons: [],
  };
  const suggestions = spyOn(fixture.ws, 'suggestions').mockReturnValue([suggestion] as never);
  const cases = [
    {
      path: '/api/documents',
      body: {
        id: 'hr-people/people.odcs.yaml',
        filename: 'people.odcs.yaml',
        source: 'ontology: []',
      },
    },
    {
      path: '/api/documents/' + encodeURIComponent('hr-people/people.odcs.yaml') + '/grouping',
      method: 'PUT',
      body: { mode: 'types' },
    },
    { path: '/api/suggestions/' + suggestion.id + '/accept' },
    { path: '/api/suggestions/' + suggestion.id + '/reject' },
    { path: '/api/trash/' + deleted.entryId + '/undo' },
    { path: '/api/trash/' + deleted.entryId + '/restore' },
  ];
  try {
    const covered = new Set<string>();
    const before = snapshot(fixture.root);
    for (const operation of cases) {
      const method = operation.method ?? 'POST';
      const row = routeFor(method, operation.path)!.row;
      expect(row.targets).toBe('body');
      covered.add(row.path);
      const response = await handler(request(operation.path, method, operation.body));
      expect(response.status, operation.path).toBe(404);
      expect(snapshot(fixture.root), operation.path).toEqual(before);
      expect(auditLines(fixture.root, response)).toHaveLength(1);
    }
    expect([...covered].sort()).toEqual(
      ROUTE_ACTIONS.filter(row => row.targets === 'body')
        .map(row => row.path)
        .sort(),
    );
  } finally {
    suggestions.mockRestore();
  }
});

test('grouping is personal: a Viewer saves her own view and nobody else sees it', async () => {
  using fixture = await authWorkspace();
  const path = '/api/documents/' + encodeURIComponent('hr-people/people.odcs.yaml') + '/grouping';
  const viewer = server(fixture.ws, 'carol');
  expect((await viewer(request(path, 'PUT', { mode: 'types' }))).status).toBe(200);
  expect(await (await viewer(request(path, 'GET'))).json()).toEqual({ mode: 'types' });
  expect(await (await server(fixture.ws, 'dave')(request(path, 'GET'))).json()).toEqual({});
  expect(fixture.ws.state.view('hr-people').files['people.odcs.yaml']).toBeUndefined();
});

test('deletion records its principal; only a Steward can restore other or legacy trash', async () => {
  using fixture = await authWorkspace();
  const editor = server(fixture.ws);
  // A file with nothing governed in it, which an Editor may delete and bring back.
  const path = '/api/projects/sales-contracts/files/sales.mapping.yaml';
  const response = await editor(request(path, 'DELETE', { confirm: true }));
  expect(response.status).toBe(200);
  const { entryId } = await response.json();
  expect(fixture.ws.trash.entry(entryId).deletedBy).toBe(person('alice').id);
  expect((await editor(request('/api/trash/' + entryId + '/undo'))).status).toBe(200);
  // Local mode left both deletions committed on the default branch. A restore in server mode goes
  // into the person's copy, which starts from that branch without the files.
  const published = join(fixture.ws.layout.projects, 'sales-contracts');
  const git = (...args: string[]) => Bun.spawnSync(['git', ...args], { cwd: published });
  const legacy = [
    [undefined, 'orders.odcs.yaml'],
    [person('bob').id, 'people.mapping.yaml'],
  ] as const;
  const entries = [];
  for (const [deletedBy, file] of legacy) {
    entries.push(
      await fixture.ws.trash.deleteFile('sales-contracts', file, deletedBy, LOCAL_READER),
    );
    git('add', '-A');
    git('commit', '-q', '-m', `Remove ${file}`);
    git('update-ref', 'refs/heads/main', 'HEAD');
  }
  for (const entry of entries) {
    const before = snapshot(fixture.root);
    const denied = await editor(request('/api/trash/' + entry.entryId + '/restore'));
    // Another person's entry is hidden from an Editor, exactly as in the trash listing.
    expect(denied.status).toBe(404);
    expect(auditLines(fixture.root, denied)[0].action).toBe('restoreOthers');
    expect(snapshot(fixture.root)).toEqual(before);
    const bob = server(fixture.ws, 'bob');
    expect((await bob(request('/api/trash/' + entry.entryId + '/restore'))).status).toBe(200);
  }
});

test('creation and clone refuse a hidden domain even when the caller has the route action', async () => {
  using fixture = await authWorkspace();
  const options = accessFixture();
  options.config.roles.push({
    id: 'r_creator',
    name: 'Creator',
    description: 'Creates projects and clones repositories.',
    createdBy: 'test',
    createdAt: '2026-10-22T00:00:00Z',
    permissions: [{ actions: ['createProject', 'clone'] }],
  });
  const editorGrant = options.config.grants.find(grant => grant.id === 'g-sales-editors')!;
  options.config.grants.push({
    ...editorGrant,
    id: 'g-creator',
    roleId: 'r_creator',
    scope: { kind: 'workspace' },
  });
  options.config.adminRules = {
    'creation-domain':
      'forbid (principal, action in [SW::Action::"createProject", SW::Action::"read"], resource) ' +
      'when { resource is SW::Project && resource.domain == "hr" };',
  };
  const access = createAccessControl(options);
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const cloneHandler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('dave')),
  });
  const before = snapshot(fixture.root);
  const cases = [
    { path: '/api/projects', body: { domain: 'hr', name: 'Hidden domain' } },
    { path: '/api/import', body: { domain: 'hr', files: [] } },
    { path: '/api/examples/ubl', body: { domain: 'hr' } },
    { path: '/api/clone', body: { domain: 'hr', url: fixture.root + '/absent.git' } },
  ];
  for (const { path, body } of cases) {
    const dispatch = path === '/api/clone' ? cloneHandler : handler;
    const response = await dispatch(request(path, 'POST', body));
    expect(response.status, path).toBe(404);
    expect(snapshot(fixture.root)).toEqual(before);
    expect(auditLines(fixture.root, response)).toHaveLength(1);
  }
});

test('write checks require a request scope and preserve protected-branch context', async () => {
  const { authorizeWrite } = await import('../../server/auth/write-access');
  const { requestAccess, requestScope } = await import('../../server/auth/request-scope');
  const req = request('/api/projects/sales-contracts/git/push');
  expect(() => requestScope(req)).toThrow('no access scope');
  expect(() => authorizeWrite(req, 'push', [])).toThrow('no access scope');
  const options = accessFixture();
  options.config.projects.projects['sales-contracts'].protectedBranches = ['main'];
  const access = createAccessControl(options);
  Object.assign(req, { [requestAccess]: access.forRequest(access.principalFor(person('alice'))) });
  const project = { type: 'project' as const, project: 'sales-contracts' };
  expect(() => authorizeWrite(req, 'push', [project], { branch: 'feature' })).not.toThrow();
  expect(() => authorizeWrite(req, 'push', [project], { branch: 'main' })).toThrow();
  const { localPrincipal } = await import('../../server/auth/principal');
  const local = createAccessControl({ ...options, mode: 'local' });
  Object.assign(req, { [requestAccess]: local.forRequest(localPrincipal()) });
  expect(() => authorizeWrite(req, 'push', [project], { branch: 'main' })).not.toThrow();
});

test('a legacy save without an id is judged under the name it is finally written to', async () => {
  using fixture = await authWorkspace();
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const first = await fixture.ws.saveDocument('orders.odcs.yaml', source, LOCAL_READER);
  expect(first.project).toBe('ungrouped');
  const options = accessFixture();
  options.config.projects.projects.ungrouped = {
    domain: 'sales',
    stewards: [],
    restricted: [],
    protectedBranches: [],
  };
  // Alice may edit the requested name but not the name a clash gives the new document.
  options.config.adminRules = {
    'second-copies':
      '@id("second-copies")\nforbid (principal, action == SW::Action::"edit", resource) ' +
      'when { resource is SW::File && resource.path like "* (2)*" };',
  };
  const access = createAccessControl({
    ...options,
    knownProjects: () => fixture.ws.state.registry().projects.map(project => project.slug),
  });
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const response = await handler(
    request('/api/documents', 'POST', { filename: 'orders.odcs.yaml', source }),
  );
  expect(response.status).toBe(403);
  expect(existsSync(projectFile(fixture.ws.layout, 'ungrouped', 'orders.odcs (2).yaml'))).toBe(
    false,
  );
  const [audit] = auditLines(fixture.root, response);
  expect(audit.resource).toMatchObject({ project: 'ungrouped', path: 'orders.odcs (2).yaml' });
});

test('a legacy save is authorized in the project it creates, even when a folder takes the slug', async () => {
  using fixture = await authWorkspace();
  // An unregistered folder already holds the preferred slug, so the new project gets another one.
  mkdirSync(join(fixture.ws.layout.projects, 'ungrouped'), { recursive: true });
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const refuse = (targets: { project: string; path: string }[]) => {
    checked.push(...targets);
    throw new Error('refused');
  };
  const checked: { project: string; path: string }[] = [];
  const before = fixture.ws.state.registry().projects.length;
  await expect(
    fixture.ws.saveDocument('orders.odcs.yaml', source, LOCAL_READER, undefined, undefined, refuse),
  ).rejects.toThrow('refused');
  expect(fixture.ws.state.registry().projects).toHaveLength(before);
  const allowed: { project: string; path: string }[] = [];
  const saved = await fixture.ws.saveDocument(
    'orders.odcs.yaml',
    source,
    LOCAL_READER,
    undefined,
    undefined,
    targets => allowed.push(...targets),
  );
  expect(saved.project).not.toBe('ungrouped');
  expect(allowed).toEqual([{ project: saved.project, path: saved.path }]);
  expect(checked).toEqual(allowed);
});

test('a missing creation domain answers exactly like a hidden one', async () => {
  using fixture = await authWorkspace();
  const handler = server(fixture.ws, 'bob');
  const statuses: number[] = [];
  for (const domain of ['hr', 'no-such-domain']) {
    const response = await handler(
      request('/api/projects', 'POST', { name: 'Probe ' + domain, domain }),
    );
    statuses.push(response.status);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  }
  expect(statuses).toEqual([404, 404]);
});
