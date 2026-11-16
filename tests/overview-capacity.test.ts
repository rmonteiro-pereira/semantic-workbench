// Tests when the whole-model graph opens with one card per area and how its text sizes follow zoom.
import { test, expect } from 'bun:test';
import { measureGraphOpening } from '../src/app/graph/useFullGraphOpening';
import { startsCollapsed, textSizesAt, modelCardHeight, entityCountLabel, minimumGraphZoom } from '../src/app/graph/overview-capacity';

test('the same model opens expanded only when its measured fit names are readable', () => {
  expect(startsCollapsed(45, 8.9)).toBe(true);
  expect(startsCollapsed(45, 9)).toBe(false);
  expect(startsCollapsed(195, 9.5)).toBe(false);
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

test('Network retains its historical type scale and padding across zoom levels', () => {
  for (const zoom of [0.1, 0.28, 0.5, 0.75, 1, 1.5, 2]) {
    const sizes = textSizesAt(zoom, 'network');
    expect(sizes.entityName).toBe(16);
    expect(sizes.areaTitle).toBe(20);
    expect(sizes.entityLines).toBe(2);
    expect(sizes.entityPadding).toBe(9);
    expect(sizes.showDetail).toBe(zoom >= 1);
  }
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

test('entity counts and zoom floors preserve singular and fitted scale', () => {
  expect(entityCountLabel(1)).toBe('1 entity');
  expect(entityCountLabel(2)).toBe('2 entities');
  expect(minimumGraphZoom(0.4)).toBeCloseTo(0.1);
  expect(minimumGraphZoom(0.8)).toBeCloseTo(0.2);
});

test('opening measures the published fit rather than the earlier unscaled names', async () => {
  let nameHeight = 16;
  const afterPaint = async () => {
    await Promise.resolve();
    nameHeight = 8.9;
  };
  expect(await measureGraphOpening(45, () => nameHeight, afterPaint)).toEqual({ minimumName: 8.9, collapsed: true });
});

test('counted Network cards compensate names while titles keep their header scale', () => {
  const sizes = textSizesAt(0.5, 'network', true);
  expect(sizes.entityName).toBe(24);
  expect(sizes.areaTitle).toBe(20);
});
