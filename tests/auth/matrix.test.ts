// Read coverage stays separate so write cases can extend the matrix independently.
import { randomBytes } from 'node:crypto';
import { createSessionStore } from '../../src/server/auth/sessions';
import { publishFixture } from '../helpers/published-workspace';
import { clientPrincipal } from '../../src/server/auth/principal';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { describe, expect, test } from 'bun:test';
import { authWorkspace, AUTH_PROJECTS, fixtureFiles, leakMarker } from '../helpers/auth-workspace';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { accessFixture, person } from './access-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { sh } from '../helpers/scm';
import {
  branchWithReclassification,
  moveCase,
  dataSnapshot,
  deleteCase,
  expectGuardRefusal,
  guardHandler,
  newProjectImport,
  restoreCase,
  sendCase,
  unprotectedContract,
  GUARDED_SAVES,
  guardedSaves,
  reclassified,
  remoteWithReclassification,
  revertCase,
  openCopyAs,
  publishCase,
  pullDefaultCase,
  readAs,
} from './guard-cases';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

describe('read matrix', () => {
  test('listings and file reads contain only the requesting person’s documents', async () => {
    using fixture = await authWorkspace();
    const access = createAccessControl(accessFixture());
    for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const view = access.view(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => principal,
      });
      const paths = ['/api/projects', '/api/documents', '/api/suggestions'];
      for (const project of AUTH_PROJECTS) {
        if (view.readableProjects.has(project)) paths.push(`/api/agent/catalog?project=${project}`);
        for (const file of fixtureFiles(project)) {
          paths.push(`/api/projects/${project}/files/${file.path}`);
        }
      }
      for (const path of paths) {
        const response = await handler(new Request('http://localhost' + path));
        if (!principal.grants.length) expect(response.status).toBe(403);
        else if (path.includes('/files/')) {
          const [, project, file] = path.match(/projects\/([^/]+)\/files\/(.+)/)!;
          expect(response.status).toBe(view.canRead(project, file) ? 200 : 404);
        } else expect(response.status).toBe(200);
        const body = await response.text();
        for (const project of AUTH_PROJECTS) {
          for (const file of fixtureFiles(project)) {
            if (!view.canRead(project, file.path)) {
              expect(body).not.toContain(leakMarker(project, file.path));
              expect(body).not.toContain(project + '/' + file.path);
              if (file.path.includes('/')) expect(body).not.toContain(file.path);
            }
          }
          if (!view.readableProjects.has(project)) expect(body).not.toContain(project);
        }
      }
    }
  }, 30000);
});

async function expectAllowedReadResponse(method: string, path: string, response: Response, name: TestUserName) {
  // Server folder previews refuse the operation after checking project visibility.
  if (method === 'GET' && /^\/api\/projects\/[^/]+\/git\/folder$/.test(path)) {
    expect(response.status).toBe(400);
    expect(await response.clone().json()).toEqual({
      error: 'Choosing a folder for an existing project works in local mode. Clone the folder instead.',
    });
    return;
  }
  // The project is checked first: a person who cannot read the project the example names is told
  // it is not found, exactly as for an unknown one.
  if ((path.startsWith('/api/agent/') || path.startsWith('/api/preview/')) && response.status === 400) {
    expect(await response.clone().json()).toEqual({ error: 'Project not found.' });
    return;
  }
  expect(response.status, `${name}: ${path}: ${response.status === 400 ? await response.clone().text() : ''}`).not.toBe(400);
  expect([200, 404]).toContain(response.status);
}

