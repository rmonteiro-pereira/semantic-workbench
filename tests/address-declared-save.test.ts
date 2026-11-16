/** Validates declared migrations through the existing single and batch HTTP entry points. */
import { expect, test } from 'bun:test';
import { readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { testWorkspace } from './helpers/temp-data-dir';

const source = 'name: Scope\nontology: [{concept: Before}]\n';
for (const batch of [false, true]) {
  test(`${batch ? 'batch' : 'single'} save accepts an owned declaration atomically and preserves requests without declarations`, async () => {
    using workspace = await testWorkspace();
    const imported = await workspace.seed([{ path: 'model.yaml', source }], 'Sample');
    const slug = imported.slug;
    const file = workspace.ws.readFile(slug, 'model.yaml');
    const declaration = { kind: 'item' as const, from: `sw1:${slug}/model.yaml#ontology:Scope/concept:Before`, to: `sw1:${slug}/model.yaml#ontology:Scope/concept:After` };
    const write = { baseHash: file.hash, source: source.replace('Before', 'After') };
    const body = batch ? { files: [{ path: 'model.yaml', ...write }], declaredMigrations: [declaration] } : { ...write, declaredMigrations: [declaration] };
    const path = batch ? `/api/projects/${slug}/save-batch` : `/api/projects/${slug}/files/model.yaml`;
    const response = await workspace.handler(new Request('http://localhost' + path, { method: batch ? 'POST' : 'PUT', body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    const history = readAddressMigrations(dataLayout(workspace.root), slug, LOCAL_READER);
    expect(history.map(record => ({ kind: record.kind, from: record.from, to: record.to }))).toEqual([declaration]);
    expect(history[0].id).toMatch(/^m-.+-0$/);
    expect(history[0].commit).toMatch(/^[0-9a-f]{40}$/);
    const saved = workspace.ws.readFile(slug, 'model.yaml');
    const unchanged = batch ? { files: [{ path: 'model.yaml', baseHash: saved.hash, patches: [] }] } : { baseHash: saved.hash, patches: [] };
    expect((await workspace.handler(new Request('http://localhost' + path, { method: batch ? 'POST' : 'PUT', body: JSON.stringify(unchanged) }))).status).toBe(200);
    expect(readAddressMigrations(dataLayout(workspace.root), slug, LOCAL_READER)).toEqual(history);
  });

  test(`${batch ? 'batch' : 'single'} save refuses cross-project, unwritten-file and oversized declarations without changing definitions`, async () => {
    using workspace = await testWorkspace();
    const imported = await workspace.seed([{ path: 'model.yaml', source }], 'Sample');
    const slug = imported.slug;
    const file = workspace.ws.readFile(slug, 'model.yaml');
    const declaration = { kind: 'item' as const, from: `sw1:${slug}/model.yaml#ontology:Scope/concept:Before`, to: `sw1:${slug}/model.yaml#ontology:Scope/concept:After` };
    const invalid = [
      [{ ...declaration, to: declaration.to.replace(`sw1:${slug}/`, 'sw1:other/') }],
      [{ ...declaration, from: declaration.from.replace('model.yaml', 'unwritten.yaml') }],
      Array(65).fill(declaration),
    ];
    for (const declaredMigrations of invalid) {
      const write = { baseHash: file.hash, source: source.replace('Before', 'After') };
      const body = batch ? { files: [{ path: 'model.yaml', ...write }], declaredMigrations } : { ...write, declaredMigrations };
      const path = batch ? `/api/projects/${slug}/save-batch` : `/api/projects/${slug}/files/model.yaml`;
      const response = await workspace.handler(new Request('http://localhost' + path, { method: batch ? 'POST' : 'PUT', body: JSON.stringify(body) }));
      expect(response.status).toBe(400);
      expect(workspace.ws.readFile(slug, 'model.yaml').source).toBe(source);
      expect(readAddressMigrations(dataLayout(workspace.root), slug, LOCAL_READER)).toEqual([]);
    }
  });
}
