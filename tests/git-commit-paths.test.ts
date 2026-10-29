// Tests committing only selected paths while preserving other staged work.
import { test, expect } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { isolateGit } from './helpers/temp-data-dir';
// Selected-path commits stage untracked files before using `git commit --only`.
// Other staged and unstaged work must remain untouched.
const sh = (cwd: string, args: string[]) => {
  const syncSubprocess = Bun.spawnSync(['git', ...args], { cwd });
  if (syncSubprocess.exitCode !== 0) throw Error(syncSubprocess.stderr.toString());
  return syncSubprocess.stdout.toString();
};
function repo() {
  isolateGit();
  const root = mkdtempSync(join(tmpdir(), 'workbench-commitpaths-'));
  const projects = join(root, 'projects');
  const dir = join(projects, 'p');
  mkdirSync(dir, { recursive: true });
  const git = createGit({ projectsRoot: projects });
  return {
    git,
    dir,
    root,
    write: (p: string, t: string) => writeFileSync(join(dir, p), t),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
test('commits only the listed paths; untracked listed paths are added; other work is untouched', async () => {
  const scratchRepo = repo();
  try {
    await scratchRepo.git.init(scratchRepo.dir);
    scratchRepo.write('a.yaml', 'a: 1\n');
    scratchRepo.write('b.yaml', 'b: 1\n');
    const first = await scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml', 'b.yaml'], 'Import 2 files');
    expect(first).toMatchObject({ committed: true });
    expect(sh(scratchRepo.dir, ['log', '--format=%s']).trim()).toBe('Import 2 files');
    scratchRepo.write('a.yaml', 'a: 2\n');
    scratchRepo.write('b.yaml', 'b: 2\n');
    sh(scratchRepo.dir, ['add', 'b.yaml']);
    scratchRepo.write('c.yaml', 'c: 1\n');
    scratchRepo.write('d.yaml', 'd: 1\n');
    const out = await scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml', 'c.yaml'], 'Update a and c');
    if (!out.committed) throw Error('expected a commit');
    expect(out.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sh(scratchRepo.dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()).toEqual(['a.yaml', 'c.yaml']);
    // File b stays staged and file d stays untracked.
    expect(sh(scratchRepo.dir, ['status', '--porcelain']).split('\n').filter(Boolean).sort()).toEqual(['?? d.yaml', 'M  b.yaml']);
  } finally {
    scratchRepo.dispose();
  }
});
test('a deleted tracked path is committed as a deletion', async () => {
  const scratchRepo = repo();
  try {
    await scratchRepo.git.init(scratchRepo.dir);
    scratchRepo.write('a.yaml', 'a: 1\n');
    await scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml'], 'Add');
    rmSync(join(scratchRepo.dir, 'a.yaml'));
    expect(await scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml'], 'Remove a')).toMatchObject({
      committed: true,
    });
    expect(sh(scratchRepo.dir, ['ls-files']).trim()).toBe('');
  } finally {
    scratchRepo.dispose();
  }
});
test('refuses during a merge and reports it', async () => {
  const scratchRepo = repo();
  try {
    await scratchRepo.git.init(scratchRepo.dir);
    scratchRepo.write('a.yaml', 'a: 1\n');
    await scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml'], 'Base');
    sh(scratchRepo.dir, ['switch', '-q', '-c', 'other']);
    scratchRepo.write('a.yaml', 'a: other\n');
    sh(scratchRepo.dir, ['commit', '-qam', 'other']);
    sh(scratchRepo.dir, ['switch', '-q', 'main']);
    scratchRepo.write('a.yaml', 'a: main\n');
    sh(scratchRepo.dir, ['commit', '-qam', 'main']);
    Bun.spawnSync(['git', 'merge', 'other'], { cwd: scratchRepo.dir });
    scratchRepo.write('z.yaml', 'z: 1\n');
    expect(await scratchRepo.git.commitPaths(scratchRepo.dir, ['z.yaml'], 'Import z')).toEqual({
      committed: false,
      reason: 'merging',
    });
    expect(sh(scratchRepo.dir, ['log', '-1', '--format=%s']).trim()).toBe('main');
  } finally {
    scratchRepo.dispose();
  }
});
test('without a Git identity nothing is committed and the reason is given', async () => {
  const scratchRepo = repo();
  const empty = join(scratchRepo.root, 'empty-gitconfig');
  writeFileSync(empty, '');
  const git = createGit({
    projectsRoot: join(scratchRepo.root, 'projects'),
    env: { ...process.env, GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' },
  });
  try {
    await git.init(scratchRepo.dir);
    scratchRepo.write('a.yaml', 'a: 1\n');
    expect(await git.commitPaths(scratchRepo.dir, ['a.yaml'], 'Import a.yaml')).toEqual({
      committed: false,
      reason: 'no-identity',
    });
    expect(Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', 'HEAD'], { cwd: scratchRepo.dir }).exitCode).not.toBe(0);
    // A repository-local identity is seen at once (no restart).
    sh(scratchRepo.dir, ['config', 'user.name', 'Local Person']);
    sh(scratchRepo.dir, ['config', 'user.email', 'local@example.invalid']);
    expect(await git.commitPaths(scratchRepo.dir, ['a.yaml'], 'Import a.yaml')).toMatchObject({
      committed: true,
    });
  } finally {
    scratchRepo.dispose();
  }
});
test('an empty path list or message is refused', async () => {
  const scratchRepo = repo();
  try {
    await scratchRepo.git.init(scratchRepo.dir);
    await expect(scratchRepo.git.commitPaths(scratchRepo.dir, [], 'x')).rejects.toThrow();
    scratchRepo.write('a.yaml', 'a: 1\n');
    await expect(scratchRepo.git.commitPaths(scratchRepo.dir, ['a.yaml'], ' ')).rejects.toThrow('commit message');
  } finally {
    scratchRepo.dispose();
  }
});
