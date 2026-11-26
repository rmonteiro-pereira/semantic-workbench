// Checks that a file declaring the Ossie 0.3.0 draft gets the 0.3 schema and rules, and that 0.2 and unknown versions keep theirs.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';
import { validateInput } from '../src/shared/validation/input';
import { NOT_VALIDATED } from '../src/shared/validation/validation';

const FIXTURES = join(import.meta.dir, 'fixtures/ossie-0.3');

beforeAll(async () => {
  await loadDraftValidators();
});

function fixture(name: string): any {
  return parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

/** Validates a document object and returns its findings as `code at path`. */
function findings(document: unknown): string[] {
  return validateInput(JSON.stringify(document), 'document.json').issues.map(issue => `${issue.code} at ${issue.path}`);
}

function errorCodes(document: unknown): string[] {
  return validateInput(JSON.stringify(document), 'document.json')
    .issues.filter(issue => issue.severity === 'error')
    .map(issue => issue.code);
}

test('each 0.3 fixture is valid with no Not validated notice', () => {
  for (const name of ['sales.semantic.yaml', 'sales.ontology.yaml', 'sales.mapping.yaml']) {
    const result = validateInput(readFileSync(join(FIXTURES, name), 'utf8'), name);
    expect({ name, valid: result.valid, issues: result.issues }).toEqual({ name, valid: true, issues: [] });
  }
});

test('the declared version picks the schema: 0.3 forms pass in 0.3, fail in 0.2, and an unknown version is not validated', () => {
  const model = fixture('sales.semantic.yaml');
  expect(findings(model)).toEqual([]);
  expect(errorCodes({ ...model, version: '0.2.0.dev0' })).toContain('schema');
  const unknown = validateInput(JSON.stringify({ ...model, version: '0.4.0' }), 'document.json').issues;
  expect(unknown.map(issue => issue.code)).toContain(NOT_VALIDATED);
});

test('a 0.3 model refuses the 0.2 extension form: custom_extensions, and data as a JSON string', () => {
  const model = fixture('sales.semantic.yaml');
  const renamed = structuredClone(model);
  renamed.metrics[0].custom_extensions = renamed.metrics[0].nonportable_extensions;
  delete renamed.metrics[0].nonportable_extensions;
  expect(findings(renamed)).toContain('schema at /metrics/0/custom_extensions');
  const stringData = structuredClone(model);
  stringData.metrics[0].nonportable_extensions[1].data = '{"format":"currency"}';
  expect(findings(stringData)).toContain('schema at /metrics/0/nonportable_extensions/1/data');
});

test('an expression needs sql or dialects, and a dialect name may be any non-empty string', () => {
  const model = fixture('sales.semantic.yaml');
  const neither = structuredClone(model);
  neither.datasets[0].fields[0].expression = {};
  expect(errorCodes(neither)).toContain('structure');
  const emptyDialect = structuredClone(model);
  emptyDialect.metrics[1].expression.dialects[0].dialect = '';
  expect(errorCodes(emptyDialect).length).toBeGreaterThan(0);
});

test('a dataset metric shares one namespace with its fields and resolves inside its dataset', () => {
  const model = fixture('sales.semantic.yaml');
  const clash = structuredClone(model);
  clash.datasets[0].metrics[0].name = 'amount';
  expect(findings(clash)).toContain('duplicate at /datasets/0/metrics/0/name');
  const reach = structuredClone(model);
  reach.datasets[0].metrics.push({ name: 'regions', expression: { sql: 'COUNT(DISTINCT customers.region)' } });
  expect(findings(reach)).toContain('reference at /datasets/0/metrics/1/expression/sql');
  const fromSource = structuredClone(model);
  fromSource.datasets[0].metrics.push({ name: 'gross', expression: { sql: 'SUM(source.gross_amount)' } });
  expect(findings(fromSource)).toEqual([]);
});

test('AGG is allowed only in the metric forms the draft defines', () => {
  const model = fixture('sales.semantic.yaml');
  const inField = structuredClone(model);
  inField.datasets[1].fields[1].expression = { sql: 'AGG(orders.total_revenue)' };
  expect(findings(inField)).toContain('reserved-function at /datasets/1/fields/1/expression/sql');
  const unknownMetric = structuredClone(model);
  unknownMetric.metrics[0].expression = { sql: 'AGG(orders.missing)' };
  expect(findings(unknownMetric)).toContain('reference at /metrics/0/expression/sql');
  const datasetForm = structuredClone(model);
  datasetForm.datasets[0].metrics.push({ name: 'measured', expression: { sql: 'AGG(source.net_revenue)' } });
  expect(findings(datasetForm)).toEqual([]);
  const wrongDatasetForm = structuredClone(model);
  wrongDatasetForm.datasets[0].metrics.push({ name: 'nested', expression: { sql: 'AGG(total_revenue)' } });
  expect(findings(wrongDatasetForm)).toContain('reserved-function at /datasets/0/metrics/1/expression/sql');
});

test('METRIC is reserved in portable expressions in any capitalization, and not in vendor dialects', () => {
  const model = fixture('sales.semantic.yaml');
  for (const text of ['METRIC(SUM(amount))', 'metric(SUM(amount))']) {
    const reserved = structuredClone(model);
    reserved.datasets[0].metrics[0].expression = { sql: text };
    expect(findings(reserved)).toContain('reserved-function at /datasets/0/metrics/0/expression/sql');
  }
  const vendor = structuredClone(model);
  vendor.metrics[1].expression.dialects[0].expression = 'METRIC(orders)';
  expect(findings(vendor)).toEqual([]);
  const quoted = structuredClone(model);
  quoted.datasets[0].metrics[0].expression = { sql: "SUM(CASE WHEN 'METRIC(x)' = 'y' THEN amount END)" };
  expect(findings(quoted)).toEqual([]);
});

test('key fields and ontology lists name each entry once in 0.3, while 0.2 keeps its looser schema', () => {
  const model = fixture('sales.semantic.yaml');
  const repeatedKey = structuredClone(model);
  repeatedKey.datasets[0].primary_key = ['id', 'id'];
  expect(findings(repeatedKey)).toContain('schema at /datasets/0/primary_key');
  const ontology = fixture('sales.ontology.yaml');
  const repeated = structuredClone(ontology);
  repeated.ontology[0].relationships[0].verbalizes = ['{Customer} has identifier {Identifier}', '{Customer} has identifier {Identifier}'];
  expect(errorCodes(repeated)).toContain('schema');
  const loose = structuredClone(repeated);
  loose.version = '0.2.0.dev0';
  delete loose.annotations;
  delete loose.ontology[0].annotations;
  expect(errorCodes(loose)).toEqual([]);
});

test('a 0.3 mapping uses the 0.3 mapping schema, and mappings stay strict about versions', () => {
  const mapping = fixture('sales.mapping.yaml');
  expect(findings(mapping)).toEqual([]);
  const oldForm = structuredClone(mapping);
  oldForm.custom_extensions = oldForm.nonportable_extensions;
  delete oldForm.nonportable_extensions;
  expect(errorCodes(oldForm)).toContain('schema');
  expect(errorCodes({ ...mapping, version: '0.4.0' })).toContain('schema');
});

test('workbench attributes on a dataset metric are checked against the metric schema', () => {
  const model = fixture('sales.semantic.yaml');
  model.datasets[0].metrics[0].nonportable_extensions = [{ vendor_name: 'SEMANTIC_WORKBENCH', data: { schema: 'semantic-workbench/metric/v1', type: 'unknown' } }];
  expect(findings(model)).toContain('extension at /datasets/0/metrics/0/nonportable_extensions/0/data');
  model.datasets[0].metrics[0].nonportable_extensions[0].data.type = 'simple';
  expect(findings(model)).toEqual([]);
});
