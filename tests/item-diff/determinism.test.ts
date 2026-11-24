// Reorders comparison inputs with a seeded shuffle to expose accidental iteration ordering.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { compareItems } from '../../src/shared/item-diff/compare-items';
import { itemsOfModel } from '../../src/shared/item-diff/model-items';
import { changedOntology } from '../helpers/item-diff-repository';

function shuffled<Value>(values: readonly Value[], seed: number): Value[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

test('shuffled documents and items give byte-identical changes across a hundred comparisons', async () => {
  const source = await Bun.file('tests/fixtures/item-diff/finance.ontology.yaml').text();
  const paths = ['z.yaml', 'a.yaml', 'middle.yaml'];
  const before = paths.flatMap(path => itemsOfModel(parse(source), 'finance', path));
  const after = paths.flatMap(path => itemsOfModel(parse(changedOntology('added').replace('A buyer.', 'Changed description.')), 'finance', path));
  const expected = JSON.stringify(compareItems(before, after));
  for (let index = 0; index < 100; index++) {
    expect(JSON.stringify(compareItems(shuffled(before, index + 1), shuffled(after, index + 101)))).toBe(expected);
  }
});
