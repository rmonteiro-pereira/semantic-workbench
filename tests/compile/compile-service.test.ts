// Checks the three read operations against the recorded golden bundle, that check returns no compiled bytes, and that none of them writes into the project, the working copy or the data folder.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { SnapshotChangedError, checkUnit, compilePublished, runCompile } from '../../src/server/tessera/compile-service';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { COMPILE_PROJECT, ONTOLOGY_PATH, TESSERA_FILES, compileWorkspace, snapshotOfFolder } from '../helpers/compile-workspace';

const GOLDEN = 'tests/fixtures/compile/golden';
const decoder = new TextDecoder();

async function digestOf(units: ReturnType<typeof workspaceUnitSource>): Promise<string> {
  const answer = await runCompile(units, {});
  if (answer.result !== 'loss-needs-acceptance') throw new Error('The fixture must need acceptance.');
  return answer.report.digest;
}

test('a release for the exact digest holds the golden files, with the commit it read in the manifest', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const outcome = await compilePublished(units, { accept: { digest: await digestOf(units) } });
  if (outcome.result !== 'released') throw new Error('Expected a release.');
  for (const entry of outcome.bundle) {
    const text = decoder.decode(entry.bytes).replace(outcome.commit, '<commit>');
    expect(text, entry.path).toBe(readFileSync(join(GOLDEN, entry.path), 'utf8'));
  }
  expect(outcome.bundle.length).toBe(9);
  expect(outcome.manifest.source).toMatchObject({ kind: 'published-snapshot', commit: outcome.commit });
  expect(outcome.manifest.loss.accepted).toBe('digest');
});

test('without acceptance, or with a stale digest, nothing is released and the fresh report is shown', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const none = await runCompile(units, {});
  expect(none.result).toBe('loss-needs-acceptance');
  const stale = await runCompile(units, { accept: { digest: 'sha256:' + '0'.repeat(64) } });
  expect(stale.result).toBe('loss-needs-acceptance');
  expect(JSON.stringify(stale)).not.toContain('"manifest"');
});

test('a run names the files with their sizes and reads one part of one file', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const accept = { digest: await digestOf(units) };
  const answer = await runCompile(units, { accept }, undefined);
  if (answer.result !== 'released') throw new Error('Expected a release.');
  expect(answer.files.map(file => file.path)).toContain('manifest.json');
  const commit = answer.manifest.source.commit;
  const withPart = await runCompile(units, { accept, commit }, { path: ONTOLOGY_PATH, offset: 0 });
  if (withPart.result !== 'released') throw new Error('Expected a release.');
  expect(withPart.part).toMatchObject({ path: ONTOLOGY_PATH, offset: 0, nextOffset: null });
  expect(withPart.part!.text).toBe(readFileSync(join(GOLDEN, ONTOLOGY_PATH), 'utf8'));
  await expect(runCompile(units, { accept }, { path: ONTOLOGY_PATH, offset: 0 })).rejects.toThrow('needs the commit');
});

test('a commit that is no longer the published one answers snapshot-changed with the current commit', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const error = await runCompile(units, { commit: 'f'.repeat(40) }).catch(thrown => thrown);
  expect(error).toBeInstanceOf(SnapshotChangedError);
  expect(error.current).toMatch(/^[0-9a-f]{40,64}$/);
});

test('check of the published source returns findings and the report but no bytes, and writes nothing anywhere', async () => {
  using workspace = await compileWorkspace();
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# unpublished edit\n');
  const before = snapshotOfFolder(workspace.fixture.root);
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const answer = await checkUnit(units, { source: 'published' });
  expect(answer).not.toHaveProperty('part');
  expect(JSON.stringify(answer)).not.toContain('manifest');
  expect(answer.result).toBe('loss');
  expect(answer.source.kind).toBe('published-snapshot');
  expect(answer.report.losses.length).toBe(3);
  expect(answer.files.find(file => file.path === ONTOLOGY_PATH)?.treatment).toBe('compiled');
  expect(snapshotOfFolder(workspace.fixture.root)).toEqual(before);
});

test('check of the working copy is labelled unpublished and sees the unpublished edit', async () => {
  using workspace = await compileWorkspace();
  const added = TESSERA_FILES[ONTOLOGY_PATH] + '  - concept: Return\n    type: EntityType\n    description: A returned order.\n    tessera_notes: A new note that is not published.\n';
  await workspace.editWorkingCopy(ONTOLOGY_PATH, added);
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const working = await checkUnit(units, { source: 'working' });
  expect(working.source).toEqual({ kind: 'working-copy', unpublished: true });
  expect(working.report.losses.length).toBe(4);
  const published = await checkUnit(units, { source: 'published' });
  expect(published.report.losses.length).toBe(3);
});

test('check accepts a loss policy only to say whether the report would count as accepted', async () => {
  using workspace = await compileWorkspace();
  const units = workspaceUnitSource(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  expect((await checkUnit(units, { source: 'published' })).accepted).toBe(false);
  expect((await checkUnit(units, { source: 'published', lossPolicy: { policy: 1, allow: ['tessera_notes'] } })).accepted).toBe(true);
  expect((await checkUnit(units, { source: 'published', lossPolicy: { policy: 1, allow: [] } })).accepted).toBe(false);
});
