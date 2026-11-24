/** Checks that older readers refuse unit declarations before schema selection. */
import { expect, test } from 'bun:test';
import { REGISTRY } from '../../src/shared/tessera/registry';
import { tesseraIssues } from '../../src/shared/tessera/validate';

const ontology = { version: '0.2.0.dev0', name: 'Retail', ontology: [{ concept: 'Order', type: 'EntityType' }] };

for (const [name, value, disposition] of [
  ['tessera_includes', ['part.yaml'], 'translate'],
  ['tessera_exports', ['Order'], 'drop'],
  ['tessera_imports', [{ project: 'finance', alias: 'fin', concepts: ['Invoice'] }], 'translate'],
  ['tessera_part', true, 'translate'],
] as const) {
  test(`${name} requires the unit revision`, () => {
    expect(REGISTRY.byName(name)).toMatchObject({ since: 3, places: ['root'], disposition });
    for (const revision of [1, 2]) {
      const result = tesseraIssues({ ...ontology, tessera: revision, [name]: value });
      expect(result.issues.map(issue => [issue.code, issue.path])).toEqual([['tessera-revision', `/${name}`]]);
    }
  });
}

test('a revision two reader refuses a split root instead of treating it as a whole ontology', () => {
  const document = { ...ontology, tessera: 3, tessera_includes: ['part.yaml'] };
  const result = tesseraIssues(document, { revisions: [1, 2] });
  expect(result.format).toBeNull();
  expect(result.issues).toContainEqual(expect.objectContaining({ code: 'tessera-revision', path: '/tessera' }));
});
