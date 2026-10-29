// The audit log is one hash chain across months, anchored at each month's end and checkable
// with the verify command.
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLog, parseMirror, readStoredMonths, verifyAuditChain, type AuditAnchor } from '../../src/server/auth/audit';
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

/** Writes records on the given days, then returns the mirrored lines and the folder. */
function writeDays(days: string[]) {
  const dir = tempDataDir();
  const mirrored: string[] = [];
  let now = new Date(days[0]);
  const log = createAuditLog({
    dir: dir.root,
    now: () => now,
    mirror: line => mirrored.push(line),
  });
  for (const day of days) {
    now = new Date(day);
    log.append(input);
  }
  return { dir, mirrored, anchors: anchorsOf(mirrored) };
}
const anchorsOf = (mirrored: string[]): AuditAnchor[] => mirrored.map(line => JSON.parse(line)).filter(record => record.type === 'audit-anchor');

test('the first record of a month names the last record of the month before', () => {
  const { dir } = writeDays(['2026-08-30T10:00:00Z', '2026-09-02T10:00:00Z', '2026-10-05Z']);
  try {
    const months = readStoredMonths(dir.root);
    expect(months.map(item => item.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    const first = (item: (typeof months)[number]) => JSON.parse(item.lines[0]);
    expect(first(months[0]).prev).toBe('0'.repeat(64));
    expect(first(months[1]).prev).toBe(sha256(months[0].lines.at(-1)!));
    expect(first(months[2]).prev).toBe(sha256(months[1].lines.at(-1)!));
  } finally {
    dir.cleanup();
  }
});

test('a month with no records is skipped and the chain still links', () => {
  const { dir } = writeDays(['2026-07-30Z', '2026-10-05Z']);
  try {
    const months = readStoredMonths(dir.root);
    expect(JSON.parse(months[1].lines[0]).prev).toBe(sha256(months[0].lines.at(-1)!));
    expect(verifyAuditChain(months).ok).toBe(true);
  } finally {
    dir.cleanup();
  }
});

test('the mirror receives the closed month and its last hash when the next month begins', () => {
  const { dir, mirrored, anchors } = writeDays(['2026-08-30Z', '2026-09-02Z', '2026-09-03Z']);
  try {
    const august = readStoredMonths(dir.root)[0];
    expect(anchors).toEqual([{ type: 'audit-anchor', month: '2026-08', tail: sha256(august.lines.at(-1)!) }]);
    // Every record is mirrored as well, so the mirror holds the whole chain.
    expect(mirrored.filter(line => line.includes('"type":"audit"'))).toHaveLength(3);
    // A restart in the same month does not announce the anchor again.
    const again: string[] = [];
    createAuditLog({
      dir: dir.root,
      now: () => new Date('2026-09-04Z'),
      mirror: line => again.push(line),
    }).append(input);
    expect(anchorsOf(again)).toEqual([]);
  } finally {
    dir.cleanup();
  }
});

test('verification accepts an untouched chain and finds the record that was changed', () => {
  const { dir, anchors } = writeDays(['2026-08-30Z', '2026-09-02Z', '2026-10-05Z', '2026-10-06Z']);
  try {
    const intact = verifyAuditChain(readStoredMonths(dir.root), anchors);
    expect(intact).toEqual({ ok: true, records: 4, months: 3 });
    const file = join(dir.root, '2026-09.jsonl');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"edit"', '"read"'));
    const broken = verifyAuditChain(readStoredMonths(dir.root));
    expect(broken).toMatchObject({ ok: false, month: '2026-10', line: 1, reason: 'broken-link' });
  } finally {
    dir.cleanup();
  }
});

test('verification finds a month file that was removed or a tail that was cut', () => {
  const { dir, anchors } = writeDays(['2026-08-30Z', '2026-09-02Z', '2026-10-05Z']);
  try {
    const months = readStoredMonths(dir.root);
    const withoutSeptember = months.filter(item => item.month !== '2026-09');
    expect(verifyAuditChain(withoutSeptember)).toMatchObject({
      ok: false,
      month: '2026-10',
      reason: 'broken-link',
    });
    // Removing the newest month leaves a chain that is internally sound; only the mirror knows.
    const withoutOctober = months.filter(item => item.month !== '2026-10');
    expect(verifyAuditChain(withoutOctober).ok).toBe(true);
    expect(verifyAuditChain([], anchors)).toMatchObject({
      ok: false,
      reason: 'anchor-month-missing',
    });
    const tail = (month: string) => anchors.find(anchor => anchor.month === month)!;
    expect(verifyAuditChain(months, [{ ...tail('2026-08'), tail: 'f'.repeat(64) }])).toMatchObject({
      ok: false,
      month: '2026-08',
      reason: 'anchor-mismatch',
    });
  } finally {
    dir.cleanup();
  }
});

test('an unreadable record is reported, and a pruned first month is not an error', () => {
  const { dir } = writeDays(['2026-08-30Z', '2026-09-02Z']);
  try {
    const months = readStoredMonths(dir.root);
    expect(verifyAuditChain(months.slice(1)).ok).toBe(true);
    const damaged = [{ month: '2026-08', lines: ['{not json'] }];
    expect(verifyAuditChain(damaged)).toMatchObject({ ok: false, reason: 'unreadable', line: 1 });
  } finally {
    dir.cleanup();
  }
});

test('the verify command reports an intact log and exits with 1 for a broken one', async () => {
  const { dir } = writeDays(['2026-08-30Z', '2026-09-02Z']);
  try {
    const run = () =>
      Bun.spawnSync([process.execPath, 'scripts/audit-verify.ts', dir.root], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const ok = run();
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.toString()).toContain('Audit log intact: 2 records in 2 months.');
    const file = join(dir.root, '2026-09.jsonl');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"prev":"', '"prev":"0'));
    const broken = run();
    expect(broken.exitCode).toBe(1);
    expect(broken.stderr.toString()).toContain('2026-09.jsonl line 1');
  } finally {
    dir.cleanup();
  }
});

const AT = { now: new Date('2026-10-20Z') };

test('the mirror must hold an anchor, and every mirrored record must still be stored', () => {
  const { dir, mirrored, anchors } = writeDays(['2026-08-30Z', '2026-09-02Z', '2026-10-05Z']);
  try {
    const months = readStoredMonths(dir.root);
    const records = mirrored.filter(line => line.includes('"type":"audit"'));
    expect(verifyAuditChain(months, anchors, { ...AT, mirrored: records }).ok).toBe(true);
    // The newest month has no anchor yet; the mirrored record still pins it.
    const cut = months.map(item => (item.month === '2026-10' ? { ...item, lines: [] } : item));
    expect(verifyAuditChain(cut, anchors, { ...AT, mirrored: records })).toMatchObject({
      ok: false,
      month: '2026-10',
      reason: 'mirror-line-missing',
    });
    const parsed = parseMirror(mirrored.join(''));
    expect(parsed.anchors).toEqual(anchors);
    expect(parsed.records).toEqual(records.map(line => line.trimEnd()));
  } finally {
    dir.cleanup();
  }
});

test('months that retention keeps must exist even when the oldest files are gone', () => {
  const { dir, anchors } = writeDays(['2026-08-30Z', '2026-09-02Z', '2026-10-05Z']);
  try {
    const months = readStoredMonths(dir.root);
    const withoutAugust = months.filter(item => item.month !== '2026-08');
    expect(verifyAuditChain(withoutAugust, anchors, AT)).toMatchObject({
      ok: false,
      month: '2026-08',
      reason: 'anchor-month-missing',
    });
    // Pruned by a short retention period, the same absence is expected.
    const short = { now: new Date('2026-10-20Z'), retentionDays: 40 };
    expect(verifyAuditChain(withoutAugust, anchors, short).ok).toBe(true);
  } finally {
    dir.cleanup();
  }
});

test('the verify command fails with --anchors when the mirrored log holds no anchor', () => {
  const { dir } = writeDays(['2026-08-30Z', '2026-09-02Z']);
  try {
    const empty = join(dir.root, 'empty.log');
    writeFileSync(empty, 'some other output\n');
    const run = Bun.spawnSync([process.execPath, 'scripts/audit-verify.ts', dir.root, '--anchors', empty], { stdout: 'pipe', stderr: 'pipe' });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain('holds no anchor');
  } finally {
    dir.cleanup();
  }
});

test('the verify command checks the mirrored records against the stored months', () => {
  const { dir, mirrored } = writeDays(['2026-08-30Z', '2026-09-02Z']);
  try {
    const log = join(dir.root, 'mirror.log');
    writeFileSync(log, mirrored.join(''));
    const run = () => Bun.spawnSync([process.execPath, 'scripts/audit-verify.ts', dir.root, '--anchors', log, '--retention-days', '100000'], { stdout: 'pipe', stderr: 'pipe' });
    expect(run().exitCode).toBe(0);
    const file = join(dir.root, '2026-09.jsonl');
    writeFileSync(file, '');
    const broken = run();
    expect(broken.exitCode).toBe(1);
    expect(broken.stderr.toString()).toMatch(/mirror saw this record|mirrored/);
  } finally {
    dir.cleanup();
  }
});
