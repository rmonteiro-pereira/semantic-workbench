// Confirms snapshot indexes read only immutable blobs, enforce bounds and share concurrent work.
import { expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { createSnapshotIndexes, SNAPSHOT_LIMITS } from '../src/server/projects/snapshot-index';
import { createCache } from '../src/server/projects/cache';
import { indexBytes } from '../src/server/projects/scanner';
import { SnapshotUnavailableError } from '../src/server/projects/errors';
import { publicationRepository } from './helpers/git-fixtures';
const project = { slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' };

function setup() {
  const fixture = publicationRepository();
  const git = createGit({ projectsRoot: join(fixture.dir, 'projects') });
  return { fixture, git, directory: () => fixture.repository };
}

test('snapshot documents equal committed bytes including ignored tracked files and exclude dirty and untracked content', async () => {
  const { fixture, git, directory } = setup();
  try {
    const committed = 'name: Exact\r\nontology: [{concept: Customer}]\r\n';
    writeFileSync(join(fixture.repository, 'ignored.yaml'), committed);
    writeFileSync(join(fixture.repository, 'image.bin'), new Uint8Array([255, 0]));
    await git.run(fixture.repository, ['add', '--', 'image.bin']);
    await git.run(fixture.repository, ['add', '--', 'ignored.yaml']);
    writeFileSync(join(fixture.repository, '.gitignore'), 'ignored.yaml\n');
    await git.addAll(fixture.repository);
    await git.commit(fixture.repository, 'Tracked ignored definition');
    const commit = (await git.head(fixture.repository))!;
    writeFileSync(join(fixture.repository, 'ignored.yaml'), 'dirty');
    writeFileSync(join(fixture.repository, 'untracked.yaml'), 'untracked');
    const index = await createSnapshotIndexes({ git, directory }).build('definitions', commit, [project]);
    const files = index.projects.get('definitions')!;
    const exact = files.find(file => file.document.path === 'ignored.yaml')!;
    expect(exact.document.source).toBe(committed);
    expect(exact.bytes).toEqual((await git.blob(fixture.repository, commit, 'ignored.yaml'))!);
    expect(files.some(file => file.document.path === 'untracked.yaml')).toBe(false);
    expect(Object.isFrozen(exact.document)).toBe(true);
    expect(exact.metadata.visible).toBe(true);
    const binary = files.find(file => file.document.path === 'image.bin')!;
    expect(binary.metadata.visible).toBe(false);
    expect(binary.bytes).toEqual(new Uint8Array([255, 0]));
  } finally {
    fixture.dispose();
  }
});

for (const limits of [
  { ...SNAPSHOT_LIMITS, documentBytes: 1 },
  { ...SNAPSHOT_LIMITS, totalBytes: 1 },
  { ...SNAPSHOT_LIMITS, projectFiles: 0 },
]) {
  test(`snapshot refuses an exceeded limit ${JSON.stringify(limits)}`, async () => {
    const { fixture, git, directory } = setup();
    try {
      const indexes = createSnapshotIndexes({ git, directory, limits });
      await expect(indexes.build('definitions', fixture.published!, [project])).rejects.toBeInstanceOf(SnapshotUnavailableError);
    } finally {
      fixture.dispose();
    }
  });
}

test('twenty concurrent callers share one object build', async () => {
  const { fixture, git, directory } = setup();
  try {
    let builds = 0;
    const lsTree = git.lsTree;
    git.lsTree = async (...args) => {
      builds++;
      return lsTree(...args);
    };
    const indexes = createSnapshotIndexes({ git, directory });
    const results = await Promise.all(Array.from({ length: 20 }, () => indexes.build('definitions', fixture.published!, [project])));
    expect(builds).toBe(1);
    expect(results.every(result => result === results[0])).toBe(true);
  } finally {
    fixture.dispose();
  }
});

test('case-variant paths refuse the entire snapshot', async () => {
  const { fixture, git, directory } = setup();
  try {
    writeFileSync(join(fixture.repository, 'Shop.ontology.yaml'), 'name: Case\nontology: []\n');
    await git.addAll(fixture.repository);
    await git.commit(fixture.repository, 'Case collision');
    const indexes = createSnapshotIndexes({ git, directory });
    await expect(indexes.build('definitions', (await git.head(fixture.repository))!, [project])).rejects.toBeInstanceOf(SnapshotUnavailableError);
  } finally {
    fixture.dispose();
  }
});

test('an identical file reuses the parse already held by the local cache', async () => {
  const { fixture, git, directory } = setup();
  const cache = createCache(join(fixture.dir, 'parse-cache.sqlite'));
  try {
    const path = 'shop.ontology.yaml';
    const bytes = (await git.blob(fixture.repository, fixture.published!, path))!;
    const indexed = indexBytes('definitions', path, bytes);
    const cached = { ...indexed.file, indexedAt: '2000-01-01T00:00:00.000Z' };
    cache.put(cached, indexed.entities, indexed.findings);
    const snapshot = await createSnapshotIndexes({ git, directory, cache }).build('definitions', fixture.published!, [project]);
    expect(snapshot.projects.get('definitions')![0].document.updated).toBe(cached.indexedAt);
  } finally {
    cache.close();
    fixture.dispose();
  }
});

test('a missing partial-clone blob never yields a partial index and a repaired object can be retried', async () => {
  const { fixture, git, directory } = setup();
  try {
    const entry = (await git.lsTree(fixture.repository, fixture.published!))[0];
    const bytes = (await git.blob(fixture.repository, fixture.published!, entry.path))!;
    unlinkSync(join(fixture.repository, '.git', 'objects', entry.id.slice(0, 2), entry.id.slice(2)));
    const indexes = createSnapshotIndexes({ git, directory });
    for (let attempt = 0; attempt < 2; attempt++) await expect(indexes.build('definitions', fixture.published!, [project])).rejects.toMatchObject({ reason: 'unavailable' });
    await git.run(fixture.repository, ['hash-object', '-w', '--stdin'], { stdin: new TextDecoder().decode(bytes) });
    expect((await indexes.build('definitions', fixture.published!, [project])).projects.get('definitions')![0].bytes).toEqual(bytes);
  } finally {
    fixture.dispose();
  }
});

test('an object-read timeout fails closed and does not retain an unfinished build', async () => {
  const { fixture } = setup();
  try {
    const binary = join(fixture.dir, 'slow-git');
    writeFileSync(binary, '#!/bin/sh\nexec sleep 5\n', { mode: 0o700 });
    const git = createGit({ projectsRoot: join(fixture.dir, 'projects'), binary, timeoutMs: 50 });
    const indexes = createSnapshotIndexes({ git, directory: () => fixture.repository });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(indexes.build('definitions', fixture.published!, [project])).rejects.toMatchObject({ reason: 'unavailable' });
    }
  } finally {
    fixture.dispose();
  }
});
