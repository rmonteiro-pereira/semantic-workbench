// Tests document exports and preservation of source content.
import { test, expect } from 'bun:test';
import { exportDocument } from '../src/app/core/export';
import { inspect, editEntity } from '../src/shared/core/model';
test('exports every UBL artifact byte-for-byte with its original filename', async () => {
  for (const filename of ['ubl.owl.ttl', 'ubl.shacl.ttl', 'ubl.ontology.yaml', 'ubl.odcs.yaml', 'ubl.semantic.yaml']) {
    const source = await Bun.file('public/examples/ubl/' + filename).text();
    const result = exportDocument(source, filename);
    expect(result.filename).toBe(filename);
    expect(await result.blob.text()).toBe(source);
    expect(inspect(await result.blob.text(), filename).entities.length).toBeGreaterThan(30);
  }
});
test('export reflects unsaved edits and preserves JSON syntax', async () => {
  const source = JSON.stringify({
    name: 'Model',
    ontology: [{ concept: 'Customer', type: 'EntityType', unknown: 'preserved' }],
  });
  const edited = editEntity(source, ['ontology', 0], 'Changed before save');
  const out = exportDocument(edited, 'model.json');
  expect(out.blob.type).toContain('application/json');
  expect(JSON.parse(await out.blob.text()).ontology[0]).toEqual({
    concept: 'Customer',
    type: 'EntityType',
    unknown: 'preserved',
    description: 'Changed before save',
  });
});
