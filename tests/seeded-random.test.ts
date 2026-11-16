/** Checks replay and fixture ownership of the address property generator. */
import { expect, test } from 'bun:test';
import { hostileName, seededRandom, shuffled, withAddressSeed } from './helpers/seeded-random';

test('the same seed reproduces names and sibling permutations', () => {
  const first = seededRandom(9721);
  const second = seededRandom(9721);
  const siblings = ['one', 'two', 'three'];
  for (let index = 0; index < 100; index++) {
    expect(hostileName(first)).toBe(hostileName(second));
    expect(shuffled(siblings, first)).toEqual(shuffled(siblings, second));
  }
  expect(siblings).toEqual(['one', 'two', 'three']);
});

test('randomized failures include a replay seed and preserve their cause', () => {
  expect(() =>
    withAddressSeed(() => {
      throw new Error('property failed');
    }),
  ).toThrow('ADDRESS_TEST_SEED=');
});
