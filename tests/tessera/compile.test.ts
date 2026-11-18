// Checks compiling one Tessera ontology removes the marker and every addition, reports each loss and refuses what it cannot compile.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { compileDocument, type CompiledDocument } from '../../src/shared/tessera/compile-document';
import { compileUnit, type UnitFile } from '../../src/shared/tessera/compile-unit';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { REGISTRY, createRegistry, type AdditionEntry } from '../../src/shared/tessera/registry';
import { RESERVED_NAMES } from '../../src/shared/tessera/reserved-names';
import { COMMITTED_FILES, PROJECT_FOLDER } from '../helpers/tessera-repository';

const folder = join(import.meta.dir, '../fixtures/tessera/documents');
const read = (name: string) => readFileSync(join(folder, name), 'utf8');
const NOTES_YAML = read('notes-everywhere.yaml');
const NOTES_JSON = JSON.stringify(parse(NOTES_YAML), null, 2) + '\n';

function released(result: CompiledDocument) {
  if (!result.ok) throw new Error(result.failures.map(failure => failure.message).join('\n'));
  return result;
}

for (const [label, path, source] of [
  ['YAML', 'retail.ontology.yaml', NOTES_YAML],
  ['JSON', 'retail.ontology.json', NOTES_JSON],
] as const) {
  test(`${label}: notes at the root, two concepts and a relationship are dropped and listed`, () => {
    const result = released(compileDocument({ path, source }, REGISTRY));
    expect(result.text).not.toContain('tessera');
    expect(result.losses.map(loss => [loss.pointer, loss.property])).toEqual([
      ['/tessera_notes', 'tessera_notes'],
      ['/ontology/0/tessera_notes', 'tessera_notes'],
      ['/ontology/0/relationships/0/tessera_notes', 'tessera_notes'],
      ['/ontology/1/tessera_notes', 'tessera_notes'],
    ]);
    expect(result.losses.map(loss => loss.item)).toEqual([
      'sw1:#ontology:Retail',
      'sw1:#ontology:Retail/concept:Order',
      'sw1:#ontology:Retail/concept:Order/relationship:placed_by',
      'sw1:#ontology:Retail/concept:Customer',
    ]);
  });

  test(`${label}: a loss records the size and hash of the value and never the value`, () => {
    const result = released(compileDocument({ path, source }, REGISTRY));
    const concept = result.losses.find(loss => loss.pointer === '/ontology/1/tessera_notes')!;
    const encoded = JSON.stringify('Customers are people, not accounts.');
    expect(concept.bytes).toBe(new TextEncoder().encode(encoded).length);
    expect(concept.sha256).toBe(sha256Hex(encoded));
    expect(JSON.stringify(result.losses)).not.toContain('Customers are people');
  });

  test(`${label}: the output data equals the source data without the marker and the notes`, () => {
    const result = released(compileDocument({ path, source }, REGISTRY));
    const sourceData = label === 'JSON' ? JSON.parse(source) : parse(source);
    delete sourceData.tessera;
    delete sourceData.tessera_notes;
    for (const concept of sourceData.ontology) {
      delete concept.tessera_notes;
      for (const relationship of concept.relationships ?? []) delete relationship.tessera_notes;
    }
    expect(result.data).toEqual(sourceData);
  });
}

test('a document with the marker only compiles with no loss', () => {
  for (const name of ['valid.yaml', 'valid.json']) {
    const result = released(compileDocument({ path: name, source: read(name) }, REGISTRY));
    expect(result.losses).toEqual([]);
    expect(result.text).not.toContain('tessera');
  }
});

test('a license header above the marker stays at the top of the output', () => {
  const source = '# Licensed under the Apache License.\ntessera: 1\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n';
  const result = released(compileDocument({ path: 'a.yaml', source }, REGISTRY));
  expect(result.text.startsWith('# Licensed under the Apache License.')).toBe(true);
});

const later = (disposition: AdditionEntry['disposition']) => createRegistry([...REGISTRY.additions, { ...REGISTRY.additions[0], name: 'tessera_later', since: 1, disposition }], RESERVED_NAMES);
const withLater = NOTES_YAML.replace('    type: EntityType\n    description: A customer order.', '    type: EntityType\n    description: A customer order.\n    tessera_later: x');

test('an addition whose disposition is refuse fails the compile as a translation failure', () => {
  const result = compileDocument({ path: 'a.yaml', source: withLater }, later('refuse'));
  expect(result.ok).toBe(false);
  expect(!result.ok && result.failures.map(failure => failure.code)).toEqual(['translation']);
});

test('an addition whose disposition is translate fails because revision 1 defines no rewrite', () => {
  const result = compileDocument({ path: 'a.yaml', source: withLater }, later('translate'));
  expect(!result.ok && result.failures.map(failure => failure.code)).toEqual(['translation']);
});

test('an addition the registry does not know fails the compile', () => {
  const result = compileDocument({ path: 'a.yaml', source: withLater }, REGISTRY);
  expect(!result.ok && result.failures.map(failure => failure.code)).toEqual(['invalid-source']);
});

test('a number a double cannot hold fails the compile instead of changing digits', () => {
  const source = '{ "tessera": 1, "version": "0.2.0.dev0", "name": "x", "ontology": [{ "concept": "A", "type": "EntityType", "code": 12345678901234567890 }] }';
  const result = compileDocument({ path: 'a.json', source }, REGISTRY);
  expect(!result.ok && result.failures.map(failure => failure.code)).toEqual(['serialization']);
});

