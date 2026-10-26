import { expect, test } from 'bun:test';
import { authWorkspace, fixtureFiles } from '../helpers/auth-workspace';
import { accessFixture, boundaryReader, person } from './access-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

test('Git rejects restricted paths even when they no longer exist', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => principal,
  });
  for (const action of ['show', 'diff', 'versions']) {
    for (const path of ['finance/revenue-recognition.odcs.yaml', 'finance/removed.yaml']) {
      const response = await handler(
        new Request(
          `http://localhost/api/projects/sales-contracts/git/${action}?path=${path}&commit=HEAD`,
        ),
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(path);
    }
  }
});

test('history counts hidden-only commits and lists only readable paths', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const view = access.view(principal);
  const path = 'finance/revenue-recognition.odcs.yaml';
  const current = fixture.ws.readFile('sales-contracts', path);
  await fixture.ws.saveFile(
    'sales-contracts',
    path,
    {
      baseHash: current.hash,
      source: current.source + '\n# LEAK-private-history\n',
    },
    LOCAL_READER,
  );
  await fixture.ws.scm.stage('sales-contracts', [path]);
  await fixture.ws.scm.commit('sales-contracts', 'LEAK-private-commit');
  const history = await fixture.ws.scm.log(
    'sales-contracts',
    undefined,
    50,
    boundaryReader(view, principal.id),
  );
  expect(history).toHaveProperty('hiddenCommits', 1);
  expect(JSON.stringify(history)).not.toContain('LEAK-private');
  expect(JSON.stringify(history)).not.toContain('finance/');
});

test('status and history use the deepest project owner in a shared repository', async () => {
  const { testWorkspace } = await import('../helpers/temp-data-dir');
  const { LOCAL_READER } = await import('../../src/server/projects/reader');
  using fixture = await testWorkspace();
  const source = fixtureFiles('sales-metrics').find(
    file => file.path === 'sales.semantic.yaml',
  )!.source;
  const path = 'nested/deep/model.yaml';
  const imported = await fixture.seed([{ path, source }], 'Repository');
  const root = fixture.ws.project(imported.slug);
  fixture.ws.state.writeRegistry([
    root,
    { ...root, slug: 'nested', folder: root.slug + '/nested', repo: root.slug },
    { ...root, slug: 'deep', folder: root.slug + '/nested/deep', repo: root.slug },
  ]);
  const file = fixture.ws.readFile(root.slug, path);
  await fixture.ws.saveFile(
    root.slug,
    path,
    {
      baseHash: file.hash,
      source: source + '# changed\n',
    },
    LOCAL_READER,
  );
  const status = await fixture.ws.scm.status(root.slug, LOCAL_READER);
  expect(status.changes).toHaveLength(1);
  expect(status.changes[0]).toMatchObject({ project: 'deep', projectPath: 'model.yaml' });
  const reader = boundaryReader(
    {
      readableProjects: new Set([root.slug, 'nested']),
      canRead: (project: string) => project !== 'deep',
      roles: () => [],
    },
    'reader',
  );
  expect((await fixture.ws.scm.status(root.slug, reader)).changes).toEqual([]);
  expect(await fixture.ws.scm.log(root.slug, undefined, 50, reader)).toEqual({
    commits: [],
    hiddenCommits: 1,
  });
});
