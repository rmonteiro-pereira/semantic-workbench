// Checks that workbench metric attributes and bindings are read and written in the form the document's Ossie version uses, and that 0.2 output is unchanged.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { openFragment, setField, fragmentValue, splice } from '../src/app/edit/fragment';
import { declaredVersion, extensionOf, fieldsFor, writeField } from '../src/shared/edit/item-model';
import { itemValue } from '../src/shared/edit/yaml-patch';
import { metricGovernanceOf } from '../src/shared/governance/item-governance';
import { readKpiBindings, readMetricExtension } from '../src/shared/metrics/extension';
import { addBinding, minimalMapping, planKpiSave, withMetricAttributes } from '../src/shared/metrics/metric-save';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';
import { validateInput } from '../src/shared/validation/input';

const FIXTURES = join(import.meta.dir, 'fixtures/ossie-0.3');
const salesModel = readFileSync(join(FIXTURES, 'sales.semantic.yaml'), 'utf8');
const salesMapping = readFileSync(join(FIXTURES, 'sales.mapping.yaml'), 'utf8');
const metricFields = fieldsFor('metric', { concepts: [], datasets: [], metrics: [] });
const owner = metricFields.find(field => field.key === 'ext.owner')!;
const kpiType = metricFields.find(field => field.key === 'ext.type')!;

/** A small model with one metric that has no workbench attributes, at the given version. */
function smallModel(version: string): string {
  return [
    `version: ${version}`,
    'name: Small',
    'datasets:',
    '  - name: orders',
    '    source: sales.orders',
    '    fields:',
    '      - name: amount',
    '        expression:',
    '          dialects:',
    '            - dialect: ANSI_SQL',
    '              expression: amount',
    'metrics:',
    '  - name: revenue',
    '    expression:',
    '      dialects:',
    '        - dialect: ANSI_SQL',
    '          expression: SUM(orders.amount)',
    '',
  ].join('\n');
}

/** Sets one attribute of the first metric through the item editor's fragment write. */
function setAttribute(document: string, spec: typeof owner, input: string): string {
  const fragment = openFragment(document, ['metrics', 0]);
  const original = fragmentValue(fragment, fragment.text).value;
  const edit = setField(fragment.text, fragment, { filename: 'small.semantic.yaml', kind: 'metric', spec, input, original });
  return splice(document, fragment, edit.text);
}

const setOwner = (document: string) => setAttribute(document, owner, 'Finance');

beforeAll(async () => {
  await loadDraftValidators();
});

test('declaredVersion reads only the top-level version key', () => {
  expect(declaredVersion(salesModel)).toBe('0.3.0.dev0');
  expect(declaredVersion('name: x\nnested:\n  version: 0.3.0.dev0\n')).toBeUndefined();
  expect(declaredVersion('{"version": "0.2.0.dev0", "name": "x"}')).toBe('0.2.0.dev0');
});

test('a 0.3 metric reads its attributes and governance from nonportable_extensions object data', () => {
  const metric = parse(salesModel).metrics[0];
  expect(readMetricExtension(metric, '/metrics/0').value).toMatchObject({ type: 'simple', status: 'proposed' });
  expect(extensionOf(metric)).toMatchObject({ index: 0, value: { status: 'proposed' } });
  expect(metricGovernanceOf(metric).status).toBe('proposed');
  const broken = structuredClone(metric);
  broken.nonportable_extensions[0].data.type = 'unknown';
  expect(readMetricExtension(broken, '/metrics/0').issues.map(issue => issue.path)).toEqual(['/metrics/0/nonportable_extensions/0/data']);
});

