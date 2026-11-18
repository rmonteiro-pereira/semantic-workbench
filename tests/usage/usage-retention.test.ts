// Tests the pure decisions about which days of counts are kept.
import { describe, expect, test } from 'bun:test';
import { daysBefore, expiredDays, isDay, periodDays, utcDay } from '../../src/server/usage/usage-retention';

describe('utcDay', () => {
  test('uses the UTC calendar day whatever the local zone', () => {
    expect(utcDay(new Date('2026-11-17T23:59:59.999Z'))).toBe('2026-11-17');
    expect(utcDay(new Date('2026-11-18T00:00:00.000Z'))).toBe('2026-11-18');
    expect(utcDay(new Date('2026-11-17T23:30:00-03:00'))).toBe('2026-11-18');
  });
});

describe('isDay', () => {
  test('accepts real days only, including 29 February of a leap year', () => {
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2027-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('2026-1-1')).toBe(false);
    expect(isDay('notes')).toBe(false);
  });
});

describe('daysBefore and periodDays', () => {
  test('cross month, year and leap day boundaries', () => {
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(daysBefore('2028-03-01', 1)).toBe('2028-02-29');
    expect(daysBefore('2027-01-01', 1)).toBe('2026-12-31');
  });

  test('list a period oldest first and ending today', () => {
    expect(periodDays('2026-11-17', 3)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
  });
});

describe('expiredDays', () => {
  const files = ['2026-10-18', '2026-10-19', '2026-11-17'];

  test('keeps today and the retention minus one days before it', () => {
    expect(expiredDays(files, '2026-11-17', 30)).toEqual(['2026-10-18']);
    expect(expiredDays(files, '2026-11-17', 31)).toEqual([]);
  });

  test('a lower retention expires more days', () => {
    expect(expiredDays(files, '2026-11-17', 1)).toEqual(['2026-10-18', '2026-10-19']);
  });

  test('a change of day moves the boundary by one', () => {
    expect(expiredDays(['2026-10-19'], '2026-11-17', 30)).toEqual([]);
    expect(expiredDays(['2026-10-19'], '2026-11-18', 30)).toEqual(['2026-10-19']);
  });

  test('a clock set back keeps the days after today and ignores names that are not days', () => {
    expect(expiredDays(['2026-12-01', 'readme.txt'], '2026-11-17', 30)).toEqual([]);
  });

  test('counts a leap day as a day', () => {
    expect(expiredDays(['2028-02-28', '2028-02-29'], '2028-03-29', 30)).toEqual(['2028-02-28']);
  });
});
