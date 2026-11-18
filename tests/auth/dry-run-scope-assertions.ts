// Checks the inputs that determine whether two dry-run scopes can share decisions.
import assert from 'node:assert/strict';
import type { compareAccess } from '../../src/server/auth/dry-run';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from './access-fixture';
import type { AccessConfig } from '../../src/server/auth/access-config';

const changes: [(config: AccessConfig) => void, string, string, string][] = [
  [
    config => {
      config.grants = config.grants.filter(grant => grant.id !== 'g-sales-editors');
    },
    person('alice').id,
    'lost',
    'edit',
  ],
  [
    config => {
      config.grants = config.grants.filter(grant => grant.id !== 'g-hank');
    },
    person('hank').id,
    'lost',
    'read',
  ],
  [
    config => {
      config.roles[0].permissions = [{ actions: ['read', 'edit'] }];
    },
    person('hank').id,
    'gained',
    'edit',
  ],
  [
    config => {
      config.projects.projects['sales-metrics'].everyoneCanRead = true;
    },
    person('carol').id,
    'gained',
    'read',
  ],
  [
    config => {
      config.agents.clients = [];
    },
    'client:sw-agent',
    'lost',
    'agentRead',
  ],
  [
    config => {
      config.adminRules = { deny: '@id("deny") forbid(principal, action == SW::Action::"read", resource);' };
    },
    person('alice').id,
    'lost',
    'read',
  ],
];

/** Verifies that grants, roles, projects, clients and arbitrary rules invalidate scope sharing. */
export function assertDryRunScopes(compare: typeof compareAccess) {
  for (const [change, principal, direction, action] of changes) {
    const options = accessFixture();
    const next = structuredClone(options.config);
    change(next);
    const result = compare(options, next, {
      users: [person('hank'), person('alice'), person('carol')],
      audit: [],
      access: createAccessControl(options),
    });
    const affected = result.people.filter(entry => entry.principal === principal);
    assert(
      affected.some(entry => (direction === 'gained' ? entry.gained : entry.lost).some(value => value === action)),
      `${principal}: ${direction} ${action}`,
    );
    if (principal !== 'client:sw-agent') assert(result.changed.length > 0);
  }
}
