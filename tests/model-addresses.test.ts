/** Proves structured locator coverage and name stability through the public derivation API. */
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { addressAtModelPath, addressesOfModel, itemIdentity, resolveInModel, UnaddressableItemError } from '../src/shared/core/model-addresses';
import { formatAddress, type Address } from '../src/shared/core/item-address';
import { shuffled, withAddressSeed } from './helpers/seeded-random';

const document = { project: 'sample', document: ['hostile.yaml'] };
const ontology = {
  name: 'O:#',
  ontology: [{ concept: 'a/b', iri: 'ex:Party', relationships: [{ name: 'r#', roles: [{ concept: 'a/b' }] }] }],
  prefixes: { ex: 'https://example.org/' },
  ontology_mappings: [{ semantic_model: { name: 'M', datasets: [{ name: 'a.b', fields: [{ name: 'a/b' }] }] }, concept_mappings: [{ concept: 'a/b', object_mappings: [{}], link_mappings: [{}] }] }],
};
const contract = {
  kind: 'DataContract',
  id: 'C',
  schema: [{ name: 'a:b', properties: [{ name: 'c', properties: [{ name: 'a.b' }] }], relationships: [{ from: 'a:b.c', to: 'a:b.c' }] }],
};
const legacy = {
  semantic_model: [
    { name: 'One', datasets: [{ name: 'orders' }], relationships: [{ name: 'orders' }], metrics: [{ name: 'm' }] },
    { name: 'Two', datasets: [] },
  ],
};

function valueAt(model: any, path: (string | number)[]) {
  return path.reduce((value, part) => value[part], model);
}

test('every layout and nested item resolves to the exact original document value', () => {
  for (const model of [ontology, contract, legacy, { name: 'Mapping', concept_mappings: [{ concept: 'C' }] }]) {
    const items = addressesOfModel(model, document);
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) {
      expect(addressAtModelPath(model, item.path).chain).toEqual(item.address.chain);
      const result = resolveInModel(model, item.address, document);
      expect(result.status).toBe('found');
      if (result.status === 'found') expect(valueAt(model, result.item.path)).toBe(valueAt(model, item.path));
    }
  }
  const nested = addressesOfModel(contract, document).find(item => item.path.length === 6)!;
  expect(nested.address.chain.slice(-2)).toEqual([
    { kind: 'property', name: 'c' },
    { kind: 'property', name: 'a.b' },
  ]);
  const unnamed = addressesOfModel(ontology, document).filter(item => item.path[0] === 'ontology_mappings');
  expect(unnamed.every(item => item.volatile)).toBe(true);
  expect(unnamed[0].address.chain.at(-1)).toEqual({ kind: 'mapping', position: 0 });
  const named = { ...ontology, ontology_mappings: [{ ...ontology.ontology_mappings[0], name: 'Named' }] };
  expect(addressesOfModel(named, document).find(item => item.kind === 'mapping')!.volatile).toBe(false);
});

test('duplicate names return all matches and kinds keep independent name scopes', () => {
  const duplicate = { name: 'O', ontology: [{ concept: 'C' }, { concept: 'C' }] };
  const items = addressesOfModel(duplicate, document).filter(item => item.kind === 'concept');
  expect(items.every(item => item.ambiguous)).toBe(true);
  expect(resolveInModel(duplicate, items[0].address, document).status).toBe('ambiguous');
  const scoped = addressesOfModel(legacy, document).filter(item => ['dataset', 'join'].includes(item.kind));
  expect(scoped.map(item => formatAddress(item.address)).length).toBe(new Set(scoped.map(item => formatAddress(item.address))).size);
  for (const item of scoped) expect(resolveInModel(legacy, item.address, document).status).toBe('found');
  const invalid: Address = {
    ...scoped[0].address,
    chain: [
      { kind: 'ontology', name: 'One' },
      { kind: 'dataset', name: 'orders' },
    ],
  };
  expect(resolveInModel(legacy, invalid, document)).toEqual({ status: 'missing' });
  expect(resolveInModel(legacy, { ...scoped[0].address, project: 'elsewhere' }, document)).toEqual({ status: 'missing' });
});

test('declared identity survives renames without inventing identities for fields', () => {
  const original = ontology.ontology[0];
  expect(itemIdentity(original, ontology)).toEqual({ iri: 'https://example.org/Party' });
  expect(itemIdentity({ ...original, concept: 'Renamed' }, ontology)).toEqual(itemIdentity(original, ontology));
  expect(itemIdentity({ name: 'field' }, ontology)).toBeNull();
});

