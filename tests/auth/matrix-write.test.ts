// Denied writes must leave the durable workspace unchanged, including Git and drafts.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authWorkspace } from '../helpers/auth-workspace';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';
import { accessFixture, person } from './access-fixture';
import { routeExamples } from './route-actions';
import { routeFor } from '../../server/auth/route-actions';
import { LOCAL_READER } from '../../server/projects/reader';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

function snapshot(root: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (path === 'state/audit' || path.startsWith('cache.sqlite')) continue;
    if (entry.isDirectory()) Object.assign(result, snapshot(root, path));
    else result[path] = readFileSync(join(root, path)).toString('base64');
  }
  return result;
}

const origin = 'http://127.0.0.1:4310';
function request(path: string, method: string, body: unknown = {}) {
  return new Request(origin + path, {
    method,
    headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}

test('write route matrix refuses Viewers without changing durable bytes and audits each denial', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('carol')),
  });
  const before = snapshot(fixture.root);
  for (const example of routeExamples) {
    const row = routeFor(example.method, example.path)?.row;
    if (!row || row.public || ['GET', 'HEAD'].includes(example.method)) continue;
    if (row.action === 'read' || row.unaudited) continue;
    for (const project of ['hr-people', 'sales-contracts']) {
      const path = example.path.replace('missing', project);
      const response = await handler(request(path, example.method));
      expect([403, 404]).toContain(response.status);
      expect(snapshot(fixture.root)).toEqual(before);
      const auditDir = join(fixture.root, 'state/audit');
      const records = readdirSync(auditDir).filter(name => name.endsWith('.jsonl'));
      const lines = records.flatMap(name =>
        readFileSync(join(auditDir, name), 'utf8').trim().split('\n'),
      );
      expect(lines.some(line => line.includes(response.headers.get('X-Request-Id')!))).toBe(true);
    }
  }
}, 30000);

test('move checks the destination before moving any source bytes', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const before = snapshot(fixture.root);
  const response = await handler(
    request('/api/projects/sales-contracts/move', 'POST', {
      path: 'orders.odcs.yaml',
      toProject: 'hr-people',
    }),
  );
  expect(response.status).toBe(404);
  expect(snapshot(fixture.root)).toEqual(before);
});

test('server identity configuration is absent even for Admins', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('dave')),
  });
  for (const path of ['/api/git/credential-helper', '/api/projects/sales-contracts/git/identity']) {
    expect((await handler(request(path, 'GET'))).status).toBe(404);
  }
});

test('batch writes and Git staging cannot bypass restricted file access', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const path = 'finance/revenue-recognition.odcs.yaml';
  const before = snapshot(fixture.root);
  const operations = [
    { route: 'save-batch', body: { files: [{ path, baseHash: null, source: 'blocked' }] } },
    { route: 'git/stage', body: { paths: [path] } },
    { route: 'git/commit', body: { paths: [path], message: 'Blocked commit' } },
    { route: 'git/revert', body: { path, baseHash: null } },
  ];
  for (const operation of operations) {
    const response = await handler(
      request('/api/projects/sales-contracts/' + operation.route, 'POST', operation.body),
    );
    expect(response.status).toBe(404);
    expect(snapshot(fixture.root)).toEqual(before);
  }
});

test('Editors can save their drafts while custom reviewers cannot', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  for (const name of ['alice', 'hank'] as const) {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person(name)),
    });
    const response = await handler(
      request('/api/drafts/sales-contracts/orders.odcs.yaml', 'PUT', {
        baseHash: null,
        text: 'draft text',
        patches: [],
      }),
    );
    expect(response.status).toBe(name === 'alice' ? 200 : 403);
  }
});

const writers = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hank'] as const;

