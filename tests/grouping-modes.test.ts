// Tests which Group by modes each document offers, why a mode is disabled, and what Auto picks.
import { test, expect } from 'bun:test';
import { Glob } from 'bun';
import { basename, resolve } from 'node:path';
import { inspect, type Entity, type Relationship } from '../src/shared/core/model';
import { modelOverview, usableGroupingModes, GROUPING_ORDER, type ConcreteGroupingMode } from '../src/app/graph/overview';

type Model = { name: string; entities: Entity[]; edges: Relationship[] };

const read = (path: string) => Bun.file(path).text();

async function load(path: string): Promise<Model> {
  return inspect(await read(path), basename(path)) as Model;
}

// Every shipped example that the workbench opens as a model.
async function shippedModels() {
  const files: string[] = [];
  for await (const path of new Glob('public/examples/**/*.{yaml,ttl,owl}').scan({
    cwd: resolve(import.meta.dir, '..'),
  }))
    files.push(path);
  const models: [string, Model][] = [];
  for (const path of files.sort()) {
    try {
      models.push([path, await load(path)]);
    } catch {
      // Not a model on its own (for example a manifest); the workbench does not group it.
    }
  }
  return models;
}

const overviewOf = (model: Model, mode: ConcreteGroupingMode | 'auto' = 'auto') => modelOverview(model.entities, model.edges, model.name, false, { mode });

test('every enabled mode of every shipped example yields at least two groups', async () => {
  const models = await shippedModels();
  expect(models.length).toBeGreaterThan(20);
  for (const [path, model] of models) {
    const modes = overviewOf(model).modes;
    for (const mode of GROUPING_ORDER) {
      const state = modes[mode];
      if (!state.offered) continue;
      if (state.reason) {
        expect({ path, mode, disabledHasFewGroups: state.groups < 2 || mode !== 'types' }).toEqual({
          path,
          mode,
          disabledHasFewGroups: true,
        });
        continue;
      }
      const groups = overviewOf(model, mode).groups.length;
      expect({ path, mode, groups }).toEqual({ path, mode, groups: state.groups });
      expect({ path, mode, atLeastTwo: groups >= 2 }).toEqual({ path, mode, atLeastTwo: true });
    }
  }
});

test('Auto picks the first mode with two or more groups, in the documented order', async () => {
  for (const [path, model] of await shippedModels()) {
    const overview = overviewOf(model);
    const first = GROUPING_ORDER.find(m => overview.modes[m].offered && !overview.modes[m].reason);
    expect({ path, auto: overview.mode }).toEqual({ path, auto: first ?? 'types' });
    expect(overview.autoMode).toBe(overview.mode);
  }
});

test('the UBL contract groups objects into communities over its foreign keys', async () => {
  const model = await load('public/examples/ubl/ubl.odcs.yaml');
  const overview = overviewOf(model, 'suggested');
  expect(overview.mode).toBe('suggested');
  expect(overview.groups.length).toBeGreaterThan(1);
  expect(overview.groups.some(g => g.name === 'Object')).toBe(false);
  expect(overview.groups.every(g => g.provenance === 'Structural suggestion')).toBe(true);
});

test('modes with no basis in a contract are disabled with their reason', async () => {
  const model = await load('public/examples/ubl/ubl.odcs.yaml');
  const { modes } = overviewOf(model);
  expect(modes.namespaces.reason).toBe('No IRIs declared');
  expect(modes.types.reason).toBe('Every entity has the same type');
  expect(modes.suggested.reason).toBeUndefined();
});

test('a contract-level domain alone does not make Auto choose declared domains', async () => {
  for (const path of ['public/examples/ubl/ubl.odcs.yaml', 'public/examples/mall/mall.odcs.yaml', 'public/examples/commerce/commerce.odcs.yaml']) {
    const overview = overviewOf(await load(path));
    expect(overview.modes.declared.reason).toBe('Only the contract-level domain is declared');
    expect(overview.mode).not.toBe('declared');
  }
});

test('entities that declare their own domains group by them before a contract-level domain', () => {
  const entity = (id: string, domain?: string): Entity => ({
    id,
    name: id,
    kind: 'Object',
    description: '',
    fields: [],
    path: [],
    definition: domain ? { domain } : {},
    declaredDomains: ['Everything'],
  });
  const model: Model = {
    name: 'Domains',
    entities: [entity('orders', 'Sales'), entity('invoices', 'Finance'), entity('payments')],
    edges: [],
  };
  const overview = overviewOf(model);
  expect(overview.mode).toBe('declared');
  expect(overview.groups.map(g => g.name).sort()).toEqual(['Everything', 'Finance', 'Sales']);
  expect(overview.memberships.get('orders')).toEqual(['domain:Sales', 'domain:Everything']);
});

