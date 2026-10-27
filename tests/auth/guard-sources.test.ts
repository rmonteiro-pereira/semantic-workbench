// Where guarded text comes from: committed owners, multi-line attribute blocks and the files a
// repository restore re-creates in each of its projects.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { guardFor, GuardedChangeError } from '../../src/server/auth/guards';
import { demoteMetric } from '../../src/shared/governance/guards';
import { payloadChanges } from '../../src/server/projects/trash';
import { accessFixture, person } from './access-fixture';

const METRICS = readFileSync(
  'tests/fixtures/auth-workspace/projects/sales-metrics/sales.semantic.yaml',
  'utf8',
);

function steward() {
  const access = createAccessControl(accessFixture());
  return guardFor(access.forRequest(access.principalFor(person('bob'))))!;
}

test('the committed owner counts for self-approval', () => {
  const owned = (owner: string, status: string) =>
    METRICS.replace(
      '"owner": "alice@example.org", "status": "proposed"',
      `"owner": "${owner}", "status": "${status}"`,
    );
  const change = {
    project: 'sales-metrics',
    path: 'sales.semantic.yaml',
    before: owned('alice@example.org', 'proposed'),
    after: owned('alice@example.org', 'approved'),
  };
  expect(() => steward()([change])).not.toThrow();
  const committed = owned('bob@example.org', 'proposed');
  expect(() => steward()([{ ...change, committed }])).toThrow(GuardedChangeError);
});

test('a demotion inside a multi-line attribute block changes only the status bytes', () => {
  const source = [
    'name: m',
    'datasets: [{name: d, source: s}]',
    'metrics:',
    '  - name: revenue',
    '    expression: SUM(a) * 2',
    '    custom_extensions:',
    '      - vendor_name: SEMANTIC_WORKBENCH',
    '        data: |',
    '          {',
    '            "schema": "semantic-workbench/metric/v1",',
    '            "type": "simple",',
    '            "status": "approved",',
    '            "owner": "bob@example.org"',
    '          }',
    '',
  ].join('\n');
  const demoted = demoteMetric(source, 'm.yaml', ['metrics', 0]);
  expect(demoted).toBe(source.replace('"status": "approved"', '"status": "proposed"'));
});

test('a restored repository re-creates each file in the project it belongs to', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workbench-trash-entry-'));
  try {
    const contract = readFileSync(
      'tests/fixtures/auth-workspace/projects/hr-people/people.odcs.yaml',
      'utf8',
    );
    mkdirSync(join(dir, 'payload', 'mono', 'hr'), { recursive: true });
    mkdirSync(join(dir, 'payload', 'mono', 'sales'), { recursive: true });
    writeFileSync(join(dir, 'payload', 'mono', 'hr', 'people.odcs.yaml'), contract);
    writeFileSync(join(dir, 'payload', 'mono', 'sales', 'notes.txt'), 'notes');
    const member = (slug: string, folder: string) => ({
      slug,
      name: slug,
      createdAt: '2026-10-22T00:00:00Z',
      origin: 'import',
      folder,
      repo: 'mono',
    });
    const entry = {
      kind: 'repository' as const,
      project: 'sales-contracts',
      projects: [member('sales-contracts', 'mono/sales'), member('hr-people', 'mono/hr')],
    };
    const changes = payloadChanges(entry, dir);
    const contractChange = changes.find(change => change.path === 'people.odcs.yaml');
    expect(contractChange?.project).toBe('hr-people');
    expect(changes.find(change => change.path === 'notes.txt')?.project).toBe('sales-contracts');
    // The Sales Steward may not re-create HR's classified contract.
    expect(() => steward()(changes, { operation: 'restore' })).toThrow(GuardedChangeError);
    const misplaced = changes.map(change => ({ ...change, project: 'sales-contracts' }));
    expect(() => steward()(misplaced, { operation: 'restore' })).not.toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
