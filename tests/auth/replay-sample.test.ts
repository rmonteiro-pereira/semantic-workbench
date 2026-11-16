// Read replay evidence cannot displace the ordinary audit stratum.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { replaySample, sampleReplayEntries } from '../../src/server/auth/replay-sample';
import { tempDataDir } from '../helpers/temp-data-dir';

import { replayEntry } from './replay-fixture';

test('ordinary snapshots and distinct transport reads have independent bounds', () => {
  const ordinary = Array.from({ length: 1100 }, (_, index) => replayEntry(index));
  const reads = Array.from({ length: 600 }, (_, index) => replayEntry(index, 'mcp'));
  const sample = sampleReplayEntries([...ordinary, ...reads, reads[599]]);
  expect(sample.filter(entry => !entry.origin)).toHaveLength(1000);
  expect(sample.filter(entry => entry.origin)).toHaveLength(500);
  expect(sample.filter(entry => entry.origin && entry.requestId === '599')).toHaveLength(1);
  expect(sample[0].requestId).toBe('100');
});

test('a complete pair of strata stops before opening corrupt older months', () => {
  const dir = tempDataDir();
  try {
    const audit = createAuditLog({ dir: dir.root, now: () => new Date('2026-10-01Z') });
    writeFileSync(join(dir.root, '2026-09.jsonl'), 'invalid json\n');
    const entries = [...Array.from({ length: 1000 }, (_, index) => replayEntry(index)), ...Array.from({ length: 500 }, (_, index) => replayEntry(index, 'mcp'))];
    writeFileSync(join(dir.root, '2026-10.jsonl'), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    expect(replaySample(audit)).toHaveLength(1500);
  } finally {
    dir.cleanup();
  }
});
