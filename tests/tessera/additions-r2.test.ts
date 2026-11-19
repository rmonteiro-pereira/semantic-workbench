// Checks the three revision 2 additions: where they are allowed, which findings each fixture gives, and that revision 1 is unchanged.
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REGISTRY } from '../../src/shared/tessera/registry';
import { tesseraIssues } from '../../src/shared/tessera/validate';
import { hasTesseraPrefix, TesseraNames } from '../../src/shared/tessera/format';
import { validateInput } from '../../src/shared/validation/input';
import { validateStructured } from '../../src/shared/validation/validation';

const FIXTURE_FOLDER = 'tests/fixtures/tessera/additions';
const REVISION_TWO_ADDITIONS = ['tessera_attributes', 'tessera_ai_context', 'tessera_governance'];

/** Reads the findings a README table promises for each fixture file. */
function expectedFindings(addition: string): [string, string[]][] {
  const readme = readFileSync(join(FIXTURE_FOLDER, addition, 'README.md'), 'utf8');
  const rows = readme.split('\n').filter(line => line.startsWith('| ') && line.includes('.yaml'));
  return rows.map(row => {
    const [file, findings] = row
      .split('|')
      .slice(1, 3)
      .map(cell => cell.trim());
    return [file, findings === 'none' ? [] : [findings]];
  });
}

for (const addition of REVISION_TWO_ADDITIONS) {
  const files = expectedFindings(addition);
  test(`${addition} has a README row for every fixture file`, () => {
    const present = readdirSync(join(FIXTURE_FOLDER, addition)).filter(name => name.endsWith('.yaml'));
    expect(files.map(([file]) => file).sort()).toEqual(present.sort());
  });
  for (const [file, expected] of files) {
    test(`${addition}/${file} gives ${expected.length ? expected[0] : 'no finding'}`, () => {
      const data = parse(readFileSync(join(FIXTURE_FOLDER, addition, file), 'utf8'));
      expect(tesseraIssues(data).issues.map(issue => `${issue.code} ${issue.path}`)).toEqual(expected);
    });
    test(`${addition}/${file} gives the same findings through the editor path`, () => {
      const result = validateInput(readFileSync(join(FIXTURE_FOLDER, addition, file), 'utf8'), file);
      const codes = result.issues.map(issue => `${issue.code} ${issue.path}`);
      expect(codes).toEqual(expected);
    });
  }
}

test('the three additions are registered at revision 2 with the places the format allows', () => {
  for (const name of REVISION_TWO_ADDITIONS) expect(REGISTRY.byName(name)?.since).toBe(2);
  expect(REGISTRY.byName('tessera_attributes')?.places).toEqual(['concept']);
  expect(REGISTRY.byName('tessera_ai_context')?.places).toEqual(['concept', 'relationship']);
  expect(REGISTRY.byName('tessera_governance')?.places).toEqual(['concept', 'relationship']);
  expect(REGISTRY.reservedNames.map(entry => entry.name)).toEqual(['tessera_imports']);
});

test('a revision 2 document with no additions is valid and described as revision 2', () => {
  const result = tesseraIssues({ tessera: 2, version: '0.2.0.dev0', name: 'Retail', ontology: [{ concept: 'Order', type: 'EntityType' }] });
  expect(result.issues).toEqual([]);
  expect(result.format).toMatchObject({ family: 'tessera', revision: 2 });
});

test('a revision 1 document that uses a revision 2 name is told which revision it needs, once', () => {
  const data = parse(readFileSync(join(FIXTURE_FOLDER, 'tessera_governance', 'at-revision-1.yaml'), 'utf8'));
  const issues = tesseraIssues(data).issues;
  expect(issues).toHaveLength(1);
  expect(issues[0].message).toContain('needs Tessera revision 2 or higher');
});

test('a revision 3 document is still refused with the supported revisions listed', () => {
  const issues = tesseraIssues({ tessera: 3, version: '0.2.0.dev0', name: 'Retail', ontology: [] }).issues;
  expect(issues[0].code).toBe('tessera-revision');
  expect(issues[0].message).toContain('Supported revisions: 1, 2');
});

function withoutTessera(node: any): any {
  if (Array.isArray(node)) return node.map(withoutTessera);
  if (node === null || typeof node !== 'object') return node;
  const kept = Object.entries(node).filter(([name]) => !hasTesseraPrefix(name) && name !== TesseraNames.markerKey);
  return Object.fromEntries(kept.map(([name, value]) => [name, withoutTessera(value)]));
}

for (const [addition, file] of [
  ['tessera_attributes', 'valid-order.yaml'],
  ['tessera_ai_context', 'context-object.yaml'],
  ['tessera_governance', 'status-approved.yaml'],
] as const) {
  test(`${addition}/${file} without the marker and the additions passes the pinned schema`, () => {
    const data = parse(readFileSync(join(FIXTURE_FOLDER, addition, file), 'utf8'));
    expect(validateStructured(withoutTessera(data)).filter(issue => issue.severity !== 'info')).toEqual([]);
  });
}
