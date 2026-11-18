// Checks the conversion of one Tessera ontology: success writes exactly one file equal to the bundle's file, and every unsafe case is refused with nothing written.
import { expect, test } from 'bun:test';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { LOCAL_READER, type Reader } from '../../src/server/projects/reader';
import { checkUnit } from '../../src/server/tessera/compile-service';
import { ConvertRefusal, convertToStandard } from '../../src/server/tessera/convert-service';
import type { ConvertRequest } from '../../src/server/tessera/compile-request';
import { workspaceConversion } from '../../src/server/tessera/workspace-conversion';
import { COMPILE_PROJECT, ONTOLOGY_PATH, TESSERA_FILES, compileWorkspace, snapshotOfFolder } from '../helpers/compile-workspace';
import { repoDir } from '../../src/server/projects/paths';

type Workspace = Awaited<ReturnType<typeof compileWorkspace>>;

/** Commits the working copy so the file is clean against Git, as a person would before converting. */
async function commitAll(workspace: Workspace, message: string) {
  await workspace.ws.scm.stage(COMPILE_PROJECT, [ONTOLOGY_PATH]);
  await workspace.ws.scm.commit(COMPILE_PROJECT, message);
}

/** What the review would send: the file version, every input hash and the unit's digest. */
async function reviewed(workspace: Workspace, reader: Reader = LOCAL_READER): Promise<ConvertRequest> {
  const deps = workspaceConversion(workspace.ws, COMPILE_PROJECT, reader);
  const check = await checkUnit(deps.units, { source: 'working' });
  return {
    path: ONTOLOGY_PATH,
    baseHash: deps.currentFile(ONTOLOGY_PATH)!.hash,
    inputs: check.report.inputs.map(input => ({ path: input.path, sha256: input.sha256 })),
    digest: check.report.digest,
  };
}

async function refusalOf(work: Promise<unknown>): Promise<ConvertRefusal> {
  const error = await work.then(
    () => null,
    thrown => thrown,
  );
  expect(error).toBeInstanceOf(ConvertRefusal);
  return error as ConvertRefusal;
}

const projectFiles = (workspace: Workspace) => snapshotOfFolder(repoDir(workspace.ws.layout, COMPILE_PROJECT));
const withoutGit = (files: Map<string, string>) => new Map([...files].filter(([path]) => !path.startsWith('.git/')));

test('a reviewed conversion changes exactly one file and it equals the file the bundle would hold', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const before = withoutGit(projectFiles(workspace));
  const deps = workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const answer = await convertToStandard(deps, request);
  const after = withoutGit(projectFiles(workspace));
  const changed = [...after].filter(([path, hash]) => before.get(path) !== hash).map(([path]) => path);
  expect(changed).toEqual([ONTOLOGY_PATH]);
  expect(after.size).toBe(before.size);
  const unit = await deps.units.read('working');
  const expected = compileUnit(
    unit.files.map(file => (file.path === ONTOLOGY_PATH ? { path: file.path, bytes: new TextEncoder().encode(TESSERA_FILES[ONTOLOGY_PATH]) } : file)),
    { lossPolicySha256: null },
  ).outputs.find(file => file.path === ONTOLOGY_PATH)!;
  expect(after.get(ONTOLOGY_PATH)).toBe(sha256Hex(expected.bytes));
  expect(answer).toMatchObject({ path: ONTOLOGY_PATH, lossDigest: request.digest });
  expect(answer.version).toBe(after.get(ONTOLOGY_PATH)!);
  expect(workspace.ws.readFile(COMPILE_PROJECT, ONTOLOGY_PATH, LOCAL_READER).source).not.toContain('tessera');
});

test('a file with uncommitted changes is refused as dirty and nothing is written', async () => {
  using workspace = await compileWorkspace();
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# not committed\n');
  const request = await reviewed(workspace);
  const before = projectFiles(workspace);
  const refusal = await refusalOf(convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), request));
  expect(refusal.code).toBe('dirty');
  expect(refusal.message).toContain('Commit or discard');
  expect(projectFiles(workspace)).toEqual(before);
});

test('a committed edit converts, because Git then holds the backup', async () => {
  using workspace = await compileWorkspace();
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# committed\n');
  await commitAll(workspace, 'Commit the edit');
  const answer = await convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), await reviewed(workspace));
  expect(answer.path).toBe(ONTOLOGY_PATH);
});

test('a stale base hash is refused as a version conflict', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const refusal = await refusalOf(convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), { ...request, baseHash: 'f'.repeat(64) }));
  expect(refusal.code).toBe('version-changed');
});

test('a sibling file that changed after the review is a digest mismatch', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const mapping = workspace.ws.readFile(COMPILE_PROJECT, 'retail.mapping.yaml', LOCAL_READER);
  await workspace.ws.saveFile(COMPILE_PROJECT, 'retail.mapping.yaml', { baseHash: mapping.hash, source: mapping.source + '# a comment\n' }, LOCAL_READER);
  const refusal = await refusalOf(convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), request));
  expect(refusal.code).toBe('digest-mismatch');
});

test('a digest that is not the one recomputed is a digest mismatch', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const refusal = await refusalOf(convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), { ...request, digest: 'sha256:' + '0'.repeat(64) }));
  expect(refusal.code).toBe('digest-mismatch');
});

test('a file that is not a Tessera ontology is refused', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const refusal = await refusalOf(
    convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), {
      ...request,
      path: 'retail.semantic.yaml',
      baseHash: sha256Hex(new TextEncoder().encode(TESSERA_FILES['retail.semantic.yaml'])),
    }),
  );
  expect(refusal.code).toBe('not-tessera');
});

test('a project with no history is refused because there would be no backup', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const deps = workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER);
  const refusal = await refusalOf(convertToStandard({ ...deps, committedState: async () => 'no-history' }, request));
  expect(refusal.code).toBe('no-history');
});

test('a unit that would fail once the file is standard is refused with the findings and nothing is written', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const before = withoutGit(projectFiles(workspace));
  let calls = 0;
  const failsAfterConversion: typeof compileUnit = (files, options) => {
    calls += 1;
    const result = compileUnit(files, options);
    if (calls < 2) return result;
    return { ...result, failures: [{ code: 'meaning', document: 'retail.mapping.yaml', message: 'The mapping no longer finds its concept.' }] };
  };
  const refusal = await refusalOf(convertToStandard(workspaceConversion(workspace.ws, COMPILE_PROJECT, LOCAL_READER), request, failsAfterConversion));
  expect(refusal.code).toBe('refused');
  expect(refusal.findings.map(finding => finding.message)).toContain('The mapping no longer finds its concept.');
  expect(withoutGit(projectFiles(workspace))).toEqual(before);
});

test('a content guard that refuses the save stops the conversion and nothing is written', async () => {
  using workspace = await compileWorkspace();
  const request = await reviewed(workspace);
  const refuse = () => {
    throw new Error('guarded');
  };
  const guarded = { ...LOCAL_READER, guard: refuse } as unknown as Reader;
  const before = withoutGit(projectFiles(workspace));
  const deps = workspaceConversion(workspace.ws, COMPILE_PROJECT, guarded);
  await expect(convertToStandard(deps, request)).rejects.toThrow('guarded');
  expect(withoutGit(projectFiles(workspace))).toEqual(before);
});
