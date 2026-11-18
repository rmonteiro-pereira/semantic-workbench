// Durable read floods cannot erase evidence of earlier writes and refusals.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { replaySample, sampleReplayEntries } from '../../src/server/auth/replay-sample';
import { compareAccess } from '../../src/server/auth/dry-run';
import { accessFixture } from './access-fixture';
import { replayEntry } from './replay-fixture';
import { tempDataDir } from '../helpers/temp-data-dir';

test('fifty thousand reads preserve all ordinary evidence, deduplicate reads and exclude protocol records', () => {
  const dir = tempDataDir();
  try {
    const audit = createAuditLog({ dir: join(dir.root, 'transport'), now: () => new Date('2026-10-01Z') });
    const ordinary = Array.from({ length: 300 }, (_, index) => ({
      ...replayEntry(index),
      requestId: 'ordinary-' + index,
      action: index % 2 ? 'edit' : 'read',
      decision: index % 2 ? ('allow' as const) : ('deny' as const),
    }));
    for (const entry of ordinary) audit.append(entry);
    for (let index = 0; index < 50000; index++) audit.append({ ...replayEntry(index % 800, 'mcp'), requestId: 'read-' + index });
    audit.append({ ...replayEntry(0, 'mcp'), requestId: 'protocol', action: 'protocol' });
    const sampled = replaySample(audit);
    expect(sampled.filter(entry => !entry.origin).map(entry => entry.requestId)).toEqual(ordinary.map(entry => entry.requestId));
    const reads = sampled.filter(entry => entry.origin);
    expect(reads).toHaveLength(500);
    expect(new Set(reads.map(entry => JSON.stringify(entry.snapshot))).size).toBe(reads.length);
    expect(sampled.some(entry => entry.action === 'protocol')).toBe(false);
    expect(sampleReplayEntries([...reads, ...ordinary]).filter(entry => !entry.origin)).toHaveLength(300);
  } finally {
    dir.cleanup();
  }
}, 60000);

test('fifty thousand agent panel reads keep every one of its writes in the sample', () => {
  const dir = tempDataDir();
  try {
    const audit = createAuditLog({ dir: join(dir.root, 'panel'), now: () => new Date('2026-10-01Z') });
    for (let index = 0; index < 300; index++) audit.append({ ...replayEntry(index, 'acp'), requestId: 'write-' + index, action: 'edit' });
    for (let index = 0; index < 50000; index++) audit.append({ ...replayEntry(index % 800, 'acp'), requestId: 'read-' + index });
    const sampled = replaySample(audit);
    expect(sampled.filter(entry => entry.action === 'edit')).toHaveLength(300);
    expect(sampled.filter(entry => entry.action === 'read')).toHaveLength(500);
  } finally {
    dir.cleanup();
  }
}, 60000);

test('stratified dry-run timings are compared against the same-size HTTP history', () => {
  const dir = tempDataDir();
  try {
    const ordinary = createAuditLog({ dir: join(dir.root, 'ordinary'), now: () => new Date('2026-10-01Z') });
    const transport = createAuditLog({ dir: join(dir.root, 'transport'), now: () => new Date('2026-10-01Z') });
    for (let index = 0; index < 50300; index++) {
      ordinary.append(replayEntry(index));
      transport.append(replayEntry(index, index < 300 ? undefined : 'mcp'));
    }
    const options = accessFixture();
    function measure(audit: typeof ordinary) {
      const started = performance.now();
      const result = compareAccess(options, options.config, { users: [], audit: replaySample(audit) });
      return { milliseconds: performance.now() - started, auditCases: result.auditCases };
    }
    const baseline = measure(ordinary);
    const withReads = measure(transport);
    console.log('Dry-run comparison ' + JSON.stringify({ records: 50300, baseline, withReads, ratio: withReads.milliseconds / baseline.milliseconds }));
    expect(baseline.auditCases).toBe(1000);
    expect(withReads.auditCases).toBe(800);
  } finally {
    dir.cleanup();
  }
}, 120000);