test('semantic models and mapping documents get suggested communities', async () => {
  for (const path of ['public/examples/mall/mall.semantic.yaml', 'public/examples/ubl/ubl.semantic.yaml', 'public/examples/mall/mall.mapping.yaml', 'public/examples/billing/billing.mapping.yaml']) {
    const overview = overviewOf(await load(path), 'suggested');
    expect({ path, mode: overview.mode }).toEqual({ path, mode: 'suggested' });
    const communities = overview.groups.filter(g => g.id.startsWith('community:'));
    expect({ path, many: communities.length >= 2 }).toEqual({ path, many: true });
  }
});

test('suggested areas merge small communities and keep unlinked entities out of them', async () => {
  for (const path of ['public/examples/mall/mall.semantic.yaml', 'public/examples/mall/mall.mapping.yaml', 'public/examples/billing/billing.semantic.yaml']) {
    const overview = overviewOf(await load(path), 'suggested');
    const sizes = overview.groups.map(g => g.entities.length);
    expect({ path, areas: sizes.length <= 20 }).toEqual({ path, areas: true });
    expect({ path, smallest: Math.min(...sizes) >= 3 }).toEqual({ path, smallest: true });
  }
});

test('a mapping document with no links between its concepts disables suggested communities', () => {
  const source = [
    'version: 0.2.0.dev0',
    'name: Loose mappings',
    'ontology_ref:',
    '  name: Flights ontology',
    '  iri: ./flights.ontology.yaml',
    'semantic_model_ref:',
    '  name: Flights model',
    '  iri: ./flights.semantic_model.yaml',
    'concept_mappings:',
    '  - concept: Airport',
    '    object_mappings:',
    '      - referent_mappings:',
    '          - relationship: id',
    '            expression: airports.id',
    '  - concept: Airline',
    '    object_mappings:',
    '      - referent_mappings:',
    '          - relationship: id',
    '            expression: airlines.id',
    '',
  ].join('\n');
  const model = inspect(source, 'loose.mapping.yaml') as Model;
  expect(overviewOf(model).modes.suggested.reason).toBe('No relationships to group by');
});

test('UBL example areas are offered by content, not by the model name', async () => {
  const ubl = await load('public/examples/ubl/ubl.ontology.yaml');
  const renamed = { ...ubl, name: 'Procurement model' };
  expect(overviewOf(renamed).modes.example.offered).toBe(true);
  expect(overviewOf(renamed).mode).toBe('example');
  expect(overviewOf(renamed, 'example').groups).toHaveLength(8);
  const mall = await load('public/examples/mall/mall.ontology.yaml');
  const named = { ...mall, name: 'UBL lookalike' };
  expect(overviewOf(named).modes.example.offered).toBe(false);
  expect(overviewOf(named).mode).not.toBe('example');
});

test('Auto names its own choice even after another mode is chosen', async () => {
  const model = await load('public/examples/mall/mall.ontology.yaml');
  const auto = overviewOf(model).mode;
  for (const mode of GROUPING_ORDER) {
    const overview = overviewOf(model, mode);
    expect(overview.autoMode).toBe(auto);
  }
});

test('a stored choice of a disabled mode falls back to Auto', async () => {
  const model = await load('public/examples/ubl/ubl.odcs.yaml');
  const overview = overviewOf(model, 'namespaces');
  expect(overview.mode).toBe(overview.autoMode);
});

test('the Group menu lists only modes that work and nothing when there is no choice', async () => {
  const models = await shippedModels();
  for (const [path, model] of models) {
    const modes = overviewOf(model).modes;
    for (const mode of usableGroupingModes(modes)) {
      expect(modes[mode].offered, `${path} ${mode}`).toBe(true);
      expect(modes[mode].reason, `${path} ${mode}`).toBeUndefined();
    }
  }
  const sameKind = {
    name: 'Plain',
    entities: [
      { id: 'a', name: 'A', kind: 'EntityType' },
      { id: 'b', name: 'B', kind: 'EntityType' },
    ],
    edges: [],
  } as unknown as Model;
  expect(usableGroupingModes(overviewOf(sameKind).modes)).toEqual([]);
});
