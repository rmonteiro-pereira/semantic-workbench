// Regression coverage for restrictions, live membership and request-scoped decisions.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { InvalidResourceError, normalizeResource } from '../../src/server/auth/resource';
import { validateAccessConfig } from '../../src/server/auth/access-config';
import { BUILTIN_ROLE_IDS } from '../../src/server/auth/actions';
import { clientFromToken, localPrincipal } from '../../src/server/auth/principal';
import { accessFixture, person } from './access-fixture';

const project = { type: 'project', project: 'sales-contracts' } as const;
const file = { ...project, type: 'file', path: 'sales/payroll/salary.yaml' } as const;

test('overlapping restrictions require every group or verified address, except for Admins', () => {
  const options = accessFixture();
  options.config.projects.projects['sales-contracts'].restricted = [
    { pattern: 'sales/**', groups: ['Group-A'], emails: [] },
    { pattern: 'sales/payroll/**', groups: ['Group-B'], emails: ['alice@example.org'] },
  ];
  const access = createAccessControl(options);
  const alice = access.principalFor(person('alice'));
  const identity = { ...alice, verifiedEmail: null };
  for (const group of ['group-a', 'group-b']) {
    const principal = { ...identity, groups: [...identity.groups, group] };
    expect(access.authorize(principal, 'read', file).allow).toBe(false);
  }
  const both = { ...identity, groups: [...identity.groups, 'group-a', 'group-b'] };
  expect(access.authorize(both, 'read', file).allow).toBe(true);
  const mixed = {
    ...alice,
    verifiedEmail: 'ALICE@example.org',
    groups: [...alice.groups, 'group-a'],
  };
  expect(access.authorize(mixed, 'read', file).allow).toBe(true);
  expect(access.authorize({ ...mixed, groupsResolved: 'failed' }, 'read', file).allow).toBe(false);
  const exact = createAccessControl({ ...options, groupMatch: 'exact' });
  expect(exact.authorize(mixed, 'read', file).allow).toBe(false);
  expect(
    exact.authorize({ ...alice, groups: [...alice.groups, 'Group-A'] }, 'read', file).allow,
  ).toBe(true);
  const admin = createAccessControl({ ...options, bootstrap: { ids: [alice.id], emails: [] } });
  expect(admin.authorize(identity, 'read', file).allow).toBe(true);
});

test('agent clients read ordinary files but cannot read restricted files', () => {
  const access = createAccessControl(accessFixture());
  const client = access.principalFor(
    clientFromToken({ tid: 'tenant', idtyp: 'app', azp: 'sw-agent' }, 'tenant'),
  );
  expect(access.authorize(client, 'agentRead', { ...file, path: 'orders.odcs.yaml' }).allow).toBe(
    true,
  );
  const denied = access.authorize(client, 'agentRead', {
    ...file,
    path: 'finance/revenue-recognition.odcs.yaml',
  });
  expect(denied.allow).toBe(false);
  expect(denied.rules).toContain('F6-restricted');
});

test('live project membership refreshes domain grants and invalidates request decisions', () => {
  const options = accessFixture();
  const projects: string[] = options.knownProjects();
  options.config.projects.projects.new = {
    domain: 'sales',
    stewards: [],
    restricted: [],
    protectedBranches: [],
  };
  const access = createAccessControl({ ...options, knownProjects: () => projects });
  const alice = access.principalFor(person('alice'));
  const before = access.forRequest(alice);
  const target = { type: 'project', project: 'new' } as const;
  const denied = before.authorize('read', target);
  expect(denied.allow).toBe(false);
  projects.push('new');
  const after = access.forRequest(alice);
  expect(after.authorize('read', target).allow).toBe(true);
  expect(before.authorize('read', target).allow).toBe(true);
  expect(after.authorize('read', target)).not.toBe(denied);
  expect(after.view().roles('new')).toContain('editor');
  expect(after.view().readableProjects.has('new')).toBe(true);
});