test('unusable root names use a volatile position rather than a coerced name', () => {
  for (const name of [undefined, '', 7, '\ud800']) {
    const items = addressesOfModel({ name, ontology: [{ concept: 'C' }] });
    expect(items[0].address.chain).toEqual([{ kind: 'ontology', position: 0 }]);
    expect(items.every(item => item.volatile)).toBe(true);
  }
});

test('deep properties report their source path instead of truncating a locator', () => {
  const deep = structuredClone(contract);
  let property: any = deep.schema[0].properties[0];
  for (let index = 0; index < 33; index++) {
    property.properties = [{ name: 'nested', properties: [] }];
    property = property.properties[0];
  }
  expect(() => addressesOfModel(deep, document)).toThrow(UnaddressableItemError);
});

const sampleFiles = readdirSync('public/examples', { recursive: true }).filter((path): path is string => typeof path === 'string' && /\.ya?ml$/.test(path));
const samples = sampleFiles.map(path => ({ path, model: parse(readFileSync(`public/examples/${path}`, 'utf8')) }));

for (const { path, model } of samples) {
  test(`structured sample ${path} resolves uniquely unless explicitly ambiguous`, () => {
    const items = addressesOfModel(model, { project: 'examples', document: path.split('/') });
    const unique = items.filter(item => !item.ambiguous);
    expect(new Set(unique.map(item => formatAddress(item.address))).size).toBe(unique.length);
    for (const item of unique) expect(resolveInModel(model, item.address, { project: 'examples', document: path.split('/') }).status).toBe('found');
  });
}

function reorder(value: any, random: () => number): any {
  if (Array.isArray(value))
    return shuffled(
      value.map(child => reorder(child, random)),
      random,
    );
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reorder(child, random)]));
}

test('named sample items keep their locators through a thousand sibling permutations', () => {
  withAddressSeed(random => {
    const projects = new Map<string, any>();
    for (const sample of samples) {
      const project = sample.path.split('/')[0];
      if (!projects.has(project) && addressesOfModel(sample.model).length) projects.set(project, sample.model);
    }
    for (const model of projects.values()) {
      const original = addressesOfModel(model)
        .filter(item => !item.volatile)
        .map(item => formatAddress(item.address))
        .sort();
      for (let index = 0; index < 1000; index++) {
        const reordered = reorder(model, random);
        const current = addressesOfModel(reordered)
          .filter(item => !item.volatile)
          .map(item => formatAddress(item.address))
          .sort();
        expect(current).toEqual(original);
      }
    }
  });
}, 180_000);

test('unnamed mappings stay volatile across generated sibling permutations', () => {
  withAddressSeed(random => {
    const model = { ...ontology, ontology_mappings: [ontology.ontology_mappings[0], { semantic_model: { name: 'Other', datasets: [] } }] };
    for (let index = 0; index < 1000; index++) {
      const permuted = reorder(model, random);
      const mapped = addressesOfModel(permuted).filter(item => item.path[0] === 'ontology_mappings');
      expect(mapped.every(item => item.volatile)).toBe(true);
      for (const item of mapped) expect(resolveInModel(permuted, item.address).status).toBe('found');
    }
  });
});

test('unnamed roots and array-item schemas resolve through generated sibling permutations', () => {
  withAddressSeed(random => {
    for (let index = 0; index < 1000; index++) {
      const model = {
        kind: 'DataContract',
        id: 'C',
        schema: [{ name: 'O', properties: shuffled([{ name: 'array', properties: [{ name: 'declared' }], items: { properties: [{ name: 'nested' }] } }, { name: 'other' }], random) }],
      };
      const items = addressesOfModel(model);
      const arrayItem = items.find(item => item.path.at(-1) === 'items')!;
      expect(arrayItem.address.chain.at(-1)).toEqual({ kind: 'property', position: 1 });
      expect(arrayItem.volatile).toBe(true);
      expect(items.find(item => item.path.includes('items') && item.path.at(-1) === 0)!.volatile).toBe(true);
      for (const item of items) {
        expect(resolveInModel(model, item.address).status).toBe('found');
        expect(addressAtModelPath(model, item.path)).toEqual(item.address);
      }
      const unnamed = { ontology: shuffled([{ concept: 'C' }, { concept: '' }], random) };
      for (const item of addressesOfModel(unnamed)) {
        expect(item.volatile).toBe(true);
        expect(resolveInModel(unnamed, item.address).status).toBe('found');
      }
    }
  });
});
