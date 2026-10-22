// Read coverage stays separate so write cases can extend the matrix independently.
import { LOCAL_READER } from '../../server/projects/reader';
import { describe, expect, test } from 'bun:test';
import { authWorkspace, AUTH_PROJECTS, fixtureFiles, leakMarker } from '../helpers/auth-workspace';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { accessFixture, person } from './access-fixture';
import { createAccessControl } from '../../server/auth/authorize';
import { createHandler } from '../../server/handler';

describe('read matrix', () => {
  test('listings and file reads contain only the requesting person’s documents', async () => {
    using fixture = await authWorkspace();
    const access = createAccessControl(accessFixture());
    for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const view = access.view(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        access,
        principal: () => principal,
      });
      const paths = ['/api/projects', '/api/documents', '/api/agent/catalog', '/api/suggestions'];
      for (const project of AUTH_PROJECTS) {
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

describe('read route inventory', () => {
  test('every read route rejects hidden targets and scans its response', async () => {
    const previewBody = {
      semanticPath: 'preview.semantic.yaml',
      metric: { name: 'new_metric', expression: 'COUNT(orders.order_id)' },
      extension: { type: 'simple', additivity: 'additive' },
    };
    const { readRouteExamples } = await import('./route-actions');
    const { routeFor } = await import('../../server/auth/route-actions');
    using fixture = await authWorkspace();
    const source = fixtureFiles('sales-metrics')
      .find(file => file.path === 'sales.semantic.yaml')!
      .source.replace(/LEAK-[^\n]+/g, '')
      .replaceAll('gross_revenue', 'preview_metric');
    for (const project of AUTH_PROJECTS) {
      await fixture.ws.saveFile(project, 'preview.semantic.yaml', { baseHash: null, source });
    }
    const access = createAccessControl(accessFixture());
    for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
      const principal = access.principalFor(person(name));
      const scope = access.forRequest(principal);
      const handler = createHandler(fixture.ws, {
        mode: 'server',
        access,
        principal: () => principal,
        publicOrigin: 'http://localhost',
      });
      for (const project of AUTH_PROJECTS) {
        for (const example of readRouteExamples) {
          let path = example.path
            .replace('/missing', '/' + project)
            .replace('example.yaml', fixtureFiles(project)[0].path);
          let requestBody = example.body;
          if (path.endsWith('/preview')) requestBody = previewBody;
          if (path.includes('/explain/')) {
            path = `/api/projects/${project}/files/preview.semantic.yaml/explain/preview_metric`;
          }
          if (path === '/api/agent/context')
            path += '?mappingId=sales-contracts/sales.mapping.yaml';
          if (path === '/api/agent/plan') {
            requestBody = {
              mappingId: 'sales-contracts/sales.mapping.yaml',
              metrics: ['gross_revenue'],
              dimensions: [],
            };
          }
          if (path.includes('/grouping')) {
            path = `/api/documents/${encodeURIComponent(project + '/' + fixtureFiles(project)[0].path)}/grouping`;
          }
          const url = new URL('http://localhost' + path);
          if (path.includes('/git/')) {
            url.searchParams.set('path', fixtureFiles(project)[0].path);
            url.searchParams.set('commit', 'HEAD');
          }
          const target = routeFor(example.method, url.pathname, 'server')!;
          const decision = scope.authorize(
            target.row.action,
            target.row.resource(target.match, url),
          );
          const response = await handler(
            new Request(url, {
              method: example.method,
              headers: { Origin: url.origin, 'X-SW-Request': '1' },
              ...(example.method === 'POST' ? { body: JSON.stringify(requestBody ?? {}) } : {}),
            }),
          );
          if (!principal.grants.length) expect(response.status).toBe(403);
          else if (!decision.allow) expect(response.status).toBe(decision.status);
          else {
            expect(
              response.status,
              `${name}: ${path}: ${response.status === 400 ? await response.clone().text() : ''}`,
            ).not.toBe(400);
            expect([200, 404]).toContain(response.status);
          }
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
            ...['show', 'diff', 'versions', 'log'].map(
              action =>
                [`/api/projects/${project}/git/${action}?${query}`, 200] as [string, number],
            ),
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
    access,
    principal: () => principal,
    publicOrigin: 'http://localhost',
  });
  const hidden = 'finance/revenue-recognition.odcs.yaml';
  const source = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source;
  const wrongHash = '0'.repeat(64);
  const requests: [string, unknown, number][] = [
    [
      '/api/projects/sales-contracts/save-batch',
      {
        files: [{ path: hidden, baseHash: wrongHash, source }],
      },
      409,
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
    ['/api/projects/sales-contracts/import', { files: [{ path: hidden, source }] }, 409],
    [
      '/api/projects/sales-contracts/move',
      {
        path: 'orders.odcs.yaml',
        toProject: 'sales-contracts',
        toPath: hidden,
      },
      409,
    ],
    [
      '/api/documents',
      {
        id: 'sales-contracts/' + hidden,
        filename: hidden.split('/').pop(),
        source,
        baseHash: wrongHash,
      },
      403,
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
