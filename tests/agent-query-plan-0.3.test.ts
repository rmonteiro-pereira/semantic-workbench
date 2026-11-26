// Checks the governed planner on an Ossie 0.3 draft model: sql expressions, and AGG(dataset.metric) inlined from a dataset-scoped metric.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { buildContext, planQuery, type StoredDocument } from '../src/server/agent/runtime';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';

const FIXTURES = join(import.meta.dir, 'fixtures/ossie-0.3');
const names = ['sales.mapping.yaml', 'sales.ontology.yaml', 'sales.semantic.yaml'];
const fixture: StoredDocument[] = names.map((filename, i) => ({ id: String(i), filename, revision: 1, source: readFileSync(join(FIXTURES, filename), 'utf8') }));

beforeAll(async () => {
  await loadDraftValidators();
});

/** The fixture with the semantic model changed by `edit`. */
function withModel(edit: (model: any) => void): StoredDocument[] {
  const documents = structuredClone(fixture);
  const model = parse(documents[2].source);
  edit(model);
  documents[2].source = stringify(model);
  return documents;
}

function plan(documents: StoredDocument[], metrics: string[]) {
  return planQuery(buildContext(documents, '0'), { mappingId: '0', metrics, dimensions: [JSON.stringify(['customers', 'region'])], scope: 'model' });
}

test('a model metric over AGG(dataset.metric) plans as the dataset metric, and sql expressions compile', () => {
  expect(plan(fixture, ['revenue', 'order_count']).sql).toBe(
    [
      'SELECT',
      '  "customers".region AS "dimension_1",',
      '  SUM("orders".amount) AS "metric_1",',
      '  COUNT("orders".id) AS "metric_2"',
      'FROM "sales"."orders" AS "orders"',
      'LEFT JOIN "sales"."customers" AS "customers" ON "orders".customer_id = "customers".id',
      'GROUP BY "customers".region;',
    ].join('\n'),
  );
});

test('the portable sql wins over an ANSI_SQL dialect entry of the same expression', () => {
  const documents = withModel(model => {
    model.metrics[1].expression.dialects.push({ dialect: 'ANSI_SQL', expression: 'SUM(orders.amount)' });
  });
  expect(plan(documents, ['order_count']).sql).toContain('COUNT("orders".id) AS "metric_1"');
});

test('the dataset metric reads unqualified names inside its own dataset', () => {
  const documents = withModel(model => {
    model.datasets[0].metrics[0].expression.sql = 'SUM(amount) - SUM(amount) / 10';
  });
  expect(plan(documents, ['revenue']).sql).toContain('(SUM("orders".amount) - SUM("orders".amount) / 10) AS "metric_1"');
});

test('AGG over an unknown dataset metric or a source measure is a context finding, and planning refuses', () => {
  for (const sql of ['AGG(orders.missing)', 'AGG(source.total)']) {
    const documents = withModel(model => {
      model.metrics[0].expression.sql = sql;
    });
    const context = buildContext(documents, '0');
    expect(context.findings.some(finding => finding.severity === 'error')).toBe(true);
    expect(() => plan(documents, ['revenue'])).toThrow('Resolve mapping context errors before planning.');
  }
});
