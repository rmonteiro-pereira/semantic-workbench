// Tests YAML item edits that preserve surrounding bytes.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { applyPatches } from '../src/editor/patch';
import { valuePatches, insertPatches, removePatches, itemValue } from '../src/edit/yaml-patch';
import { validateInput } from '../src/input';
// YAML item edits change only the edited node's text: comments, anchors, key order, quoting and
// indentation elsewhere keep their bytes.
const set = (src: string, path: (string | number)[], value: any) =>
  applyPatches(src, valuePatches(src, path, value));
const src = `# Commerce ontology
name: Commerce # inline comment
defaults: &base {owner: Sales}
ontology:
  - concept: Customer   # who buys
    type: EntityType
    description: "A person who buys."
    extends: [Party]
    relationships:
      - name: places
        roles:
          - concept: Order
  # Orders follow
  - concept: Order
    type: EntityType
    description: 'An order'
    notes: |
      first line
      second line
  - concept: Party
    type: EntityType
extra: *base
`;
test('changing one scalar keeps comments, anchors, quoting and every other byte', () => {
  const out = set(src, ['ontology', 0, 'description'], 'A person or company who buys.');
  expect(out).toBe(src.replace('"A person who buys."', '"A person or company who buys."'));
  expect(set(src, ['ontology', 1, 'description'], "Customer's order")).toBe(
    src.replace("'An order'", "'Customer''s order'"),
  );
  expect(set(src, ['ontology', 0, 'concept'], 'Client')).toBe(
    src.replace('concept: Customer   # who buys', 'concept: Client   # who buys'),
  );
});
test('a plain value that needs quoting is quoted; a block literal stays a block literal', () => {
  expect(set(src, ['ontology', 2, 'type'], 'a: b')).toBe(
    src.replace('  - concept: Party\n    type: EntityType', '  - concept: Party\n    type: "a: b"'),
  );
  expect(set(src, ['ontology', 1, 'notes'], 'first line\nchanged line\n')).toBe(
    src.replace('      second line', '      changed line'),
  );
});
test('editing a whole item diffs it: unchanged keys, comments and order stay; new keys follow the item', () => {
  const item = itemValue(src, ['ontology', 0]);
  const out = set(src, ['ontology', 0], { ...item, description: 'Buyer', iri: 'ex:Customer' });
  expect(out).toBe(
    src
      .replace('"A person who buys."', '"Buyer"')
      .replace(
        '          - concept: Order\n  # Orders',
        '          - concept: Order\n    iri: ex:Customer\n  # Orders',
      ),
  );
  const removed = set(src, ['ontology', 0], {
    concept: 'Customer',
    type: 'EntityType',
    extends: ['Party'],
    relationships: item.relationships,
  });
  expect(removed).toBe(src.replace('    description: "A person who buys."\n', ''));
});
test('removing the first key of a list item keeps the "- " on the next key', () => {
  const item = itemValue(src, ['ontology', 2]);
  const { concept, ...rest } = item;
  expect(set(src, ['ontology', 2], rest)).toBe(
    src.replace('  - concept: Party\n    type: EntityType', '  - type: EntityType'),
  );
});
test('flow lists stay flow; block lists get one line per entry', () => {
  expect(set(src, ['ontology', 0, 'extends'], ['Party', 'Agent'])).toBe(
    src.replace('extends: [Party]', 'extends: [Party, Agent]'),
  );
  expect(
    set(
      src,
      ['ontology', 0, 'relationships', 0, 'roles'],
      [{ concept: 'Order' }, { concept: 'Party', name: 'seller' }],
    ),
  ).toBe(
    src.replace(
      '          - concept: Order\n',
      '          - concept: Order\n          - concept: Party\n            name: seller\n',
    ),
  );
});
test('insert and remove list items in the document style; add then remove restores the original', () => {
  const added = applyPatches(
    src,
    insertPatches(src, ['ontology'], {
      concept: 'Product',
      type: 'EntityType',
      description: 'Sold item',
      extends: ['Thing'],
    }),
  );
  expect(added).toBe(
    src.replace(
      'extra: *base',
      '  - concept: Product\n    type: EntityType\n    description: Sold item\n    extends: [Thing]\nextra: *base',
    ),
  );
  expect(applyPatches(added, removePatches(added, ['ontology', 3]))).toBe(src);
  // Removing a middle item removes exactly its lines (the comment before the next item stays).
  expect(applyPatches(src, removePatches(src, ['ontology', 1]))).toBe(
    src.replace(/\n  - concept: Order\n[\s\S]*?second line\n/, '\n'),
  );
});
test('CRLF files keep CRLF in new and changed lines', () => {
  const crlf = src.replace(/\n/g, '\r\n');
  const out = applyPatches(
    crlf,
    insertPatches(crlf, ['ontology'], { concept: 'Product', type: 'EntityType' }),
  );
  expect(out).toBe(
    crlf.replace('extra: *base', '  - concept: Product\r\n    type: EntityType\r\nextra: *base'),
  );
  expect(set(crlf, ['ontology', 1, 'notes'], 'one\ntwo\n')).toBe(
    crlf.replace('      first line\r\n      second line', '      one\r\n      two'),
  );
});
test('the JSON inside an extension block is patched line by line', () => {
  const sem = readFileSync('public/examples/mall/mall.semantic.yaml', 'utf8');
  const metrics = itemValue(sem, ['metrics']) as any[];
  const i = metrics.findIndex(m => m.name === 'occupancy_rate');
  const path = ['metrics', i, 'custom_extensions', 0, 'data'];
  const ext = JSON.parse(itemValue(sem, path));
  const out = set(sem, path, JSON.stringify({ ...ext, status: 'proposed', steward: 'Finance' }));
  const before = sem.split('\n');
  const after = out.split('\n');
  expect(after.length).toBe(before.length + 1);
  // Three lines differ: the changed status, the comma after the last attribute, the new steward.
  let a = 0;
  while (before[a] === after[a]) a++;
  let z = 0;
  while (before[before.length - 1 - z] === after[after.length - 1 - z]) z++;
  const changed = after.slice(a, after.length - z);
  expect(changed).toEqual([
    '            "status": "proposed",',
    '            "time": {"dimension":"calendar_months.first_day","min_grain":"month","allowed_grains":["month","quarter","year"]},',
    '            "dimensions": ["properties.name","calendar_months.year_month"],',
    '            "targets": [{"grain":"month","direction":"higher_is_better","value":0.95}],',
    '            "steward": "Finance"',
  ]);
  expect(before.slice(a, before.length - z)).toEqual([
    '            "status": "approved",',
    before[a + 1],
    before[a + 2],
    '            "targets": [{"grain":"month","direction":"higher_is_better","value":0.95}]',
  ]);
  expect(JSON.parse(itemValue(out, path))).toEqual({
    ...ext,
    status: 'proposed',
    steward: 'Finance',
  });
  expect(validateInput(out, 'mall.semantic.yaml').valid).toBe(true);
});
import {
  openFragment,
  splice,
  setField,
  fragmentIssues,
  fragmentValue,
} from '../src/edit/fragment';
import { fieldsFor } from '../src/edit/item-model';
test('the item editor edits the item fragment and puts it back in place', () => {
  const sem = readFileSync('public/examples/mall/mall.semantic.yaml', 'utf8');
  const metrics = itemValue(sem, ['metrics']) as any[];
  const i = metrics.findIndex(m => m.name === 'occupancy_rate');
  const f = openFragment(sem, ['metrics', i]);
  expect(f.text.startsWith('- name: occupancy_rate\n  description:')).toBe(true);
  expect(f.prefix).toBe('  ');
  expect(splice(sem, f, f.text)).toBe(sem);
  const original = fragmentValue(f, f.text).value;
  const fields = fieldsFor('metric', { concepts: [], datasets: [], metrics: [] });
  const expression = fields.find(x => x.key === 'expression')!;
  const owner = fields.find(x => x.key === 'ext.owner')!;
  // Changing the formula of an approved KPI: two lines change (expression, status → proposed).
  const a = setField(
    f.text,
    f,
    'mall.semantic.yaml',
    'metric',
    expression,
    'occupied_gla / total_gla',
    original,
  );
  expect(a.reopened).toBe(true);
  const draft = splice(sem, f, a.text);
  const x = sem.split('\n');
  const y = draft.split('\n');
  expect(y.length).toBe(x.length);
  expect(y.filter((l, n) => l !== x[n])).toEqual([
    '          expression: occupied_gla / total_gla',
    '            "status": "proposed",',
  ]);
  // Changing the owner only: one line, status unchanged.
  const b = setField(f.text, f, 'mall.semantic.yaml', 'metric', owner, 'Finance', original);
  expect(b.reopened).toBe(false);
  expect(
    splice(sem, f, b.text)
      .split('\n')
      .filter((l, n) => l !== x[n]),
  ).toEqual(['            "owner": "Finance",']);
  // Findings are moved onto the fragment's lines.
  expect(
    fragmentIssues(
      [
        { severity: 'error', code: 'x', path: '/', message: 'm', line: f.line + 2, column: 5 },
        { severity: 'error', code: 'x', path: '/', message: 'n', line: 1 },
      ],
      f,
      f.text,
    ),
  ).toEqual([
    { severity: 'error', code: 'x', path: '/', message: 'm', line: 3, column: 3 },
    { severity: 'error', code: 'x', path: '/', message: 'Line 1 (outside this item): n' },
  ]);
  expect(fragmentValue(f, f.text + '\n- name: other').error).toContain('one list entry');
});
