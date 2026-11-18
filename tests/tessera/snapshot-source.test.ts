// Checks the command reads only the committed snapshot of the default branch and refuses sources it must not use, and that the disk source stays inside its folder.
import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SNAPSHOT_LIMITS } from '../../src/server/projects/snapshot-index';
import { UNIT_LIMITS } from '../../src/shared/tessera/compile-unit';
import { readFolder } from '../../src/server/tessera/disk-source';
import { TesseraRefusal } from '../../src/server/tessera/refusal';
import { gitFor, readSnapshot } from '../../src/server/tessera/snapshot-source';
import { ONTOLOGY_TEXT, PROJECT_FOLDER, createTesseraRepository, type TesseraRepository } from '../helpers/tessera-repository';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function repository(): TesseraRepository {
  const created = createTesseraRepository();
  cleanups.push(created.dispose);
  return created;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const request = (created: TesseraRepository, more: object = {}) => ({ repository: created.directory, projectFolder: PROJECT_FOLDER, ...more });

test('the snapshot holds the committed files of the project folder only, with the folder removed from their paths', async () => {
  const created = repository();
  const source = await readSnapshot(request(created));
  expect(source).toMatchObject({ kind: 'published-snapshot', branch: 'main', commit: created.firstCommit, projectFolder: PROJECT_FOLDER });
  expect(source.files.map(file => file.path).sort()).toEqual(['contract.odcs.yaml', 'mapping.yaml', 'ontology.yaml', 'semantic-model.yaml', 'vocabulary.ttl']);
  expect(decode(source.files.find(file => file.path === 'ontology.yaml')!.bytes)).toBe(ONTOLOGY_TEXT);
});

test('uncommitted edits, ignored files and a personal branch are absent from the snapshot', async () => {
  const created = repository();
  created.addPersonalBranch('personal/someone');
  created.editWithoutCommit(`${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT + '# uncommitted\n');
  created.editWithoutCommit(`${PROJECT_FOLDER}/new.yaml`, 'name: untracked\n');
  const source = await readSnapshot(request(created));
  expect(source.commit).toBe(created.firstCommit);
  expect(source.files.some(file => file.path === 'new.yaml')).toBe(false);
  expect(decode(source.files.find(file => file.path === 'ontology.yaml')!.bytes)).toBe(ONTOLOGY_TEXT);
});

test('a repository with no commit on the branch is refused as having no published snapshot', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'tessera-empty-'));
  cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
  const directory = join(empty, 'repository');
  mkdirSync(directory);
  Bun.spawnSync(['git', 'init', '-q', '-b', 'main'], { cwd: directory });
  await expect(readSnapshot({ repository: directory })).rejects.toThrow('no published snapshot');
});

test('an explicit commit on the default branch history is read, and one off it is refused', async () => {
  const created = repository();
  const offBranch = created.addPersonalBranch('personal/someone');
  const second = created.addSecondCommit();
  expect((await readSnapshot(request(created, { commit: created.firstCommit }))).commit).toBe(created.firstCommit);
  expect((await readSnapshot(request(created, { commit: second }))).commit).toBe(second);
  await expect(readSnapshot(request(created, { commit: offBranch }))).rejects.toThrow('not on the history');
  await expect(readSnapshot(request(created, { commit: created.firstCommit.slice(0, 10) }))).rejects.toThrow('full commit identifier');
});

function dataRootPointing(commit: string, repositoryName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'tessera-dataroot-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'state'));
  writeFileSync(join(root, 'state', 'published.json'), JSON.stringify({ formatVersion: 1, repositories: { [repositoryName]: { branch: 'main', commit } } }));
  return root;
}

test('with a data root the commit must equal the published one, so a branch moved ahead is refused', async () => {
  const created = repository();
  const name = created.directory.split('/').at(-1)!;
  const root = dataRootPointing(created.firstCommit, name);
  expect((await readSnapshot(request(created, { dataRoot: root }))).commit).toBe(created.firstCommit);
  created.addSecondCommit();
  await expect(readSnapshot(request(created, { dataRoot: root }))).rejects.toThrow('has published');
  expect((await readSnapshot(request(created, { dataRoot: root, commit: created.firstCommit }))).commit).toBe(created.firstCommit);
});

test('a data root without a record for the repository is refused', async () => {
  const created = repository();
  const root = dataRootPointing(created.firstCommit, 'another-repository');
  await expect(readSnapshot(request(created, { dataRoot: root }))).rejects.toThrow('has not published');
});

test('a file over the document limit is refused before any blob is read', async () => {
  const created = repository();
  const git = gitFor(created.directory);
  let blobsRead = false;
  const spying = Object.create(git, { catFileBatch: { value: async () => ((blobsRead = true), new Map()) } });
  await expect(readSnapshot(request(created), spying, { ...SNAPSHOT_LIMITS, documentBytes: 100 })).rejects.toThrow('limit');
  expect(blobsRead).toBe(false);
});

test('a total over the limit and a count over the limit are refused before any blob is read', async () => {
  const created = repository();
  const git = gitFor(created.directory);
  let blobsRead = false;
  const spying = Object.create(git, { catFileBatch: { value: async () => ((blobsRead = true), new Map()) } });
  await expect(readSnapshot(request(created), spying, { ...SNAPSHOT_LIMITS, totalBytes: 500 })).rejects.toThrow('limit');
  await expect(readSnapshot(request(created), spying, { ...SNAPSHOT_LIMITS, projectFiles: 2 })).rejects.toThrow('limit');
  expect(blobsRead).toBe(false);
});

test('the unit limits equal the published snapshot limits', () => {
  expect(UNIT_LIMITS).toEqual({ files: SNAPSHOT_LIMITS.projectFiles, totalBytes: SNAPSHOT_LIMITS.totalBytes, documentBytes: SNAPSHOT_LIMITS.documentBytes });
});

test('a folder name that leaves the repository is refused', async () => {
  const created = repository();
  await expect(readSnapshot(request(created, { projectFolder: '../outside' }))).rejects.toBeInstanceOf(TesseraRefusal);
});

function folderWith(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), 'tessera-disk-'));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

test('the disk source reads files as they are on disk, skipping Git metadata', () => {
  const folder = folderWith({ 'a.yaml': 'name: a\n', 'nested/b.yaml': 'name: b\n', '.git/config': 'x' });
  const source = readFolder(folder);
  expect(source.kind).toBe('files-on-disk');
  expect(source.files.map(file => file.path).sort()).toEqual(['a.yaml', 'nested/b.yaml']);
});

test('the disk source skips a symbolic link that points out of the folder', () => {
  const outside = folderWith({ 'secret.yaml': 'name: secret\n' });
  const folder = folderWith({ 'a.yaml': 'name: a\n' });
  symlinkSync(join(outside, 'secret.yaml'), join(folder, 'link.yaml'));
  symlinkSync(outside, join(folder, 'linked-folder'));
  expect(readFolder(folder).files.map(file => file.path)).toEqual(['a.yaml']);
});

test('the disk source refuses a file over the limit before reading it', () => {
  const folder = folderWith({ 'big.yaml': 'x'.repeat(200) });
  expect(() => readFolder(folder, { ...SNAPSHOT_LIMITS, documentBytes: 100 })).toThrow('limit');
});
