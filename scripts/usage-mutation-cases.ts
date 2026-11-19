// Runs focused assertions against a candidate usage module, so a deliberately introduced fault in
// counting, storing, reading, moving or expiring counts makes one of them fail.
import assert from 'node:assert/strict';
import type { MigrationRecord } from '../src/shared/core/address-migration';
import { createUsageStore } from '../src/server/usage/usage-store';
import { dataLayout } from '../src/server/projects/paths';
import { addCount, emptyDayFile } from '../src/server/usage/usage-counts';
import { tempDataDir } from '../tests/helpers/temp-data-dir';
import { MAPPING_ID, PROJECT, commerceDocuments, contextAnswer, modelsOf } from '../tests/usage/commerce-answers';
import { SNAPSHOT_HEADER } from '../src/server/usage/usage-recorder';

const metric = `sw1:${PROJECT}/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:gross_revenue`;
const key = { measure: 'workbench-requests' as const, operation: 'agent.plan', origin: 'http' };

async function recorderCases(candidate: typeof import('../src/server/usage/usage-recorder')) {
  const directory = tempDataDir('usage-mutants-');
  try {
    const store = createUsageStore(dataLayout(directory.root));
    const documents = await commerceDocuments();
    const models = modelsOf(documents);
    const answer = contextAnswer(documents);
    const open = (enabled: boolean) =>
      candidate.createUsageRecorder({
        settings: { enabled, retentionDays: 30 },
        store,
        models: async () => models,
        migrationRecords: () => [],
        now: () => new Date('2026-11-17T10:00:00Z'),
        warn: () => {},
      });
    const request = (overrides: Record<string, unknown> = {}, init: ResponseInit = { headers: { [SNAPSHOT_HEADER]: 'a'.repeat(40) } }) => ({
      operationId: 'agent.context.read',
      origin: 'http',
      surface: 'agent' as const,
      outcome: 'ok' as const,
      target: {},
      response: Response.json(answer, init),
      ...overrides,
    });
    const countedBy = async (recorder: ReturnType<typeof open>, input: ReturnType<typeof request>) => {
      recorder.record(input);
      await recorder.settled();
      const days = recorder.pending(PROJECT);
      recorder.close();
      return days.reduce((sum, day) => sum + Object.keys(day.counts).length, 0);
    };
    assert.ok((await countedBy(open(true), request())) > 0, 'a successful published request is counted');
    assert.equal(await countedBy(open(true), request({ response: Response.json(answer, { status: 403, headers: { [SNAPSHOT_HEADER]: 'a'.repeat(40) } }) })), 0, 'a refused request adds nothing');
    assert.equal(await countedBy(open(true), request({ response: Response.json(answer, { status: 500, headers: { [SNAPSHOT_HEADER]: 'a'.repeat(40) } }) })), 0, 'a failed request adds nothing');
    assert.equal(await countedBy(open(true), request({ surface: 'browser' })), 0, 'a browser request adds nothing');
    assert.equal(await countedBy(open(true), request({}, {})), 0, 'an answer that is not from a published snapshot adds nothing');
    const off = open(false);
    assert.equal(off.enabled, false, 'counters off give the no-op recorder');
    assert.equal(await countedBy(off, request()), 0, 'nothing is counted while counters are off');
    const once = open(true);
    once.record(request());
    await once.settled();
    const counts = once.pending(PROJECT)[0].counts[metric]['workbench-requests']['agent.context.read'];
    once.close();
    assert.deepEqual(counts, { http: 1 }, 'an item is counted once per request');
  } finally {
    directory.cleanup();
  }
}

async function itemCases(candidate: typeof import('../src/server/usage/usage-items')) {
  const documents = await commerceDocuments();
  const found = candidate.itemAddresses('context-items', { answer: { ...contextAnswer(documents), mappingId: MAPPING_ID }, models: modelsOf(documents), target: {} });
  assert.equal(new Set(found).size, found.length, 'every item appears once');
  assert.deepEqual(found, [...found].sort(), 'items are in address order');
  assert.ok(found.includes(metric));
}

function flushCases(candidate: typeof import('../src/server/usage/usage-flush')) {
  const memory = emptyDayFile(PROJECT, '2026-11-17');
  addCount(memory.counts, { address: metric, ...key });
  const decision = candidate.decideFlush({ status: 'missing' }, memory, []);
  assert.equal(decision.action, 'write');
  if (decision.action !== 'write') return;
  assert.deepEqual(Object.keys(decision.file).sort(), ['counts', 'day', 'formatVersion', 'migratedThrough', 'project'], 'a written day holds only the documented fields');
}

function readCases(candidate: typeof import('../src/server/usage/usage-read')) {
  const hidden = `sw1:${PROJECT}/finance/pay.yaml#model:Pay/metric:secret`;
  const file = emptyDayFile(PROJECT, '2026-11-17');
  addCount(file.counts, { address: metric, ...key });
  addCount(file.counts, { address: hidden, ...key }, 40);
  const answer = candidate.readUsage({
    settings: { enabled: true, retentionDays: 30 },
    project: PROJECT,
    days: 1,
    today: '2026-11-17',
    dayReads: new Map([['2026-11-17', { status: 'ok' as const, file }]]),
    pending: [],
    records: [],
    resolves: () => true,
    canRead: path => path !== 'finance/pay.yaml',
    readsWholeProject: false,
  });
  assert.deepEqual(
    answer.measures[0].items.map(item => item.address),
    [metric],
    'an unreadable file leaves no item',
  );
  assert.equal(answer.measures[0].total, 1, 'an unreadable file leaves no count in the total');
}

function migrationCases(candidate: typeof import('../src/server/usage/usage-migration')) {
  const renamed = `sw1:${PROJECT}/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:revenue`;
  const record: MigrationRecord = { id: 'm-1', kind: 'item', from: metric, to: renamed, at: '2026-11-16T00:00:00Z', commit: 'c'.repeat(40) };
  const file = emptyDayFile(PROJECT, '2026-11-16');
  addCount(file.counts, { address: metric, ...key }, 3);
  const moved = candidate.rekey(file, [record]);
  assert.deepEqual(Object.keys(moved.counts), [renamed], 'a renamed item keeps its counts under the new address');
  assert.equal(moved.migratedThrough, 'm-1');
  const gone = candidate.rekey(file, [{ ...record, id: 'd-1', kind: 'deleted', to: undefined }]);
  assert.deepEqual(gone.counts, {}, 'a deleted item loses its counts');
}

function retentionCases(candidate: typeof import('../src/server/usage/usage-retention')) {
  assert.deepEqual(candidate.expiredDays(['2026-10-01', '2026-11-17'], '2026-11-17', 30), ['2026-10-01'], 'days past the retention expire');
  assert.deepEqual(candidate.expiredDays(['2026-10-19'], '2026-11-17', 30), [], 'the oldest kept day stays');
}

/** Runs the assertions that guard one usage module. */
export async function usageCase(category: string, candidate: unknown) {
  if (category === 'usage-recorder') await recorderCases(candidate as typeof import('../src/server/usage/usage-recorder'));
  if (category === 'usage-items') await itemCases(candidate as typeof import('../src/server/usage/usage-items'));
  if (category === 'usage-flush') flushCases(candidate as typeof import('../src/server/usage/usage-flush'));
  if (category === 'usage-read') readCases(candidate as typeof import('../src/server/usage/usage-read'));
  if (category === 'usage-migration') migrationCases(candidate as typeof import('../src/server/usage/usage-migration'));
  if (category === 'usage-retention') retentionCases(candidate as typeof import('../src/server/usage/usage-retention'));
}
