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
