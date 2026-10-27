// Tests when the whole-model graph opens with one card per area and how its text sizes follow zoom.
import { test, expect } from 'bun:test';
import {
  readableCapacity,
  startsCollapsed,
  textSizesAt,
  layoutNeedsAreaCards,
  modelCardHeight,
} from '../src/app/graph/overview-capacity';

const phone = { width: 370, height: 330 };
const laptop = { width: 950, height: 500 };
const wideMonitor = { width: 2000, height: 1100 };

test('a bigger pane holds more entity cards', () => {
  expect(readableCapacity(phone)).toBeLessThan(readableCapacity(laptop));
  expect(readableCapacity(laptop)).toBeLessThan(readableCapacity(wideMonitor));
});

test('the 45-entity model opens as areas on a phone and a laptop, and expanded on a wide monitor', () => {
  expect(startsCollapsed(45, phone)).toBe(true);
  expect(startsCollapsed(45, laptop)).toBe(true);
  expect(startsCollapsed(45, wideMonitor)).toBe(false);
});

test('a model of more than 250 entities always opens as areas', () => {
  expect(startsCollapsed(251, { width: 8000, height: 8000 })).toBe(true);
});

test('long layouts use counted areas even when a balanced arrangement would fit', () => {
  expect(layoutNeedsAreaCards({ width: 7000, height: 1000 }, wideMonitor)).toBe(true);
  expect(layoutNeedsAreaCards({ width: 1000, height: 7000 }, wideMonitor)).toBe(true);
  expect(layoutNeedsAreaCards({ width: 1500, height: 900 }, wideMonitor)).toBe(false);
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
