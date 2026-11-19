// Tests that a flush brings stored counts to the addresses their items have now.
import { afterEach, expect, test } from 'bun:test';
import type { MigrationRecord } from '../../src/shared/core/address-migration';
import { decideFlush } from '../../src/server/usage/usage-flush';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { contextRequest, openUsage } from './usage-fixture';

const model = 'sw1:shop/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model';
const renamed = `${model}/metric:revenue_gross`;

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

const rename: MigrationRecord = { id: 'm-1', kind: 'item', from: `${model}/metric:gross_revenue`, to: renamed, at: '2026-11-17T09:00:00.000Z', commit: 'c'.repeat(40) };

test('a rename after counting is applied by the next flush and the marker advances', async () => {
  const records: MigrationRecord[] = [];
  const fixture = await openUsage({ migrationRecords: () => records });
  disposers.push(fixture.dispose);
  fixture.recorder.record(contextRequest(fixture.documents));
  await fixture.recorder.settled();
  fixture.recorder.flush();
  records.push(rename);
  fixture.recorder.record(contextRequest(fixture.documents));
  await fixture.recorder.settled();
  fixture.recorder.flush();
  const read = fixture.store.readDay('shop', '2026-11-17');
  expect(read.status).toBe('ok');
  if (read.status !== 'ok') return;
  expect(read.file.migratedThrough).toBe('m-1');
  // The count taken before the rename moved; the one taken after it is under the name the answer used.
  expect(read.file.counts[renamed]['workbench-requests']['agent.context.read'].http).toBe(1);
  expect(read.file.counts[`${model}/metric:gross_revenue`]['workbench-requests']['agent.context.read'].http).toBe(1);
});

test('a first write is marked with the newest record so later flushes do not move its addresses again', () => {
  const memory = emptyDayFile('shop', '2026-11-17');
  addCount(memory.counts, { address: `${model}/metric:gross_revenue`, measure: 'workbench-requests', operation: 'agent.plan', origin: 'http' });
  const decision = decideFlush({ status: 'missing' }, memory, [rename]);
  expect(decision.action === 'write' && decision.file.migratedThrough).toBe('m-1');
});

test('a damaged day file or an unreadable history leaves the disk alone and keeps memory', async () => {
  const fixture = await openUsage({ migrationRecords: () => null });
  disposers.push(fixture.dispose);
  fixture.recorder.record(contextRequest(fixture.documents));
  await fixture.recorder.settled();
  fixture.recorder.flush();
  expect(fixture.store.readDay('shop', '2026-11-17')).toEqual({ status: 'missing' });
  expect(fixture.recorder.pending('shop')).toHaveLength(1);
  expect(fixture.warnings.map(entry => entry.event)).toEqual(['usage.flush-deferred']);
  expect(decideFlush({ status: 'damaged' }, emptyDayFile('shop', '2026-11-17'), [])).toEqual({ action: 'keep-memory', reason: 'damaged-file' });
});