describe('read route inventory', () => {
  test('every read route rejects hidden targets and scans its response', async () => {
    const previewBody = {
      semanticPath: 'preview.semantic.yaml',
      metric: { name: 'new_metric', expression: 'COUNT(orders.order_id)' },
      extension: { type: 'simple', additivity: 'additive' },
    };
    const { readRouteExamples } = await import('./route-actions');
    const { routeFor } = await import('../../src/server/auth/route-actions');
    const { routeVerdict } = await import('../../src/server/auth/route-verdict');
    using fixture = await authWorkspace();
    const source = fixtureFiles('sales-metrics')
      .find(file => file.path === 'sales.semantic.yaml')!
      .source.replace(/LEAK-[^\n]+/g, '')
      .replaceAll('gross_revenue', 'preview_metric');
    for (const project of AUTH_PROJECTS) {
      await fixture.ws.saveFile(project, 'preview.semantic.yaml', { baseHash: null, source }, LOCAL_READER);
    }
    await publishFixture(fixture);
    const access = createAccessControl(accessFixture());
    for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const scope = access.forRequest(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => principal,
        publicOrigin: 'http://localhost',
      });
      for (const project of AUTH_PROJECTS) {
        for (const example of readRouteExamples) {
          let path = example.path.replace('/missing', '/' + project).replace('example.yaml', fixtureFiles(project)[0].path);
          let requestBody = example.body;
          if (path.endsWith('/preview')) requestBody = previewBody;
          if (path.includes('/explain/')) {
            path = `/api/projects/${project}/files/preview.semantic.yaml/explain/preview_metric`;
          }
          if (['/api/agent/catalog', '/api/preview/catalog'].includes(path)) {
            // A project the person cannot read answers like an unknown one, so ask for one they can.
            const readable = scope.view().readableProjects;
            const named = readable.has(project) ? project : ([...readable][0] ?? project);
            path += `?project=${named}`;
          }
          if (path.endsWith('/item-addresses/resolve')) requestBody = { address: `sw1:${project}/${fixtureFiles(project)[0].path}#ontology:O` };
          if (['/api/agent/context', '/api/preview/context'].includes(path)) path += '?project=sales-contracts&mappingId=sales-contracts/sales.mapping.yaml';
          if (['/api/agent/plan', '/api/preview/plan'].includes(path)) {
            requestBody = {
              project: 'sales-contracts',
              mappingId: 'sales-contracts/sales.mapping.yaml',
              metrics: ['gross_revenue'],
              dimensions: [],
            };
          }
          if (path.includes('/grouping')) {
            const documentId = project + '/' + fixtureFiles(project)[0].path;
            path = `/api/documents/${encodeURIComponent(documentId)}/grouping`;
          }
          const url = new URL('http://localhost' + path);
          if (path.includes('/git/')) {
            url.searchParams.set('path', fixtureFiles(project)[0].path);
            url.searchParams.set('commit', 'HEAD');
          }
          const target = routeFor(example.method, url.pathname, 'server')!;
          const resource = target.row.resource(target.match, url);
          const decision = routeVerdict(scope, target.row, 'server', { resource }).decision;
          const response = await handler(
            new Request(url, {
              method: example.method,
              headers: { Origin: url.origin, 'X-SW-Request': '1', Cookie: 'session=fixture' },
              ...(example.method === 'POST' ? { body: JSON.stringify(requestBody ?? {}) } : {}),
            }),
          );
          if (!principal.grants.length) expect(response.status).toBe(403);
          else if (!decision.allow) expect(response.status, `${name}: ${path}`).toBe(decision.status);
          else await expectAllowedReadResponse(example.method, path, response, name);
          if (path === '/api/events' && response.status === 200) {
            const stream = response.body!.getReader();
            const frame = new TextDecoder().decode((await stream.read()).value);
            expect(frame).toContain(': connected');
            expect(frame).not.toContain('LEAK-');
            await stream.cancel();
            continue;
          }
          const body = await response.text();
          for (const hidden of AUTH_PROJECTS) {
            if (!scope.view().readableProjects.has(hidden)) expect(body).not.toContain(hidden);
            for (const file of fixtureFiles(hidden)) {
              if (!scope.view().canRead(hidden, file.path)) {
                expect(body).not.toContain(leakMarker(hidden, file.path));
                expect(body).not.toContain(hidden + '/' + file.path);
                if (file.path.includes('/')) expect(body).not.toContain(file.path);
              }
            }
          }
        }
      }
    }
  }, 60000);
});

