// A project that starts in its own repository can move into a folder of a team repository, and a
// project in a folder can change folder. Both are previewed first and never rewrite history.
import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_READER } from '../src/server/projects/reader';
import { plannedMoves } from '../src/server/projects/project-folder';
import { bareRepository } from './helpers/git-fixtures';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
import { OTHER_FOLDER, PROJECT_FOLDER, cloneFolder, cloneOutcome, teamRepository } from './helpers/sparse-fixtures';

test('the planned moves put every file under the folder', () => {
  expect(plannedMoves(['a.yaml', 'sub/b.yaml'], 'semantic/ubl')).toEqual([
    { from: 'a.yaml', to: 'semantic/ubl/a.yaml' },
    { from: 'sub/b.yaml', to: 'semantic/ubl/sub/b.yaml' },
  ]);
});

test('a preview lists which files move where and changes nothing', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    const shown = await ok(call(fixture.t, 'GET', `${fixture.base}/git/folder?folder=semantic%2Fubl`));
    expect(shown).toMatchObject({
      kind: 'move',
      current: '',
      folder: 'semantic/ubl',
      moveCount: 1,
      moves: [{ from: 'shop.yaml', to: 'semantic/ubl/shop.yaml' }],
    });
    expect(existsSync(join(fixture.dir, 'shop.yaml'))).toBe(true);
    const refused = await call(fixture.t, 'GET', `${fixture.base}/git/folder?folder=..%2Fx`);
    expect(refused.status).toBe(400);
  } finally {
    fixture.dispose();
  }
});

test('confirming moves the files under the folder in a new commit and keeps the history', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    const firstCommit = sh(fixture.dir, ['rev-parse', 'HEAD']).trim();
    writeFileSync(join(fixture.dir, 'notes.txt'), 'Not committed yet.\n');
    const applied = await ok(call(fixture.t, 'PUT', `${fixture.base}/git/folder`, { folder: 'semantic/ubl' }));
    expect(applied).toMatchObject({ kind: 'move', moveCount: 2 });

    expect(readdirSync(fixture.dir).filter(name => name !== '.git')).toEqual(['semantic']);
    expect(readFileSync(join(fixture.dir, 'semantic/ubl/shop.yaml'), 'utf8')).toContain('Buys.');
    expect(existsSync(join(fixture.dir, 'semantic/ubl/notes.txt'))).toBe(true);
    // The old commit is still the root of the history, and one new commit records the move.
    expect(sh(fixture.dir, ['rev-list', '--max-parents=0', 'HEAD']).trim()).toBe(firstCommit);
    expect(sh(fixture.dir, ['log', '--format=%s', '-1']).trim()).toBe('Move the project into semantic/ubl');
    expect(sh(fixture.dir, ['show', '--name-status', '--format=', 'HEAD']).trim()).toMatch(/^R\d*\s+shop\.yaml\s+semantic\/ubl\/shop\.yaml$/m);
    expect(sh(fixture.dir, ['status', '--porcelain']).trim()).toBe('?? semantic/ubl/notes.txt');
    expect(sh(fixture.dir, ['sparse-checkout', 'list']).trim()).toBe('semantic/ubl');

    const entry = fixture.t.ws.state.registry().projects.find(p => p.slug === fixture.slug);
    expect(entry).toMatchObject({ folder: `${fixture.slug}/semantic/ubl`, repo: fixture.slug });
    const listed = (await ok(call(fixture.t, 'GET', '/api/projects'))).find((project: any) => project.slug === fixture.slug);
    expect(listed.files.map((file: any) => file.path)).toEqual(['shop.yaml']);
    const status = await ok(call(fixture.t, 'GET', `${fixture.base}/git/status`));
    expect(status).toMatchObject({ folder: 'semantic/ubl' });
  } finally {
    fixture.dispose();
  }
});

test('a move waits for uncommitted changes and unsaved edits', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    writeFileSync(join(fixture.dir, 'shop.yaml'), ontology('Edited, not committed.'));
    const blocked = await call(fixture.t, 'PUT', `${fixture.base}/git/folder`, {
      folder: 'semantic/ubl',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('dirty');
    expect(existsSync(join(fixture.dir, 'shop.yaml'))).toBe(true);
    const shown = await ok(call(fixture.t, 'GET', `${fixture.base}/git/folder?folder=semantic%2Fubl`));
    expect(shown.blocked).toMatchObject({ reason: 'dirty', paths: ['shop.yaml'] });
  } finally {
    fixture.dispose();
  }
});

