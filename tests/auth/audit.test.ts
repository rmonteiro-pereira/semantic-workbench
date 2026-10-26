// Verifies the durable audit format without writing to the workspace's data root.
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLog, reportAuditFailure } from '../../src/server/auth/audit';
import { sha256 } from '../../src/server/projects/atomic';
import { tempDataDir } from '../helpers/temp-data-dir';

const input = {
  requestId: 'request',
  principal: { id: 'local', kind: 'local' },
  action: 'edit',
  resource: { type: 'workspace' },
  decision: 'allow' as const,
  rules: [],
  outcome: 'ok' as const,
};
test('audit lines whitelist fields and chain across writer restarts', () => {
  const dir = tempDataDir();
  try {
    const lines: string[] = [];
    const options = { dir: dir.root, now: () => new Date('2026-10-21Z') };
    const log = createAuditLog({ ...options, mirror: line => lines.push(line) });
    log.append({
      ...input,
      token: 'secret',
      resource: { type: 'file', path: 'a', text: 'secret' },
    });
    createAuditLog(options).append(input);
    const raw = readFileSync(join(dir.root, '2026-10.jsonl'), 'utf8');
    const stored = raw.trimEnd().split('\n');
    expect(raw.startsWith(lines[0])).toBe(true);
    expect(raw).not.toContain('secret');
    const entries = log.entries('2026-10');
    expect(entries[0].prev).toBe('0'.repeat(64));
    expect(entries[1].prev).toBe(sha256(stored[0]));
    stored[0] = stored[0].replace('edit', 'read');
    writeFileSync(join(dir.root, '2026-10.jsonl'), stored.join('\n') + '\n');
    expect(log.entries('2026-10')[1].prev).not.toBe(sha256(stored[0]));
    expect(Object.keys(entries[0]).sort()).toEqual(
      [
        'type',
        'at',
        'requestId',
        'principal',
        'action',
        'resource',
        'decision',
        'rules',
        'outcome',
        'prev',
      ].sort(),
    );
  } finally {
    dir.cleanup();
  }
});
test('a new month continues the chain, and retention preserves partly retained months and other files', () => {
  const dir = tempDataDir();
  try {
    let now = new Date('2026-09-30T23:59:59Z');
    const log = createAuditLog({ dir: dir.root, retentionDays: 30, now: () => now });
    log.append(input);
    const septemberTail = readFileSync(join(dir.root, '2026-09.jsonl'), 'utf8').trimEnd();
    now = new Date('2026-10-01T00:00:00Z');
    expect(log.append(input).prev).toBe(sha256(septemberTail));
    writeFileSync(join(dir.root, 'notes.txt'), 'keep');
    writeFileSync(join(dir.root, '2025-01.jsonl'), '');
    expect(log.prune()).toEqual(['2025-01.jsonl']);
    expect(existsSync(join(dir.root, 'notes.txt'))).toBe(true);
    expect(log.entries('2026-09')).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
});

test('a thousand appends scale linearly and a new writer continues their chain', () => {
  const dir = tempDataDir();
  try {
    const options = { dir: dir.root, now: () => new Date('2026-10-21Z') };
    const log = createAuditLog(options);
    const start = performance.now();
    for (let index = 0; index < 1000; index++) log.append(input);
    expect(performance.now() - start).toBeLessThan(10000);
    createAuditLog(options).append(input);
    const lines = readFileSync(join(dir.root, '2026-10.jsonl'), 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(1001);
    for (let index = 1; index < lines.length; index++) {
      expect(JSON.parse(lines[index]).prev).toBe(sha256(lines[index - 1]));
    }
  } finally {
    dir.cleanup();
  }
});

test('recent reads months newest first and stops once it has enough matching records', () => {
  const dir = tempDataDir();
  try {
    let now = new Date('2026-08-10Z');
    const log = createAuditLog({ dir: dir.root, now: () => now });
    log.append({ ...input, requestId: 'august' });
    now = new Date('2026-09-10Z');
    log.append({ ...input, requestId: 'september-read', action: 'read' });
    log.append({ ...input, requestId: 'september' });
    now = new Date('2026-10-10Z');
    log.append({ ...input, requestId: 'october' });
    // An unreadable older month proves that it is never opened.
    writeFileSync(join(dir.root, '2026-07.jsonl'), 'not json\n');
    const ids = (entries: { requestId: string }[]) => entries.map(entry => entry.requestId);
    expect(ids(log.recent(2))).toEqual(['september', 'october']);
    const edits = log.recent(3, entry => entry.action === 'edit');
    expect(ids(edits)).toEqual(['august', 'september', 'october']);
    expect(() => log.recent(10)).toThrow();
  } finally {
    dir.cleanup();
  }
});

test('between reads only the months from the first through the last time', () => {
  const dir = tempDataDir();
  try {
    let now = new Date('2026-08-10Z');
    const log = createAuditLog({ dir: dir.root, now: () => now });
    log.append({ ...input, requestId: 'august' });
    now = new Date('2026-10-10Z');
    log.append({ ...input, requestId: 'october' });
    writeFileSync(join(dir.root, '2026-06.jsonl'), 'not json\n');
    const ids = (entries: { requestId: string }[]) => entries.map(entry => entry.requestId);
    expect(ids(log.between('2026-08-01T00:00:00Z', '2026-09-30T00:00:00Z'))).toEqual(['august']);
    expect(ids(log.between('2026-07-01T00:00:00Z'))).toEqual(['august', 'october']);
  } finally {
    dir.cleanup();
  }
});

test('a failed audit write after an operation is one JSON line with request and version', () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    reportAuditFailure({
      requestId: 'request',
      action: 'adminChange',
      version: 'abc',
      error: new Error('disk full'),
    });
  } finally {
    console.error = original;
  }
  expect(JSON.parse(lines[0])).toMatchObject({
    type: 'audit-failure',
    requestId: 'request',
    action: 'adminChange',
    version: 'abc',
    reason: 'disk full',
  });
});
