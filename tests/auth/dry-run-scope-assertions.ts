// Checks the inputs that determine whether two dry-run scopes can share decisions.
import assert from 'node:assert/strict';
import type { compareAccess, scopeCache } from '../../src/server/auth/dry-run';
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

/** Checks a comparison whose active control has moved past the supplied snapshot. */
export function assertReloadedReplay(compare: typeof compareAccess) {
  const options = accessFixture();
  const access = createAccessControl(options);
  const stale = access.snapshot();
  access.reload({ ...stale.config, adminRules: { deny: 'forbid(principal, action == SW::Action::"read", resource);' } });
  const alice = person('alice');
  const result = compare(stale, stale.config, { users: [alice], audit: [], access });
  assert(
    result.people.some(change => change.principal === alice.id && change.gained.includes('read')),
    'Alice regains read access',
  );
}

/** Verifies that removing a group grant changes a deactivated person's denial evidence. */
export function assertDeactivatedReplay(scopes: typeof scopeCache) {
  const options = accessFixture();
  const dave = person('dave');
  options.config.deactivated.principals.push({ id: dave.id, at: '2026-03-15T12:00:00Z', by: person('bob').id, reason: 'Account disabled' });
  const before = createAccessControl(options);
  const next = structuredClone(options.config);
  next.grants = next.grants.filter(grant => grant.roleId !== 'admin');
  const after = before.fork(next);
  const pair = scopes(before, after, options.config, next)(dave);
  const project = { type: 'project', project: 'sales-metrics' } as const;
  const expected = after.forRequest(after.principalFor(dave)).authorize('setRemote', project);
  assert(expected.rules.includes('F7-remote-admin'));
  assert(pair.before.authorize('setRemote', project).rules.includes('F3-deactivated'));
  assert.deepEqual([...pair.after.authorize('setRemote', project).rules].sort(), [...expected.rules].sort());
}

/** An unchanged time rule must not turn a clock tick into a policy change. */
export function assertReplayClock(compare: typeof compareAccess, createControl = createAccessControl) {
  const fixture = accessFixture();
  fixture.config.adminRules = { hour: 'forbid(principal, action == SW::Action::"read", resource) when { context.hour == 13 };' };
  let samples = 0;
  const options = { ...fixture, context: () => ({ hour: samples++ === 0 ? 12 : 13 }) };
  const access = createControl(options);
  const result = compare(options, options.config, { users: [person('alice')], audit: [], access });
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.people, []);
  assert.equal(samples, 1);
}
