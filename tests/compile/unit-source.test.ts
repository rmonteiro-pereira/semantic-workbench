// Checks where a unit comes from: unpublished edits stay out of the published source, a hidden file looks like a missing one, limits apply before any read, and a working copy is labelled unpublished.
import { expect, test } from 'bun:test';
import { HiddenResourceError, SnapshotUnavailableError } from '../../src/server/projects/errors';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { UnitLimitError, createUnitSource, type FolderView } from '../../src/server/tessera/unit-source';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { COMPILE_PROJECT, HIDDEN_FILE, ONTOLOGY_PATH, TESSERA_FILES, compileWorkspace, readerFor } from '../helpers/compile-workspace';

const decoder = new TextDecoder();
const EDITED = TESSERA_FILES[ONTOLOGY_PATH] + '# unpublished edit\n';

function textOf(files: { path: string; bytes: Uint8Array }[], path: string): string {
  return decoder.decode(files.find(file => file.path === path)!.bytes);
}

test('an unpublished edit and an unpublished commit are in the working copy but not in the published source', async () => {
  using workspace = await compileWorkspace();
  const { ws } = workspace;
  await workspace.editWorkingCopy(ONTOLOGY_PATH, EDITED);
  const source = workspaceUnitSource(ws, COMPILE_PROJECT, LOCAL_READER);
  expect(textOf((await source.read('working')).files, ONTOLOGY_PATH)).toBe(EDITED);
  expect(textOf((await source.read('published')).files, ONTOLOGY_PATH)).toBe(TESSERA_FILES[ONTOLOGY_PATH]);
  await ws.scm.stage(COMPILE_PROJECT, [ONTOLOGY_PATH]);
  await ws.scm.commit(COMPILE_PROJECT, 'Commit a note that is not published');
  expect(textOf((await source.read('published')).files, ONTOLOGY_PATH)).toBe(TESSERA_FILES[ONTOLOGY_PATH]);
});

test('the published source names its commit and the working source is labelled unpublished with no commit', async () => {
  using workspace = await compileWorkspace();
  const source = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const published = await source.read('published');
  expect(published.label).toEqual({ kind: 'published-snapshot', commit: published.commit!, unpublished: false });
  expect(published.commit).toMatch(/^[0-9a-f]{40,64}$/);
  const working = await source.read('working');
  expect(working.label).toEqual({ kind: 'working-copy', unpublished: true });
  expect(working.commit).toBeUndefined();
});

test('a hidden file refuses the unit with the answer for a missing file and names nothing', async () => {
  using workspace = await compileWorkspace();
  const source = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, readerFor('alice'));
  for (const kind of ['published', 'working'] as const) {
    const refusal = await source.read(kind).catch(error => error);
    expect(refusal).toBeInstanceOf(HiddenResourceError);
    expect(refusal.message).toBe('Not found.');
    expect(refusal.message).not.toContain('finance');
    expect(String(refusal.stack)).not.toContain(HIDDEN_FILE);
  }
  const allowed = await workspaceUnitSource(workspace.ws, COMPILE_PROJECT, readerFor('frank')).read('published');
  expect(allowed.files.map(file => file.path)).toContain(HIDDEN_FILE);
});

test('a project with no snapshot cannot be read as published but can be read as a working copy', async () => {
  using workspace = await compileWorkspace();
  const source = workspaceUnitSource(workspace.ws, workspace.unpublishedProject, LOCAL_READER);
  await expect(source.read('published')).rejects.toBeInstanceOf(SnapshotUnavailableError);
  expect((await source.read('working')).files.map(file => file.path)).toEqual(['notes.ontology.yaml']);
});

test('a file over the limit is refused before any content is read', async () => {
  const reads: string[] = [];
  const view: FolderView = {
    list: async () => [{ path: 'big.yaml', size: 11 }],
    read: async path => {
      reads.push(path);
      return new Uint8Array(11);
    },
  };
  const source = createUnitSource({
    canRead: () => true,
    openPublished: use => use({ ...view, commit: 'a'.repeat(40) }),
    openWorking: async () => view,
    limits: { documentBytes: 10, totalBytes: 100, projectFiles: 5 },
  });
  await expect(source.read('working')).rejects.toBeInstanceOf(UnitLimitError);
  await expect(source.read('published')).rejects.toThrow('limit is 10');
  expect(reads).toEqual([]);
});

test('too many files and too many bytes are refused with the limit named', async () => {
  const many: FolderView = { list: async () => [1, 2, 3].map(index => ({ path: `f${index}.yaml`, size: 1 })), read: async () => new Uint8Array(1) };
  const heavy: FolderView = { list: async () => [1, 2].map(index => ({ path: `f${index}.yaml`, size: 60 })), read: async () => new Uint8Array(60) };
  const deps = { canRead: () => true, openPublished: async () => ({}) as never };
  await expect(createUnitSource({ ...deps, openWorking: async () => many, limits: { documentBytes: 100, totalBytes: 100, projectFiles: 2 } }).read('working')).rejects.toThrow('limit is 2');
  await expect(createUnitSource({ ...deps, openWorking: async () => heavy, limits: { documentBytes: 100, totalBytes: 100, projectFiles: 5 } }).read('working')).rejects.toThrow('limit is 100');
});

test('a file that vanishes between the list and the read refuses the unit as missing', async () => {
  const view: FolderView = { list: async () => [{ path: 'gone.yaml', size: 1 }], read: async () => null };
  const source = createUnitSource({ canRead: () => true, openPublished: async () => ({}) as never, openWorking: async () => view });
  await expect(source.read('working')).rejects.toBeInstanceOf(HiddenResourceError);
});