test('text that is not a document fails as an invalid source', () => {
  expect(compileDocument({ path: 'a.json', source: '{ nope' }, REGISTRY).ok).toBe(false);
  expect(compileDocument({ path: 'a.yaml', source: 'a: [1,' }, REGISTRY).ok).toBe(false);
});

// Compiling a project folder.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const options = { lossPolicySha256: null };
const projectFiles: UnitFile[] = Object.entries(COMMITTED_FILES)
  .filter(([path]) => path.startsWith(PROJECT_FOLDER))
  .map(([path, text]) => ({ path: path.slice(PROJECT_FOLDER.length + 1), bytes: encoder.encode(text) }));
const textOf = (files: UnitFile[], path: string) => decoder.decode(files.find(file => file.path === path)!.bytes);

test('a project folder compiles: the ontology is compiled, the standard files are copied byte for byte and the others are listed as not included', () => {
  const result = compileUnit(projectFiles, options);
  expect(result.failures).toEqual([]);
  expect(result.outputs.map(output => output.path)).toEqual(['mapping.yaml', 'ontology.yaml', 'semantic-model.yaml']);
  expect(textOf(result.outputs, 'ontology.yaml')).not.toContain('tessera');
  for (const path of ['semantic-model.yaml', 'mapping.yaml']) expect(textOf(result.outputs, path)).toBe(COMMITTED_FILES[`${PROJECT_FOLDER}/${path}`]);
  const treatments = Object.fromEntries(result.report.inputs.map(input => [input.path, input.treatment]));
  expect(treatments).toEqual({ 'contract.odcs.yaml': 'not-included', 'mapping.yaml': 'copied', 'ontology.yaml': 'compiled', 'semantic-model.yaml': 'copied', 'vocabulary.ttl': 'not-included' });
  expect(result.report.counts).toEqual({ tessera_notes: 3 });
  expect(result.tesseraRevisions).toEqual([1]);
});

test('an invalid standard file fails the whole unit and releases nothing', () => {
  const broken = {
    path: 'broken.yaml',
    bytes: encoder.encode(
      'version: 0.2.0.dev0\nname: m\ndatasets:\n  - name: A\n    source: db.a\nrelationships:\n  - name: r\n    from: A\n    to: Missing\n    from_columns: [x]\n    to_columns: [y]\n',
    ),
  };
  const result = compileUnit([...projectFiles, broken], options);
  expect(result.outputs).toEqual([]);
  expect(result.failures.map(failure => [failure.code, failure.document])).toContainEqual(['invalid-source', 'broken.yaml']);
});

test('a standard file the validator cannot check against the pinned schema fails the unit', () => {
  const unversioned = { path: 'old.yaml', bytes: encoder.encode('name: Old\nontology:\n  - concept: A\n    type: EntityType\n') };
  const result = compileUnit([unversioned], options);
  expect(result.failures.map(failure => failure.code)).toEqual(['output-schema']);
  expect(result.outputs).toEqual([]);
});

test('two outputs that differ only in case fail with a path collision', () => {
  const lower = projectFiles.find(file => file.path === 'mapping.yaml')!;
  const upper = { path: 'MAPPING.yaml', bytes: lower.bytes };
  const result = compileUnit([...projectFiles, upper], options);
  expect(result.failures.map(failure => failure.code)).toContain('path-collision');
  expect(result.outputs).toEqual([]);
});

test('an output that fails the pinned schema fails the unit and cannot be released', () => {
  const faulty = { compileDocument: () => ({ ok: true as const, text: 'name: broken\nontology: []\n', data: {}, losses: [] }) };
  const result = compileUnit(projectFiles, options, faulty);
  expect(result.failures.some(failure => failure.code === 'output-schema')).toBe(true);
  expect(result.outputs).toEqual([]);
});

test('an output that changes the meaning fails the unit', () => {
  const faulty = {
    compileDocument: (document: { source: string }) => ({ ok: true as const, text: document.source.replace(/^tessera: 1\n/, '').replace('A customer order.', 'Changed.'), data: {}, losses: [] }),
  };
  const result = compileUnit(projectFiles, options, faulty);
  expect(result.failures.map(failure => failure.code)).toContain('meaning');
});

test('compiling the output again gives the same output', () => {
  const first = compileUnit(projectFiles, options);
  const second = compileUnit(first.outputs, options);
  expect(second.failures).toEqual([]);
  expect(second.report.losses).toEqual([]);
  expect(second.outputs.map(output => [output.path, decoder.decode(output.bytes)])).toEqual(first.outputs.map(output => [output.path, decoder.decode(output.bytes)]));
});

test('a unit with no Tessera file returns the input bytes of its Ossie files', () => {
  const standard = projectFiles.filter(file => ['semantic-model.yaml', 'mapping.yaml'].includes(file.path));
  const result = compileUnit(standard, options);
  expect(result.failures).toEqual([]);
  expect(result.report.losses).toEqual([]);
  for (const file of standard) expect(Buffer.from(result.outputs.find(output => output.path === file.path)!.bytes).equals(Buffer.from(file.bytes))).toBe(true);
});

test('a file over the size limit is refused', () => {
  const large = { path: 'large.yaml', bytes: new Uint8Array(2_000_001) };
  expect(compileUnit([large], options).failures.map(failure => failure.code)).toEqual(['limit']);
});
