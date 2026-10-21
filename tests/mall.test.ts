// Tests the generated shopping center model and its metrics.
import { test, expect } from 'bun:test';
import { parse } from 'yaml';
import { inspect } from '../src/model';
import { modelOverview } from '../src/overview';
import { checkMall } from '../scripts/mall-checks';
test('shopping center example: every file validates and governed KPIs match independently computed values', async () => {
  const r = await checkMall();
  expect(r.imports).toHaveLength(7);
  expect(r.executions).toHaveLength(15);
  expect(r.counts.entityTypes).toBe(145);
});
test('shopping center ontology groups by its eleven module namespaces', async () => {
  const source = await Bun.file('public/examples/mall/mall.ontology.yaml').text();
  const m = inspect(source, 'mall.ontology.yaml');
  const o = modelOverview(m.entities, m.edges, m.name);
  expect(o.mode).toBe('namespaces');
  expect(
    o.groups
      .filter(g => g.provenance === 'Declared prefix')
      .map(g => g.name)
      .sort(),
  ).toEqual([
    'asset:',
    'core:',
    'fin:',
    'hr:',
    'kpi:',
    'lease:',
    'legal:',
    'ops:',
    'party:',
    'perf:',
    'proc:',
  ]);
  expect(o.groups.some(g => g.id === 'no-namespace')).toBe(false);
  const doc = parse(source);
  for (const c of doc.ontology) {
    expect(c.iri).toMatch(/^[a-z]+:[A-Z]/);
    expect(c.description?.length).toBeGreaterThan(5);
  }
});
