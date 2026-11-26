// Checks that a 0.3 draft model lists its dataset metrics as Metric items, reads sql expressions, and marks them as SQL regions.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from '../src/shared/core/model';
import { sqlRegions } from '../src/shared/sql/regions';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';

const source = readFileSync(join(import.meta.dir, 'fixtures/ossie-0.3/sales.semantic.yaml'), 'utf8');

beforeAll(async () => {
  await loadDraftValidators();
});

test('a dataset metric is a Metric item at its place under the dataset, linked to that dataset', () => {
  const model: any = inspect(source, 'sales.semantic.yaml');
  const metrics = model.entities.filter((entity: any) => entity.kind === 'Metric').map((entity: any) => entity.path.join('/'));
  expect(metrics).toEqual(['metrics/0', 'metrics/1', 'datasets/0/metrics/0']);
  const link = model.edges.find((edge: any) => edge.target === 'datasets/0/metrics/0');
  expect(link).toMatchObject({ source: 'datasets/0', label: 'used by metric' });
});

test('a model metric written in sql links to the datasets it reads, including through AGG', () => {
  const model: any = inspect(source, 'sales.semantic.yaml');
  const sources = (target: string) => model.edges.filter((edge: any) => edge.target === target && edge.label === 'used by metric').map((edge: any) => edge.source);
  expect(sources('metrics/0')).toEqual(['datasets/0']);
  expect(sources('metrics/1')).toEqual(['datasets/0']);
});

test('sql expressions, including dataset metrics, are SQL regions in the portable dialect', () => {
  const regions = sqlRegions(source, 'sales.semantic.yaml').map(region => ({ pointer: region.pointer, dialect: region.dialect, grammar: region.grammar }));
  expect(regions).toContainEqual({ pointer: '/datasets/0/metrics/0/expression/sql', dialect: 'OSSIE_SQL_2026', grammar: 'postgresql' });
  expect(regions).toContainEqual({ pointer: '/metrics/0/expression/sql', dialect: 'OSSIE_SQL_2026', grammar: 'postgresql' });
  expect(regions).toContainEqual({ pointer: '/metrics/1/expression/dialects/0/expression', dialect: 'BI_EXPRESSION', grammar: null });
});
