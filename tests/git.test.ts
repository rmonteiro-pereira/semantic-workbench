// Tests local repository operations.
import { test, expect } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit, gitEnv, parseStatus, LOCAL_TIMEOUT_MS } from '../src/server/projects/git';
import { dataLayout } from '../src/server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
function setup(binary?: string) {
  const dir = tempDataDir();
  const layout = dataLayout(dir.root);
  mkdirSync(layout.projects, { recursive: true });
  return { tempData: dir, layout, git: createGit({ projectsRoot: layout.projects, binary }) };
}
test('environment disables terminal prompts, fixes the locale and drops repository overrides', () => {
  const env = gitEnv({
    PATH: '/bin',
    GIT_DIR: '/elsewhere',
    GIT_WORK_TREE: '/x',
    SSH_AUTH_SOCK: '/s',
    GCM_INTERACTIVE: undefined,
  });
  expect(env as Record<string, string>).toEqual({
    PATH: '/bin',
    SSH_AUTH_SOCK: '/s',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  });
  expect(LOCAL_TIMEOUT_MS).toBe(30_000);
});
test('Git runs only with argument arrays and inside data/projects/', async () => {
  const { tempData, layout, git } = setup();
  try {
    await expect(git.run(tempData.root, ['status'])).rejects.toThrow('inside data/projects');
    await expect(git.run('/tmp', ['status'])).rejects.toThrow('inside data/projects');
    await expect(git.run(join(layout.projects, 'p'), 'status --short' as any)).rejects.toThrow('array');
    await expect(git.run(join(layout.projects, 'p'), ['status', 42 as any])).rejects.toThrow('array');
  } finally {
    tempData.cleanup();
  }
});
test('init configures managed repositories so committed bytes equal saved bytes', async () => {
  const { tempData, layout, git } = setup();
  try {
    const dir = join(layout.projects, 'p');
    mkdirSync(dir);
    await git.init(dir);
    expect((await git.run(dir, ['config', '--get', 'core.autocrlf'])).stdout.trim()).toBe('false');
    expect((await git.run(dir, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim()).toBe('main');
    writeFileSync(join(dir, 'crlf.yaml'), 'a: 1\r\nb: 2\r\n');
    await git.addAll(dir);
    await git.commit(dir, 'Message with ; rm -rf / and "quotes"');
    expect((await git.run(dir, ['log', '-1', '--format=%s'])).stdout.trim()).toBe('Message with ; rm -rf / and "quotes"');
    expect((await git.run(dir, ['show', 'HEAD:crlf.yaml'])).stdout).toBe('a: 1\r\nb: 2\r\n');
    await expect(git.commit(dir, '  ')).rejects.toThrow('message');
  } finally {
    tempData.cleanup();
  }
});
test('operations on one repository are serialized', async () => {
  const { tempData, layout, git } = setup();
  try {
    const dir = join(layout.projects, 'p');
    mkdirSync(dir);
    await git.init(dir);
    const order: string[] = [];
    await Promise.all(Array.from({ length: 6 }, (_, i) => git.run(dir, ['config', `test.k${i}`, String(i)]).then(() => order.push(String(i)))));
    expect(order).toEqual(['0', '1', '2', '3', '4', '5']);
    const failing = git.run(dir, ['not-a-command']);
    const after = git.run(dir, ['config', '--get', 'test.k5']);
    await expect(failing).rejects.toThrow();
    expect((await after).stdout.trim()).toBe('5');
  } finally {
    tempData.cleanup();
  }
});
test('a command that exceeds its timeout is killed', async () => {
  const { tempData, layout } = setup();
  try {
    const dir = join(layout.projects, 'p');
    mkdirSync(dir);
    const script = join(tempData.root, 'slow-git');
    writeFileSync(script, '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
    const slow = createGit({ projectsRoot: layout.projects, binary: script, timeoutMs: 200 });
    const started = Date.now();
    await expect(slow.run(dir, ['status'])).rejects.toThrow('timed out');
    expect(Date.now() - started).toBeLessThan(3000);
  } finally {
    tempData.cleanup();
  }
});
test('missing Git and missing identity are detected', async () => {
  const { tempData, layout, git } = setup();
  try {
    expect(await git.available()).toBe(true);
    expect(await git.identity()).toBe(true);
    expect(
      await createGit({
        projectsRoot: layout.projects,
        binary: join(tempData.root, 'no-git'),
      }).available(),
    ).toBe(false);
    const empty = join(tempData.root, 'empty-gitconfig');
    writeFileSync(empty, '');
    const noIdentity = createGit({
      projectsRoot: layout.projects,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: empty,
        GIT_CONFIG_NOSYSTEM: '1',
        HOME: tempData.root,
        XDG_CONFIG_HOME: tempData.root,
        GIT_AUTHOR_NAME: undefined,
        GIT_AUTHOR_EMAIL: undefined,
        EMAIL: undefined,
      },
    });
    expect(await noIdentity.identity()).toBe(false);
  } finally {
    tempData.cleanup();
  }
});
test('porcelain v2 status is read per path', () => {
  const out = [
    '# branch.oid abc',
    '# branch.head main',
    '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 a a a.yaml',
    '1 A. N... 000000 100644 100644 0 a new file.yaml',
    '1 D. N... 100644 000000 000000 a 0 gone.ttl',
    '2 R. N... 100644 100644 100644 a a R100 to.yaml',
    'from.yaml',
    'u UU N... 100644 100644 100644 100644 a b c conflict.yaml',
    '? untracked.yaml',
    '',
  ].join('\0');
  const status = parseStatus(out);
  expect([status.branch, status.ahead, status.behind, status.changes]).toEqual(['main', 2, 1, 6]);
  expect(Object.fromEntries(status.files)).toEqual({
    'a.yaml': 'modified',
    'new file.yaml': 'added',
    'gone.ttl': 'deleted',
    'to.yaml': 'renamed',
    'conflict.yaml': 'conflicted',
    'untracked.yaml': 'untracked',
  });
});
