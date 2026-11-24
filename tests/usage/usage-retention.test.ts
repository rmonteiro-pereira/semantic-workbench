// Tests the pure decisions about which days of counts are kept.
import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dataLayout } from '../../src/server/projects/paths';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { createUsageRecorder } from '../../src/server/usage/usage-recorder';
import { daysBefore, expiredDays, isDay, periodDays, utcDay } from '../../src/server/usage/usage-retention';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { tempDataDir } from '../helpers/temp-data-dir';
import { openUsage } from './usage-fixture';

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

describe('compaction', () => {
  const key = { measure: 'workbench-requests' as const, operation: 'agent.plan', origin: 'http' };
  const address = 'sw1:shop/sales.yaml#model:Sales/metric:revenue';

  function writeDay(usage: Awaited<ReturnType<typeof openUsage>>, day: string) {
    const file = emptyDayFile('shop', day);
    addCount(file.counts, { address, ...key });
    usage.store.writeDay(file);
  }

  test('start-up removes days past the retention and keeps the others', async () => {
    const directory = tempDataDir('usage-retention-');
    const store = createUsageStore(dataLayout(directory.root));
    for (const day of ['2026-10-18', '2026-10-19', '2026-11-17']) store.writeDay({ ...emptyDayFile('shop', day), counts: { [address]: { 'workbench-requests': { 'agent.plan': { http: 1 } } } } });
    const recorder = createUsageRecorder({ settings: { enabled: true, retentionDays: 30 }, store, models: async () => null, migrationRecords: () => [], now: () => new Date('2026-11-17T08:00:00Z') });
    expect(store.listDays('shop')).toEqual(['2026-10-19', '2026-11-17']);
    recorder.close();
    const lower = createUsageRecorder({ settings: { enabled: true, retentionDays: 2 }, store, models: async () => null, migrationRecords: () => [], now: () => new Date('2026-11-17T08:00:00Z') });
    expect(store.listDays('shop')).toEqual(['2026-11-17']);
    lower.close();
    directory.cleanup();
  });

  test('a running server expires old days once the day changes, and no file older than the retention remains', async () => {
    const usage = await openUsage({ settings: { enabled: true, retentionDays: 3 } });
    writeDay(usage, '2026-11-15');
    writeDay(usage, '2026-11-16');
    usage.clock.set('2026-11-18T10:00:00.000Z');
    usage.recorder.flush();
    expect(usage.store.listDays('shop')).toEqual(['2026-11-16']);
    usage.clock.set('2026-11-25T10:00:00.000Z');
    usage.recorder.flush();
    expect(usage.store.listDays('shop')).toEqual([]);
    usage.dispose();
  });

  test('compaction rewrites a retained day to current addresses and leaves a damaged one alone', async () => {
    const renamed = 'sw1:shop/sales.yaml#model:Sales/metric:turnover';
    const record = { id: 'm-1', kind: 'item' as const, from: address, to: renamed, at: '2026-11-16T00:00:00.000Z', commit: 'c'.repeat(40) };
    const usage = await openUsage({ migrationRecords: () => [record] });
    writeDay(usage, '2026-11-16');
    const damaged = usage.store.dayPath('shop', '2026-11-15');
    writeFileSync(damaged, '{ nope');
    usage.clock.set('2026-11-18T10:00:00.000Z');
    usage.recorder.flush();
    const read = usage.store.readDay('shop', '2026-11-16');
    expect(read.status === 'ok' && Object.keys(read.file.counts)).toEqual([renamed]);
    expect(readFileSync(damaged, 'utf8')).toBe('{ nope');
    usage.dispose();
  });
});
