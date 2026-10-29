/** Verifies that explicit parser choices survive replacements until another document opens. */
import { expect, test } from 'bun:test';
import { resolveDocumentMode } from '../src/app/editor/documentMode';

test('Full parsing survives typing and external replacement in the same document', () => {
  const sameDocument = { previous: true, override: false, newDocument: false };
  expect(resolveDocumentMode({ ...sameDocument, length: 600_000 })).toBe(false);
  expect(resolveDocumentMode({ ...sameDocument, length: 700_000 })).toBe(false);
  expect(resolveDocumentMode({ length: 100, previous: false, override: true, newDocument: false })).toBe(true);
});

test('Another document resets the override using its own size', () => {
  expect(resolveDocumentMode({ length: 600_000, previous: false, override: false, newDocument: true })).toBe(true);
  expect(resolveDocumentMode({ length: 100, previous: true, override: true, newDocument: true })).toBe(false);
});
