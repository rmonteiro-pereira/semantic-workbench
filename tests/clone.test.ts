// Tests cloning a repository as a new project from a local bare repository: address checks,
// staging, preserved bytes, links and submodules, cancellation and recovery after a stop.
import { test, expect } from 'bun:test';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkspace } from '../src/server/projects/workspace';
import { tempDataDir, testWorkspace } from './helpers/temp-data-dir';
import { call, ok, ontology, sh } from './helpers/scm';
import { bareRepository, emptyBareRepository } from './helpers/git-fixtures';

const CRLF_TEXT = 'name: Windows\r\nontology:\r\n  - concept: Store\r\n    type: EntityType\r\n';
const INVALID_TEXT = 'name: Broken\nontology:\n  - concept: [unclosed\n';

// A bare repository with a valid file, a CRLF file, an invalid file, a symbolic link and a
// submodule entry, standing for a team repository. Nothing here touches a network remote.
function teamRepository() {
  const root = mkdtempSync(join(tmpdir(), 'workbench-clone-source-'));
  const submodule = join(root, 'submodule');
  sh(root, ['init', '-q', '-b', 'main', submodule]);
  writeFileSync(join(submodule, 'inner.yaml'), ontology('Inner.'));
  sh(submodule, ['add', '.']);
  sh(submodule, ['commit', '-qm', 'Inner']);
  const submoduleHead = sh(submodule, ['rev-parse', 'HEAD']).trim();

  const work = join(root, 'work');
  sh(root, ['init', '-q', '-b', 'main', work]);
  sh(work, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(work, 'shop.yaml'), ontology('Buys.'));
  writeFileSync(join(work, 'windows.yaml'), CRLF_TEXT);
  writeFileSync(join(work, 'broken.yaml'), INVALID_TEXT);
  symlinkSync('/etc/hostname', join(work, 'outside.yaml'));
  writeFileSync(join(work, '.gitmodules'), `[submodule "inner"]\n\tpath = inner\n\turl = ${submodule}\n`);
  sh(work, ['add', '.']);
  sh(work, ['update-index', '--add', '--cacheinfo', `160000,${submoduleHead},inner`]);
  sh(work, ['commit', '-qm', 'Team files']);
  const bare = join(root, 'team.git');
  sh(root, ['clone', '-q', '--bare', work, bare]);
  return { root, bare, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

type Workspace = Awaited<ReturnType<typeof testWorkspace>>;

// Waits for the clone's last event: done, failed or cancelled.
async function outcome(app: Workspace, op: string) {
  for (let tries = 0; tries < 400; tries++) {
    const events = app.ws.events.replay(0)!.filter(event => event.event === 'clone');
    const last = events
      .map(event => event.data as { op: string; phase: string })
      .filter(data => data.op === op)
      .pop();
    if (last && ['done', 'failed', 'cancelled'].includes(last.phase)) return last as any;
    await Bun.sleep(25);
  }
  throw Error('The clone did not finish.');
}

const stagingFolders = (root: string) => readdirSync(join(root, 'projects')).filter(name => name.startsWith('.staging'));

test('a clone becomes a project with its bytes, without links or submodules', async () => {
  const source = teamRepository();
  const app = await testWorkspace();
  try {
    const started = await ok(call(app, 'POST', '/api/clone', { url: source.bare }));
    expect(started.name).toBe('team');
    const done = await outcome(app, started.op);
    expect(done).toMatchObject({ phase: 'done', repo: started.slug });
    // The former link is now a one-line text file, which is not a valid definition either.
    expect(done.invalid.sort()).toEqual(['broken.yaml', 'outside.yaml']);

    const dir = join(app.root, 'projects', started.slug);
    expect(readFileSync(join(dir, 'windows.yaml'), 'utf8')).toBe(CRLF_TEXT);
    expect(readFileSync(join(dir, 'broken.yaml'), 'utf8')).toBe(INVALID_TEXT);
    expect(lstatSync(join(dir, 'outside.yaml')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(dir, 'outside.yaml'), 'utf8')).toBe('/etc/hostname');
    expect(readdirSync(join(dir, 'inner'))).toEqual([]);
    expect(sh(dir, ['config', '--local', 'core.autocrlf']).trim()).toBe('false');
    expect(sh(dir, ['config', '--local', 'core.symlinks']).trim()).toBe('false');
    expect(sh(dir, ['status', '--porcelain'])).toBe('');
    expect(stagingFolders(app.root)).toEqual([]);

    const project = app.ws.state.registry().projects.find(entry => entry.slug === started.slug);
    expect(project).toMatchObject({ name: 'team', origin: 'clone', remoteAddress: source.bare });
    const listed = (await ok(call(app, 'GET', '/api/projects'))).find((entry: any) => entry.slug === started.slug);
    expect(listed.files.find((file: any) => file.path === 'broken.yaml').valid).toBe(false);
    const status = await ok(call(app, 'GET', `/api/projects/${started.slug}/git/status`));
    expect(status.remotes).toEqual({ origin: source.bare });
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('a clone reports how many definitions and whether the repository has commits', async () => {
  const documentation = bareRepository('documentation');
  const single = bareRepository('single');
  const empty = emptyBareRepository();
  const app = await testWorkspace();
  try {
    const expectations = [
      { url: single.bare, definitions: 1, hasCommits: true },
      { url: documentation.bare, definitions: 0, hasCommits: true },
      { url: empty.bare, definitions: 0, hasCommits: false },
    ];
    for (const { url, definitions, hasCommits } of expectations) {
      const started = await ok(call(app, 'POST', '/api/clone', { url }));
      const done = await outcome(app, started.op);
      expect(done).toMatchObject({ phase: 'done', definitions, hasCommits });
      const status = await ok(call(app, 'GET', `/api/projects/${started.slug}/git/status`));
      expect(status.hasCommits).toBe(hasCommits);
    }
  } finally {
    app.dispose();
    single.dispose();
    documentation.dispose();
    empty.dispose();
  }
});

test('a second clone of the same address gets a free name', async () => {
  const source = teamRepository();
  const app = await testWorkspace();
  try {
    const first = await ok(call(app, 'POST', '/api/clone', { url: source.bare }));
    await outcome(app, first.op);
    const second = await ok(call(app, 'POST', '/api/clone', { url: source.bare }));
    expect(second.name).toBe('team (2)');
    expect(second.slug).not.toBe(first.slug);
    expect(await outcome(app, second.op)).toMatchObject({ phase: 'done', repo: second.slug });
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('helper, option-like and multi-line addresses are refused before Git runs', async () => {
  const app = await testWorkspace();
  try {
    for (const url of ['ext::sh -c touch% /tmp/pwned', 'fd::17', '--upload-pack=touch /tmp/pwned', '-u x', 'https://example.invalid/a.git\nhttps://example.invalid/b.git', 'x'.repeat(2001), '']) {
      const response = await call(app, 'POST', '/api/clone', { url });
      expect({ url, status: response.status }).toEqual({ url, status: 400 });
    }
    const extra = await call(app, 'POST', '/api/clone', { url: '/tmp/x', depth: 1 });
    expect(extra.status).toBe(400);
    expect(stagingFolders(app.root)).toEqual([]);
    expect(app.ws.state.registry().projects).toEqual([]);
  } finally {
    app.dispose();
  }
});

test('a failed clone reports the error and leaves nothing behind', async () => {
  const app = await testWorkspace();
  try {
    const started = await ok(call(app, 'POST', '/api/clone', { url: '/nonexistent/workbench-repo.git' }));
    const failed = await outcome(app, started.op);
    expect(failed.phase).toBe('failed');
    expect(failed.message).toContain('does not exist');
    expect(stagingFolders(app.root)).toEqual([]);
    expect(app.ws.state.registry().projects).toEqual([]);
  } finally {
    app.dispose();
  }
});

test('Cancel stops a running clone and removes its staging folder', async () => {
  const source = teamRepository();
  // A Git wrapper that waits before cloning, so there is time to cancel.
  const bin = mkdtempSync(join(tmpdir(), 'workbench-slow-git-'));
  const wrapper = join(bin, 'git');
  writeFileSync(wrapper, '#!/bin/sh\nfor a in "$@"; do [ "$a" = clone ] && sleep 30; done\nexec git "$@"\n');
  chmodSync(wrapper, 0o755);
  const app = await testWorkspace({ gitBinary: wrapper });
  try {
    const started = await ok(call(app, 'POST', '/api/clone', { url: source.bare }));
    await Bun.sleep(200);
    expect(stagingFolders(app.root).length).toBe(1);
    expect(await ok(call(app, 'POST', `/api/clone/${started.op}/cancel`))).toEqual({
      cancelled: true,
    });
    expect(await outcome(app, started.op)).toMatchObject({ phase: 'cancelled' });
    expect(stagingFolders(app.root)).toEqual([]);
    expect(app.ws.state.registry().projects).toEqual([]);
  } finally {
    app.dispose();
    source.dispose();
    rmSync(bin, { recursive: true, force: true });
  }
});

test('two clones started together get different names and folders', async () => {
  const source = teamRepository();
  const app = await testWorkspace();
  try {
    const [first, second] = await Promise.all([ok(call(app, 'POST', '/api/clone', { url: source.bare })), ok(call(app, 'POST', '/api/clone', { url: source.bare }))]);
    expect(new Set([first.name, second.name])).toEqual(new Set(['team', 'team (2)']));
    expect(first.slug).not.toBe(second.slug);
    expect(await outcome(app, first.op)).toMatchObject({ phase: 'done' });
    expect(await outcome(app, second.op)).toMatchObject({ phase: 'done' });
  } finally {
    app.dispose();
    source.dispose();
  }
});

test('a clone interrupted by a stop is rolled back on the next start', async () => {
  const data = tempDataDir();
  try {
    const first = await openWorkspace({ root: data.root });
    first.close();
    const staging = join(data.root, 'projects', '.staging-clone-abc123', 'team');
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, 'shop.yaml'), ontology('Half cloned.'));
    const second = await openWorkspace({ root: data.root });
    try {
      expect(second.recovery).toContainEqual({
        opId: 'abc123',
        kind: 'clone',
        outcome: 'rolled-back',
        paths: [],
      });
      expect(existsSync(join(data.root, 'projects', '.staging-clone-abc123'))).toBe(false);
      expect(second.state.registry().projects).toEqual([]);
    } finally {
      second.close();
    }
  } finally {
    data.cleanup();
  }
});
