/** Verifies that explicit parser choices survive replacements until another document opens. */
import { expect, test } from 'bun:test';
import { resolveDocumentMode, toggleDocumentMode } from '../src/editor/documentMode';

test('The mode toggle works in both directions', () => {
  expect(toggleDocumentMode(true)).toBe(false);
  expect(toggleDocumentMode(false)).toBe(true);
});

test('Full parsing survives typing and external replacement in the same document', () => {
  expect(resolveDocumentMode(600_000, true, false, false)).toBe(false);
  expect(resolveDocumentMode(700_000, true, false, false)).toBe(false);
  expect(resolveDocumentMode(100, false, true, false)).toBe(true);
});

test('Another document resets the override using its own size', () => {
  expect(resolveDocumentMode(600_000, false, false, true)).toBe(true);
  expect(resolveDocumentMode(100, true, true, true)).toBe(false);
});
