// Exercises immutable Git object reads using isolated repositories and binary blob contents.
import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGit } from '../src/server/projects/git';
import { tempDataDir } from './helpers/temp-data-dir';

async function objectRepository() {
  mkdirSync(join(tmpdir(), 'sw-008'), { recursive: true });
  const temporary = tempDataDir('sw-008/objects-');
  const repository = join(temporary.root, 'objects');
  mkdirSync(repository);
  const git = createGit({ projectsRoot: temporary.root });
  await git.init(repository);
  return { temporary, repository, git };
}

test('tree listing preserves spaces and Unicode and batch reads preserve exact blob bytes', async () => {
  const { temporary, repository, git } = await objectRepository();
  try {
    mkdirSync(join(repository, 'folder'));
    const source = new Uint8Array([0, 10, 13, 255, 32, 97]);
    writeFileSync(join(repository, 'folder', 'ação with spaces.yaml'), source);
    writeFileSync(join(repository, 'outside.yaml'), 'outside');
    await git.addAll(repository);
    await git.commit(repository, 'Definitions');
    const entries = await git.lsTree(repository, 'HEAD', 'folder/');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('folder/ação with spaces.yaml');
    expect(entries[0].size).toBe(source.length);
    writeFileSync(join(repository, entries[0].path), 'dirty');
    const blobs = await git.catFileBatch(repository, [entries[0].id, entries[0].id]);
    expect(blobs.size).toBe(1);
    expect(blobs.get(entries[0].id)).toEqual(source);
    expect(await git.catFileBatch(repository, [])).toEqual(new Map());
  } finally {
    temporary.cleanup();
  }
});

test('batch preflight refuses oversized and missing blobs and non-blob objects', async () => {
  const { temporary, repository, git } = await objectRepository();
  try {
    writeFileSync(join(repository, 'big.yaml'), 'x'.repeat(2_000_001));
    await git.addAll(repository);
    await git.commit(repository, 'Large definition');
    const [entry] = await git.lsTree(repository, 'HEAD');
    await expect(git.catFileBatch(repository, [entry.id])).rejects.toThrow('limits');
    await expect(git.catFileBatch(repository, ['0'.repeat(40)])).rejects.toThrow('unavailable');
    await expect(git.catFileBatch(repository, [(await git.head(repository))!])).rejects.toThrow('unavailable');
    await expect(git.catFileBatch(repository, ['HEAD\nHEAD'])).rejects.toThrow('identifiers');
    await expect(git.catFileBatch(repository, [entry.id], { documentBytes: 3_000_000, totalBytes: 1 })).rejects.toThrow('limits');
  } finally {
    temporary.cleanup();
  }
});

test('revision and tag resolution distinguish tags, ancestry and unborn repositories', async () => {
  const { temporary, repository, git } = await objectRepository();
  try {
    expect(await git.revParse(repository, 'HEAD')).toBeNull();
    expect(await git.peelTag(repository, 'absent')).toBeNull();
    await expect(git.lsTree(repository, 'HEAD')).rejects.toThrow();
    writeFileSync(join(repository, 'a.yaml'), 'first');
    await git.addAll(repository);
    await git.commit(repository, 'First');
    const first = (await git.head(repository))!;
    await git.run(repository, ['tag', 'lightweight']);
    await git.run(repository, ['tag', '-a', 'annotated', '-m', 'Release']);
    writeFileSync(join(repository, 'a.yaml'), 'second');
    await git.addAll(repository);
    await git.commit(repository, 'Second');
    const second = (await git.head(repository))!;
    expect(await git.revParse(repository, 'HEAD')).toBe(second);
    expect(await git.peelTag(repository, 'lightweight')).toBe(first);
    expect(await git.peelTag(repository, 'refs/tags/annotated')).toBe(first);
    expect(await git.peelTag(repository, 'main')).toBeNull();
    expect(await git.isAncestor(repository, first, second)).toBe(true);
    expect(await git.isAncestor(repository, second, first)).toBe(false);
    await expect(git.isAncestor(repository, '0'.repeat(40), second)).rejects.toThrow('ancestry');
  } finally {
    temporary.cleanup();
  }
});
