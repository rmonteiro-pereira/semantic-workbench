// Exercises every structured shipped example after serialization-only edits.
import { expect, test } from 'bun:test';
import { Glob } from 'bun';
import { basename } from 'node:path';
import { parse, stringify } from 'yaml';
import { addressesOfModel } from '../../src/shared/core/model-addresses';
import { inspect } from '../../src/shared/core/model';
import { itemsOfModel } from '../../src/shared/item-diff/model-items';
import { compareItems } from '../../src/shared/item-diff/compare-items';

function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reorder(child)]),
    );
  return value;
}

test('all structured examples produce no changes for comments, key order, whitespace and CRLF', async () => {
  let documents = 0;
  for await (const path of new Glob('**/*.{yaml,yml,json}').scan('public/examples')) {
    const source = await Bun.file(`public/examples/${path}`).text();
    if (!addressesOfModel(parse(source)).length) continue;
    const model = await inspect(source, basename(path));
    if (!('document' in model) || !model.document) continue;
    const before = itemsOfModel(model.document, 'examples', path);
    const changed = '# Serialization only\r\n' + stringify(reorder(parse(source)), { indent: 4, lineWidth: 0 }).replaceAll('\n', '\r\n');
    // YAML and JSON serialize the same parsed model; inspect uses YAML for the transformed source.
    const after = await inspect(changed, basename(path).replace(/\.json$/, '.yaml'));
    if (!('document' in after)) throw new Error(`Structured example lost its model: ${path}`);
    expect(compareItems(before, itemsOfModel(after.document, 'examples', path)), path).toEqual([]);
    documents++;
  }
  expect(documents).toBeGreaterThan(0);
}, 60_000);
