// Checks that a dataset-scoped metric of an Ossie 0.3 draft model has a durable address that formats, parses and resolves back to it.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { formatAddress, parseAddress } from '../src/shared/core/item-address';
import { addressAtModelPath, addressesOfModel, resolveInModel } from '../src/shared/core/model-addresses';

const document = { project: 'sales', document: ['sales.semantic.yaml'] };
const model = parse(readFileSync(join(import.meta.dir, 'fixtures/ossie-0.3/sales.semantic.yaml'), 'utf8'));

test('a dataset metric address formats, parses and resolves to that metric', () => {
  const address = addressAtModelPath(model, ['datasets', 0, 'metrics', 0]);
  expect(address.chain.map(segment => segment.kind)).toEqual(['model', 'dataset', 'metric']);
  const text = formatAddress(address);
  const parsed = parseAddress(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(formatAddress(parsed.address)).toBe(text);
  const resolved = resolveInModel(model, parsed.address, document);
  expect(resolved.status).toBe('found');
  if (resolved.status === 'found') expect(resolved.item.path).toEqual(['datasets', 0, 'metrics', 0]);
});

test('a model metric and a dataset metric with the same name get distinct addresses that each resolve to their own item', () => {
  const twin = structuredClone(model);
  twin.metrics[0].name = 'total_revenue';
  const items = addressesOfModel(twin, document).filter(item => item.address.chain.at(-1)?.kind === 'metric');
  const named = items.filter(item => item.path.at(-2) === 'metrics' && (item.path.join('/') === 'metrics/0' || item.path.join('/') === 'datasets/0/metrics/0'));
  expect(named).toHaveLength(2);
  const texts = named.map(item => formatAddress(item.address));
  expect(new Set(texts).size).toBe(2);
  for (const item of named) {
    const resolved = resolveInModel(twin, item.address, document);
    expect(resolved.status === 'found' && resolved.item.path).toEqual(item.path);
  }
});
