// Checks request-scoped reuse against decisions made with fresh scopes and changed policies.
import assert from 'node:assert/strict';
import type { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from './access-fixture';
import matrix from '../../policies/matrix-cases.json';
import { isAction, ACTIONS } from '../../src/shared/auth/actions';
import type { ResourceRef } from '../../src/server/auth/resource';
import { clientPrincipal, type NormalizedPrincipal } from '../../src/server/auth/principal';

/** Exercises policy applicability, context separation and policy replacement through authorization. */
export function assertAccessIndexes(createControl: typeof createAccessControl) {
  const options = accessFixture();
  const access = createControl(options);
  distinctKinds(access);
  for (const identity of matrix.principals as NormalizedPrincipal[]) {
    const principal = access.principalFor(identity);
    const scope = access.forRequest(principal);
    for (const entry of matrix.cases) {
      if (!isAction(entry.action)) continue;
      const target = entry.resource as ResourceRef;
      const expected = access.forRequest(principal).authorize(entry.action, target);
      const actual = scope.authorize(entry.action, target);
      assert.equal(actual.allow, expected.allow, `${identity.id}: ${entry.case}`);
      assert.equal(actual.status, expected.status, `${identity.id}: ${entry.case}`);
    }
  }
  const resource = { type: 'project', project: 'sales-metrics' } as const;
  const scope = access.forRequest(access.principalFor(person('hank')));
  assert.equal(scope.authorize('edit', resource).allow, false);
  const changed = structuredClone(options.config);
  changed.roles[0].permissions = [{ actions: ['read', 'edit'] }];
  access.reload(changed);
  assert.equal(scope.authorize('edit', resource).allow, true);
  assert.equal(scope.authorize('read', resource).allow, true);
  const fork = access.fork(options.config);
  assert.equal(fork.authorize(fork.principalFor(person('hank')), 'edit', resource).allow, false);
  assert.equal(scope.authorize('edit', resource).allow, true);
  assert.throws(() => access.validatePolicy({ ...changed, adminRules: { broken: 'invalid Cedar' } }));
  arbitraryPolicyActions(createControl);
}

function distinctKinds(access: ReturnType<typeof createAccessControl>) {
  const alice = access.forRequest(access.principalFor(person('alice')));
  assert.equal(alice.authorize('export', { type: 'project', project: 'sales-metrics' }).allow, true);
  assert.equal(alice.authorize('export', { type: 'workspace' }).allow, false);
  assert.equal(alice.authorize('read', { type: 'workspace' }).allow, true);
  const erin = access.forRequest(access.principalFor(person('erin')));
  const resource = { type: 'project', project: 'sales-contracts' } as const;
  assert.equal(erin.authorize('edit', resource).allow, false);
  const client = access.forRequest(access.principalFor(clientPrincipal('sw-agent', 'Sales agent')));
  assert.equal(client.authorize('edit', resource).allow, false);
  assert.equal(client.authorize('agentRead', resource).allow, true);
  assert.equal(alice.authorize('admin', { type: 'project', project: 'sales-metrics' }).status, 403);
}

function arbitraryPolicyActions(createControl: typeof createAccessControl) {
  const options = accessFixture();
  options.config.adminRules = {
    'role:unheld:1': '@id("role:unheld:1") forbid(principal, action == SW::Action::"edit", resource);',
  };
  const access = createControl(options);
  const principal = access.principalFor(person('alice'));
  const scope = access.forRequest(principal);
  const resource = { type: 'project', project: 'sales-metrics' } as const;
  for (const action of ACTIONS) {
    assert.equal(scope.authorize(action, resource).allow, access.forRequest(principal).authorize(action, resource).allow);
  }
  assert.equal(scope.authorize('edit', resource).allow, false);
  assert.equal(scope.authorize('import', resource).allow, true);
  assert.equal(scope.authorize('push', resource, { protectedBranch: true }).allow, false);
  assert.equal(scope.authorize('push', resource).allow, true);
}
