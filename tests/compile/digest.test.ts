// Checks the shared digest gives the same answer as Node's for the empty input, block boundaries, long inputs and text.
import { expect, test } from 'bun:test';
import { createHash as nodeHash } from 'node:crypto';
import { sha256Hex } from '../../src/shared/tessera/digest';

const nodeHex = (bytes: Uint8Array) => nodeHash('sha256').update(bytes).digest('hex');

test('it matches Node for every length around a block boundary', () => {
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 31 + 7) % 256);
    expect(sha256Hex(bytes), `length ${length}`).toBe(nodeHex(bytes));
  }
});

test('it matches Node for a large input', () => {
  const bytes = Uint8Array.from({ length: 1_500_000 }, (_, index) => (index * 17) % 251);
  expect(sha256Hex(bytes)).toBe(nodeHex(bytes));
});

test('text is encoded as UTF-8 and bytes retain their exact value', () => {
  expect(sha256Hex('café ontology')).toBe(nodeHash('sha256').update('café ontology').digest('hex'));
  expect(sha256Hex(new Uint8Array([1, 2, 3]))).toBe(nodeHex(new Uint8Array([1, 2, 3])));
});
