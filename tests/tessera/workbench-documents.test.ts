// Checks a Tessera ontology behaves like an Ossie ontology everywhere the workbench reads or saves one, in YAML and in JSON.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { formatAddress, type Address } from '../../src/shared/core/item-address';
import { inspect } from '../../src/shared/core/model';
import type { DocumentFormat } from '../../src/shared/tessera/format';
import { fieldsFor, writeField } from '../../src/shared/edit/item-model';
import { valuePatches } from '../../src/shared/edit/yaml-patch';
import { applyPatches } from '../../src/shared/editor/patch';
import { InputError } from '../../src/shared/validation/diagnostics';
import { validateInput } from '../../src/shared/validation/input';
import { sha256 } from '../../src/server/projects/atomic';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { indexBytes } from '../../src/server/projects/scanner';
import { testWorkspace } from '../helpers/temp-data-dir';

const NOTES_YAML = readFileSync(join(import.meta.dir, '../fixtures/tessera/documents/notes-everywhere.yaml'), 'utf8');
const NOTES_JSON = JSON.stringify(parse(NOTES_YAML), null, 2) + '\n';
const FORMS = [
  { label: 'YAML', filename: 'retail.ontology.yaml', text: NOTES_YAML },
  { label: 'JSON', filename: 'retail.ontology.json', text: NOTES_JSON },
];

function withoutTessera(text: string): string {
  const data = parse(text);
  const strip = (node: any): any => {
    if (Array.isArray(node)) return node.map(strip);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node)
        .filter(([name]) => !name.startsWith('tessera'))
        .map(([name, value]) => [name, strip(value)]),
    );
  };
  return JSON.stringify(strip(data), null, 2) + '\n';
}

function formatOf(model: object) {
  return 'format' in model ? (model.format as DocumentFormat) : undefined;
}

function summary(text: string, filename: string) {
  const model = inspect(text, filename);
  return {
    kind: model.kind,
    layout: 'layout' in model ? model.layout : undefined,
    entityIds: model.entities.map(entity => entity.id),
    edgeIds: model.edges.map(edge => edge.id),
    addresses: [...model.entities, ...model.edges].flatMap(item => ('address' in item ? [formatAddress(item.address as Address)] : [])),
  };
}

for (const form of FORMS) {
  test(`${form.label}: inspection of a Tessera ontology equals that of the same ontology without marker and notes`, () => {
    const twin = withoutTessera(form.text);
    expect(summary(form.text, form.filename)).toEqual(summary(twin, 'twin.ontology.json'));
    expect(formatOf(inspect(form.text, form.filename))).toEqual({ family: 'tessera', revision: 1, base: '0.2.0.dev0', baseLabel: 'valid against the bundled Ossie 0.2.0.dev0 draft' });
    expect(formatOf(inspect(twin, 'twin.ontology.json'))).toEqual({ family: 'standard' });
  });

  test(`${form.label}: the scanner records the document type Ossie ontology`, () => {
    const indexed = indexBytes('retail', form.filename, new TextEncoder().encode(form.text));
    expect(indexed.file.docType).toBe('Ossie ontology');
    expect(indexed.file.valid).toBe(true);
  });

  test(`${form.label}: a valid save writes the exact bytes and checks the base hash`, async () => {
    using workspace = await testWorkspace();
    const { slug } = await workspace.seed([{ path: form.filename, source: withoutTessera(form.text) }], 'Retail');
    const before = workspace.ws.readFile(slug, form.filename);
    await expect(workspace.ws.saveFile(slug, form.filename, { baseHash: 'not-the-hash', source: form.text }, LOCAL_READER)).rejects.toThrow();
    const saved = await workspace.ws.saveFile(slug, form.filename, { baseHash: before.hash, source: form.text }, LOCAL_READER);
    expect(saved.hash).toBe(sha256(new TextEncoder().encode(form.text)));
    expect(workspace.ws.readFile(slug, form.filename).source).toBe(form.text);
  });

  test(`${form.label}: an invalid save throws the validator's findings and writes nothing`, async () => {
    using workspace = await testWorkspace();
    const original = withoutTessera(form.text);
    const { slug } = await workspace.seed([{ path: form.filename, source: original }], 'Retail');
    const before = workspace.ws.readFile(slug, form.filename);
    const broken = form.text.replace('tessera_notes', 'tessera_note');
    const expected = validateInput(broken, form.filename).issues;
    expect(expected.some(issue => issue.code === 'tessera-property')).toBe(true);
    const failure = await workspace.ws.saveFile(slug, form.filename, { baseHash: before.hash, source: broken }, LOCAL_READER).catch(error => error);
    expect(failure).toBeInstanceOf(InputError);
    expect((failure as InputError).issues).toEqual(expected);
    expect(workspace.ws.readFile(slug, form.filename).source).toBe(original);
  });

  test(`${form.label}: a form edit of one concept keeps the marker and every note byte for byte`, () => {
    const model = inspect(form.text, form.filename);
    const concept = model.entities.find(entity => entity.name === 'Order')!;
    const original = structuredClone(concept.definition);
    const description = fieldsFor('concept', { concepts: [], datasets: [], metrics: [] }).find(spec => spec.key === 'description')!;
    const item = writeField(original, description, 'An order placed by a customer.');
    const edited = applyPatches(form.text, valuePatches(form.text, concept.path, item, form.filename));
    expect(edited).toContain('An order placed by a customer.');
    const noteLines = form.text.match(/^.*tessera_notes.*$/gm)!;
    expect(noteLines).toHaveLength(4);
    for (const line of noteLines) expect(edited).toContain(line);
    expect(parse(edited).tessera).toBe(1);
    expect(validateInput(edited, form.filename).valid).toBe(true);
  });

  test(`${form.label}: deleting the only note by a source edit leaves a marked, valid document`, () => {
    const document = parse(form.text);
    delete document.tessera_notes;
    for (const concept of document.ontology) {
      delete concept.tessera_notes;
      for (const relationship of concept.relationships ?? []) delete relationship.tessera_notes;
    }
    const text = form.filename.endsWith('.json') ? JSON.stringify(document, null, 2) + '\n' : form.text.replace(/^\s*tessera_notes:.*\n/gm, '');
    const result = validateInput(text, form.filename);
    expect(result.valid).toBe(true);
    expect(result.valid && formatOf(result.model)?.family).toBe('tessera');
  });
}