test('request scopes isolate memo state and refresh grants after reload', () => {
  const options = accessFixture();
  const access = createAccessControl(options);
  const alice = access.principalFor(person('alice'));
  const first = access.forRequest(alice);
  const allowed = first.authorize('read', project);
  expect(first.authorize('read', project)).toBe(allowed);
  expect(access.forRequest(alice).authorize('read', project)).not.toBe(allowed);
  access.reload({ ...options.config, grants: [] });
  const second = access.forRequest(alice);
  expect(second.authorize('read', project).allow).toBe(false);
  expect(second.principal.grants).toEqual([]);
  expect(first.authorize('read', project).allow).toBe(false);
  expect(first.principal.grants).toEqual([]);
});

test('caller deactivation survives principal matching and view construction', () => {
  const access = createAccessControl(accessFixture());
  const alice = { ...access.principalFor(person('alice')), deactivated: true };
  expect(access.principalFor(alice).deactivated).toBe(true);
  expect(access.authorize(alice, 'read', project).allow).toBe(false);
  expect(access.view(alice).readableProjects.size).toBe(0);
  expect(access.view(alice).canRead(project.project, 'orders.odcs.yaml')).toBe(false);
});

test('admin forbids are loaded while disabled admin rules are skipped', () => {
  const options = accessFixture();
  const alice = person('alice');
  const access = createAccessControl({
    ...options,
    bootstrap: { ids: [alice.id], emails: [] },
  });
  const principal = access.principalFor(alice);
  const rule = 'forbid (principal, action, resource);';
  access.reload({ ...options.config, adminRules: { custom: '@enabled("false")\n' + rule } });
  expect(access.authorize(principal, 'read', project).allow).toBe(true);
  access.reload({ ...options.config, adminRules: { custom: rule } });
  expect(access.authorize(principal, 'read', project).allow).toBe(false);
  expect(access.authorize(principal, 'read', project).rules).toContain('custom');
});

test('boundary normalization prevents restriction bypasses and rejects unsafe paths', () => {
  const access = createAccessControl(accessFixture());
  const request = access.forRequest(access.principalFor(person('alice')));
  const denied = request.authorize('read', { ...file, path: 'finance/x.yaml' });
  expect(denied.allow).toBe(false);
  for (const path of ['./finance/x.yaml', 'finance//x.yaml']) {
    expect(request.authorize('read', { ...file, path })).toBe(denied);
    expect(normalizeResource({ ...file, path })).toEqual({ ...file, path: 'finance/x.yaml' });
  }
  for (const path of ['', '.', './', '/finance/x', '../x', 'finance/../x', 'finance\\x']) {
    expect(() => request.authorize('read', { ...file, path })).toThrow(InvalidResourceError);
  }
});

test('configuration boundary validates role semantics and reserves built-in identities', () => {
  const options = accessFixture();
  const role = options.config.roles[0];
  for (const id of BUILTIN_ROLE_IDS) {
    expect(() => validateAccessConfig({ ...options.config, roles: [{ ...role, id }] })).toThrow();
  }
  expect(() =>
    validateAccessConfig({
      ...options.config,
      roles: [
        { ...role, permissions: [{ actions: ['push'], conditions: { path: 'finance/**' } }] },
      ],
    }),
  ).toThrow('file conditions require file actions');
  expect(() => validateAccessConfig({ ...options.config, roles: [role, role] })).toThrow();
});

test('admin rules that name a metric keep distinct identities in the request cache', () => {
  const options = accessFixture();
  options.config.adminRules = {
    hidden:
      'forbid (principal, action, ' +
      'resource == SW::Metric::"sales-contracts/orders.yaml#hidden");',
  };
  const access = createAccessControl(options);
  const request = access.forRequest(access.principalFor(person('alice')));
  const visible = { ...file, path: 'orders.yaml', metric: { name: 'visible', status: 'draft' } };
  expect(request.authorize('read', visible).allow).toBe(true);
  const hidden = { ...visible, metric: { ...visible.metric, name: 'hidden' } };
  expect(request.authorize('read', hidden).allow).toBe(false);
});

test('local principal matching also preserves caller deactivation', () => {
  const access = createAccessControl({ ...accessFixture(), mode: 'local' });
  const principal = { ...localPrincipal(), deactivated: true };
  expect(access.forRequest(principal).principal.deactivated).toBe(true);
  expect(access.view(principal).readableProjects.size).toBe(0);
  expect(access.authorize(principal, 'read', project).allow).toBe(false);
});
