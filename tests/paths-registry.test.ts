// Tests resolving project and repository folders from registry entries.
import { test, expect } from 'bun:test';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dataLayout, locationOf, projectDir, repoDir, projectPrefix, PathError } from '../src/server/projects/paths';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok } from './helpers/scm';
// Project and repository folders come from the registry. Entries without `folder` or `repo` use
// the slug for both.
test('legacy entries default to folder = repo = slug', () => {
  expect(locationOf({ slug: 'shop' })).toEqual({ folder: 'shop', repo: 'shop' });
  const layout = dataLayout('/tmp/x');
  expect(projectDir(layout, 'shop')).toBe(join(layout.projects, 'shop'));
  expect(repoDir(layout, 'shop')).toBe(join(layout.projects, 'shop'));
  expect(projectPrefix(layout, 'shop')).toBe('');
});
test('subfolder entries resolve inside their repository; invalid ones are refused', () => {
  expect(locationOf({ slug: 'sales', folder: 'team/domains/sales', repo: 'team' })).toEqual({
    folder: 'team/domains/sales',
    repo: 'team',
  });
  expect(locationOf({ slug: 'team', folder: 'team', repo: 'team' })).toEqual({
    folder: 'team',
    repo: 'team',
  });
  for (const bad of [
    { folder: 'team/../other', repo: 'team' },
    { folder: 'other/x', repo: 'team' },
    { folder: 'team/.git/x', repo: 'team' },
    { folder: '/abs', repo: 'team' },
    { folder: 'teamx/a', repo: 'team' },
  ])
    expect(() => locationOf({ slug: 's', ...bad })).toThrow(PathError);
  const layout = {
    ...dataLayout('/tmp/x'),
    locate: (slug: string) => (slug === 'sales' ? { folder: 'team/domains/sales', repo: 'team' } : undefined),
  };
  expect(projectDir(layout, 'sales')).toBe(join(layout.projects, 'team/domains/sales'));
  expect(repoDir(layout, 'sales')).toBe(join(layout.projects, 'team'));
  expect(projectPrefix(layout, 'sales')).toBe('domains/sales/');
  expect(projectDir(layout, 'other')).toBe(join(layout.projects, 'other'));
  expect(() => projectDir(layout, '../x')).toThrow(PathError);
});
test('a legacy registry file loads unchanged and its projects keep working', async () => {
  const workspace = await testWorkspace();
  try {
    const created = await ok(
      call(workspace, 'POST', '/api/import', {
        files: [
          {
            path: 'shop.yaml',
            source: 'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n',
          },
        ],
      }),
    );
    const before = readFileSync(workspace.ws.layout.registry, 'utf8');
    expect(JSON.parse(before).projects[0]).not.toHaveProperty('folder');
    expect(workspace.ws.layout.locate!(created.slug)).toEqual({
      folder: created.slug,
      repo: created.slug,
    });
    const file = await ok(call(workspace, 'GET', `/api/projects/${created.slug}/files/shop.yaml`));
    expect(file.source).toContain('Customer');
    const status = await ok(call(workspace, 'GET', `/api/projects/${created.slug}/git/status`));
    expect(status.branch).toBe('main');
    expect(readFileSync(workspace.ws.layout.registry, 'utf8')).toBe(before);
  } finally {
    workspace.dispose();
  }
});
test('the workspace resolves a registered subfolder project through the registry', async () => {
  const workspace = await testWorkspace();
  try {
    const repo = join(workspace.ws.layout.projects, 'team');
    const sub = join(repo, 'domains', 'sales');
    mkdirSync(sub, { recursive: true });
    await workspace.ws.git.init(repo);
    writeFileSync(join(sub, 'sales.yaml'), 'name: Sales\nontology:\n  - concept: Customer\n    type: EntityType\n');
    workspace.ws.state.writeRegistry([
      {
        slug: 'sales',
        name: 'Sales',
        createdAt: new Date(0).toISOString(),
        origin: 'clone',
        folder: 'team/domains/sales',
        repo: 'team',
      },
    ]);
    expect(projectDir(workspace.ws.layout, 'sales')).toBe(sub);
    expect(repoDir(workspace.ws.layout, 'sales')).toBe(repo);
    const file = workspace.ws.readFile('sales', 'sales.yaml');
    expect(file.source).toContain('Sales');
    expect(existsSync(join(workspace.ws.layout.projects, 'sales'))).toBe(false);
  } finally {
    workspace.dispose();
  }
});
