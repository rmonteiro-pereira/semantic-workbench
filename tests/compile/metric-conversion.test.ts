// Checks the reviewed conversion of workbench metric payloads to the 0.3 draft form: object data, every status mapped, bindings and other vendors kept, never an approval.
import { beforeAll, expect, test } from 'bun:test';
import { parse } from 'yaml';
import { BaseConversionRefusal, convertToDraftBase } from '../../src/shared/tessera/base-conversion';
import { loadDraftValidators } from '../../src/shared/validation/draft-validators';
import { validateInput } from '../../src/shared/validation/input';

beforeAll(async () => {
  await loadDraftValidators();
});

/** A 0.2 model with one metric per status, each with workbench attributes, and one metric that also carries another vendor. */
function modelWithStatuses(statuses: string[]): string {
  const metrics = statuses.flatMap((status, index) => [
    `  - name: m${index}`,
    '    expression:',
    '      dialects:',
    '        - dialect: ANSI_SQL',
    '          expression: SUM(orders.amount)',
    '    custom_extensions:',
    '      - vendor_name: SEMANTIC_WORKBENCH',
    `        data: '{"schema": "semantic-workbench/metric/v1", "type": "simple", "status": "${status}"${status === 'deprecated' ? ', "deprecation_reason": "old"' : ''}}'`,
    ...(index === 0 ? ['      - vendor_name: BI_TOOL', `        data: '{"format": "currency"}'`] : []),
  ]);
  return ['version: 0.2.0.dev0', 'name: Sales', 'datasets:', '  - name: orders', '    source: sales.orders', 'metrics:', ...metrics, ''].join('\n');
}

const statusOf = (model: any, index: number) => model.metrics[index].nonportable_extensions[0].data.status;

test('every workbench status maps to the 0.3 form: draft becomes proposed, the others stay', () => {
  const conversion = convertToDraftBase(modelWithStatuses(['draft', 'proposed', 'approved', 'deprecated']), 'sales.semantic.yaml');
  const model = parse(conversion.text);
  expect([0, 1, 2, 3].map(index => statusOf(model, index))).toEqual(['proposed', 'proposed', 'approved', 'deprecated']);
  expect(conversion.changes.filter(change => change.kind === 'metric-status')).toEqual([
    { pointer: '/metrics/0/custom_extensions/0/data/status', kind: 'metric-status', before: 'draft', after: 'proposed' },
  ]);
  expect(validateInput(conversion.text, 'sales.semantic.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
});

test('two vendors in one file both become object data, and the other vendor is kept as it was', () => {
  const model = parse(convertToDraftBase(modelWithStatuses(['proposed']), 'sales.semantic.yaml').text);
  expect(model.metrics[0].custom_extensions).toBeUndefined();
  expect(model.metrics[0].nonportable_extensions).toEqual([
    { vendor_name: 'SEMANTIC_WORKBENCH', data: { schema: 'semantic-workbench/metric/v1', type: 'simple', status: 'proposed' } },
    { vendor_name: 'BI_TOOL', data: { format: 'currency' } },
  ]);
});

test('a mapping keeps its metric bindings as object data', () => {
  const mapping = [
    'version: 0.2.0.dev0',
    'name: Sales mappings',
    'ontology_ref:',
    '  name: Sales ontology',
    '  iri: ./sales.ontology.yaml',
    'semantic_model_ref:',
    '  name: Sales',
    '  iri: ./sales.semantic.yaml',
    'concept_mappings: []',
    'custom_extensions:',
    '  - vendor_name: SEMANTIC_WORKBENCH',
    '    data: |',
    '      {"schema": "semantic-workbench/mapping/v1", "kpi_bindings": [',
    '        {"metric":"revenue","measures":"Revenue","of":"Customer"}',
    '      ]}',
    '',
  ].join('\n');
  const conversion = convertToDraftBase(mapping, 'sales.mapping.yaml');
  expect(parse(conversion.text).nonportable_extensions[0].data).toEqual({ schema: 'semantic-workbench/mapping/v1', kpi_bindings: [{ metric: 'revenue', measures: 'Revenue', of: 'Customer' }] });
  expect(validateInput(conversion.text, 'sales.mapping.yaml').issues.filter(issue => issue.severity === 'error')).toEqual([]);
});

test('a status rename that would approve a metric refuses the whole conversion', () => {
  const refusal = (() => {
    try {
      convertToDraftBase(modelWithStatuses(['draft']), 'sales.semantic.yaml', { draft: 'approved' });
      return null;
    } catch (error) {
      return error;
    }
  })();
  expect(refusal).toBeInstanceOf(BaseConversionRefusal);
  expect((refusal as BaseConversionRefusal).code).toBe('would-approve');
});
