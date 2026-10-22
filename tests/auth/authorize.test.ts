// Exercises the real Cedar boundary with the shipped access fixture and role matrix.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../../server/auth/authorize';
import { loadPolicySet, PolicyLoadError } from '../../server/auth/cedar';
import { clientFromToken, localPrincipal } from '../../server/auth/principal';
import { ACTIONS, type Action } from '../../server/auth/actions';
import type { GrantScope, Role } from '../../server/auth/grants';
import builtin from '../../policies/builtin-roles.json';
import { accessFixture, person } from './access-fixture';

const boundary = createAccessControl(accessFixture());
const project = { type: 'project', project: 'sales-contracts' } as const;
const finance = {
  type: 'file',
  project: 'sales-contracts',
  path: 'finance/revenue-recognition.odcs.yaml',
} as const;

test('fixture people receive the union of group and verified address grants', () => {
  const alice = boundary.principalFor(person('alice'));
  expect(boundary.authorize(alice, 'edit', project).allow).toBe(true);
  expect(boundary.authorize(alice, 'read', { type: 'project', project: 'hr-people' }).status).toBe(
    404,
  );
  expect(boundary.authorize(alice, 'read', finance).status).toBe(404);
  for (const name of ['bob', 'frank'] as const) {
    expect(boundary.authorize(boundary.principalFor(person(name)), 'read', finance).allow).toBe(
      true,
    );
  }
  const both = boundary.principalFor({ ...person('alice'), verifiedEmail: 'bob@example.org' });
  expect(both.grants).toHaveLength(2);
  expect(boundary.authorize(both, 'approveMetric', project).allow).toBe(true);
});

test('unverified guests and people with only provider roles receive no access', () => {
  for (const name of ['erin', 'gina'] as const) {
    const principal = boundary.principalFor(person(name));
    expect(boundary.authorize(principal, 'read', { type: 'workspace' }).status).toBe(403);
    expect(boundary.authorize(principal, 'read', project).status).toBe(404);
  }
});

test('project grants reach domainless projects and shared reading does not grant writing', () => {
  const carol = boundary.principalFor(person('carol'));
  expect(boundary.authorize(carol, 'read', { type: 'project', project: 'lab-notes' }).allow).toBe(
    true,
  );
  const shared = { type: 'project', project: 'shared-reference' } as const;
  expect(boundary.authorize(carol, 'read', shared).allow).toBe(true);
  expect(boundary.authorize(carol, 'edit', shared).status).toBe(403);
});

test('custom reviewers approve metrics but cannot edit and owners cannot approve', () => {
  const metric = {
    type: 'file',
    project: 'sales-metrics',
    path: 'revenue.yaml',
    metric: { name: 'gross_revenue', status: 'proposed', owner: 'Bob@Example.org' },
  } as const;
  const hank = boundary.principalFor(person('hank'));
  expect(boundary.authorize(hank, 'approveMetric', metric).allow).toBe(true);
  expect(boundary.authorize(hank, 'edit', metric).allow).toBe(false);
  const decision = boundary.authorize(
    boundary.principalFor(person('bob')),
    'approveMetric',
    metric,
  );
  expect(decision.reason).toBe('F1-no-self-approval');
});

const viewerActions: Action[] = ['read', 'export', 'history', 'viewOwnState'];
const editorActions: Action[] = [
  ...viewerActions,
  'edit',
  'createMetric',
  'import',
  'move',
  'delete',
  'revert',
  'restoreOwn',
  'stage',
  'commit',
  'branch',
  'fetch',
  'pull',
  'push',
  'cancelOwn',
];
const stewardActions: Action[] = [
  ...editorActions,
  'approveMetric',
  'editGuarded',
  'restoreOthers',
  'publish',
  'createProject',
  'renameProject',
  'readAudit',
];
const roleMatrix: Record<string, Action[]> = {
  viewer: viewerActions,
  editor: editorActions,
  steward: stewardActions,
  admin: [...ACTIONS],
};

test('every role matrix action holds for workspace domain and project scoped grants', () => {
  for (const role of builtin.roles as Role[]) {
    const expected = new Set(roleMatrix[role.id]);
    for (const scope of [
      { kind: 'workspace' },
      { kind: 'domains', domains: ['sales'] },
      { kind: 'projects', projects: ['sales-contracts'] },
    ] as GrantScope[]) {
      if (role.id === 'admin' && scope.kind !== 'workspace') continue;
      const options = accessFixture();
      options.config.grants = [
        {
          id: 'matrix',
          roleId: role.id,
          member: { kind: 'email', email: 'alice@example.org' },
          scope: structuredClone(scope),
          addedBy: 'test',
          addedAt: '2026-10-21T00:00:00Z',
        },
      ];
      const access = createAccessControl(options);
      const principal = access.principalFor(person('alice'));
      for (const action of ACTIONS) {
        expect(access.authorize(principal, action, project).allow).toBe(
          role.id === 'admin' || expected.has(action),
        );
      }
      expect(
        access.authorize(principal, 'read', { type: 'project', project: 'lab-notes' }).allow,
      ).toBe(role.id === 'admin');
    }
  }
});

