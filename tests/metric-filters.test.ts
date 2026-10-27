// Tests the pure rules of the metrics list: filters, grouping, optional columns.
import { expect, test } from 'bun:test';
import type { KpiSummary } from '../src/server/agent/explain';
import {
  filterMetrics,
  groupMetrics,
  isNarrowed,
  metricKey,
  noFilters,
  visibleColumns,
} from '../src/metrics/metric-filters';

function metric(overrides: Partial<KpiSummary>): KpiSummary {
  return {
    name: 'metric',
    label: 'Metric',
    file: 'sales.ossie.yaml',
    modelPath: ['semantic_model', 0],
    type: 'simple',
    governed: false,
    concepts: [],
    findings: [],
    ...overrides,
  } as KpiSummary;
}

const revenue = metric({
  name: 'revenue',
  label: 'Revenue',
  type: 'ratio',
  owner: 'Finance',
  status: 'approved',
  governed: true,
  unit: 'EUR',
});
const orders = metric({ name: 'orders', label: 'Orders', description: 'Counts order lines' });
const all = [revenue, orders];

test('a metric is keyed by file, model path and name', () => {
  expect(metricKey(revenue)).toBe('sales.ossie.yaml#semantic_model/0#revenue');
});

test('each filter keeps only the metrics that match it', () => {
  expect(filterMetrics(all, { ...noFilters, type: 'ratio' }, '')).toEqual([revenue]);
  expect(filterMetrics(all, { ...noFilters, status: 'approved' }, '')).toEqual([revenue]);
  expect(filterMetrics(all, { ...noFilters, owner: 'Finance' }, '')).toEqual([revenue]);
  expect(filterMetrics(all, { ...noFilters, governedOnly: true }, '')).toEqual([revenue]);
});

test('the search text looks at label, name, description, owner and concepts', () => {
  expect(filterMetrics(all, noFilters, 'order lines')).toEqual([orders]);
  expect(filterMetrics(all, noFilters, 'finance')).toEqual([revenue]);
  expect(filterMetrics(all, noFilters, 'nothing like it')).toEqual([]);
});

test('grouping sorts the groups and names metrics that lack the grouped value', () => {
  const groups = groupMetrics(all, 'owner');
  expect(groups.map(([name]) => name)).toEqual(['Finance', 'No owner']);
  expect(groupMetrics(all, 'status').map(([name]) => name)).toEqual(['Approved', 'No status']);
  expect(groupMetrics(all, 'concept').map(([name]) => name)).toEqual(['Not bound to a concept']);
});

test('a column is drawn only when some metric has a value for it', () => {
  expect(visibleColumns([orders])).toEqual({
    unit: false,
    status: false,
    owner: false,
    concept: false,
  });
  expect(visibleColumns(all)).toEqual({ unit: true, status: true, owner: true, concept: false });
});

test('only filters narrow the list; grouping does not', () => {
  const grouped = { ...noFilters, groupBy: 'owner' as const };
  expect(isNarrowed(grouped, '')).toBe(false);
  const narrowed = { ...grouped, type: 'ratio' as const };
  expect(isNarrowed(narrowed, '')).toBe(true);
  expect(isNarrowed(noFilters, 'revenue')).toBe(true);
});
