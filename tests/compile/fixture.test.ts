// Checks the compile fixture: the published commit holds exactly the committed bytes, the working copy can differ from it, and the second project has no snapshot.
import { expect, test } from 'bun:test';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { COMPILE_PROJECT, HIDDEN_FILE, ONTOLOGY_PATH, TESSERA_FILES, compileWorkspace, readerFor } from '../helpers/compile-workspace';

const decoder = new TextDecoder();

test('the published snapshot holds exactly the committed bytes and the working copy can differ', async () => {
  using workspace = await compileWorkspace();
  const { ws } = workspace;
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# unpublished edit\n');
  const published = await ws.published.withPin(async pin => decoder.decode((await ws.published.fileBytes(pin, COMPILE_PROJECT, ONTOLOGY_PATH))!));
  expect(published).toBe(TESSERA_FILES[ONTOLOGY_PATH]);
  expect(ws.readFile(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER).source).toBe(TESSERA_FILES[ONTOLOGY_PATH] + '# unpublished edit\n');
});

test('the published project holds every kind of file and a folder that only some people may read', async () => {
  using workspace = await compileWorkspace();
  const { ws } = workspace;
  const paths = await ws.published.withPin(pin => ws.published.filePaths(pin, COMPILE_PROJECT));
  for (const path of Object.keys(TESSERA_FILES)) expect(paths).toContain(path);
  expect(paths).toContain(HIDDEN_FILE);
  expect(readerFor('alice').view!.canRead(COMPILE_PROJECT, HIDDEN_FILE)).toBe(false);
  expect(readerFor('frank').view!.canRead(COMPILE_PROJECT, HIDDEN_FILE)).toBe(true);
});

test('the second project has no published snapshot', async () => {
  using workspace = await compileWorkspace();
  const { ws } = workspace;
  await expect(ws.published.withPin(pin => ws.published.filePaths(pin, workspace.unpublishedProject))).rejects.toThrow('no published snapshot');
});