describe('read targets across all fixture paths', () => {
  test('file, draft, grouping, impact and history routes enforce the same readable set', async () => {
    using fixture = await authWorkspace();
    const access = createAccessControl(accessFixture());
    for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const view = access.view(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => principal,
      });
      for (const project of AUTH_PROJECTS) {
        const commits = await fixture.ws.scm.log(project, undefined, undefined, LOCAL_READER);
        if (!Array.isArray(commits)) throw Error('Local history must be an array.');
        const commit = commits[0].commit;
        for (const file of fixtureFiles(project)) {
          const query = new URLSearchParams({ path: file.path, commit });
          const id = encodeURIComponent(project + '/' + file.path);
          const targets: [string, number][] = [
            [`/api/projects/${project}/files/${file.path}`, 200],
            [`/api/drafts/${project}/${file.path}`, 404],
            [`/api/documents/${id}/grouping`, 200],
            [`/api/projects/${project}/delete-impact?${query}`, 200],
            ...['show', 'diff', 'versions', 'log'].map(action => [`/api/projects/${project}/git/${action}?${query}`, 200] as [string, number]),
          ];
          for (const [path, allowedStatus] of targets) {
            const response = await handler(new Request('http://localhost' + path));
            let expected = allowedStatus;
            if (!view.canRead(project, file.path)) expected = 404;
            if (!principal.grants.length) expected = 403;
            expect(response.status).toBe(expected);
            const body = await response.text();
            for (const hiddenProject of AUTH_PROJECTS) {
              for (const hiddenFile of fixtureFiles(hiddenProject)) {
                if (view.canRead(hiddenProject, hiddenFile.path)) continue;
                expect(body).not.toContain(leakMarker(hiddenProject, hiddenFile.path));
                expect(body).not.toContain(hiddenProject + '/' + hiddenFile.path);
                // Visible references may already contain the hidden file’s basename.
                if (hiddenFile.path.includes('/')) expect(body).not.toContain(hiddenFile.path);
              }
              if (!view.readableProjects.has(hiddenProject)) {
                expect(body).not.toContain(hiddenProject);
              }
            }
          }
        }
      }
    }
  }, 60000);
});

test('content-echoing writes conceal hidden paths and destination existence', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => principal,
    publicOrigin: 'http://localhost',
  });
  const hidden = 'finance/revenue-recognition.odcs.yaml';
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const wrongHash = '0'.repeat(64);
  // A hidden write target answers 404 like a missing one; a metric save meets the stale hash
  // while planning over readable files, before it names any target.
  const requests: [string, unknown, number][] = [
    [
      '/api/projects/sales-contracts/save-batch',
      {
        files: [{ path: hidden, baseHash: wrongHash, source }],
      },
      404,
    ],
    [
      '/api/projects/sales-contracts/kpis',
      {
        semanticPath: hidden,
        metric: { name: 'metric', expression: '1' },
        extension: { type: 'simple' },
        baseHashes: { [hidden]: wrongHash },
      },
      409,
    ],
    ['/api/projects/sales-contracts/import', { files: [{ path: hidden, source }] }, 404],
    [
      '/api/projects/sales-contracts/move',
      {
        path: 'orders.odcs.yaml',
        toProject: 'sales-contracts',
        toPath: hidden,
      },
      404,
    ],
    [
      '/api/documents',
      {
        id: 'sales-contracts/' + hidden,
        filename: hidden.split('/').pop(),
        source,
        baseHash: wrongHash,
      },
      404,
    ],
  ];
  async function post(path: string, body: unknown) {
    return handler(
      new Request('http://localhost' + path, {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
        body: JSON.stringify(body),
      }),
    );
  }
  for (const [path, input, status] of requests) {
    const response = await post(path, input);
    expect(response.status).toBe(status);
    const body = await response.text();
    expect(body).not.toContain('LEAK-');
    expect(body).not.toContain('currentSource');
    expect(body).not.toContain(hidden);
    expect(body).not.toContain('hr-people');
  }
  const destinations = [];
  for (const toProject of ['hr-people', 'missing-project']) {
    const response = await post('/api/projects/sales-contracts/move', {
      path: 'orders.odcs.yaml',
      toProject,
    });
    expect(response.status).toBe(404);
    destinations.push(await response.text());
  }
  expect(destinations[0]).toBe(destinations[1]);
});

