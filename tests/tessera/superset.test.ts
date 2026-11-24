// Proves a Tessera ontology is a strict superset of an Ossie ontology in both directions: adding the marker changes nothing else, and removing it and every addition leaves valid Ossie.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { validateInput } from '../../src/shared/validation/input';
import { validateStructured } from '../../src/shared/validation/validation';
import { TesseraNames, hasTesseraPrefix } from '../../src/shared/tessera/format';

type Baseline = { documents: Record<string, { valid: boolean; kind?: string }> };
const baseline: Baseline = JSON.parse(readFileSync('tests/fixtures/tessera/standard-baseline.json', 'utf8'));
const ontologyFiles = Object.entries(baseline.documents)
  .filter(([path, record]) => record.valid && record.kind === 'Ossie ontology' && /\.ya?ml$/.test(path))
  // A Tessera document must name its Ossie base, so only ontologies that declare the shipped version apply.
  .filter(([path]) => /^version: 0\.2\.0\.dev0$/m.test(readFileSync(path, 'utf8')))
  .map(([path]) => path);

const findingKey = (issue: { severity: string; code: string; path: string; message: string }) => `${issue.severity} ${issue.code} ${issue.path} ${issue.message}`;

test('the baseline holds ontologies to check', () => {
  expect(ontologyFiles.length).toBeGreaterThan(5);
});

for (const path of ontologyFiles) {
  test(`${path} with the marker added has the same findings and the same items`, () => {
    const source = readFileSync(path, 'utf8');
    const unmarked = validateInput(source, 'ontology.yaml');
    const marked = validateInput(`${TesseraNames.markerKey}: 1\n${source}`, 'ontology.yaml');
    expect(marked.valid).toBe(unmarked.valid);
    expect(marked.issues.map(findingKey)).toEqual(unmarked.issues.map(findingKey));
    if (unmarked.valid && marked.valid) {
      expect(marked.model.kind).toBe(unmarked.model.kind);
      expect(marked.model.entities.map(entity => entity.id)).toEqual(unmarked.model.entities.map(entity => entity.id));
      expect(marked.model.edges.map(edge => edge.id)).toEqual(unmarked.model.edges.map(edge => edge.id));
    }
  });
}

function withoutTessera(node: any): any {
  if (Array.isArray(node)) return node.map(withoutTessera);
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([name]) => !hasTesseraPrefix(name) && name !== TesseraNames.markerKey)
      .map(([name, value]) => [name, withoutTessera(value)]),
  );
}

for (const name of ['valid.yaml', 'valid.json', 'notes-everywhere.yaml']) {
  test(`${name} without the marker and the additions passes the pinned schema`, () => {
    const text = readFileSync(join('tests/fixtures/tessera/documents', name), 'utf8');
    const data = name.endsWith('.json') ? JSON.parse(text) : parse(text);
    expect(validateInput(text, name).valid).toBe(true);
    expect(() => validateStructured(withoutTessera(data))).not.toThrow();
    expect(validateStructured(withoutTessera(data)).filter(issue => issue.severity !== 'info')).toEqual([]);
  });
}
