// Tests remote Git actions, conflicts and cancellation.
import { test, expect } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit, gitEnv, REMOTE_TIMEOUT_MS, subcommandOf } from '../server/projects/git';
import { dataLayout } from '../server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
import { LOCAL_READER } from '../server/projects/reader';
test('push to a local bare remote sets the upstream; pull merges a commit made elsewhere', async () => {
  const p = await scmProject();
  try {
    const s = await ok(call(p.t, 'GET', p.base + '/git/status'));
    expect(s).toMatchObject({
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      remotes: { origin: p.bare },
    });
    writeFileSync(join(p.other, 'shop.yaml'), ontology('From elsewhere.'));
    sh(p.other, ['commit', '-qam', 'Elsewhere']);
    sh(p.other, ['push', '-q']);
    const f = await ok(call(p.t, 'POST', p.base + '/git/fetch'));
    expect(f).toMatchObject({ ok: true, behind: 1, ahead: 0 });
    const pulled = await ok(call(p.t, 'POST', p.base + '/git/pull'));
    expect(pulled).toMatchObject({ ok: true, conflicted: [], altered: [], behind: 0 });
    expect(p.t.ws.readFile(p.slug, 'shop.yaml').source).toBe(ontology('From elsewhere.'));
    p.write('shop.yaml', ontology('Local.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Local' }));
    expect((await ok(call(p.t, 'GET', p.base + '/git/status'))).ahead).toBe(1);
    const pushed = await ok(call(p.t, 'POST', p.base + '/git/sync'));
    expect(pushed).toMatchObject({ ok: true, ahead: 0, behind: 0 });
    sh(p.other, ['pull', '-q', '--no-rebase']);
    expect(readFileSync(join(p.other, 'shop.yaml'), 'utf8')).toBe(ontology('Local.'));
  } finally {
    p.dispose();
  }
});
test('a conflicting pull merges with --no-rebase, lists conflicted files, blocks commit until they are repaired and staged', async () => {
  const p = await scmProject();
  try {
    writeFileSync(join(p.other, 'shop.yaml'), ontology('Theirs.'));
    sh(p.other, ['commit', '-qam', 'Theirs']);
    sh(p.other, ['push', '-q']);
    p.write('shop.yaml', ontology('Ours.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Ours' }));
    const r = await ok(call(p.t, 'POST', p.base + '/git/pull'));
    expect(r.ok).toBe(false);
    expect(r.conflicted).toEqual(['shop.yaml']);
    expect(r.stderr + '').not.toContain('rebase');
    const text = readFileSync(join(p.dir, 'shop.yaml'), 'utf8');
    expect(text).toContain('<<<<<<<');
    // The conflicted file is listed in the workspace as invalid, for repair in Source.
    const file = (await ok(call(p.t, 'GET', '/api/projects')))[0].files.find(
      (f: any) => f.path === 'shop.yaml',
    );
    expect(file).toMatchObject({ valid: false, gitState: 'conflicted' });
    const s = await ok(call(p.t, 'GET', p.base + '/git/status'));
    expect(s.merging).toBe(true);
    expect(s.changes[0]).toMatchObject({ path: 'shop.yaml', conflicted: true });
    expect(
      (await call(p.t, 'POST', p.base + '/git/commit', { message: 'Merge' })).body.error,
    ).toContain('Resolve the conflicted files');
    const current = p.t.ws.readFile(p.slug, 'shop.yaml');
    await p.t.ws.saveFile(
      p.slug,
      'shop.yaml',
      {
        baseHash: current.hash,
        source: ontology('Ours and theirs.'),
      },
      LOCAL_READER,
    );
    await ok(call(p.t, 'POST', p.base + '/git/stage', { paths: ['shop.yaml'] }));
    await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Merge theirs' }));
    expect(sh(p.dir, ['log', '-1', '--format=%P']).trim().split(' ')).toHaveLength(2);
  } finally {
    p.dispose();
  }
});
test('remote commands run only from the explicit actions; nothing else contacts the remote', async () => {
  const p = await scmProject();
  try {
    expect(subcommandOf(['-c', 'a=b', 'fetch', 'x'])).toBe('fetch');
    expect(subcommandOf(['remote', 'update'])).toBe('remote-update');
    expect(subcommandOf(['remote', '-v'])).toBe('remote');
    for (const args of [
      ['fetch'],
      ['pull'],
      ['push'],
      ['-c', 'x=y', 'ls-remote', 'origin'],
      ['remote', 'update'],
    ])
      await expect(p.t.ws.git.run(p.dir, args)).rejects.toThrow('explicit');
    rmFetchHead(p.dir);
    for (const path of ['/git/status', '/git/branches', '/git/log', '/git/diff?path=shop.yaml'])
      await ok(call(p.t, 'GET', p.base + path));
    await ok(call(p.t, 'GET', '/api/projects'));
    expect(existsSync(join(p.dir, '.git/FETCH_HEAD'))).toBe(false);
  } finally {
    p.dispose();
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
  const d = tempDataDir();
  const layout = dataLayout(d.root);
  mkdirSync(join(layout.projects, 'p'), { recursive: true });
  const git = createGit({
    projectsRoot: layout.projects,
    remoteTimeoutMs,
    env: { ...process.env, GIT_SSH_COMMAND: 'sleep 30 #' },
  });
  return { d, dir: join(layout.projects, 'p'), git };
}
test('a waiting remote operation is cancelled from the UI, and stops at its time limit', async () => {
  const h = hangingGit();
  try {
    await h.git.init(h.dir);
    await h.git.run(h.dir, ['remote', 'add', 'origin', 'ssh://example.invalid/repo.git']);
    const started = Date.now();
    const pending = h.git.run(h.dir, ['fetch', 'origin'], { remote: true });
    await Bun.sleep(300);
    expect(h.git.cancel(h.dir)).toBe(true);
    await expect(pending).rejects.toThrow('cancelled');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(h.git.cancel(h.dir)).toBe(false);
    // Local commands keep working afterwards.
    expect((await h.git.status(h.dir)).branch).toBe('main');
  } finally {
    h.d.cleanup();
  }
  const t = hangingGit(400);
  try {
    await t.git.init(t.dir);
    await t.git.run(t.dir, ['remote', 'add', 'origin', 'ssh://example.invalid/repo.git']);
    await expect(t.git.run(t.dir, ['fetch', 'origin'], { remote: true })).rejects.toThrow(
      'timed out',
    );
  } finally {
    t.d.cleanup();
  }
});
test('the cancel endpoint reports a cancelled push without an error status', async () => {
  const p = await scmProject({ remote: false });
  try {
    await ok(
      call(p.t, 'PUT', p.base + '/git/remote', {
        name: 'origin',
        url: 'ssh://example.invalid/repo.git',
      }),
    );
    const prev = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = 'sleep 30 #';
    try {
      const pending = call(p.t, 'POST', p.base + '/git/push');
      await Bun.sleep(400);
      expect((await ok(call(p.t, 'POST', p.base + '/git/cancel'))).cancelled).toBe(true);
      const r = await pending;
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: false, cancelled: true });
    } finally {
      if (prev === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = prev;
    }
    for (const body of [
      { name: '-x', url: '/r' },
      { name: 'origin', url: '--upload-pack=x' },
      { name: 'origin', url: 'a\nb' },
    ])
      expect((await call(p.t, 'PUT', p.base + '/git/remote', body)).status).toBe(400);
  } finally {
    p.dispose();
  }
});

test('saving the masked form of a credentialed address keeps the original address', async () => {
  const p = await scmProject({ remote: false });
  try {
    const real = 'https://ana:secret@example.invalid/shop.git';
    await ok(call(p.t, 'PUT', p.base + '/git/remote', { name: 'origin', url: real }));
    const shown = (await ok(call(p.t, 'GET', p.base + '/git/status'))).remotes.origin;
    expect(shown).toBe('https://***@example.invalid/shop.git');
    await ok(call(p.t, 'PUT', p.base + '/git/remote', { name: 'origin', url: shown }));
    expect(sh(p.dir, ['remote', 'get-url', 'origin']).trim()).toBe(real);
    const masked = await call(p.t, 'PUT', p.base + '/git/remote', {
      name: 'origin',
      url: 'https://***@example.invalid/other.git',
    });
    expect(masked.status).toBe(400);
    expect(sh(p.dir, ['remote', 'get-url', 'origin']).trim()).toBe(real);
  } finally {
    p.dispose();
  }
});
test('an upstream whose remote was removed reports that the project has no remote', async () => {
  const p = await scmProject();
  try {
    // The branch keeps tracking `other/main` after the remote lost its address.
    sh(p.dir, ['remote', 'add', 'other', p.bare]);
    sh(p.dir, ['fetch', '-q', 'other']);
    sh(p.dir, ['branch', '-q', '--set-upstream-to', 'other/main']);
    sh(p.dir, ['config', '--unset', 'remote.other.url']);
    const fetched = await call(p.t, 'POST', p.base + '/git/fetch');
    expect(fetched.body.error).toContain('This project has no remote');
  } finally {
    p.dispose();
  }
});