describe('guard matrix', () => {
  test('an Editor is refused every guarded save as a whole; a Steward is not', async () => {
    for (const name of GUARDED_SAVES) {
      // Each path starts from the fixture, because the Steward's save changes the file.
      using fixture = await authWorkspace();
      const item = guardedSaves(fixture.ws).find(candidate => candidate.name === name)!;
      const before = dataSnapshot(fixture.root);
      await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice'), item), item, fixture.root);
      expect(dataSnapshot(fixture.root), item.name).toEqual(before);
      const allowed = await sendCase(guardHandler(fixture.ws, 'bob'), item);
      expect(allowed.status, `${item.name}: ${await allowed.clone().text()}`).toBe(200);
    }
  }, 60000);

  test('an approved metric edited by an Editor is stored as proposed and the response says so', async () => {
    using fixture = await authWorkspace();
    const file = fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml');
    const edited = file.source.replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'");
    const response = await sendCase(guardHandler(fixture.ws, 'alice'), {
      name: 'Source save',
      method: 'PUT',
      path: '/api/projects/sales-metrics/files/sales.semantic.yaml',
      body: { baseHash: file.hash, source: edited },
      guarded: { file: '', pointer: '', kind: '' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.demoted).toEqual([{ file: 'sales.semantic.yaml', pointer: '/metrics/0', metric: 'gross_revenue' }]);
    // The save went to Alice's own working copy, so she reads it there.
    const stored = (await readAs(fixture.ws, 'alice', 'sales-metrics', 'sales.semantic.yaml')).source;
    expect(stored).toBe(edited.replace('"status": "approved"', '"status": "proposed"'));
    expect(body.source).toBe(stored);
  });

  test('a revert that would undo a guarded change is refused before any file changes', async () => {
    using fixture = await authWorkspace();
    // Each person's working copy holds a classification change nobody committed, as one made
    // while the person was a Steward would be.
    const reclassifiedCopy = async (name: TestUserName) => {
      const copy = await openCopyAs(fixture.ws, name);
      const file = join(copy, 'orders.odcs.yaml');
      writeFileSync(file, reclassified(readFileSync(file, 'utf8')));
      return copy;
    };
    const item = revertCase(fixture.ws, await reclassifiedCopy('alice'));
    const before = dataSnapshot(fixture.root);
    const body = await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice'), item), item, fixture.root);
    expect(body.error).toContain('to revert this file');
    expect(dataSnapshot(fixture.root)).toEqual(before);
    const steward = guardHandler(fixture.ws, 'bob');
    const stewardsRevert = revertCase(fixture.ws, await reclassifiedCopy('bob'));
    expect((await sendCase(steward, stewardsRevert)).status).toBe(200);
  });

  test('a pull that would bring in a guarded change is refused before any file changes', async () => {
    using fixture = await authWorkspace();
    const remote = remoteWithReclassification(fixture.ws, fixture.root);
    try {
      await fixture.ws.scm.setRemote('sales-contracts', 'origin', remote.bare);
      const repository = join(fixture.root, 'projects', 'sales-contracts');
      const head = sh(repository, ['rev-parse', 'HEAD']);
      const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
      const refused = await sendCase(guardHandler(fixture.ws, 'alice'), remote.pull);
      const body = await expectGuardRefusal(refused, remote.pull, fixture.root);
      expect(body.error).toContain('to pull these changes');
      expect(sh(repository, ['rev-parse', 'HEAD'])).toBe(head);
      expect(fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source).toBe(source);
      // The pull ran in Alice's working copy, which stays as it was.
      const aliceCopy = await openCopyAs(fixture.ws, 'alice');
      expect(sh(aliceCopy, ['rev-parse', 'HEAD'])).toBe(head);
      const aliceReads = await readAs(fixture.ws, 'alice', 'sales-contracts', 'orders.odcs.yaml');
      expect(aliceReads.source).toBe(source);
      const pulled = await sendCase(guardHandler(fixture.ws, 'bob'), remote.pull);
      expect(pulled.status).toBe(200);
      expect((await pulled.json()).ok).toBe(true);
      const after = await readAs(fixture.ws, 'bob', 'sales-contracts', 'orders.odcs.yaml');
      expect(after.source).toBe(reclassified(source));
    } finally {
      remote.dispose();
    }
  });

  test('deleting a file with a protected property needs a Steward; the Editor is told who may', async () => {
    using fixture = await authWorkspace();
    const item = deleteCase();
    const before = dataSnapshot(fixture.root);
    const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
    const body = await expectGuardRefusal(refused, item, fixture.root);
    expect(body.error).toContain('to delete this file');
    expect(dataSnapshot(fixture.root)).toEqual(before);
    expect((await sendCase(guardHandler(fixture.ws, 'bob'), item)).status).toBe(200);
  });

  test('restoring from the trash is judged as creating the restored content', async () => {
    using fixture = await authWorkspace();
    const file = 'catalog.odcs.yaml';
    const source = unprotectedContract(fixture.ws);
    await fixture.ws.saveFile('sales-contracts', file, { baseHash: null, source }, LOCAL_READER);
    // Committed, so each person's working copy starts with the contract.
    const repository = join(fixture.root, 'projects', 'sales-contracts');
    const identity = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];
    sh(repository, ['add', file]);
    sh(repository, [...identity, 'commit', '-q', '-m', 'Add the catalog contract']);
    // Each person deletes it from their own copy; an entry from a copy is its owner's to restore.
    const deleteAs = async (handler: ReturnType<typeof guardHandler>) => {
      const deleted = await sendCase(handler, {
        ...deleteCase(),
        path: `/api/projects/sales-contracts/files/${file}`,
      });
      expect(deleted.status).toBe(200);
      return restoreCase((await deleted.json()).entryId, file);
    };
    const editor = guardHandler(fixture.ws, 'alice');
    const item = await deleteAs(editor);
    const before = dataSnapshot(fixture.root);
    const body = await expectGuardRefusal(await sendCase(editor, item), item, fixture.root);
    expect(body.error).toContain('to restore it');
    expect(dataSnapshot(fixture.root)).toEqual(before);
    const steward = guardHandler(fixture.ws, 'bob');
    const stewardsEntry = await deleteAs(steward);
    const restored = await sendCase(steward, {
      ...stewardsEntry,
      path: stewardsEntry.path.replace('/undo', '/restore'),
    });
    expect(restored.status).toBe(200);
    expect((await readAs(fixture.ws, 'bob', 'sales-contracts', file)).source).toBe(source);
  });

  test('an import that creates a project is judged as creating its files', async () => {
    using fixture = await authWorkspace();
    const own = newProjectImport(fixture.ws, 'bob@example.org');
    const before = dataSnapshot(fixture.root);
    const steward = guardHandler(fixture.ws, 'bob');
    const body = await expectGuardRefusal(await sendCase(steward, own), own, fixture.root);
    expect(body.error).toContain('nobody approves or deprecates a metric they own');
    expect(dataSnapshot(fixture.root)).toEqual(before);
    const others = newProjectImport(fixture.ws, 'carol@example.org');
    const created = await sendCase(steward, others);
    expect(created.status, await created.clone().text()).toBe(200);
  });

  test('a move between projects is judged as removing and creating the file', async () => {
    using fixture = await authWorkspace();
    const item = moveCase();
    const before = dataSnapshot(fixture.root);
    const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
    const body = await expectGuardRefusal(refused, item, fixture.root);
    expect(body.error).toContain('to move this file');
    expect(dataSnapshot(fixture.root)).toEqual(before);
    expect((await sendCase(guardHandler(fixture.ws, 'bob'), item)).status).toBe(200);
  });

  test('switching to a branch brings in its content, judged before the switch', async () => {
    using fixture = await authWorkspace();
    const item = branchWithReclassification(fixture.ws, fixture.root);
    const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
    const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
    const body = await expectGuardRefusal(refused, item, fixture.root);
    expect(body.error).toContain('to switch to this branch');
    // The switch ran in Alice's working copy, which stays on her branch with her files.
    const aliceCopy = await openCopyAs(fixture.ws, 'alice');
    const aliceBranch = sh(aliceCopy, ['branch', '--show-current']).trim();
    expect(aliceBranch.startsWith('work/')).toBe(true);
    const aliceReads = await readAs(fixture.ws, 'alice', 'sales-contracts', 'orders.odcs.yaml');
    expect(aliceReads.source).toBe(source);
    expect((await sendCase(guardHandler(fixture.ws, 'bob'), item)).status).toBe(200);
    const bobCopy = await openCopyAs(fixture.ws, 'bob');
    expect(sh(bobCopy, ['branch', '--show-current']).trim()).toBe('reclassify');
  });

  test('handing a metric to someone else does not let its committed owner approve it next', async () => {
    using fixture = await authWorkspace();
    const repository = join(fixture.root, 'projects', 'sales-metrics');
    const path = 'sales.semantic.yaml';
    const aliceOwns = '"owner": "alice@example.org", "status": "proposed"';
    const original = fixture.ws.readFile('sales-metrics', path);
    const bobOwns = original.source.replace(aliceOwns, '"owner": "bob@example.org", "status": "proposed"');
    await fixture.ws.saveFile('sales-metrics', path, { baseHash: original.hash, source: bobOwns }, LOCAL_READER);
    const identity = ['-c', 'user.name=Bob', '-c', 'user.email=bob@example.org'];
    sh(repository, [...identity, 'commit', '-q', '-am', 'Bob owns order count']);
    const steward = guardHandler(fixture.ws, 'bob');
    // Bob's saves go to his own working copy, so each starts from the file as he reads it.
    const bobReads = () => readAs(fixture.ws, 'bob', 'sales-metrics', path);
    const save = async (source: string) =>
      sendCase(steward, {
        name: 'Source save',
        method: 'PUT',
        path: `/api/projects/sales-metrics/files/${path}`,
        body: { baseHash: (await bobReads()).hash, source },
        guarded: { file: path, pointer: '/metrics/1', kind: 'metric-status' },
      });
    const handedOver = bobOwns.replace('"owner": "bob@example.org", "status": "proposed"', aliceOwns);
    expect((await save(handedOver)).status).toBe(200);
    const approved = handedOver.replace(aliceOwns, '"owner": "alice@example.org", "status": "approved"');
    const refused = await save(approved);
    const body = await refused.json();
    expect(refused.status).toBe(403);
    expect(body.error).toContain('nobody approves or deprecates a metric they own');
    expect((await bobReads()).source).toBe(handedOver);
  });

  test('pulling the default branch into a copy judges the exact commit before merging it', async () => {
    using fixture = await authWorkspace();
    const item = await pullDefaultCase({ ws: fixture.ws, root: fixture.root });
    const aliceCopy = await openCopyAs(fixture.ws, 'alice');
    const head = sh(aliceCopy, ['rev-parse', 'HEAD']);
    const before = dataSnapshot(fixture.root);
    const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
    const body = await expectGuardRefusal(refused, item, fixture.root);
    expect(body.error).toContain('to pull these changes');
    expect(sh(aliceCopy, ['rev-parse', 'HEAD'])).toBe(head);
    expect(dataSnapshot(fixture.root)).toEqual(before);
    // A Steward may bring the same commit into their own copy.
    const steward = guardHandler(fixture.ws, 'bob');
    await openCopyAs(fixture.ws, 'bob');
    const pulled = await sendCase(steward, item);
    expect(pulled.status).toBe(200);
    expect((await pulled.json()).ok).toBe(true);
    const bobReads = await readAs(fixture.ws, 'bob', 'sales-contracts', 'orders.odcs.yaml');
    expect(bobReads.source).toContain('classification: public');
  });

  test('publishing judges the copy’s commits as the publisher’s own changes', async () => {
    using fixture = await authWorkspace();
    const item = await publishCase({ ws: fixture.ws, root: fixture.root });
    const published = join(fixture.root, 'projects', 'sales-metrics');
    const head = sh(published, ['rev-parse', 'HEAD']);
    const before = dataSnapshot(fixture.root);
    const refused = await sendCase(guardHandler(fixture.ws, 'bob'), item);
    const body = await expectGuardRefusal(refused, item, fixture.root);
    expect(body.error).toContain('nobody approves or deprecates a metric they own');
    expect(sh(published, ['rev-parse', 'HEAD'])).toBe(head);
    expect(dataSnapshot(fixture.root)).toEqual(before);
  });
});

test('snapshot availability is reported only after project readability for every role', async () => {
  using fixture = await authWorkspace({ published: false });
  const access = createAccessControl(accessFixture());
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const principal = access.principalFor(person(name));
    const view = access.view(principal);
    const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, principal: () => principal, publicOrigin: 'http://localhost' });
    for (const operation of ['catalog', 'context', 'plan']) {
      const send = (project: string) =>
        handler(
          new Request(`http://localhost/api/agent/${operation}?project=${project}&mappingId=${project}/missing.yaml`, {
            method: operation === 'plan' ? 'POST' : 'GET',
            headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
            ...(operation === 'plan' ? { body: JSON.stringify({ project, mappingId: `${project}/missing.yaml`, metrics: [], dimensions: [] }) } : {}),
          }),
        );
      const unknown = await send('unknown');
      const unknownBody = await unknown.text();
      for (const project of AUTH_PROJECTS) {
        const response = await send(project);
        if (!principal.grants.length || !view.readableProjects.has(project)) {
          expect(response.status).toBe(unknown.status);
          expect(await response.text()).toBe(unknownBody);
        } else {
          expect(response.status).toBe(409);
          expect(await response.json()).toEqual({ error: 'no published snapshot', code: 'no-published-snapshot', reason: 'no-commit' });
        }
      }
    }
  }
}, 30000);