test('a moved project joins a team repository: its first pull merges, its push adds one folder', async () => {
  const team = teamRepository();
  const fixture = await scmProject({ remote: false });
  try {
    await ok(call(fixture.t, 'PUT', `${fixture.base}/git/folder`, { folder: 'semantic/shop' }));
    await ok(call(fixture.t, 'PUT', `${fixture.base}/git/remote`, { name: 'origin', url: team.address }));
    const pulled = await ok(call(fixture.t, 'POST', `${fixture.base}/git/pull`));
    expect(pulled.ok).toBe(true);
    // The team's folders are in the history but not on the disk.
    expect(existsSync(join(fixture.dir, OTHER_FOLDER))).toBe(false);
    expect(existsSync(join(fixture.dir, PROJECT_FOLDER))).toBe(false);
    const pushed = await ok(call(fixture.t, 'POST', `${fixture.base}/git/push`));
    expect(pushed.ok).toBe(true);
    const tree = sh(team.bare, ['ls-tree', '-r', '--name-only', 'main']).split('\n').filter(Boolean);
    expect(tree).toEqual(expect.arrayContaining(['README.md', `${PROJECT_FOLDER}/shop.yaml`, `${OTHER_FOLDER}/crm.yaml`, 'semantic/shop/shop.yaml']));
  } finally {
    fixture.dispose();
    team.dispose();
  }
});

test('changing the folder of a sparse project previews, then checks out the other folder', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    const base = `/api/projects/${cloned.slug}/git/folder`;
    const shown = await ok(call(app, 'GET', `${base}?folder=${encodeURIComponent(OTHER_FOLDER)}`));
    expect(shown).toMatchObject({ kind: 'change', current: PROJECT_FOLDER, existsOnBranch: true });
    expect(existsSync(join(cloned.project, 'shop.yaml'))).toBe(true);

    await ok(call(app, 'PUT', base, { folder: OTHER_FOLDER }));
    expect(existsSync(join(cloned.repository, OTHER_FOLDER, 'crm.yaml'))).toBe(true);
    expect(existsSync(join(cloned.repository, PROJECT_FOLDER))).toBe(false);
    expect(sh(cloned.repository, ['sparse-checkout', 'list']).trim()).toBe(OTHER_FOLDER);
    const status = await ok(call(app, 'GET', `/api/projects/${cloned.slug}/git/status`));
    expect(status.folder).toBe(OTHER_FOLDER);

    const missing = await call(app, 'PUT', base, { folder: 'semantic/fresh' });
    expect(missing.status).toBe(409);
    expect(missing.body.missingFolder).toBe('semantic/fresh');
    await ok(call(app, 'PUT', base, { folder: 'semantic/fresh', createFolder: true }));
    expect(existsSync(join(cloned.repository, 'semantic/fresh'))).toBe(true);
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('an interrupted move is completed on the next start, leaving the move to commit', async () => {
  const crash = { on: false };
  const t = await testWorkspace({
    journalHooks: {
      crashAfter: (kind: string, step: number) => crash.on && kind === 'project-folder' && step === 0,
    },
  });
  const root = t.root;
  const created = await ok(call(t, 'POST', '/api/import', { files: [{ path: 'shop.yaml', source: ontology('Buys.') }] }));
  const dir = join(root, 'projects', created.slug);
  crash.on = true;
  const interrupted = await call(t, 'PUT', `/api/projects/${created.slug}/git/folder`, {
    folder: 'semantic/ubl',
  });
  expect(interrupted.status).not.toBe(200);
  t.ws.close();
  const again = await testWorkspace({ root });
  try {
    expect(again.ws.recovery.map(entry => [entry.kind, entry.outcome])).toEqual([['project-folder', 'completed']]);
    expect(readFileSync(join(dir, 'semantic/ubl/shop.yaml'), 'utf8')).toContain('Buys.');
    expect(existsSync(join(dir, 'shop.yaml'))).toBe(false);
    const entry = again.ws.state.registry().projects.find(project => project.slug === created.slug);
    expect(entry).toMatchObject({ folder: `${created.slug}/semantic/ubl`, repo: created.slug });
    const status = await ok(call(again, 'GET', `/api/projects/${created.slug}/git/status`));
    expect(status.changes.map((change: any) => change.repoPath).sort()).toEqual(['semantic/ubl/shop.yaml', 'shop.yaml']);
    // Confirming again records the move and limits the checkout, as the first try would have.
    const finish = await ok(call(again, 'PUT', `/api/projects/${created.slug}/git/folder`, { folder: 'semantic/ubl' }));
    expect(finish.kind).toBe('finish');
    expect(sh(dir, ['log', '--format=%s', '-1']).trim()).toBe('Move the project into semantic/ubl');
    expect(sh(dir, ['status', '--porcelain']).trim()).toBe('');
    expect(sh(dir, ['sparse-checkout', 'list']).trim()).toBe('semantic/ubl');
    const done = await ok(call(again, 'GET', `/api/projects/${created.slug}/git/folder?folder=semantic%2Fubl`));
    expect(done.kind).toBe('none');
  } finally {
    again.dispose();
  }
});

test('a move that fails to commit is finished by confirming again', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    const hook = join(fixture.dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const failed = await call(fixture.t, 'PUT', `${fixture.base}/git/folder`, {
      folder: 'semantic/ubl',
    });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(existsSync(join(fixture.dir, 'semantic/ubl/shop.yaml'))).toBe(true);
    rmSync(hook);
    const again = await ok(call(fixture.t, 'PUT', `${fixture.base}/git/folder`, { folder: 'semantic/ubl' }));
    expect(again.kind).toBe('finish');
    expect(sh(fixture.dir, ['log', '--format=%s', '-1']).trim()).toBe('Move the project into semantic/ubl');
    expect(sh(fixture.dir, ['sparse-checkout', 'list']).trim()).toBe('semantic/ubl');
  } finally {
    fixture.dispose();
  }
});

