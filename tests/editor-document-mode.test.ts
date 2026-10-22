/** Verifies that typing cannot switch a document's highlighting budget. */
import { expect, test } from 'bun:test';
import { chooseLargeDocumentMode } from '../src/editor/documentMode';

test('The initial mode uses the strict size threshold', () => {
  expect(chooseLargeDocumentMode(500_000)).toBe(false);
  expect(chooseLargeDocumentMode(500_001)).toBe(true);
});

test('Typing across the threshold preserves the initial mode in both directions', () => {
  const smallMode = chooseLargeDocumentMode(500_000);
  const largeMode = chooseLargeDocumentMode(500_001);
  expect(chooseLargeDocumentMode(500_001, smallMode)).toBe(false);
  expect(chooseLargeDocumentMode(499_999, largeMode)).toBe(true);
});

test('An external replacement chooses a fresh mode in both directions', () => {
  expect(chooseLargeDocumentMode(500_001, false, true)).toBe(true);
  expect(chooseLargeDocumentMode(500_000, true, true)).toBe(false);
});