test('application grants retain the fixed four-route agent allowlist', async () => {
  const { ROUTE_ACTIONS } = await import('../../src/server/auth/route-actions');
  const { clientPrincipal } = await import('../../src/server/auth/principal');
  const allowed = ['GET /api/agent/projects', 'GET /api/agent/catalog', 'GET /api/agent/context', 'POST /api/agent/plan'];
  expect(
    ROUTE_ACTIONS.filter(row => row.clientAction)
      .map(row => row.path)
      .sort(),
  ).toEqual([...allowed].sort());
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, { mode: 'server', access, bearer: async () => clientPrincipal('sw-agent'), remoteCredentials: allowEveryRemote() });
  for (const route of allowed) {
    const [method, path] = route.split(' ');
    const project = 'sales-contracts';
    const mappingId = `${project}/sales.mapping.yaml`;
    const response = await handler(
      new Request(`http://localhost${path}?project=${project}&mappingId=${mappingId}`, {
        method,
        headers: { Authorization: 'Bearer fixture' },
        ...(method === 'POST' ? { body: JSON.stringify({ project, mappingId, metrics: ['gross_revenue'], dimensions: [] }) } : {}),
      }),
    );
    expect(response.status, `${route}: ${await response.clone().text()}`).toBe(200);
  }
  for (const path of ['/api/projects', '/api/documents', '/api/projects/sales-contracts/metrics', '/api/preview/catalog', '/api/agent/unknown']) {
    const response = await handler(new Request('http://localhost' + path, { headers: { Authorization: 'Bearer fixture' } }));
    expect(response.status).toBe(path.startsWith('/api/agent/') ? 404 : 401);
  }
});

