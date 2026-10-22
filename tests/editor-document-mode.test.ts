/** Verifies the highlighting budget across document opens, replacements and overrides. */
import { expect, test } from 'bun:test';
import {
  initialDocumentMode,
  largeDocumentThreshold,
  resolveDocumentMode,
} from '../src/editor/documentMode';

test('Opening a document uses the strict size threshold', () => {
  expect(initialDocumentMode(largeDocumentThreshold)).toBe(false);
  expect(initialDocumentMode(largeDocumentThreshold + 1)).toBe(true);
});

test('Typing and same-document replacements preserve the opening mode in both directions', () => {
  for (const openingLength of [largeDocumentThreshold, largeDocumentThreshold + 1]) {
    let previous = initialDocumentMode(openingLength);
    for (const length of [largeDocumentThreshold + 1, largeDocumentThreshold - 1]) {
      previous = resolveDocumentMode({
        length,
        previous,
        override: undefined,
        newDocument: false,
      });
      expect(previous).toBe(initialDocumentMode(openingLength));
    }
  }
});

test('The user can switch both ways and replacements preserve the override', () => {
  let previous = initialDocumentMode(largeDocumentThreshold + 1);
  for (const override of [false, true]) {
    for (const length of [largeDocumentThreshold - 1, largeDocumentThreshold + 1]) {
      previous = resolveDocumentMode({ length, previous, override, newDocument: false });
      expect(previous).toBe(override);
    }
  }
});

test('A different document resets the mode regardless of the old mode or override', () => {
  for (const previous of [false, true]) {
    for (const override of [undefined, false, true]) {
      for (const length of [largeDocumentThreshold, largeDocumentThreshold + 1]) {
        expect(resolveDocumentMode({ length, previous, override, newDocument: true })).toBe(
          initialDocumentMode(length),
        );
      }
    }
  }
});
