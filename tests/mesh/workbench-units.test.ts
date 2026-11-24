/** Validates a Tessera unit's source files through the workbench input path. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateInput } from '../../src/shared/validation/input';
import { editEntity, inspectOntologyUnit } from '../../src/shared/core/model';
import { duplicateUnitConcept } from '../../src/shared/edit/item-model';
import { readUnitStructure } from '../../src/shared/tessera/unit-structure';
import { indexBytes } from '../../src/server/projects/scanner';
import { activeOntologyUnit } from '../../src/app/workspace/ontologyUnit';
import { selectionAddress, selectionId } from '../../src/app/graph/selection-addresses';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { testWorkspace } from '../helpers/temp-data-dir';

function validateFixture(folder: string, path: string) {
  return validateInput(readFileSync(`tests/fixtures/tessera/mesh/units/${folder}/${path}`, 'utf8'), path);
}

test('roots and parts validate as their own documents and allow references across files', () => {
  for (const path of ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json']) {
    const result = validateFixture('three-parts', path);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  }
  expect(validateFixture('empty-root', 'ontology.yaml').valid).toBe(true);
});

test('an invalid part gets a specific schema finding, never an unchecked-version notice', () => {
  const result = validateInput(JSON.stringify({ tessera: 3, tessera_part: true, version: '0.2.0.dev0', ontology: [{ concept: 'A', type: 'EntityType' }] }), 'part.json');
  expect(result.valid).toBe(false);
  expect(result.issues).toMatchObject([{ code: 'tessera-part-shape', path: '/version' }]);
});

test('the scanner indexes fragments as ontology files and the dependency lock as project metadata', () => {
  const bytes = readFileSync('tests/fixtures/tessera/mesh/units/three-parts/orders.yaml');
  const part = indexBytes('retail', 'orders.yaml', bytes);
  expect(part.file).toMatchObject({ docType: 'Ossie ontology', valid: true, visible: true });
  expect(part.entities).toMatchObject([{ name: 'Order' }]);
  const manifest = indexBytes('retail', 'tessera-dependencies.json', Buffer.from(JSON.stringify({ manifestVersion: 1, root: 'ontology.yaml', providers: [] })));
  expect(manifest.file).toMatchObject({ docType: 'Tessera dependency manifest', valid: true, visible: true });
  expect(manifest.entities).toEqual([]);
});

test('inspection gives the same graph for the composed unit and the single file', () => {
  const splitFiles = ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json'];
  const { units } = readUnitStructure(
    splitFiles.map(path => ({
      path,
      data: JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/units/three-parts/${path}`, 'utf8')),
    })),
  );
  const composed = inspectOntologyUnit(units[0]);
  const twin = validateFixture('one-file-twin', 'ontology.yaml').model;
  if (!twin || !('document' in twin)) throw new Error('Expected the single-file ontology model.');
  expect(composed.entities).toEqual(twin.entities);
  expect(composed.edges).toEqual(twin.edges);
});

test('the workspace chooses the combined model only when every declared file is visible', () => {
  const project = 'retail';
  const documents = ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json'].map(path => {
    const source = readFileSync(`tests/fixtures/tessera/mesh/units/three-parts/${path}`, 'utf8');
    return { id: `${project}/${path}`, project, path, filename: path, hash: source, source };
  });
  const root = documents[0];
  const part = documents[1];
  const model = validateInput(root.source, root.filename).model;
  const composed = activeOntologyUnit(root, model, documents)!;
  expect(composed.entities.map(entity => entity.name)).toEqual(['Shop', 'Order', 'Return', 'Customer']);
  const order = composed.entities.find(entity => entity.name === 'Order')!;
  const selection = { project, document: [root.path], entities: composed.entities };
  const address = selectionAddress(selection, order.id);
  expect(address).toContain('sw1:retail/orders.yaml#');
  expect(selectionId(selection, address)).toBe(order.id);
  expect(composed.itemSources.get(order.path.join('/'))).toEqual({ file: 'orders.yaml', path: ['ontology', 0] });
  expect(activeOntologyUnit(root, model, documents.slice(0, -1))).toBeNull();
  const partModel = validateInput(part.source, part.filename).model;
  expect(activeOntologyUnit(part, partModel, documents)?.itemFiles.size).toBeGreaterThan(4);
  expect(activeOntologyUnit(part, partModel, documents.slice(1))).toBeNull();
});

test('an edit at a composed item location changes only its owning file', async () => {
  using workspace = await testWorkspace();
  const paths = ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json'];
  const rootPath = paths[0];
  const files = paths.map(path => ({
    path,
    source: readFileSync(`tests/fixtures/tessera/mesh/units/three-parts/${path}`, 'utf8'),
  }));
  const imported = await workspace.seed(files, 'Retail');
  const project = imported.slug;
  const before = Object.fromEntries(paths.map(path => [path, workspace.ws.readFile(project, path, LOCAL_READER)]));
  const { units } = readUnitStructure(files.map(({ path, source }) => ({ path, data: JSON.parse(source) })));
  const model = inspectOntologyUnit(units[0], project);
  const order = model.entities.find(entity => entity.name === 'Order')!;
  const target = model.itemSources.get(order.path.join('/'))!;
  const source = editEntity(before[target.file].source, target.path, 'A purchase.', target.file);
  await workspace.ws.saveFile(project, target.file, { baseHash: before[target.file].hash, source }, LOCAL_READER);
  expect(JSON.parse(workspace.ws.readFile(project, target.file, LOCAL_READER).source).ontology[0].description).toBe('A purchase.');
  for (const path of [rootPath, 'returns.yaml', 'customers.json']) expect(workspace.ws.readFile(project, path, LOCAL_READER).hash).toBe(before[path].hash);
});

test('the add form can report both files when a concept already belongs to another part', () => {
  const files = [
    { path: 'orders.yaml', document: { ontology: [{ concept: 'Order' }] } },
    { path: 'customers.json', document: { ontology: [{ concept: 'Customer' }] } },
  ];
  expect(duplicateUnitConcept('Order', 'customers.json', files)).toBe('Concept "Order" already exists in orders.yaml. It cannot also be added to customers.json.');
  expect(duplicateUnitConcept('Invoice', 'customers.json', files)).toBeUndefined();
});

test('an atomic save refuses duplicate concepts and records a stable address when a concept moves between parts', async () => {
  using workspace = await testWorkspace();
  const paths = ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json'];
  const files = paths.map(path => ({
    path,
    source: readFileSync(`tests/fixtures/tessera/mesh/units/three-parts/${path}`, 'utf8'),
  }));
  const { slug } = await workspace.seed(files, 'Retail');
  const orders = workspace.ws.readFile(slug, 'orders.yaml', LOCAL_READER);
  const customers = workspace.ws.readFile(slug, 'customers.json', LOCAL_READER);
  const original = JSON.parse(orders.source);
  const destination = JSON.parse(customers.source);
  destination.ontology.push(original.ontology[0]);
  const write = { path: customers.path, baseHash: customers.hash, source: JSON.stringify(destination) };
  const oldAddress = `sw1:${slug}/orders.yaml#ontology:Retail/concept:Order`;
  const newAddress = `sw1:${slug}/customers.json#ontology:Retail/concept:Order`;
  expect(workspace.ws.resolveAddress(oldAddress, LOCAL_READER)).toMatchObject({ status: 'found', address: oldAddress });
  await expect(workspace.ws.saveFile(slug, write.path, write, LOCAL_READER)).rejects.toThrow('orders.yaml, customers.json');
  expect(workspace.ws.readFile(slug, write.path, LOCAL_READER).hash).toBe(customers.hash);
  // Keep the original part populated because a fragment is an ontology concept list.
  original.ontology = [{ concept: 'OrderBatch', type: 'EntityType' }];
  const updated = { path: orders.path, baseHash: orders.hash, source: JSON.stringify(original) };
  await workspace.ws.saveFiles(slug, [updated, write], LOCAL_READER);
  expect(workspace.ws.resolveAddress(oldAddress, LOCAL_READER)).toMatchObject({ status: 'found', address: newAddress, item: { path: ['ontology', 1] } });
});
