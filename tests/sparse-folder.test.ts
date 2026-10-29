// A project that lives in one folder of a team repository: clone, edit, commit, push and pull
// touch only that folder, and the rest of the repository never reaches the disk. The remote is a
// local bare repository, so no test needs a network.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRepositoryFolder } from '../src/shared/scm/repository-folder';
import { createGit } from '../src/server/projects/git';
import { conePathspecs, fetchMissingContents, sparseSetArguments } from '../src/server/projects/sparse-folder';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok, ontology, sh } from './helpers/scm';
import { OTHER_FOLDER, PROJECT_FOLDER, cloneFolder, teamRepository } from './helpers/sparse-fixtures';

const GOOD_FOLDERS: [string, string][] = [
  ['semantic/ubl', 'semantic/ubl'],
  ['  semantic/ubl/  ', 'semantic/ubl'],
  ['ubl', 'ubl'],
  ['', ''],
  ['a b/c-d_e.f', 'a b/c-d_e.f'],
];
const BAD_FOLDERS = ['../outside', 'a/../b', 'a/./b', '/absolute', 'C:/windows', 'a//b', 'a\\b', '.git', 'a/.GIT/b', './a', '-option', 'a/*', 'a/[b]', 'a\nb', 'x'.repeat(501)];

test('a folder is relative, normalised and free of traversal, or it is refused', () => {
  for (const [typed, folder] of GOOD_FOLDERS) expect(checkRepositoryFolder(typed), typed).toEqual({ ok: true, folder });
  for (const typed of BAD_FOLDERS) expect(checkRepositoryFolder(typed), JSON.stringify(typed)).toMatchObject({ ok: false });
  expect(checkRepositoryFolder(42)).toMatchObject({ ok: false });
});

test('the server refuses a bad folder before it clones anything', async () => {
  const app = await testWorkspace();
  try {
    for (const folder of ['../x', '/etc', 'a/../../b']) expect((await call(app, 'POST', '/api/clone', { url: '/tmp/x.git', folder })).status).toBe(400);
  } finally {
    app.dispose();
  }
});

