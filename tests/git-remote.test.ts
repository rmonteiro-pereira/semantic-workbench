// Tests remote Git actions, conflicts and cancellation.
import { test, expect } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit, gitEnv, REMOTE_TIMEOUT_MS, subcommandOf } from '../src/server/projects/git';
import { dataLayout } from '../src/server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
import { LOCAL_READER } from '../src/server/projects/reader';
test('push to a local bare remote sets the upstream; pull merges a commit made elsewhere', async () => {
  const project = await scmProject();
  try {
    const status = await ok(call(project.t, 'GET', project.base + '/git/status'));
    expect(status).toMatchObject({
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      remotes: { origin: project.bare },
    });
    writeFileSync(join(project.other, 'shop.yaml'), ontology('From elsewhere.'));
    sh(project.other, ['commit', '-qam', 'Elsewhere']);
    sh(project.other, ['push', '-q']);
    const fetched = await ok(call(project.t, 'POST', project.base + '/git/fetch'));
    expect(fetched).toMatchObject({ ok: true, behind: 1, ahead: 0 });
    const pulled = await ok(call(project.t, 'POST', project.base + '/git/pull'));
    expect(pulled).toMatchObject({ ok: true, conflicted: [], altered: [], behind: 0 });
    expect(project.t.ws.readFile(project.slug, 'shop.yaml').source).toBe(ontology('From elsewhere.'));
    project.write('shop.yaml', ontology('Local.'));
    await ok(call(project.t, 'POST', project.base + '/git/stage', { all: true }));
    await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Local' }));
    expect((await ok(call(project.t, 'GET', project.base + '/git/status'))).ahead).toBe(1);
    const pushed = await ok(call(project.t, 'POST', project.base + '/git/sync'));
    expect(pushed).toMatchObject({ ok: true, ahead: 0, behind: 0 });
    sh(project.other, ['pull', '-q', '--no-rebase']);
    expect(readFileSync(join(project.other, 'shop.yaml'), 'utf8')).toBe(ontology('Local.'));
  } finally {
    project.dispose();
  }
});
test('a conflicting pull merges with --no-rebase, lists conflicted files, blocks commit until they are repaired and staged', async () => {
  const project = await scmProject();
  try {
    writeFileSync(join(project.other, 'shop.yaml'), ontology('Theirs.'));
    sh(project.other, ['commit', '-qam', 'Theirs']);
    sh(project.other, ['push', '-q']);
    project.write('shop.yaml', ontology('Ours.'));
    await ok(call(project.t, 'POST', project.base + '/git/stage', { all: true }));
    await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Ours' }));
    const pullResult = await ok(call(project.t, 'POST', project.base + '/git/pull'));
    expect(pullResult.ok).toBe(false);
    expect(pullResult.conflicted).toEqual(['shop.yaml']);
    expect(pullResult.stderr + '').not.toContain('rebase');
    const conflictedSource = readFileSync(join(project.dir, 'shop.yaml'), 'utf8');
    expect(conflictedSource).toContain('<<<<<<<');
    // The conflicted file is listed in the workspace as invalid, for repair in Source.
    const file = (await ok(call(project.t, 'GET', '/api/projects')))[0].files.find((f: any) => f.path === 'shop.yaml');
    expect(file).toMatchObject({ valid: false, gitState: 'conflicted' });
    const mergeStatus = await ok(call(project.t, 'GET', project.base + '/git/status'));
    expect(mergeStatus.merging).toBe(true);
    expect(mergeStatus.changes[0]).toMatchObject({ path: 'shop.yaml', conflicted: true });
    expect((await call(project.t, 'POST', project.base + '/git/commit', { message: 'Merge' })).body.error).toContain('Resolve the conflicted files');
    const current = project.t.ws.readFile(project.slug, 'shop.yaml');
    await project.t.ws.saveFile(
      project.slug,
      'shop.yaml',
      {
        baseHash: current.hash,
        source: ontology('Ours and theirs.'),
      },
      LOCAL_READER,
    );
    await ok(call(project.t, 'POST', project.base + '/git/stage', { paths: ['shop.yaml'] }));
    await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Merge theirs' }));
    expect(sh(project.dir, ['log', '-1', '--format=%P']).trim().split(' ')).toHaveLength(2);
  } finally {
    project.dispose();
  }
});
test('remote commands run only from the explicit actions; nothing else contacts the remote', async () => {
  const project = await scmProject();
  try {
    expect(subcommandOf(['-c', 'a=b', 'fetch', 'x'])).toBe('fetch');
    expect(subcommandOf(['remote', 'update'])).toBe('remote-update');
    expect(subcommandOf(['remote', '-v'])).toBe('remote');
    for (const args of [['fetch'], ['pull'], ['push'], ['-c', 'x=y', 'ls-remote', 'origin'], ['remote', 'update']]) await expect(project.t.ws.git.run(project.dir, args)).rejects.toThrow('explicit');
    rmFetchHead(project.dir);
    for (const path of ['/git/status', '/git/branches', '/git/log', '/git/diff?path=shop.yaml']) await ok(call(project.t, 'GET', project.base + path));
    await ok(call(project.t, 'GET', '/api/projects'));
    expect(existsSync(join(project.dir, '.git/FETCH_HEAD'))).toBe(false);
  } finally {
    project.dispose();
  }
});
function rmFetchHead(dir: string) {
  try {
    require('node:fs').rmSync(join(dir, '.git/FETCH_HEAD'));
  } catch {}
}
test('remote environment: no terminal prompt, credential-helper GUI variables left as the user set them, 10-minute limit', () => {
  const env = gitEnv({
    PATH: '/bin',
    GCM_INTERACTIVE: 'auto',
    GCM_GUI_PROMPT: 'true',
    DISPLAY: ':0',
    SSH_AUTH_SOCK: '/s',
  });
  expect(env).toMatchObject({
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'auto',
    GCM_GUI_PROMPT: 'true',
    DISPLAY: ':0',
    SSH_AUTH_SOCK: '/s',
  });
  expect(gitEnv({ PATH: '/bin' })).not.toHaveProperty('GCM_INTERACTIVE');
  expect(gitEnv({ PATH: '/bin' })).not.toHaveProperty('GCM_GUI_PROMPT');
  expect(REMOTE_TIMEOUT_MS).toBe(600_000);
});
// A remote that never answers (an SSH command that sleeps), as when a credential window stays
// open.
function hangingGit(remoteTimeoutMs?: number) {
  const dir = tempDataDir();
  const layout = dataLayout(dir.root);
  mkdirSync(join(layout.projects, 'p'), { recursive: true });
  const git = createGit({
    projectsRoot: layout.projects,
    remoteTimeoutMs,
    env: { ...process.env, GIT_SSH_COMMAND: 'sleep 30 #' },
  });
  return { tempDir: dir, dir: join(layout.projects, 'p'), git };
}
test('a waiting remote operation is cancelled from the UI, and stops at its time limit', async () => {
  const cancellable = hangingGit();
  try {
    await cancellable.git.init(cancellable.dir);
    await cancellable.git.run(cancellable.dir, ['remote', 'add', 'origin', 'ssh://example.invalid/repo.git']);
    const started = Date.now();
    const pending = cancellable.git.run(cancellable.dir, ['fetch', 'origin'], { remote: true });
    await Bun.sleep(300);
    expect(cancellable.git.cancel(cancellable.dir)).toBe(true);
    await expect(pending).rejects.toThrow('cancelled');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(cancellable.git.cancel(cancellable.dir)).toBe(false);
    // Local commands keep working afterwards.
    expect((await cancellable.git.status(cancellable.dir)).branch).toBe('main');
  } finally {
    cancellable.tempDir.cleanup();
  }
  const hanging = hangingGit(400);
  try {
    await hanging.git.init(hanging.dir);
    await hanging.git.run(hanging.dir, ['remote', 'add', 'origin', 'ssh://example.invalid/repo.git']);
    await expect(hanging.git.run(hanging.dir, ['fetch', 'origin'], { remote: true })).rejects.toThrow('timed out');
  } finally {
    hanging.tempDir.cleanup();
  }
});
test('the cancel endpoint reports a cancelled push without an error status', async () => {
  const project = await scmProject({ remote: false });
  try {
    await ok(
      call(project.t, 'PUT', project.base + '/git/remote', {
        name: 'origin',
        url: 'ssh://example.invalid/repo.git',
      }),
    );
    const prev = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = 'sleep 30 #';
    try {
      const pending = call(project.t, 'POST', project.base + '/git/push');
      await Bun.sleep(400);
      expect((await ok(call(project.t, 'POST', project.base + '/git/cancel'))).cancelled).toBe(true);
      const response = await pending;
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ok: false, cancelled: true });
    } finally {
      if (prev === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = prev;
    }
    for (const body of [
      { name: '-x', url: '/r' },
      { name: 'origin', url: '--upload-pack=x' },
      { name: 'origin', url: 'a\nb' },
    ])
      expect((await call(project.t, 'PUT', project.base + '/git/remote', body)).status).toBe(400);
  } finally {
    project.dispose();
  }
});

