// Tests the day files: merge, damaged files, the size cap, atomic replacement and the stored fields.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, readdirSync, truncateSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataLayout } from '../../src/server/projects/paths';
import { createUsageStore, parseDayFile } from '../../src/server/usage/usage-store';
import { addCount, emptyDayFile, mergeIntoDay, type CounterDayFile } from '../../src/server/usage/usage-counts';
import { decideFlush } from '../../src/server/usage/usage-flush';
import { parseAddress } from '../../src/shared/core/item-address';
import { tempDataDir } from '../helpers/temp-data-dir';
import { contextRequest, openUsage } from './usage-fixture';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function store() {
  const directory = tempDataDir('usage-store-');
  cleanups.push(directory.cleanup);
  return createUsageStore(dataLayout(directory.root));
}

const key = (address: string, origin = 'http') => ({ address, measure: 'workbench-requests' as const, operation: 'agent.context.read', origin });
const address = (name: string) => `sw1:shop/sales.yaml#model:Sales/metric:${name}`;

function dayWith(...names: string[]): CounterDayFile {
  const file = emptyDayFile('shop', '2026-11-10');
  for (const name of names) addCount(file.counts, key(address(name)));
  return file;
}

describe('day files', () => {
  test('a written day reads back unchanged', () => {
    const usage = store();
    const file = dayWith('revenue', 'orders');
    usage.writeDay(file);
    expect(usage.readDay('shop', '2026-11-10')).toEqual({ status: 'ok', file });
    expect(usage.listDays('shop')).toEqual(['2026-11-10']);
    expect(usage.listProjects()).toEqual(['shop']);
  });

  test('long addresses overflow to the aggregate and the following flush still works', () => {
    const usage = store();
    const file = dayWith('revenue');
    const longName = '%C3%A9'.repeat(500);
    expect(parseAddress(address(longName)).ok).toBe(true);
    for (let index = 0; index < 23_000; index++) addCount(file.counts, key(address(index + longName)));
    usage.writeDay(file);

    const read = usage.readDay(file.project, file.day);
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') throw Error('Expected to read the written day.');
    expect(read.file.other).toBeGreaterThan(0);
    expect(Object.keys(read.file.counts).length + (read.file.other ?? 0)).toBe(23_001);

    const next = decideFlush(read, dayWith('revenue'), []);
    if (next.action !== 'write') throw Error('Expected to flush again.');
    usage.writeDay(next.file);
    const flushed = usage.readDay(file.project, file.day);
    expect(flushed.status === 'ok' && flushed.file.counts[address('revenue')]).toEqual({ 'workbench-requests': { 'agent.context.read': { http: 2 } } });
  });

  test('a missing day is reported as missing', () => {
    expect(store().readDay('shop', '2026-11-10')).toEqual({ status: 'missing' });
  });

  test('a damaged file is reported and left alone', () => {
    const usage = store();
    const path = usage.dayPath('shop', '2026-11-10');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{ not json');
    expect(usage.readDay('shop', '2026-11-10')).toEqual({ status: 'damaged' });
    expect(readFileSync(path, 'utf8')).toBe('{ not json');
  });

  test('a file for another project, another day, another version or with an extra field is damaged', () => {
    const file = dayWith('revenue');
    expect(parseDayFile(file, 'shop', '2026-11-10')).not.toBeNull();
    expect(parseDayFile(file, 'other', '2026-11-10')).toBeNull();
    expect(parseDayFile(file, 'shop', '2026-11-11')).toBeNull();
    expect(parseDayFile({ ...file, formatVersion: 2 }, 'shop', '2026-11-10')).toBeNull();
    expect(parseDayFile({ ...file, person: 'someone' }, 'shop', '2026-11-10')).toBeNull();
  });

  test('a count that is not a whole number of at least one, or an unknown origin or measure, is damaged', () => {
    const bad = (counts: unknown) => parseDayFile({ ...dayWith(), counts }, 'shop', '2026-11-10');
    expect(bad({ a: { 'workbench-requests': { 'agent.context.read': { http: 0 } } } })).toBeNull();
    expect(bad({ a: { 'workbench-requests': { 'agent.context.read': { http: 1.5 } } } })).toBeNull();
    expect(bad({ a: { 'workbench-requests': { 'agent.context.read': { carrier: 1 } } } })).toBeNull();
    expect(bad({ a: { 'queries-in-production': { 'agent.context.read': { http: 1 } } } })).toBeNull();
    expect(bad({ a: { 'workbench-requests': { 'agent.context.read': { http: 1 } } } })).not.toBeNull();
  });

  test('a stored day rejects unknown operations, too many addresses and oversized input', () => {
    const usage = store();
    const file = dayWith('revenue');
    const counts = { a: { 'workbench-requests': { unknown: { http: 1 } } } };
    expect(parseDayFile({ ...file, counts }, file.project, file.day)).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 50_001 }, (_, index) => [address(String(index)), Object.values(file.counts)[0]]));
    expect(parseDayFile({ ...file, counts: many }, file.project, file.day)).toBeNull();
    usage.writeDay(file);
    truncateSync(usage.dayPath(file.project, file.day), 65 * 1024 * 1024);
    expect(usage.readDay(file.project, file.day)).toEqual({ status: 'damaged' });
  });

  test('a write interrupted before the rename leaves the old file whole and the leftover is not a day', () => {
    const usage = store();
    usage.writeDay(dayWith('revenue'));
    const crash = () =>
      usage.writeDay(dayWith('revenue', 'orders'), {
        beforeRename: () => {
          throw new Error('power cut');
        },
      });
    expect(crash).toThrow('power cut');
    const read = usage.readDay('shop', '2026-11-10');
    expect(read.status === 'ok' && Object.keys(read.file.counts)).toEqual([address('revenue')]);
    expect(readdirSync(usage.projectFolder('shop')).filter(name => name.endsWith('.workbench-tmp'))).toHaveLength(1);
    expect(usage.listDays('shop')).toEqual(['2026-11-10']);
  });

  test('only the documented fields are written', () => {
    const usage = store();
    usage.writeDay({ ...dayWith('revenue'), other: 3 });
    const stored = JSON.parse(readFileSync(usage.dayPath('shop', '2026-11-10'), 'utf8'));
    expect(Object.keys(stored).sort()).toEqual(['counts', 'day', 'formatVersion', 'migratedThrough', 'other', 'project']);
  });

  test('a day preserved as unverified twice keeps both copies, and deleting the day removes them', () => {
    const usage = store();
    const first = { ...dayWith('revenue'), migratedThrough: 'unverified' };
    const second = { ...dayWith('orders'), migratedThrough: 'unverified-again' };
    usage.writeDay(first);
    usage.preserveUnverifiedDay('shop', '2026-11-10');
    usage.writeDay(second);
    usage.preserveUnverifiedDay('shop', '2026-11-10');

    const folder = usage.projectFolder('shop');
    expect(readdirSync(folder).sort()).toEqual(['2026-11-10.unverified.1.json', '2026-11-10.unverified.json']);
    expect(JSON.parse(readFileSync(`${folder}/2026-11-10.unverified.json`, 'utf8')).migratedThrough).toBe('unverified');
    expect(JSON.parse(readFileSync(`${folder}/2026-11-10.unverified.1.json`, 'utf8')).migratedThrough).toBe('unverified-again');
    expect(usage.hasUnverifiedDay('shop', '2026-11-10')).toBe(true);
    expect(usage.listDays('shop')).toEqual(['2026-11-10']);

    usage.deleteDay('shop', '2026-11-10');
    expect(readdirSync(folder)).toEqual([]);
    expect(usage.hasUnverifiedDay('shop', '2026-11-10')).toBe(false);
  });

  test('deleting a day removes only that file', () => {
    const usage = store();
    usage.writeDay(dayWith('revenue'));
    usage.writeDay({ ...dayWith('revenue'), day: '2026-11-11' });
    usage.deleteDay('shop', '2026-11-10');
    expect(usage.listDays('shop')).toEqual(['2026-11-11']);
  });
});

