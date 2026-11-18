// Checks that the download over HTTP and the command line give the same bytes for the same snapshot, that two compiles at once agree, and that a publish during a compile does not change the commit it reports.
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { compilePublished } from '../../src/server/tessera/compile-service';
import { workspaceUnitSource, type UnitWorkspace } from '../../src/server/tessera/workspace-unit-source';
import { COMPILE_PROJECT, ONTOLOGY_PATH, TESSERA_FILES, compileWithCommandLine, compileWorkspace, sendToCompile } from '../helpers/compile-workspace';
import { readZip } from '../helpers/zip-reader';

const base = `/api/projects/${COMPILE_PROJECT}/compile`;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function releasedFor(workspace: Awaited<ReturnType<typeof compileWorkspace>>) {
  const first = await (await sendToCompile(workspace, base, {})).json();
  return { digest: first.report.digest as string, commit: first.source.commit as string };
}

test('the zip from the download and the command line bundle have equal bytes for every file', async () => {
  using workspace = await compileWorkspace();
  const { digest, commit } = await releasedFor(workspace);
  const zip = readZip(new Uint8Array(await (await sendToCompile(workspace, `${base}/bundle?accept=${digest}&commit=${commit}`)).arrayBuffer()));
  const bundle = compileWithCommandLine(workspace, COMPILE_PROJECT, { acceptLoss: digest, commit });
  expect(bundle.status).toBe(0);
  expect([...zip.keys()].sort()).toEqual([...bundle.files.keys()].sort());
  for (const [path, bytes] of bundle.files) expect(sha256(zip.get(path)!), path).toBe(sha256(bytes));
});

test('two downloads at once give the same archive', async () => {
  using workspace = await compileWorkspace();
  const { digest, commit } = await releasedFor(workspace);
  const download = async () => new Uint8Array(await (await sendToCompile(workspace, `${base}/bundle?accept=${digest}&commit=${commit}`)).arrayBuffer());
  const [first, second] = await Promise.all([download(), download()]);
  expect(sha256(first)).toBe(sha256(second));
  expect(first.length).toBeGreaterThan(0);
});

async function publishAnotherCommit(workspace: Awaited<ReturnType<typeof compileWorkspace>>) {
  await workspace.editWorkingCopy(ONTOLOGY_PATH, TESSERA_FILES[ONTOLOGY_PATH] + '# published later\n');
  await workspace.ws.scm.stage(COMPILE_PROJECT, [ONTOLOGY_PATH]);
  await workspace.ws.scm.commit(COMPILE_PROJECT, 'Change published during a compile');
  await workspace.ws.publish(COMPILE_PROJECT, LOCAL_READER);
}

test('a publish while the compile is reading does not change the commit or the files it reports', async () => {
  using workspace = await compileWorkspace();
  const { ws } = workspace;
  const { digest, commit } = await releasedFor(workspace);
  let published = false;
  const interfering: UnitWorkspace = {
    ...ws,
    published: {
      ...ws.published,
      fileBytes: async (pin, project, path) => {
        if (!published) {
          published = true;
          await publishAnotherCommit(workspace);
        }
        return ws.published.fileBytes(pin, project, path);
      },
      withPin: use => ws.published.withPin(use),
      fileSizes: (pin, project) => ws.published.fileSizes(pin, project),
    },
    repoOf: slug => ws.repoOf(slug),
    layoutFor: (slug, reader) => ws.layoutFor(slug, reader),
  };
  const outcome = await compilePublished(workspaceUnitSource(interfering, COMPILE_PROJECT, LOCAL_READER), { accept: { digest } });
  expect(published).toBe(true);
  if (outcome.result !== 'released') throw new Error('Expected a release.');
  expect(outcome.commit).toBe(commit);
  expect(outcome.manifest.source.commit).toBe(commit);
  expect(outcome.report.digest).toBe(digest);
  const afterwards = await (await sendToCompile(workspace, base, {})).json();
  expect(afterwards.source.commit).not.toBe(commit);
});
