// Tests how stored counts become the answer of the read operation: periods, readers, damaged days and
// migrations.
import { describe, expect, test } from 'bun:test';
import type { MigrationRecord } from '../../src/shared/core/address-migration';
import { addCount, emptyDayFile, type CounterDayFile } from '../../src/server/usage/usage-counts';
import { parseUsageQuery, readUsage, type UsageReadInput } from '../../src/server/usage/usage-read';
import type { DayRead } from '../../src/server/usage/usage-store';

const model = 'sw1:shop/sales.yaml#model:Sales';
const hiddenModel = 'sw1:shop/finance/pay.yaml#model:Pay';
const settings = { enabled: true, retentionDays: 30 };

function day(name: string, ...entries: [string, string, string, number][]): CounterDayFile {
  const file = emptyDayFile('shop', name);
  for (const [address, operation, origin, amount] of entries) addCount(file.counts, { address, measure: 'workbench-requests', operation, origin }, amount);
  return file;
}

function input(overrides: Partial<UsageReadInput> = {}, files: CounterDayFile[] = []): UsageReadInput {
  const dayReads = new Map<string, DayRead>(files.map(file => [file.day, { status: 'ok', file }]));
  return { settings, project: 'shop', days: 3, today: '2026-11-17', dayReads, pending: [], records: [], canRead: () => true, readsWholeProject: true, ...overrides };
}

describe('readUsage', () => {
  test('says only that counters are off, with no count, when they are off', () => {
    const answer = readUsage(input({ settings: { enabled: false, retentionDays: 30 } }, [day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 5])]));
    expect(answer).toEqual({ counters: { enabled: false }, measures: [] });
  });

  test('sums the days of the period with the breakdown, sorted by address, and states the label and period', () => {
    const files = [
      day('2026-11-15', [`${model}/metric:b`, 'agent.plan', 'http', 1]),
      day('2026-11-17', [`${model}/metric:b`, 'agent.context.read', 'mcp', 2], [`${model}/metric:a`, 'agent.plan', 'http', 4]),
    ];
    const [series] = readUsage(input({}, files)).measures;
    expect(series).toMatchObject({ measure: 'workbench-requests', label: 'requests through this workbench', from: '2026-11-15', to: '2026-11-17', total: 7, unavailableDays: [] });
    expect(series.items.map(item => item.address)).toEqual([`${model}/metric:a`, `${model}/metric:b`]);
    expect(series.items[1]).toEqual({ address: `${model}/metric:b`, total: 3, byOperation: { 'agent.context.read': 2, 'agent.plan': 1 }, byOrigin: { http: 1, mcp: 2 } });
  });

  test('a day outside the period is not counted', () => {
    const [series] = readUsage(input({ days: 1 }, [day('2026-11-16', [`${model}/metric:a`, 'agent.plan', 'http', 9])])).measures;
    expect(series.items).toEqual([]);
    expect(series.total).toBe(0);
  });

  test('adds the counts memory holds to those on disk', () => {
    const pending = [day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 2])];
    const [series] = readUsage(input({ pending }, [day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 3])])).measures;
    expect(series.total).toBe(5);
  });

  test('leaves out items of documents the reader may not read, in items and in totals', () => {
    const files = [day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 2], [`${hiddenModel}/metric:secret`, 'agent.plan', 'http', 50])];
    const [series] = readUsage(input({ canRead: path => path !== 'finance/pay.yaml', readsWholeProject: false }, files)).measures;
    expect(series.items.map(item => item.address)).toEqual([`${model}/metric:a`]);
    expect(series.total).toBe(2);
    expect(JSON.stringify(series)).not.toContain('secret');
  });

  test('never returns counts of another project', () => {
    const files = [day('2026-11-17', ['sw1:other/sales.yaml#model:Sales/metric:a', 'agent.plan', 'http', 2])];
    expect(readUsage(input({}, files)).measures[0].items).toEqual([]);
  });

  test('drops the unaddressed total unless the reader may read every file', () => {
    const file = { ...day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 1]), other: 7 };
    expect(readUsage(input({}, [file])).measures[0].otherTotal).toBe(7);
    expect(readUsage(input({ readsWholeProject: false }, [file])).measures[0].otherTotal).toBeUndefined();
  });

  test('names a damaged day as unavailable and still reads the others', () => {
    const dayReads = new Map<string, DayRead>([
      ['2026-11-16', { status: 'damaged' }],
      ['2026-11-17', { status: 'ok', file: day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 2]) }],
    ]);
    const [series] = readUsage(input({ dayReads })).measures;
    expect(series.unavailableDays).toEqual(['2026-11-16']);
    expect(series.total).toBe(2);
  });

  test('follows address migrations for each stored day', () => {
    const record: MigrationRecord = { id: 'm-1', kind: 'item', from: `${model}/metric:a`, to: `${model}/metric:b`, at: '2026-11-16T00:00:00Z', commit: 'c'.repeat(40) };
    const files = [day('2026-11-16', [`${model}/metric:a`, 'agent.plan', 'http', 2]), day('2026-11-17', [`${model}/metric:b`, 'agent.plan', 'http', 1])];
    const [series] = readUsage(input({ records: [record] }, files)).measures;
    expect(series.items).toEqual([{ address: `${model}/metric:b`, total: 3, byOperation: { 'agent.plan': 3 }, byOrigin: { http: 3 } }]);
  });

  test('marks every day unavailable and shows no counts when the migration history cannot be read', () => {
    const [series] = readUsage(input({ records: null }, [day('2026-11-17', [`${model}/metric:a`, 'agent.plan', 'http', 2])])).measures;
    expect(series.items).toEqual([]);
    expect(series.unavailableDays).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
  });
});

describe('parseUsageQuery', () => {
  test('defaults to the retention and accepts days from 1 to it', () => {
    expect(parseUsageQuery(new URLSearchParams(), 30)).toEqual({ days: 30 });
    expect(parseUsageQuery(new URLSearchParams('days=1'), 30)).toEqual({ days: 1 });
    expect(parseUsageQuery(new URLSearchParams('days=30'), 30)).toEqual({ days: 30 });
  });

  test('refuses other values and unknown parameters', () => {
    for (const query of ['days=0', 'days=31', 'days=x', 'days=1.5', 'days=', 'days=-1', 'verbose=1']) {
      expect(() => parseUsageQuery(new URLSearchParams(query), 30), query).toThrow();
    }
  });
});