test('preview routes admit session and marked local browsers while other surfaces answer as unknown routes', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const sessions = createSessionStore({ dir: join(fixture.root, 'preview-sessions'), key: randomBytes(32) });
  const session = await sessions.create({ principal, tokens: { accessToken: 'fixture', expiresAt: Date.now() + 60_000 } });
  const server = createHandler(fixture.ws, {
    mode: 'server',
    authentication: {
      sessions,
      session: async request => (request.headers.get('Cookie') === 'session=fixture' ? session : null),
      login: async () => new Response(null, { status: 302 }),
      callback: async () => new Response(null, { status: 302 }),
      logout: async () => new Response(null, { status: 303 }),
      frontChannelLogout: async () => new Response(null, { status: 200 }),
    },
    access,
    principal: () => principal,
    bearer: async () => clientPrincipal('sw-agent'),
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost:5173',
  });
  const local = createHandler(fixture.ws);
  for (const handler of [server, local]) {
    for (const operation of ['catalog', 'context', 'plan']) {
      const path = operation === 'plan' ? '/api/preview/plan' : `/api/preview/${operation}?project=sales-contracts&mappingId=sales-contracts/sales.mapping.yaml`;
      const options = {
        method: operation === 'plan' ? 'POST' : 'GET',
        ...(operation === 'plan' ? { body: JSON.stringify({ project: 'sales-contracts', mappingId: 'sales-contracts/sales.mapping.yaml', metrics: ['gross_revenue'], dimensions: [] }) } : {}),
      };
      const browser = await handler(
        new Request('http://localhost:5173' + path, { ...options, headers: { Cookie: 'session=fixture', Origin: 'http://localhost:5173', 'X-SW-Request': '1', 'Sec-Fetch-Site': 'same-origin' } }),
      );
      expect(browser.status).toBe(200);
      expect(browser.headers.has('X-Workbench-Snapshot')).toBe(false);
      const headers = { Origin: 'http://localhost:5173', 'X-SW-Request': '1', ...(handler === server ? { Authorization: 'Bearer fixture' } : {}) };
      const refused = await handler(new Request('http://localhost:5173' + path, { ...options, headers }));
      const unknown = await handler(new Request('http://localhost:5173/api/unknown-preview', { ...options, headers }));
      expect(refused.status).toBe(unknown.status);
      expect(await refused.text()).toBe(await unknown.text());
    }
  }
});