test('a clone into a folder checks out only that folder and makes it the project root', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    expect(cloned.done).toMatchObject({ phase: 'done', repo: cloned.slug });
    expect(cloned.name).toBe('ubl');
    expect(existsSync(join(cloned.project, 'shop.yaml'))).toBe(true);
    expect(existsSync(join(cloned.repository, OTHER_FOLDER))).toBe(false);
    expect(sh(cloned.repository, ['sparse-checkout', 'list']).trim()).toBe(PROJECT_FOLDER);
    expect(sh(cloned.repository, ['config', '--get', 'extensions.worktreeConfig']).trim()).toBe('true');
    expect(sh(cloned.repository, ['config', '--get', 'remote.origin.partialclonefilter']).trim()).toBe('blob:none');
    const entry = app.ws.state.registry().projects.find(project => project.slug === cloned.slug);
    expect(entry).toMatchObject({
      folder: `${cloned.slug}/${PROJECT_FOLDER}`,
      repo: cloned.slug,
    });
    const listed = (await ok(call(app, 'GET', '/api/projects'))).find((project: any) => project.slug === cloned.slug);
    expect(listed.files.map((file: any) => file.path)).toEqual(['shop.yaml']);
    const status = await ok(call(app, 'GET', `/api/projects/${cloned.slug}/git/status`));
    expect(status).toMatchObject({ branch: 'main', folder: PROJECT_FOLDER, changes: [] });
    expect(status.remotes).toEqual({ origin: team.address });
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('edits commit and push inside the folder and leave the other folders untouched', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    const otherBefore = sh(team.bare, ['rev-parse', `main:${OTHER_FOLDER}`]).trim();
    writeFileSync(join(cloned.project, 'shop.yaml'), ontology('Changed.'));
    writeFileSync(join(cloned.project, 'extra.yaml'), ontology('Added.'));
    const base = `/api/projects/${cloned.slug}`;
    const committed = await ok(
      call(app, 'POST', base + '/git/commit', {
        message: 'Edit the shop',
        paths: ['shop.yaml', 'extra.yaml'],
        push: true,
      }),
    );
    expect(committed.pushed).toMatchObject({ ok: true });
    const changed = sh(team.bare, ['show', '--name-only', '--format=', 'main']).split('\n').filter(Boolean);
    expect(changed.sort()).toEqual([`${PROJECT_FOLDER}/extra.yaml`, `${PROJECT_FOLDER}/shop.yaml`]);
    expect(sh(team.bare, ['rev-parse', `main:${OTHER_FOLDER}`]).trim()).toBe(otherBefore);
    expect(sh(team.bare, ['show', `main:${PROJECT_FOLDER}/shop.yaml`])).toBe(ontology('Changed.'));
    const status = await ok(call(app, 'GET', base + '/git/status'));
    expect(status).toMatchObject({ ahead: 0, behind: 0, changes: [] });
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('a commit never takes a path outside the folder', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    writeFileSync(join(cloned.repository, 'README.md'), 'Changed at the root.\n');
    const base = `/api/projects/${cloned.slug}`;
    const refused = await call(app, 'POST', base + '/git/commit', {
      message: 'Edit the readme',
      repoPaths: ['README.md'],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain(PROJECT_FOLDER);
    const stagedAll = await call(app, 'POST', base + '/git/stage', { all: true });
    expect(stagedAll.status).toBe(200);
    expect(sh(cloned.repository, ['diff', '--cached', '--name-only']).trim()).toBe('');
    expect(sh(cloned.repository, ['log', '--format=%s', '-1']).trim()).toBe('Team files');
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('a pull brings others changes inside the folder and keeps the rest off the disk', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    team.push(
      {
        [`${PROJECT_FOLDER}/shop.yaml`]: ontology('Edited by a colleague.'),
        [`${OTHER_FOLDER}/crm.yaml`]: ontology('Edited elsewhere.'),
        'semantic/new/added.yaml': ontology('Brand new folder.'),
      },
      'Colleague edits',
    );
    const base = `/api/projects/${cloned.slug}`;
    const pulled = await ok(call(app, 'POST', base + '/git/pull'));
    expect(pulled).toMatchObject({ ok: true, behind: 0 });
    expect(readFileSync(join(cloned.project, 'shop.yaml'), 'utf8')).toBe(ontology('Edited by a colleague.'));
    expect(existsSync(join(cloned.repository, OTHER_FOLDER))).toBe(false);
    expect(existsSync(join(cloned.repository, 'semantic/new'))).toBe(false);
    const head = sh(cloned.repository, ['rev-parse', 'HEAD']).trim();
    expect(sh(cloned.repository, ['show', `${head}:${OTHER_FOLDER}/crm.yaml`])).toBe(ontology('Edited elsewhere.'));
    const status = await ok(call(app, 'GET', base + '/git/status'));
    expect(status.changes).toEqual([]);
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('switching to another branch keeps the folder, and a branch without it is refused', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    team.push({ [`${PROJECT_FOLDER}/shop.yaml`]: ontology('On a feature.') }, 'Feature', 'feature');
    team.push({ [`${PROJECT_FOLDER}/shop.yaml`]: null }, 'Remove the folder', 'no-folder');
    const base = `/api/projects/${cloned.slug}`;
    await ok(call(app, 'POST', base + '/git/fetch'));
    const switched = await ok(call(app, 'POST', base + '/git/switch', { branch: 'origin/feature' }));
    expect(switched.branch).toBe('feature');
    expect(readFileSync(join(cloned.project, 'shop.yaml'), 'utf8')).toBe(ontology('On a feature.'));
    expect(existsSync(join(cloned.repository, OTHER_FOLDER))).toBe(false);
    const refused = await call(app, 'POST', base + '/git/switch', { branch: 'origin/no-folder' });
    expect(refused.status).toBe(409);
    expect(refused.body.missingFolder).toBe(PROJECT_FOLDER);
    await ok(call(app, 'POST', base + '/git/switch', { branch: 'main' }));
    expect(readFileSync(join(cloned.project, 'shop.yaml'), 'utf8')).toBe(ontology('Buys.'));
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('a folder the remote branch lacks is reported, and the first push can create it', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const missing = 'semantic/fresh';
    const refused = await cloneFolder(app, team, missing);
    expect(refused.done).toMatchObject({ phase: 'failed', missingFolder: missing });
    expect(refused.done.message).toContain('does not exist on the remote branch');
    expect(existsSync(refused.repository)).toBe(false);

    const created = await cloneFolder(app, team, missing, true);
    expect(created.done).toMatchObject({ phase: 'done' });
    expect(existsSync(created.project)).toBe(true);
    writeFileSync(join(created.project, 'fresh.yaml'), ontology('First file.'));
    const base = `/api/projects/${created.slug}`;
    const committed = await ok(
      call(app, 'POST', base + '/git/commit', {
        message: 'Start the folder',
        paths: ['fresh.yaml'],
        push: true,
      }),
    );
    expect(committed.pushed).toMatchObject({ ok: true });
    expect(sh(team.bare, ['ls-tree', '-r', '--name-only', 'main']).split('\n').filter(Boolean)).toEqual(
      expect.arrayContaining([`${missing}/fresh.yaml`, `${PROJECT_FOLDER}/shop.yaml`, `${OTHER_FOLDER}/crm.yaml`]),
    );
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('cloning an empty remote with a folder waits for the first push to create it', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    sh(team.bare, ['update-ref', '-d', 'refs/heads/main']);
    const refused = await cloneFolder(app, team);
    expect(refused.done).toMatchObject({ phase: 'failed', missingFolder: PROJECT_FOLDER });
    const created = await cloneFolder(app, team, PROJECT_FOLDER, true);
    expect(created.done).toMatchObject({ phase: 'done' });
    expect(existsSync(created.project)).toBe(true);
  } finally {
    app.dispose();
    team.dispose();
  }
});

test('the sparse checkout arguments are cone mode and cannot be read as options', () => {
  expect(sparseSetArguments(['semantic/ubl'])).toEqual(['sparse-checkout', 'set', '--cone', '--', 'semantic/ubl']);
});

test('the pathspecs cover the folder, the root files and the files of each parent folder', () => {
  expect(conePathspecs(['semantic/ubl'])).toEqual([':(glob)*', 'semantic/ubl', ':(glob)semantic/*']);
  expect(conePathspecs(['a/b/c'])).toEqual([':(glob)*', 'a/b/c', ':(glob)a/*', ':(glob)a/b/*']);
  expect(conePathspecs(['ubl'])).toEqual([':(glob)*', 'ubl']);
});

test('the contents a pull needs are downloaded in one fetch, including root files', async () => {
  const team = teamRepository();
  const app = await testWorkspace();
  try {
    const cloned = await cloneFolder(app, team);
    team.push(
      {
        [`${PROJECT_FOLDER}/shop.yaml`]: ontology('Changed inside.'),
        'README.md': 'Changed at the root.\n',
        'semantic/notes.txt': 'A file in the parent folder.\n',
        [`${OTHER_FOLDER}/crm.yaml`]: ontology('Changed elsewhere.'),
      },
      'Edits',
    );
    const git = createGit({ projectsRoot: join(app.root, 'projects') });
    await git.run(cloned.repository, ['fetch', '--end-of-options', 'origin'], { remote: true });
    const tip = 'refs/remotes/origin/main';
    const missing = () =>
      sh(cloned.repository, ['rev-list', '--objects', '--missing=print', tip, '--not', 'HEAD'])
        .split('\n')
        .filter(line => line.startsWith('?')).length;
    expect(missing()).toBe(4);
    await fetchMissingContents(git, cloned.repository, {
      tip,
      folders: [PROJECT_FOLDER],
      remote: 'origin',
    });
    // The inside file, the root file and the parent folder's file came; the other folder did not.
    expect(missing()).toBe(1);
  } finally {
    app.dispose();
    team.dispose();
  }
});
