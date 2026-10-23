// Tests when the whole-model graph opens with one card per area and how its text sizes follow zoom.
import { test, expect } from 'bun:test';
import { readableCapacity, startsCollapsed, textSizesAt } from '../src/graph/overview-capacity';

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

test('names keep their size while readable and grow once zoomed out', () => {
  expect(textSizesAt(1).entityName).toBe(16);
  const zoomedOut = textSizesAt(0.5);
  expect(zoomedOut.entityName * 0.5).toBeGreaterThanOrEqual(12);
  expect(zoomedOut.showDetail).toBe(false);
  expect(textSizesAt(1).showDetail).toBe(true);
});