test('saving the masked form of a credentialed address keeps the original address', async () => {
  const project = await scmProject({ remote: false });
  try {
    const real = 'https://ana:secret@example.invalid/shop.git';
    await ok(call(project.t, 'PUT', project.base + '/git/remote', { name: 'origin', url: real }));
    const shown = (await ok(call(project.t, 'GET', project.base + '/git/status'))).remotes.origin;
    expect(shown).toBe('https://***@example.invalid/shop.git');
    await ok(call(project.t, 'PUT', project.base + '/git/remote', { name: 'origin', url: shown }));
    expect(sh(project.dir, ['remote', 'get-url', 'origin']).trim()).toBe(real);
    const masked = await call(project.t, 'PUT', project.base + '/git/remote', {
      name: 'origin',
      url: 'https://***@example.invalid/other.git',
    });
    expect(masked.status).toBe(400);
    expect(sh(project.dir, ['remote', 'get-url', 'origin']).trim()).toBe(real);
  } finally {
    project.dispose();
  }
});
test('an upstream whose remote was removed reports that the project has no remote', async () => {
  const project = await scmProject();
  try {
    // The branch keeps tracking `other/main` after the remote lost its address.
    sh(project.dir, ['remote', 'add', 'other', project.bare]);
    sh(project.dir, ['fetch', '-q', 'other']);
    sh(project.dir, ['branch', '-q', '--set-upstream-to', 'other/main']);
    sh(project.dir, ['config', '--unset', 'remote.other.url']);
    const fetched = await call(project.t, 'POST', project.base + '/git/fetch');
    expect(fetched.body.error).toContain('This project has no remote');
  } finally {
    project.dispose();
  }
});