describe('mergeIntoDay', () => {
  test('sums counts of items that meet and keeps the rest', () => {
    const memory = dayWith('revenue', 'orders').counts;
    const merged = mergeIntoDay(dayWith('revenue'), memory);
    expect(Object.keys(merged.counts).sort()).toEqual([address('orders'), address('revenue')]);
    expect(merged.counts[address('revenue')]['workbench-requests']['agent.context.read'].http).toBe(2);
    expect(merged.other).toBeUndefined();
  });

  test('counts of items past the size cap go to the unaddressed total', () => {
    const merged = mergeIntoDay(dayWith('a', 'b'), dayWith('b', 'c', 'd').counts, 0, 2);
    expect(Object.keys(merged.counts).sort()).toEqual([address('a'), address('b')]);
    expect(merged.counts[address('b')]['workbench-requests']['agent.context.read'].http).toBe(2);
    expect(merged.other).toBe(2);
  });

  test('an increment past the largest stored value stays at it', () => {
    const file = emptyDayFile('shop', '2026-11-10');
    addCount(file.counts, key(address('a')), 2 ** 31 - 1);
    const merged = mergeIntoDay(file, dayWith('a').counts);
    expect(merged.counts[address('a')]['workbench-requests']['agent.context.read'].http).toBe(2 ** 31 - 1);
  });
});

describe('the loss window', () => {
  test('a stop without close after 29 seconds loses the unflushed counts and none that were flushed', async () => {
    const fixture = await openUsage({ flushIntervalMs: 3_600_000 });
    cleanups.push(fixture.dispose);
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    fixture.clock.advance(30_000);
    fixture.recorder.flush();
    fixture.clock.advance(29_000);
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    const metric = 'sw1:shop/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:gross_revenue';
    const afterCrash = fixture.store.readDay('shop', '2026-11-17');
    expect(afterCrash.status === 'ok' && afterCrash.file.counts[metric]['workbench-requests']['agent.context.read'].http).toBe(1);
    fixture.recorder.close();
    const afterClose = fixture.store.readDay('shop', '2026-11-17');
    expect(afterClose.status === 'ok' && afterClose.file.counts[metric]['workbench-requests']['agent.context.read'].http).toBe(2);
  });
});
