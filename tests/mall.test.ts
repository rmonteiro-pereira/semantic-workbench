// Tests the generated shopping center model and its metrics.
import { test, expect } from 'bun:test';
import { parse } from 'yaml';
import { inspect } from '../src/shared/core/model';
import { modelOverview } from '../src/app/graph/overview';
import { checkMall } from '../scripts/mall-checks';
test('shopping center example: every file validates and governed KPIs match independently computed values', async () => {
  const mall = await checkMall();
  expect(mall.imports).toHaveLength(7);
  expect(mall.executions).toHaveLength(15);
  expect(mall.counts.entityTypes).toBe(145);
});
test('shopping center ontology groups by its eleven module namespaces', async () => {
  const source = await Bun.file('public/examples/mall/mall.ontology.yaml').text();
  const ontologyModel = inspect(source, 'mall.ontology.yaml');
  const overview = modelOverview(ontologyModel.entities, ontologyModel.edges, ontologyModel.name);
  expect(overview.mode).toBe('namespaces');
  expect(
    overview.groups
      .filter(g => g.provenance === 'Declared prefix')
      .map(g => g.name)
      .sort(),
  ).toEqual(['asset:', 'core:', 'fin:', 'hr:', 'kpi:', 'lease:', 'legal:', 'ops:', 'party:', 'perf:', 'proc:']);
  expect(overview.groups.some(g => g.id === 'no-namespace')).toBe(false);
  const doc = parse(source);
  for (const concept of doc.ontology) {
    expect(concept.iri).toMatch(/^[a-z]+:[A-Z]/);
    expect(concept.description?.length).toBeGreaterThan(5);
  }
});