test('a folder named like an existing top-level folder keeps every file', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    mkdirSync(join(fixture.dir, 'semantic'));
    writeFileSync(join(fixture.dir, 'semantic/inner.yaml'), ontology('Inner.'));
    sh(fixture.dir, ['add', '-A']);
    sh(fixture.dir, ['commit', '-qm', 'Add a semantic folder']);
    await ok(call(fixture.t, 'PUT', `${fixture.base}/git/folder`, { folder: 'semantic/ubl' }));
    expect(existsSync(join(fixture.dir, 'semantic/ubl/shop.yaml'))).toBe(true);
    expect(existsSync(join(fixture.dir, 'semantic/ubl/semantic/inner.yaml'))).toBe(true);
    expect(readdirSync(fixture.dir).filter(name => name !== '.git')).toEqual(['semantic']);
    expect(sh(fixture.dir, ['status', '--porcelain']).trim()).toBe('');
  } finally {
    fixture.dispose();
  }
});

test('leaving a folder waits for the untracked files in it', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    writeFileSync(join(cloned.project, 'scratch.yaml'), ontology('Scratch.'));
    const base = `/api/projects/${cloned.slug}/git/folder`;
    const blocked = await call(app, 'PUT', base, { folder: OTHER_FOLDER });
    expect(blocked.status).toBe(409);
    expect(blocked.body.paths).toEqual([`${PROJECT_FOLDER}/scratch.yaml`]);
    expect(existsSync(join(cloned.project, 'scratch.yaml'))).toBe(true);
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('a pull from an unrelated repository is refused once the project holds the team folders', async () => {
  const team = teamRepository();
  const stranger = bareRepository('monorepo');
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    const base = `/api/projects/${cloned.slug}`;
    await ok(call(app, 'PUT', base + '/git/remote', { name: 'origin', url: stranger.bare }));
    const pulled = await ok(call(app, 'POST', base + '/git/pull'));
    expect(pulled.ok).toBe(false);
    expect(pulled.stderr).toContain('unrelated histories');
  } finally {
    app.dispose();
    team.dispose();
    stranger.dispose();
  }
});

test('server mode and shared repositories refuse a folder change with a reason', async () => {
  const fixture = await scmProject({ remote: false });
  try {
    const monorepo = bareRepository('monorepo');
    const started = fixture.t.ws.clone(monorepo.bare, undefined, LOCAL_READER);
    await cloneOutcome(fixture.t, started.op);
    const sales = fixture.t.ws.state.registry().projects.find(project => project.name === 'Sales')!;
    const shared = await call(fixture.t, 'GET', `/api/projects/${sales.slug}/git/folder?folder=other%2Ffolder`);
    expect(shared.status).toBe(400);
    expect(shared.body.error).toContain('shares its repository');
    monorepo.dispose();
  } finally {
    fixture.dispose();
  }
});
