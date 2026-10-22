// Checks administration changes in disposable Git repositories.
import { expect, test } from 'bun:test';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { createGit, GitError } from '../../server/projects/git';
import { openAdminRepository, AdminConfigError } from '../../server/auth/admin-repo';
import { tempDataDir } from '../helpers/temp-data-dir';
const author = { name: 'Admin Person', email: 'admin@example.org' };
test('first use creates one commit and changes preserve authorship, history and rollback', async () => {
  const dir = tempDataDir();
  try {
    const repo = openAdminRepository({ root: dir.root });
    await repo.ensure();
    const first = await repo.version();
    await repo.ensure();
    expect(await repo.version()).toBe(first);
    expect(await repo.history()).toHaveLength(1);
    expect((await repo.diff(await repo.version()))['roles.json']).toContain('roles');
    const files = Object.fromEntries(
      readdirSync('tests/fixtures/auth-workspace/admin')
        .filter(name => name.endsWith('.json'))
        .map(name => [
          name,
          readFileSync(join('tests/fixtures/auth-workspace/admin', name), 'utf8'),
        ]),
    );
    const next = await repo.write(files, {
      author,
      baseVersion: first,
      message: 'access: Import grants',
    });
    expect(repo.load().grants).toEqual(JSON.parse(files['grants.json']).grants);
    const history = await repo.history('grants.json');
    expect(history[0].author).toEqual(author);
    expect(history[0].message).toBe('access: Import grants');
    expect((await repo.diff(next, first))['grants.json']).toContain('@@');
    await expect(
      repo.write(
        { 'grants.json': '{"grants":[]}' },
        {
          author,
          baseVersion: first,
          message: 'grants: Clear',
        },
      ),
    ).rejects.toThrow('stale');
    const restored = await repo.rollback(first, { author, baseVersion: next });
    expect(restored).not.toBe(first);
    expect(repo.load().grants).toEqual([]);
    expect(await repo.history()).toHaveLength(3);
  } finally {
    dir.cleanup();
  }
});
test('invalid documents and identities never change files or create commits', async () => {
  const dir = tempDataDir();
  try {
    const repo = openAdminRepository({ root: dir.root });
    await repo.ensure();
    const baseVersion = await repo.version();
    for (const files of [
      { 'grants.json': '{}' },
      { '../escape': '{}' },
      { 'roles.json': '{"roles":[{"id":"admin"}]}' },
    ] as Record<string, string>[]) {
      await expect(
        repo.write(files, { author, baseVersion, message: 'access: Invalid' }),
      ).rejects.toThrow();
      expect(await repo.version()).toBe(baseVersion);
    }
    await expect(
      repo.write(
        { 'grants.json': '{"grants":[]}' },
        {
          author: { ...author, name: 'bad\nname' },
          baseVersion,
          message: 'access: Invalid',
        },
      ),
    ).rejects.toThrow();
    expect(await repo.history()).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
});

test('Admin policies are keyed by annotation and rollback removes later policy files', async () => {
  const dir = tempDataDir();
  try {
    const repo = openAdminRepository({ root: dir.root });
    await repo.ensure();
    const first = await repo.version();
    const policy = '@id("test-rule")\nforbid(principal, action == SW::Action::"edit", resource);';
    const next = await repo.write(
      { 'policies/test.cedar': policy },
      {
        author,
        baseVersion: first,
        message: 'policies: Forbid editing',
      },
    );
    expect(repo.load().adminRules).toEqual({ 'test-rule': policy });
    await expect(
      repo.write(
        { 'policies/test.cedar': '@id("invalid")\nnot a policy' },
        {
          author,
          baseVersion: next,
          message: 'policies: Invalid rule',
        },
      ),
    ).rejects.toThrow('policies');
    expect(await repo.version()).toBe(next);
    expect(repo.load().adminRules).toEqual({ 'test-rule': policy });
    await repo.rollback(first, { author, baseVersion: next });
    expect(repo.load().adminRules).toEqual({});
  } finally {
    dir.cleanup();
  }
});

test('a failed commit restores committed configuration and removes new policies', async () => {
  const dir = tempDataDir();
  try {
    const repo = openAdminRepository({ root: dir.root });
    await repo.ensure();
    const previous = repo.load();
    const baseVersion = await repo.version();
    const hook = join(dir.root, 'admin/.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await expect(
      repo.write(
        {
          'deactivated.json': JSON.stringify({
            formatVersion: 1,
            principals: [{ id: 'blocked', at: '2026-10-22T00:00:00Z', by: 'admin' }],
          }),
          'policies/rejected.cedar': '@id("rejected")\nforbid(principal, action, resource);',
        },
        { author, baseVersion, message: 'policies: Add rule' },
      ),
    ).rejects.toThrow(GitError);
    expect(repo.load()).toEqual(previous);
    expect(await repo.version()).toBe(baseVersion);
    expect(existsSync(join(dir.root, 'admin/policies/rejected.cedar'))).toBe(false);
  } finally {
    dir.cleanup();
  }
});

test('ensure completes an unborn repository and recovers from a failed first commit', async () => {
  const dir = tempDataDir();
  try {
    const root = join(dir.root, 'admin');
    mkdirSync(root);
    await createGit({ projectsRoot: dir.root }).init(root);
    const hook = join(root, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const repo = openAdminRepository({ root: dir.root });
    await expect(repo.ensure()).rejects.toThrow();
    expect(readdirSync(root)).toEqual(['.git']);
    unlinkSync(hook);
    await repo.ensure();
    expect(await repo.version()).toMatch(/^[0-9a-f]{40}$/);
    expect(repo.load().grants).toEqual([]);
    expect(await repo.history()).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
});

test('non-file administration entries raise configuration errors', async () => {
  for (const entry of ['directory', 'symlink', 'dangling', 'policies-file']) {
    const dir = tempDataDir();
    try {
      const repo = openAdminRepository({ root: dir.root });
      await repo.ensure();
      const path = join(dir.root, 'admin/grants.json');
      if (entry === 'policies-file') {
        writeFileSync(join(dir.root, 'admin/policies'), 'not a directory');
      } else {
        unlinkSync(path);
        if (entry === 'directory') mkdirSync(path);
        else symlinkSync(entry === 'dangling' ? 'missing.json' : 'roles.json', path);
      }
      expect(() => repo.load()).toThrow(AdminConfigError);
    } finally {
      dir.cleanup();
    }
  }
});

test('settings validates lifetimes and supplies defaults for missing fields', async () => {
  const dir = tempDataDir();
  try {
    const repository = openAdminRepository({ root: dir.root });
    await repository.ensure();
    const path = join(dir.root, 'admin/settings.json');
    for (const settings of [{}, { session: {} }, { session: { idleHours: 2 } }]) {
      writeFileSync(path, JSON.stringify(settings));
      expect(repository.settings().session).toEqual({
        idleHours: settings.session?.idleHours ?? 8,
        absoluteHours: 24,
      });
    }
    for (const session of [{ idleHours: null }, { absoluteHours: '24' }, { idleHours: 0 }]) {
      writeFileSync(path, JSON.stringify({ session }));
      expect(() => repository.settings()).toThrow(AdminConfigError);
    }
    unlinkSync(path);
    expect(() => repository.settings()).toThrow(AdminConfigError);
  } finally {
    dir.cleanup();
  }
});
