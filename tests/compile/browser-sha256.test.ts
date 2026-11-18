// Checks the browser digest gives the same answer as Node's for the empty input, block boundaries, long inputs and text.
import { expect, test } from 'bun:test';
import { createHash as nodeHash } from 'node:crypto';
import { createHash, hashBytes } from '../../src/app/compile/browser-sha256';

const nodeHex = (bytes: Uint8Array) => nodeHash('sha256').update(bytes).digest('hex');

test('it matches Node for every length around a block boundary', () => {
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 31 + 7) % 256);
    expect(hashBytes(bytes), `length ${length}`).toBe(nodeHex(bytes));
  }
});

test('it matches Node for a large input', () => {
  const bytes = Uint8Array.from({ length: 1_500_000 }, (_, index) => (index * 17) % 251);
  expect(hashBytes(bytes)).toBe(nodeHex(bytes));
});

test('the createHash shape the digest module uses gives the same hexadecimal for text and bytes', () => {
  expect(createHash('sha256').update('café ontology').digest('hex')).toBe(nodeHash('sha256').update('café ontology').digest('hex'));
  expect(
    createHash('sha256')
      .update(new Uint8Array([1, 2, 3]))
      .digest('hex'),
  ).toBe(nodeHex(new Uint8Array([1, 2, 3])));
});

test('anything but sha256 and hexadecimal is refused', () => {
  expect(() => createHash('md5')).toThrow('sha256 only');
  expect(() =>
    createHash('sha256')
      .update('x')
      .digest('base64' as never),
  ).toThrow('hexadecimal only');
});