test('history source matrix never reveals a foreign personal commit by its id', async () => {
  using fixture = await authWorkspace();
  const project = 'sales-contracts';
  const path = 'sales.mapping.yaml';
  const base = join(fixture.ws.layout.projects, project);
  const foreignCopy = join(fixture.ws.layout.worktrees, 'u' + 'f'.repeat(20), project);
  await fixture.ws.git.run(base, ['worktree', 'add', '-q', '-b', 'work/foreign', foreignCopy, 'main']);
  const marker = 'private foreign history payload';
  writeFileSync(join(foreignCopy, path), readFileSync(join(foreignCopy, path), 'utf8') + `\n# ${marker}\n`);
  await fixture.ws.git.run(foreignCopy, ['commit', '-qam', 'Foreign personal change']);
  const foreign = (await fixture.ws.git.head(foreignCopy))!;
  const access = createAccessControl(accessFixture());
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const principal = access.principalFor(person(name));
    const handler = createHandler(fixture.ws, { mode: 'server', access, principal: () => principal, remoteCredentials: allowEveryRemote() });
    for (const operation of ['show', 'versions']) {
      const read = (commit: string) => handler(new Request(`http://localhost/api/projects/${project}/git/${operation}?path=${path}&commit=${commit}`, { headers: { Cookie: 'session=fixture' } }));
      const response = await read(foreign);
      const missing = await read('0'.repeat(40));
      expect(response.status).toBe(missing.status);
      const text = await response.text();
      expect(text).toBe(await missing.text());
      expect(text).not.toContain(marker);
      if (response.status === 200 && operation === 'show') expect(JSON.parse(text)).toEqual({ source: '', exists: false });
    }
  }
});
