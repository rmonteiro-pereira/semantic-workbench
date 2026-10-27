// Tests when the whole-model graph opens with one card per area and how its text sizes follow zoom.
import { test, expect } from 'bun:test';
import { startsCollapsed, textSizesAt, modelCardHeight } from '../src/graph/overview-capacity';

test('the 45-entity model opens with every entity visible, whatever the pane', () => {
  expect(startsCollapsed(45)).toBe(false);
  expect(startsCollapsed(250)).toBe(false);
});

test('a model of more than 250 entities opens as areas', () => {
  expect(startsCollapsed(251)).toBe(true);
});

test('collapsed cards fit count text and two lines of relationship guidance', () => {
  const countHeight = 16 * 1.2;
  const guidanceHeight = 12 * 1.3 * 2;
  expect(modelCardHeight(true)).toBeGreaterThanOrEqual(countHeight + guidanceHeight + 18 + 5 + 2);
  expect(modelCardHeight(false)).toBe(60);
});

test('names keep their size while readable and grow once zoomed out', () => {
  expect(textSizesAt(1).entityName).toBe(16);
  const zoomedOut = textSizesAt(0.5);
  expect(zoomedOut.entityName * 0.5).toBeGreaterThanOrEqual(12);
  expect(zoomedOut.showDetail).toBe(false);
  expect(textSizesAt(1).showDetail).toBe(true);
});

test('unscaled twelve-pixel details disappear before they become smaller on screen', () => {
  expect(textSizesAt(1).showDetail).toBe(true);
  expect(textSizesAt(0.99).showDetail).toBe(false);
  expect(textSizesAt(0.75).showDetail).toBe(false);
});

test('area-card names remain at twelve pixels at compact fitted scales', () => {
  for (const zoom of [0.28, 0.3, 0.35, 0.4, 0.5, 0.75]) {
    expect(textSizesAt(zoom).entityName * zoom).toBeGreaterThanOrEqual(12);
  }
});

test('compensated name lines and padding fit inside sixty-pixel cards', () => {
  for (const zoom of [0.28, 0.3, 0.35, 0.4, 0.5, 0.75, 1]) {
    const sizes = textSizesAt(zoom);
    const textHeight = sizes.entityName * 1.2 * sizes.entityLines;
    expect(textHeight + 2 * sizes.entityPadding + 2).toBeLessThanOrEqual(60);
  }
});
