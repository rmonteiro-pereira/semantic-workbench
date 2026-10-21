import { test, expect } from 'bun:test';
import { parse, stringify } from 'yaml';
import { inspect } from '../src/model';
import { validateInput } from '../src/input';
import { buildContext, agentCatalog } from '../server/agent/runtime';
import { projectMetrics } from '../server/agent/explain';
// Both official Ossie layouts (FR-031): split files and the consolidated file whose ontology_mappings
// embed the semantic model (deprecated upstream) give the same model.
const dir = 'public/examples/ossie/';
const read = (f: string) => Bun.file(dir + f).text();
const docs = async (files: string[]) =>
  Promise.all(
    files.map(async filename => ({
      id: `flights/${filename}`,
      project: 'flights',
      path: filename,
      filename,
      revision: 1,
      source: await read(filename),
    })),
  );
test('split and consolidated Flights give the same concepts, datasets, joins, metrics and 60 bindings', async () => {
  const split = await docs([
    'flights.ontology.yaml',
    'flights.semantic_model.yaml',
    'flights.mapping.yaml',
  ]);
  const consolidated = await docs(['flights.yaml']);
  const splitModel = inspect(split[1].source, split[1].filename) as any;
  const whole = inspect(consolidated[0].source, consolidated[0].filename) as any;
  const ontology = inspect(split[0].source, split[0].filename) as any;
  const count = (m: any, kind: string) => m.entities.filter((e: any) => e.kind === kind).length;
  expect(count(whole, 'Dataset')).toBe(count(splitModel, 'Dataset'));
  expect(count(whole, 'Dataset')).toBeGreaterThan(0);
  expect(whole.edges.filter((e: any) => e.data.kind === 'Dataset relationship').length).toBe(
    splitModel.edges.filter((e: any) => e.data.kind === 'Dataset relationship').length,
  );
  expect(count(whole, 'Metric')).toBe(count(splitModel, 'Metric'));
  expect(whole.document.ontology.length).toBe(ontology.document.ontology.length);
  const a = buildContext(split, 'flights/flights.mapping.yaml');
  const b = buildContext(consolidated, agentCatalog(consolidated).mappings[0].id);
  expect(a.bindings).toHaveLength(60);
  expect(b.bindings).toHaveLength(60);
  for (const k of ['concepts', 'datasets', 'joins', 'metrics', 'fields'] as const)
    expect((b as any)[k].length).toBe((a as any)[k].length);
  expect(b.findings.filter(f => f.severity === 'error')).toEqual([]);
});
test('layouts are labelled: split files, and the consolidated form as deprecated upstream', async () => {
  for (const f of ['flights.ontology.yaml', 'flights.semantic_model.yaml', 'flights.mapping.yaml'])
    expect((inspect(await read(f), f) as any).layout).toBe('split');
  const whole = inspect(await read('flights.yaml'), 'flights.yaml') as any;
  expect(whole.layout).toBe('embedded (deprecated)');
  // The embedded semantic model is not treated as ontology-only: its datasets are entities of the file.
  expect(
    whole.entities.some((e: any) => e.kind === 'Dataset' && e.path[0] === 'ontology_mappings'),
  ).toBe(true);
  expect(
    projectMetrics(await docs(['flights.yaml']), 'flights').every(
      m => m.layout === 'embedded (deprecated)',
    ),
  ).toBe(true);
});
test('other single-file layouts are rejected with the two official layouts named', async () => {
  const ontology = await read('flights.ontology.yaml');
  const semantic = await read('flights.semantic_model.yaml');
  const mixed = stringify({ ...parse(ontology), datasets: parse(semantic).datasets });
  const r = validateInput(mixed, 'mixed.yaml');
  expect(r.valid).toBe(false);
  expect(r.issues.map(i => i.message).join(' ')).toContain('two official Ossie layouts');
  const mapping = await read('flights.mapping.yaml');
  const r2 = validateInput(
    mapping.replace(/^concept_mappings:/m, 'ontology: []\nconcept_mappings:'),
    'm.yaml',
  );
  expect(r2.valid).toBe(false);
  expect(r2.issues.map(i => i.message).join(' ')).toContain('official Ossie layouts');
});
