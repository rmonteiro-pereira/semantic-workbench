/** Exercises structural refusals with the complete project file inventory. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readUnitStructure } from '../../src/shared/tessera/unit-structure';

const cases = [
  'duplicate-owner',
  'self-include',
  'root-in-list',
  'repeated-part',
  'parent-path',
  'absolute-path',
  'backslash',
  'control-path',
  'link',
  'missing',
  'not-part',
  'part-header',
  'mixed-version',
  'duplicate-concept',
  'orphan-part',
  'part-bound',
  'import-bound',
];

for (const name of cases) {
  test(`reports the structural finding for ${name}`, () => {
    const fixture = JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/refusals/${name}.json`, 'utf8'));
    const docs = fixture.files.map((file: { path: string; source: string }) => ({
      path: file.path,
      data: JSON.parse(file.source),
      link: fixture.links?.includes(file.path),
    }));
    const { findings } = readUnitStructure(docs);
    const errors = findings.filter(finding => finding.severity === 'error' || fixture.code === 'tessera-orphan-part');
    expect(errors.map(finding => finding.code)).toEqual([fixture.code]);
    for (const file of errors[0].files) expect(errors[0].message).toContain(file);
  });
}

test('metadata and undeclared definitions never enter a unit', () => {
  const root = { path: 'root.yaml', data: { tessera: 3, ontology: [], tessera_includes: ['part.yaml'] } };
  const part = { path: 'part.yaml', data: { tessera: 3, tessera_part: true, ontology: [] } };
  const files = [root, { path: 'tessera-dependencies.json', data: {} }, { path: 'address-history.jsonl', data: {} }, part];
  expect(readUnitStructure(files)).toEqual({ units: [{ root, parts: [part] }], findings: [] });
});
