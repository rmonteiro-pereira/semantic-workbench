// Confirms snapshot indexes read only immutable blobs, enforce bounds and share concurrent work.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { createSnapshotIndexes, SNAPSHOT_LIMITS } from '../src/server/projects/snapshot-index';
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