test('clients only read their assigned projects through the agent action', () => {
  const client = boundary.principalFor(
    clientFromToken({ tid: 'tenant', idtyp: 'app', azp: 'sw-agent' }, 'tenant'),
  );
  expect(boundary.authorize(client, 'agentRead', project).allow).toBe(true);
  expect(boundary.authorize(client, 'read', project).allow).toBe(false);
  expect(
    boundary.authorize(client, 'agentRead', { type: 'project', project: 'hr-people' }).allow,
  ).toBe(false);
});

test('memoisation shares indistinguishable files and separates restricted files', () => {
  const alice = boundary.principalFor(person('alice'));
  const request = boundary.forRequest(alice);
  const first = request.authorize('read', { ...finance, path: 'one.yaml' });
  expect(request.authorize('read', { ...finance, path: 'two.yaml' })).toBe(first);
  expect(request.authorize('read', finance)).not.toBe(first);
  for (const level of ['public', 'internal', 'confidential', 'restricted'] as const) {
    expect(request.authorize('read', { ...finance, path: 'one.yaml', level }).allow).toBe(true);
  }
});

test('deactivation wins and a failed reload preserves the active policy set', () => {
  const options = accessFixture();
  const access = createAccessControl(options);
  const alice = access.principalFor(person('alice'));
  expect(() => access.reload({ ...options.config, roles: builtin.roles as Role[] })).toThrow(
    PolicyLoadError,
  );
  expect(access.authorize(alice, 'read', project).allow).toBe(true);
  expect(access.authorize({ ...alice, deactivated: true }, 'read', project).allow).toBe(false);
  access.reload({
    ...options.config,
    deactivated: {
      formatVersion: 1,
      principals: [{ id: alice.id, at: '2026-10-21T00:00:00Z', by: 'test', reason: 'test' }],
    },
  });
  expect(access.authorize(alice, 'read', project).allow).toBe(false);
  expect(() =>
    loadPolicySet({
      builtinRoles: builtin.roles as Role[],
      customRoles: [],
      adminRules: { broken: 'permit nonsense' },
    }),
  ).toThrow(PolicyLoadError);
});

test('local mode uses the same policies including baseline prohibitions', () => {
  const access = createAccessControl({ ...accessFixture(), mode: 'local' });
  expect(access.authorize(localPrincipal(), 'read', finance).allow).toBe(true);
  expect(access.authorize(localPrincipal(), 'push', project, { branch: 'main' }).allow).toBe(false);
});

test('custom conditions distinguish resource attributes and request context', () => {
  const options = accessFixture();
  options.config.roles = [
    {
      id: 'r_conditional',
      name: 'Conditional',
      description: '',
      createdBy: 'test',
      createdAt: '2026-10-21T00:00:00Z',
      permissions: [
        { actions: ['read'] },
        {
          actions: ['edit'],
          conditions: {
            path: 'reports/**',
            docType: ['metric'],
            maxLevel: 'internal',
          },
        },
        { actions: ['commit'], conditions: { branch: 'review/*' } },
      ],
    },
  ];
  options.config.grants = [
    {
      id: 'conditional',
      roleId: 'r_conditional',
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'workspace' },
      addedBy: 'test',
      addedAt: '2026-10-21T00:00:00Z',
    },
  ];
  const access = createAccessControl(options);
  const alice = access.principalFor(person('alice'));
  const file = {
    type: 'file',
    project: 'sales-metrics',
    path: 'reports/revenue.yaml',
    docType: 'metric',
    level: 'internal',
  } as const;
  expect(access.authorize(alice, 'edit', file).allow).toBe(true);
  expect(access.authorize(alice, 'edit', { ...file, path: 'other/revenue.yaml' }).allow).toBe(
    false,
  );
  expect(access.authorize(alice, 'edit', { ...file, docType: 'contract' }).allow).toBe(false);
  expect(access.authorize(alice, 'edit', { ...file, level: 'restricted' }).allow).toBe(false);
  expect(access.authorize(alice, 'commit', file, { branch: 'review/alice' }).allow).toBe(true);
  expect(access.authorize(alice, 'commit', file, { branch: 'feature/alice' }).allow).toBe(false);
});

test('filter and view expose only readable resources and effective project roles', () => {
  const alice = boundary.principalFor(person('alice'));
  expect(boundary.filter(alice, 'read', [project, finance], resource => resource)).toEqual([
    project,
  ]);
  const view = boundary.view(alice);
  expect(view.readableProjects.has('sales-contracts')).toBe(true);
  expect(view.readableProjects.has('hr-people')).toBe(false);
  expect(view.roles('sales-contracts')).toEqual(['editor']);
  expect(view.canRead('sales-contracts', finance.path)).toBe(false);
});
