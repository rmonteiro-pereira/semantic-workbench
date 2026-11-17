// The commit route checks the branch, head and file versions it was prepared against, in one step with the commit, and rejects half-given or mixed keys.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { testWorkspace } from './helpers/temp-data-dir';
import { example } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../src/server/projects/reader';

const post = (handler: (request: Request) => Promise<Response>, slug: string, body: unknown) =>
  handler(new Request(`http://localhost/api/projects/${slug}/git/commit`, { method: 'POST', body: JSON.stringify(body) }));

async function prepare() {
  const workspace = await testWorkspace();
  const imported = await workspace.seed([{ path: 'a.ontology.yaml', source: await example('commerce', 'commerce.mapped-ontology.yaml') }], 'precondition');
  const directory = join(workspace.root, 'projects', imported.slug);
  const text = (await Bun.file(join(directory, 'a.ontology.yaml')).text()) + '# changed\n';
  writeFileSync(join(directory, 'a.ontology.yaml'), text);
  const head = await workspace.ws.git.head(directory);
  const branch = (await workspace.ws.git.run(directory, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim();
  return { workspace, slug: imported.slug, version: sha256(new TextEncoder().encode(text)), head, branch };
}

test('keys come as a set and cannot be mixed with paths', async () => {
  const { workspace, slug, version, head, branch } = await prepare();
  using _workspace = workspace;
  const files = [{ path: 'a.ontology.yaml', version }];
  expect((await post(workspace.handler, slug, { message: 'm', files })).status).toBe(400);
  expect((await post(workspace.handler, slug, { message: 'm', files, expectedBranch: branch, expectedHead: head, paths: ['a.ontology.yaml'] })).status).toBe(400);
  expect((await post(workspace.handler, slug, { message: 'm', files: [{ path: 'a.ontology.yaml', version: 'short' }], expectedBranch: branch, expectedHead: head })).status).toBe(400);
});

test('a moved head, a changed version and a wrong branch refuse with what changed, and a match commits', async () => {
  const { workspace, slug, version, head, branch } = await prepare();
  using _workspace = workspace;
  const files = [{ path: 'a.ontology.yaml', version }];
  const wrongHead = await post(workspace.handler, slug, { message: 'm', files, expectedBranch: branch, expectedHead: 'f'.repeat(40) });
  expect(wrongHead.status).toBe(409);
  expect(((await wrongHead.json()) as { changed: { head: unknown } }).changed.head).toBeDefined();
  const wrongVersion = await post(workspace.handler, slug, { message: 'm', files: [{ path: 'a.ontology.yaml', version: 'e'.repeat(64) }], expectedBranch: branch, expectedHead: head });
  expect(((await wrongVersion.json()) as { changed: { files: string[] } }).changed.files).toEqual(['a.ontology.yaml']);
  const wrongBranch = await post(workspace.handler, slug, { message: 'm', files, expectedBranch: 'elsewhere', expectedHead: head });
  expect(((await wrongBranch.json()) as { changed: { branch: { actual: string } } }).changed.branch.actual).toBe(branch);
  expect(await workspace.ws.git.head(join(workspace.root, 'projects', slug))).toBe(head);
  const accepted = await post(workspace.handler, slug, { message: 'Matched', files, expectedBranch: branch, expectedHead: head });
  expect(accepted.status).toBe(200);
});

test('a save of a listed file waits for the commit that checked it, so no save lands between the checks and the commit', async () => {
  const { workspace, slug, version, head, branch } = await prepare();
  using _workspace = workspace;
  const directory = join(workspace.root, 'projects', slug);
  const originalCommitPaths = workspace.ws.git.commitPaths.bind(workspace.ws.git);
  let saveFinished = false;
  let saveFinishedDuringCommit = false;
  let pendingSave: Promise<unknown> | undefined;
  workspace.ws.git.commitPaths = async (...args: Parameters<typeof originalCommitPaths>) => {
    const text = await Bun.file(join(directory, 'a.ontology.yaml')).text();
    pendingSave = workspace.ws.saveFile(slug, 'a.ontology.yaml', { baseHash: version, source: text + '# saved during the commit\n' }, LOCAL_READER).then(() => {
      saveFinished = true;
    });
    await Bun.sleep(500);
    saveFinishedDuringCommit = saveFinished;
    return originalCommitPaths(...args);
  };
  const accepted = await post(workspace.handler, slug, {
    message: 'Matched',
    files: [{ path: 'a.ontology.yaml', version }],
    expectedBranch: branch,
    expectedHead: head,
  });
  expect(accepted.status).toBe(200);
  expect(saveFinishedDuringCommit).toBe(false);
  await pendingSave;
  expect(saveFinished).toBe(true);
});
