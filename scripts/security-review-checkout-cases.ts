// Assertions for the mutants of the scanner's case check, the start-up restore of the published
// checkout, and the audit mirror checks.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candidate } from './security-review-scm-cases';

async function scannerCase(candidate: Candidate) {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const { createCache } = await import('../src/server/projects/cache');
  const { dataLayout } = await import('../src/server/projects/paths');
  const data = tempDataDir();
  try {
    const layout = dataLayout(data.root);
    const cache = createCache(layout.cache);
    const dir = join(layout.projects, 'p');
    for (const folder of ['secret', 'SECRET']) {
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, 'plan.yaml'), 'name: T\nontology: [{concept: A}]');
    }
    let listed = 0;
    const lister = (folder: string) => {
      listed++;
      return readdirSync(folder).filter(name => name !== 'SECRET');
    };
    const git = {
      lsFiles: async () => ['secret/plan.yaml', 'SECRET/plan.yaml'],
      status: async () => {
        throw Error('no status');
      },
    };
    const scanner = candidate.createScanner(layout, cache, git, () => true, lister);
    assert.deepEqual((await scanner.scan('p')).changed, ['secret/plan.yaml']);
    assert.equal(cache.file('p', 'SECRET/plan.yaml'), null);
    assert.equal(listed, 2);
    cache.close();
  } finally {
    data.cleanup();
  }
}

async function publishedCase(candidate: Candidate) {
  const calls: string[][] = [];
  const logged: string[] = [];
  const entry = (path: string, index: string, worktree: string, untracked = false) => ({
    path,
    index,
    worktree,
    conflicted: false,
    untracked,
  });
  const checkout = (entries: object[]) => ({
    status: async () => ({ entries }),
    run: async (_dir: string, args: string[]) => void calls.push(args),
  });
  const restore = (entries: object[], trashed: string[]) =>
    candidate.restoreTrashedDeletions({
      git: checkout(entries),
      dir: '/d',
      repo: 'repo',
      trashed: new Set(trashed),
      log: (line: string) => logged.push(line),
    });
  const restored = await restore([entry('a.yaml', '.', 'D'), entry('b.yaml', 'D', '.')], ['a.yaml', 'b.yaml']);
  assert.deepEqual(restored, ['a.yaml', 'b.yaml']);
  assert.deepEqual(calls, [['restore', '--staged', '--worktree', '--', 'a.yaml', 'b.yaml']]);
  assert.deepEqual(JSON.parse(logged[0]), {
    type: 'published-checkout-restored',
    repo: 'repo',
    paths: ['a.yaml', 'b.yaml'],
  });
  assert.deepEqual(await restore([], ['a.yaml']), []);
  const refused = async (entries: object[], paths: string[]) =>
    assert.rejects(
      () => restore(entries, ['a.yaml', 'm.yaml']),
      (error: any) => error.name === 'PublishedCheckoutChangedError' && JSON.stringify(error.paths) === JSON.stringify(paths),
    );
  await refused([entry('c.yaml', '.', 'D')], ['c.yaml']);
  await refused([entry('m.yaml', '.', 'M')], ['m.yaml']);
  await refused([entry('m.yaml', 'M', 'D')], ['m.yaml']);
  await refused([entry('a.yaml', '.', 'D'), entry('x.txt', '?', '?', true)], ['x.txt']);
  assert.equal(calls.length, 1);
}

async function auditMirrorCase(candidate: Candidate) {
  const { sha256 } = await import('../src/server/projects/atomic');
  const line = (month: string, prev: string) => JSON.stringify({ type: 'audit', at: `${month}-05T00:00:00.000Z`, prev });
  const first = line('2026-09', '0'.repeat(64));
  const second = line('2026-10', sha256(first));
  const stored = [
    { month: '2026-09', lines: [first] },
    { month: '2026-10', lines: [second] },
  ];
  const now = new Date('2026-10-20Z');
  assert.equal(candidate.oldestRetainedMonth(40, now), '2026-09');
  assert.equal(candidate.oldestRetainedMonth(400, now), '2025-09');
  const check = (mirrored: string[]) => candidate.verifyAuditChain(stored, [], { mirrored, now });
  assert.equal(check([first + '\n', second + '\n']).ok, true);
  const lost = line('2026-10', 'f'.repeat(64));
  assert.deepEqual({ ...check([first, lost]), ok: undefined }, {
    ok: undefined,
    month: '2026-10',
    line: 2,
    reason: 'mirror-line-missing',
  } as object);
  // A mirrored record older than retention keeps is no longer stored, and need not be.
  const ancient = line('2024-01', '0'.repeat(64));
  assert.equal(check([ancient, first]).ok, true);
  const parsed = candidate.parseMirror(['garbage "type":"audit" here', first, '{"type":"audit-anchor","month":"2026-09","tail":"x"}', 'x "audit-anchor" y'].join('\n'));
  assert.deepEqual(parsed.records, [first]);
  assert.equal(parsed.anchors.length, 1);
  // The retention cutoff, not the oldest file, decides which anchored month must exist.
  const anchor = { type: 'audit-anchor', month: '2026-08', tail: 'x' };
  const missing = candidate.verifyAuditChain(stored, [anchor], { now, retentionDays: 100 });
  assert.equal(missing.reason, 'anchor-month-missing');
  assert.equal(candidate.verifyAuditChain(stored, [anchor], { now, retentionDays: 40 }).ok, true);
}

/** The categories of this file and the assertions each runs. */
export const checkoutCases: Record<string, (candidate: Candidate) => Promise<void>> = {
  'secrev-scanner': scannerCase,
  'secrev-published': publishedCase,
  'secrev-audit-mirror': auditMirrorCase,
};