test('the item editor gives a 0.3 metric without attributes a nonportable_extensions object, and the file saves', () => {
  const edited = setOwner(setAttribute(smallModel('0.3.0.dev0'), kpiType, 'simple'));
  const metric = itemValue(edited, ['metrics', 0]);
  expect(metric.custom_extensions).toBeUndefined();
  expect(metric.nonportable_extensions).toEqual([{ vendor_name: 'SEMANTIC_WORKBENCH', data: { schema: 'semantic-workbench/metric/v1', type: 'simple', owner: 'Finance' } }]);
  expect(validateInput(edited, 'small.semantic.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
});

test('the item editor writes a 0.2 metric exactly as before', () => {
  const expected =
    smallModel('0.2.0.dev0') +
    [
      '    custom_extensions:',
      '      - vendor_name: SEMANTIC_WORKBENCH',
      '        data: |',
      '          {',
      '            "schema": "semantic-workbench/metric/v1",',
      '            "owner": "Finance"',
      '          }',
      '',
    ].join('\n');
  expect(setOwner(smallModel('0.2.0.dev0'))).toBe(expected);
  expect(writeField({ name: 'm' }, owner, 'Finance')).toEqual({
    name: 'm',
    custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: '{\n  "schema": "semantic-workbench/metric/v1",\n  "owner": "Finance"\n}\n' }],
  });
});

test('changing attributes of a 0.3 metric patches its object data in place', () => {
  const changed = withMetricAttributes(salesModel, 'sales.semantic.yaml', ['metrics', 0], { status: 'approved', owner: 'Finance' });
  const metric = itemValue(changed, ['metrics', 0]);
  expect(metric.nonportable_extensions[0].data).toEqual({ schema: 'semantic-workbench/metric/v1', type: 'simple', status: 'approved', owner: 'Finance' });
  expect(metric.nonportable_extensions[1]).toEqual({ vendor_name: 'BI_TOOL', data: { format: 'currency' } });
});

test('a binding added to a 0.3 mapping is an object entry, and other vendors stay', () => {
  const once = addBinding(salesMapping, [], { metric: 'revenue', measures: 'Revenue', of: 'Customer' }, 'sales.mapping.yaml');
  const twice = addBinding(once, [], { metric: 'order_count', measures: 'OrderCount' }, 'sales.mapping.yaml');
  const root = parse(twice);
  expect(root.custom_extensions).toBeUndefined();
  expect(root.nonportable_extensions[0]).toEqual({ vendor_name: 'BI_TOOL', data: { folder: 'sales' } });
  expect(readKpiBindings(root).value.map(binding => binding.metric)).toEqual(['order_count', 'revenue']);
  expect(root.nonportable_extensions[1].data.schema).toBe('semantic-workbench/mapping/v1');
});

test('a new mapping for a 0.3 model declares 0.3 and validates; for a 0.2 model it is unchanged', () => {
  const binding = { metric: 'revenue', measures: 'Revenue' };
  const draft = minimalMapping('Sales mappings', { name: 'Sales ontology', path: 'sales.ontology.yaml' }, { name: 'Sales', path: 'sales.semantic.yaml' }, binding, '0.3.0.dev0');
  expect(declaredVersion(draft)).toBe('0.3.0.dev0');
  expect(validateInput(draft, 'sales.mapping.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
  expect(readKpiBindings(parse(draft)).value).toEqual([binding]);
  const old = minimalMapping('Sales mappings', { name: 'Sales ontology', path: 'sales.ontology.yaml' }, { name: 'Sales', path: 'sales.semantic.yaml' }, binding);
  expect(old).toContain('version: 0.2.0.dev0\n');
  expect(old).toContain('custom_extensions:\n  - vendor_name: SEMANTIC_WORKBENCH\n    data: |\n');
});

test('saving a new metric into a 0.3 model writes its attributes as a nonportable_extensions object, and the file validates', () => {
  const plan = planKpiSave([{ path: 'sales.semantic.yaml', source: salesModel }], {
    semanticPath: 'sales.semantic.yaml',
    metric: { name: 'average_order', expression: 'AVG(orders.amount)' },
    extension: { schema: 'semantic-workbench/metric/v1', type: 'simple', owner: 'Finance' },
  });
  const written = plan.writes.find(write => write.path === 'sales.semantic.yaml')!.source;
  const metric = itemValue(written, ['metrics', 2]);
  expect(metric.custom_extensions).toBeUndefined();
  expect(metric.nonportable_extensions).toEqual([{ vendor_name: 'SEMANTIC_WORKBENCH', data: { type: 'simple', owner: 'Finance', schema: 'semantic-workbench/metric/v1' } }]);
  expect(validateInput(written, 'sales.semantic.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
});
