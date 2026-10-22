// Verifies the durable audit format without writing to the workspace's data root.
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLog } from '../../server/auth/audit';
import { sha256 } from '../../server/projects/atomic';
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
test('months start new chains and retention preserves partly retained months and other files', () => {
  const dir = tempDataDir();
  try {
    let now = new Date('2026-09-30T23:59:59Z');
    const log = createAuditLog({ dir: dir.root, retentionDays: 30, now: () => now });
    log.append(input);
    now = new Date('2026-10-01T00:00:00Z');
    expect(log.append(input).prev).toBe('0'.repeat(64));
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
