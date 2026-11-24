// Compares replay output with independently evaluated questions across policy changes.
import { expect, test } from 'bun:test';
import { compareAccess } from '../../src/server/auth/dry-run';
import { createAccessControl } from '../../src/server/auth/authorize';
import type { AccessConfig } from '../../src/server/auth/access-config';
import { compareOriginalReplay } from './original-dry-run-replay';
import { accessFixture, person } from './access-fixture';
import { createAuditLog } from '../../src/server/auth/audit';

function comparableBytes(result: ReturnType<typeof compareAccess>) {
  return JSON.stringify({
    ...result,
    changed: result.changed.map(decision => ({ ...decision, rules: [...decision.rules].sort() })),
  });
}

const proposals: [string, (config: AccessConfig) => void][] = [
  [
    'grant added',
    config => {
      config.grants.push({ ...config.grants.find(grant => grant.id === 'g-hank')!, id: 'extra', roleId: 'editor' });
    },
  ],
  [
    'grant removed',
    config => {
      config.grants = config.grants.filter(grant => grant.id !== 'g-hank');
    },
  ],
  [
    'custom role changed',
    config => {
      config.roles[0].permissions = [{ actions: ['read', 'edit'], conditions: { path: 'metrics/*' } }];
    },
  ],
  [
    'role deleted',
    config => {
      config.roles = [];
      config.grants = config.grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
    },
  ],
  [
    'last administrator removed',
    config => {
      config.grants = config.grants.filter(grant => grant.roleId !== 'admin');
    },
  ],
];

for (const [name, change] of proposals) {
  test(`${name} preserves the full replay answer`, () => {
    const options = accessFixture();
    const next = structuredClone(options.config);
    change(next);
    const audit = createAuditLog({ dir: 'tests/fixtures/dry-run', now: () => new Date('2026-03-15T12:00:00Z') });
    const users = (['alice', 'hank', 'dave', 'erin', 'bob'] as const).map(name => person(name));
    const evidence = { users, audit: audit.recent(1000) };
    const expected = compareOriginalReplay(options, next, evidence);
    const actual = compareAccess(options, next, { ...evidence, access: createAccessControl(options) });
    expect(comparableBytes(actual)).toBe(comparableBytes(expected));
    expect(JSON.stringify(actual)).toBe(comparableBytes(actual));
  }, 60_000);
}
