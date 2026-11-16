// Old-format audit months remain verifiable without consulting the current date.
import { expect, test } from 'bun:test';
import { readStoredMonths, verifyAuditChain } from '../../src/server/auth/audit';

const folder = 'tests/fixtures/audit-v1';

test('original audit months link across the month boundary', () => {
  const months = readStoredMonths(folder);
  expect(months.map(month => month.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  expect(verifyAuditChain(months)).toMatchObject({ ok: true, records: 9, months: 3 });
  const records = months.flatMap(month => month.lines.map(line => JSON.parse(line)));
  expect(records.some(record => record.snapshot)).toBe(true);
  expect(records.some(record => record.principal.kind === 'anonymous')).toBe(true);
  expect(new Set(records.map(record => record.decision))).toEqual(new Set(['allow', 'deny']));
  expect(records.every(record => record.origin === undefined)).toBe(true);
});

test('audit verification command accepts the original months', async () => {
  const result = Bun.spawn([process.execPath, 'run', 'audit:verify', folder], { stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(result.stdout).text();
  expect(await result.exited).toBe(0);
  expect(output).toContain('Audit log intact: 9 records in 3 months.');
});

import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLog, parseMirror } from '../../src/server/auth/audit';
import { testWorkspace } from '../helpers/temp-data-dir';

async function verificationCode(dir: string, mirror?: string) {
  const args = [process.execPath, 'run', 'audit:verify', dir];
  if (mirror) args.push('--anchors', mirror);
  const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return child.exited;
}

test('old and attributed records verify in one month, across months and against their mixed mirror', async () => {
  using fixture = await testWorkspace();
  const target = join(fixture.root, 'mixed');
  cpSync(folder, target, { recursive: true });
  const original = readStoredMonths(folder);
  const mirrored = original.flatMap(month => month.lines);
  let now = new Date('2026-03-31T23:59:59Z');
  const log = createAuditLog({ dir: target, now: () => now, mirror: line => mirrored.push(line.trimEnd()) });
  const input = {
    requestId: 'mixed',
    principal: { id: 'reader', kind: 'person' },
    action: 'read',
    resource: { type: 'workspace' },
    decision: 'allow' as const,
    rules: [],
    origin: 'mcp' as const,
    tool: 'projects.list',
  };
  log.append(input);
  now = new Date('2026-04-01T00:00:00Z');
  log.append({ ...input, origin: 'mcp' });
  const parsed = parseMirror(mirrored.join('\n'));
  expect(parsed.records).toHaveLength(11);
  expect(parsed.anchors).toHaveLength(1);
  expect(verifyAuditChain(readStoredMonths(target), parsed.anchors, { mirrored: parsed.records, now })).toMatchObject({ ok: true, records: 11, months: 4 });
  const mirror = join(fixture.root, 'mirror.jsonl');
  writeFileSync(mirror, mirrored.join('\n') + '\n');
  expect(await verificationCode(target, mirror)).toBe(0);
  const path = join(target, '2026-03.jsonl');
  writeFileSync(path, readFileSync(path, 'utf8').replace('projects.list', 'files.read'));
  expect(await verificationCode(target, mirror)).toBe(1);
  expect(readStoredMonths(folder)).toEqual(original);
});