test('every write action is checked for every fixture user and readable or hidden targets', () => {
  const access = createAccessControl(accessFixture());
  for (const name of writers) {
    const scope = access.forRequest(access.principalFor(person(name)));
    for (const example of routeExamples) {
      const route = routeFor(example.method, example.path);
      if (!route || route.row.public || ['GET', 'HEAD'].includes(example.method)) continue;
      for (const project of ['sales-contracts', 'hr-people']) {
        const path = example.path.replace('missing', project);
        const resolved = routeFor(example.method, path)!;
        const resource = resolved.row.resource(resolved.match, new URL(origin + path));
        const decision = scope.authorize(resolved.row.action, resource);
        if (name === 'dave') expect(decision.allow).toBe(true);
        if (['erin', 'gina'].includes(name)) expect(decision.allow).toBe(false);
        if (name === 'carol' && !['read', 'viewOwnState'].includes(resolved.row.action)) {
          expect(decision.allow).toBe(false);
        }
        if (resource.type !== 'workspace' && !scope.authorize('read', resource).allow) {
          expect(decision.status).toBe(404);
        }
      }
    }
  }
}, 30000);

test('Editor and Steward saves succeed in Sales and fail unchanged in HR', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  for (const name of ['alice', 'bob'] as const) {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person(name)),
    });
    const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml');
    const saved = await handler(
      request('/api/projects/sales-contracts/files/orders.odcs.yaml', 'PUT', {
        baseHash: source.hash,
        source: source.source,
      }),
    );
    expect(saved.status).toBe(200);
    const before = snapshot(fixture.root);
    const denied = await handler(
      request('/api/projects/hr-people/files/people.odcs.yaml', 'PUT', {
        baseHash: null,
        source: source.source,
      }),
    );
    expect(denied.status).toBe(404);
    expect(snapshot(fixture.root)).toEqual(before);
  }
});

test('keep-both imports authorize the final disambiguated filename before any writes', async () => {
  using fixture = await authWorkspace();
  const options = accessFixture();
  options.config.projects.projects['sales-contracts'].restricted.push({
    pattern: 'orders.odcs (2).yaml',
    groups: [],
    emails: [],
  });
  const access = createAccessControl(options);
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const before = snapshot(fixture.root);
  const response = await handler(
    request('/api/projects/sales-contracts/import', 'POST', {
      files: [{ path: 'orders.odcs.yaml', source }],
      onConflict: 'keep-both',
    }),
  );
  expect(response.status).toBe(404);
  expect(snapshot(fixture.root)).toEqual(before);
});

test('Admin-only routes refuse every non-Admin without touching durable bytes', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const actions = ['purge', 'clear', 'deleteProject', 'setRemote', 'clone', 'registerProjects'];
  for (const name of ['alice', 'bob', 'carol', 'hank'] as const) {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => access.principalFor(person(name)),
    });
    const before = snapshot(fixture.root);
    for (const example of routeExamples) {
      const row = routeFor(example.method, example.path)?.row;
      if (!row || !actions.includes(row.action)) continue;
      const response = await handler(
        request(example.path.replace('missing', 'sales-contracts'), example.method, {
          confirm: true,
        }),
      );
      expect([403, 404]).toContain(response.status);
      expect(snapshot(fixture.root)).toEqual(before);
    }
  }
}, 30000);

test('an Editor can move a file when both projects are in its domain', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  // A file with nothing governed in it: a governed one is also judged by the content guards.
  const response = await handler(
    request('/api/projects/sales-contracts/move', 'POST', {
      path: 'sales.mapping.yaml',
      toProject: 'sales-metrics',
    }),
  );
  expect(response.status).toBe(200);
  const moved = await handler(
    request('/api/projects/sales-metrics/files/sales.mapping.yaml', 'GET'),
  );
  // The move happened in Alice's own working copy, so she reads the result there.
  expect((await moved.json()).source).toContain('Sales');
});

test('restore and undo authorize original paths and cross-project destinations', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person('alice')),
  });
  const hidden = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    'finance/revenue-recognition.odcs.yaml',
    undefined,
    LOCAL_READER,
  );
  const visible = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    'orders.odcs.yaml',
    person('alice').id,
    LOCAL_READER,
  );
  const before = snapshot(fixture.root);
  const undo = await handler(request(`/api/trash/${hidden.entryId}/undo`, 'POST'));
  expect(undo.status).toBe(404);
  const restore = await handler(
    request(`/api/trash/${visible.entryId}/restore`, 'POST', {
      toProject: 'hr-people',
      toPath: 'orders.odcs.yaml',
    }),
  );
  expect(restore.status).toBe(404);
  expect(snapshot(fixture.root)).toEqual(before);
});
