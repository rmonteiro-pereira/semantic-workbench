/** Generates reproducible hostile names and sibling permutations for address properties. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Replays randomized assertions with the seed included in any failure. */
export function withAddressSeed(assertions: (random: () => number) => void) {
  const configured = process.env.ADDRESS_TEST_SEED;
  const seed = configured === undefined ? Date.now() >>> 0 : Number(configured);
  if (!Number.isSafeInteger(seed)) throw new Error('ADDRESS_TEST_SEED must be an integer');
  try {
    assertions(seededRandom(seed));
  } catch (error) {
    throw new Error(`ADDRESS_TEST_SEED=${seed}`, { cause: error });
  }
}

/** Includes delimiters, Unicode and unreserved bytes without producing empty names. */
export function hostileName(random: () => number) {
  const alphabet = ['a', 'Z', '0', '-', '.', '_', '~', ':', '#', '/', '@', '%', ' ', 'é', '東京', '😀'];
  const length = 1 + Math.floor(random() * 12);
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

/** Shuffles a copy so fixtures remain unchanged across property iterations. */
export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
