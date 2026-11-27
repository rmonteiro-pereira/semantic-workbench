// Checks that rename and delete find metric bindings and attribute references stored as object data in a 0.3 draft file, and change only them.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { findReferences, removeDependents, rewriteReferences, type ProjectDoc } from '../src/app/edit/references';
import { readKpiBindings } from '../src/shared/metrics/extension';
import { addBinding } from '../src/shared/metrics/metric-save';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';
import { validateInput } from '../src/shared/validation/input';

const FIXTURES = join(import.meta.dir, 'fixtures/ossie-0.3');
const model = readFileSync(join(FIXTURES, 'sales.semantic.yaml'), 'utf8');
const mapping = addBinding(
  addBinding(readFileSync(join(FIXTURES, 'sales.mapping.yaml'), 'utf8'), [], { metric: 'revenue', measures: 'Revenue', of: 'Customer' }, 'sales.mapping.yaml'),
  [],
  { metric: 'order_count', measures: 'OrderCount' },
  'sales.mapping.yaml',
);
const docs: ProjectDoc[] = [
  { id: 'model', path: 'sales.semantic.yaml', filename: 'sales.semantic.yaml', source: model },
  { id: 'mapping', path: 'sales.mapping.yaml', filename: 'sales.mapping.yaml', source: mapping },
];
const revenue = { kind: 'metric' as const, name: 'revenue', docId: 'model', path: ['metrics', 0] };

beforeAll(async () => {
  await loadDraftValidators();
});

function errors(source: string, filename: string): string[] {
  return validateInput(source, filename)
    .issues.filter(issue => issue.severity === 'error')
    .map(issue => `${issue.code} at ${issue.path}`);
}

test('renaming a metric finds its binding in a 0.3 mapping and rewrites only that value', () => {
  const references = findReferences(revenue, docs).filter(reference => reference.docId === 'mapping');
  expect(references).toHaveLength(1);
  expect(mapping.slice(references[0].from, references[0].to)).toBe('revenue');
  expect(references[0].dependent?.binding?.metric).toBe('revenue');
  const [rewritten] = rewriteReferences(docs, references, 'net_revenue');
  expect(readKpiBindings(parse(rewritten.source)).value.map(binding => binding.metric)).toEqual(['order_count', 'net_revenue']);
  expect(errors(rewritten.source, 'sales.mapping.yaml')).toEqual([]);
});

test('renaming a concept finds the binding that measures it or names it as its subject', () => {
  const customer = { kind: 'concept' as const, name: 'Customer', docId: 'ontology', path: ['ontology', 0] };
  const bindingReferences = findReferences(customer, docs).filter(reference => reference.dependent?.binding);
  expect(bindingReferences.map(reference => reference.dependent!.binding!.metric)).toEqual(['revenue']);
});

test('deleting a metric removes its binding from a 0.3 mapping and keeps the other bindings and vendors', () => {
  const dependents = findReferences(revenue, docs)
    .filter(reference => reference.dependent?.binding)
    .map(reference => ({ docId: reference.docId, dependent: reference.dependent! }));
  expect(dependents).toHaveLength(1);
  const [edited] = removeDependents(docs, dependents);
  const root = parse(edited.source);
  expect(readKpiBindings(root).value.map(binding => binding.metric)).toEqual(['order_count']);
  expect(root.nonportable_extensions[0]).toEqual({ vendor_name: 'BI_TOOL', data: { folder: 'sales' } });
  expect(errors(edited.source, 'sales.mapping.yaml')).toEqual([]);
});

test('a metric named in another metric’s 0.3 attributes is found as a reference of that metric', () => {
  const withRatio = model.replace('          status: proposed\n', '          status: proposed\n          replaced_by: order_count\n');
  const orderCount = { kind: 'metric' as const, name: 'order_count', docId: 'model', path: ['metrics', 1] };
  const references = findReferences(orderCount, [{ ...docs[0], source: withRatio }]);
  const attribute = references.find(reference => reference.path.includes('replaced_by'))!;
  expect(withRatio.slice(attribute.from, attribute.to)).toBe('order_count');
  expect(attribute.dependent?.path).toEqual(['metrics', 0]);
});

test('a metric label that matches the name is not a reference, while a replaced_by that names it is', () => {
  const labelled =
    '  - name: basket\n    expression:\n      sql: AVG(orders.total_revenue)\n    nonportable_extensions:\n      - vendor_name: SEMANTIC_WORKBENCH\n        data:\n          schema: semantic-workbench/metric/v1\n          type: simple\n          label: order_count\n';
  const source = model
    .replace('          status: proposed\n', '          status: proposed\n          replaced_by: order_count\n')
    .replace('  - name: order_count\n', labelled + '  - name: order_count\n');
  const orderCount = { kind: 'metric' as const, name: 'order_count', docId: 'model', path: ['metrics', 2] };
  const references = findReferences(orderCount, [{ ...docs[0], source }]);
  expect(references.map(reference => reference.path.at(-1))).toEqual(['replaced_by']);
  expect(references.map(reference => reference.dependent?.path)).toEqual([['metrics', 0]]);
  const [renamed] = rewriteReferences([{ ...docs[0], source }], references, 'orders_total');
  expect(parse(renamed.source).metrics[1].nonportable_extensions[0].data.label).toBe('order_count');
  expect(parse(renamed.source).metrics[0].nonportable_extensions[0].data.replaced_by).toBe('orders_total');
});

test('the reference lists of a 0.2 project are exactly the ones recorded before the draft base', () => {
  const folder = join(import.meta.dir, '../public/examples/commerce');
  const commerce: ProjectDoc[] = readdirSync(folder)
    .filter(name => name.endsWith('.yaml'))
    .sort()
    .map(name => ({ id: name, path: name, filename: name, source: readFileSync(join(folder, name), 'utf8') }));
  const salesModel = parse(commerce.find(document => document.id === 'sales.ossie.yaml')!.source);
  const dataset = salesModel.datasets[0];
  const targets = [
    { kind: 'metric' as const, name: 'gross_revenue', docId: 'sales.ossie.yaml', path: ['metrics', salesModel.metrics.findIndex((metric: any) => metric.name === 'gross_revenue')] },
    { kind: 'dataset' as const, name: dataset.name, docId: 'sales.ossie.yaml', path: ['datasets', 0] },
    { kind: 'field' as const, name: dataset.fields[0].name, owner: dataset.name, docId: 'sales.ossie.yaml', path: ['datasets', 0, 'fields', 0] },
    { kind: 'concept' as const, name: 'Customer', docId: 'commerce-business.ossie.yaml', path: ['ontology', 0] },
  ];
  const current = targets.map(target => ({
    target: `${target.kind}:${target.name}`,
    references: findReferences(target, commerce).map(reference => ({ docId: reference.docId, path: reference.path, from: reference.from, to: reference.to, dependent: reference.dependent })),
  }));
  expect(JSON.parse(JSON.stringify(current))).toEqual(JSON.parse(readFileSync(join(FIXTURES, 'references-0.2-baseline.json'), 'utf8')));
});
