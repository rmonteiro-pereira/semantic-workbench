// Tests the five intensity levels and the line width they give.
import { describe, expect, test } from 'bun:test';
import { INTENSITY_LEVELS, intensityLevel, trafficStrokeWidth } from '../src/app/usage/usage-intensity';

describe('intensityLevel', () => {
  test('zero requests have no mark', () => {
    expect(intensityLevel(0, 100)).toBe(0);
    expect(intensityLevel(5, 0)).toBe(0);
    expect(intensityLevel(Number.NaN, 100)).toBe(0);
  });

  test('the busiest item is at the top level and any request is at least level 1', () => {
    expect(intensityLevel(100, 100)).toBe(INTENSITY_LEVELS);
    expect(intensityLevel(1, 1_000_000)).toBe(1);
  });

  test('levels rise with the share of the largest count', () => {
    const levels = [10, 11, 25, 26, 50, 51, 75, 76, 100].map(count => intensityLevel(count, 100));
    expect(levels).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  test('is monotonic and uses every level', () => {
    const levels = Array.from({ length: 100 }, (_, index) => intensityLevel(index + 1, 100));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  test('a count above the largest is capped at the top level', () => {
    expect(intensityLevel(500, 100)).toBe(5);
  });
});

describe('trafficStrokeWidth', () => {
  test('grows with the level and leaves level 0 as it was', () => {
    expect(trafficStrokeWidth(1.5, 0)).toBe(1.5);
    expect(trafficStrokeWidth(1.5, 5)).toBeGreaterThan(trafficStrokeWidth(1.5, 1));
  });
});
