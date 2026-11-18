import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { newProjectIn } from '../../src/server/auth/resource';
import { accessFixture, person } from './access-fixture';

test('project creation evaluates the control and request context defaults', () => {
  const options = accessFixture();
  options.config.adminRules = {
    creationHours: 'forbid(principal, action == SW::Action::"createProject", resource) when { context.hour == 13 };',
  };
  const access = createAccessControl({ ...options, context: () => ({ hour: 13 }) });
  const principal = access.principalFor(person('dave'));
  const workspace = { type: 'workspace' } as const;
  const prospective = newProjectIn('sales');

  expect(access.authorize(principal, 'createProject', workspace).status).toBe(403);
  expect(access.forRequest(principal, { hour: 12 }).authorize('createProject', prospective).status).toBe(200);
  expect(access.forRequest(principal, { hour: 12 }).authorize('createProject', prospective, { hour: 13 }).status).toBe(403);
});
