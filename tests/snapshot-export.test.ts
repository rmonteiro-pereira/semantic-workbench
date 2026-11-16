// Compares immutable exports with Git blobs and keeps the default archive's byte contract.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { testWorkspace } from './helpers/temp-data-dir';
import { publishFixture } from './helpers/published-workspace';
import { readZip } from './helpers/zip-reader';
import { repoDir } from '../src/server/projects/paths';

test('published exports contain exact committed bytes and no saved or unsaved draft', async () => {
  using fixture = await testWorkspace();
  const { slug } = await fixture.seed([{ path: 'shop.ontology.yaml', source: '# exact\r\nname: Published\r\nontology:\r\n  - concept: Customer\r\n    type: EntityType\r\n' }], 'Shop');
  await publishFixture(fixture);
  const directory = repoDir(fixture.ws.layout, slug);
  const pin = fixture.ws.published.pin();
  const commit = pin.commits.get(slug)!.commit;
  writeFileSync(join(directory, 'shop.ontology.yaml'), 'name: Draft\nontology: []\n');
  writeFileSync(join(directory, 'draft.ontology.yaml'), 'name: Draft only\nontology: []\n');
  const download = (query: string) => fixture.handler(new Request(`http://localhost/api/projects/${slug}/export${query}`));
  const defaultBefore = new Uint8Array(await (await download('')).arrayBuffer());
  const explicitEditing = new Uint8Array(await (await download('?source=editing')).arrayBuffer());
  expect(defaultBefore).toEqual(explicitEditing);
  const response = await download('?source=published');
  expect(response.status).toBe(200);
  expect(response.headers.has('X-Workbench-Snapshot')).toBe(false);
  const files = readZip(new Uint8Array(await response.arrayBuffer()));
  const tree = await fixture.ws.git.lsTree(directory, commit);
  expect([...files.keys()].sort()).toEqual(tree.map(file => file.path).sort());
  for (const file of tree) expect(files.get(file.path)).toEqual((await fixture.ws.git.blob(directory, commit, file.path))!);
  expect(files.has('draft.ontology.yaml')).toBe(false);
  expect(new Uint8Array(await (await download('')).arrayBuffer())).toEqual(defaultBefore);
  const refused = await download('?source=published&history=1');
  expect(refused.status).toBe(400);
  expect(await refused.json()).toEqual({ error: 'history is not available for the published source' });
  expect((await download('?source=unknown')).status).toBe(400);
});
