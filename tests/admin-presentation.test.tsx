import { actionLabel, newIdentifier, whenLabel } from '../src/app/admin/helpers';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DryRunResult } from '../src/app/admin/ReviewChange';
import { canOpenAdmin } from '../src/app/admin/AdminLauncher';
import { grantScope } from '../src/app/admin/GrantForm';
import { RolePermissions } from '../src/app/admin/RolePermissions';
import type { Me } from '../src/auth/useMe';
import builtin from '../policies/builtin-roles.json';
import { decisionLabel } from '../src/app/admin/AccessCheckSection';
import { inUseMessage } from '../src/app/admin/ReviewChange';
import { grantSummary } from '../src/app/admin/RolesAccessSection';
import type { Role } from '../src/app/admin/types';
import {
  ADMIN_AREAS,
  ADMINISTRATION_TIME_LIMIT_MS,
  screenshotName,
  withinAdministrationTime,
} from '../scripts/helpers/admin-browser';
const me: Me = {
  mode: 'server',
  name: 'Dave',
  verifiedEmail: 'dave@example.org',
  can: { admin: true, audit: true },
  roles: { workspace: ['admin'], projects: {} },
  roleNames: { admin: 'Admin' },
};

test('the Admin entry uses the capability and local identity, never a custom role name', () => {
  expect(canOpenAdmin(null)).toBe(false);
  expect(canOpenAdmin(me)).toBe(true);
  expect(canOpenAdmin({ ...me, can: { admin: false, audit: true } })).toBe(false);
  expect(canOpenAdmin({ ...me, mode: 'local', can: undefined })).toBe(true);
});

test('Admin scope cannot be narrowed and member lists are normalized', () => {
  expect(grantScope('admin', 'domains', 'sales', '')).toEqual({ kind: 'workspace' });
  expect(grantScope('editor', 'domains', ' sales, hr, sales, ', '')).toEqual({
    kind: 'domains',
    domains: ['sales', 'hr'],
  });
});

test('review renders gained and lost actions for people and clients', () => {
  const html = renderToStaticMarkup(
    <DryRunResult
      result={{
        dryRunId: 'r',
        matrixCases: 20,
        auditCases: 10,
        changed: [],
        people: [
          {
            principal: 'alice',
            name: 'Alice',
            project: 'sales',
            gained: ['approveMetric'],
            lost: ['edit'],
            access: 'kept',
          },
          {
            principal: 'client:agent',
            name: 'client:agent',
            project: 'hr',
            gained: [],
            lost: ['agentRead'],
            access: 'lost',
          },
        ],
      }}
    />,
  );
  for (const text of [
    'Alice',
    'approveMetric',
    'edit',
    'client:agent',
    'access lost',
    '20 matrix cases',
  ])
    expect(html).toContain(text);
});

test('role conditions only show for applicable selected actions', () => {
  const html = renderToStaticMarkup(
    <RolePermissions
      role={{
        id: 'r_review',
        name: 'Reviewer',
        description: '',
        permissions: [{ actions: ['approveMetric'] }],
      }}
      actions={['approveMetric', 'read']}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('Conditions for approve metric');
  expect(html).toContain('Document type');
  expect(html).not.toContain('Conditions for read');
});

test('timestamps use the reader locale and unknown text passes through', () => {
  const iso = '2026-10-21T10:00:00Z';
  expect(whenLabel(iso)).toBe(new Date(iso).toLocaleString());
  expect(whenLabel('today')).toBe('today');
});

test('access decisions read as words whatever shape the server sends', () => {
  expect(decisionLabel({ allow: true })).toBe('Allowed');
  expect(decisionLabel({ allow: false, reason: 'x' })).toBe('Denied');
  expect(decisionLabel('allow')).toBe('Allowed');
  expect(decisionLabel('deny')).toBe('Denied');
  expect(decisionLabel({ other: 1 })).toBe('{"other":1}');
});

test('a refused role deletion names the affected people', () => {
  const inUse = { roleId: 'r_x', grants: 1, people: [{ id: 'a', name: 'Alice' }, { id: 'b' }] };
  expect(inUseMessage(inUse)).toBe('Affected people: Alice, b.');
  expect(inUseMessage({ roleId: 'r_x', grants: 2, people: [] })).toBe('The role still has grants.');
});

test('a grant is named by role, member and scope', () => {
  const grant = {
    id: 'g_1',
    roleId: 'editor',
    member: { kind: 'email' as const, email: 'erin@example.org' },
    scope: { kind: 'projects' as const, projects: ['sales'] },
    addedBy: 'dave',
    addedAt: '2026-10-01T00:00:00Z',
  };
  const roles = { builtIn: builtin.roles as Role[], custom: [] };
  expect(grantSummary(grant, roles)).toBe(
    'the Editor grant for erin@example.org (Projects: sales)',
  );
  expect(grantSummary({ ...grant, roleId: 'r_gone' }, roles)).toContain('the r_gone grant');
});

test('new identifiers match the access schema patterns and do not repeat', () => {
  const grant = newIdentifier('g_');
  expect(grant).toMatch(/^g_[0-9a-f]{32}$/);
  expect(newIdentifier('r_')).toMatch(/^r_[a-z0-9_]{1,62}$/);
  expect(newIdentifier('g_')).not.toBe(grant);
});

test('browser check names screenshots and enforces the three-minute limit', () => {
  expect(ADMIN_AREAS.map(screenshotName)).toEqual([
    'access-grants',
    'roles',
    'users-groups',
    'policies',
    'projects-access',
    'git-remotes',
    'audit',
    'settings',
    'access-check',
  ]);
  expect(withinAdministrationTime(1_000, 1_000 + ADMINISTRATION_TIME_LIMIT_MS - 1)).toBe(true);
  expect(withinAdministrationTime(1_000, 1_000 + ADMINISTRATION_TIME_LIMIT_MS)).toBe(false);
});

test('action identifiers read as labels', () => {
  expect(actionLabel('approveMetric')).toBe('Approve metric');
  expect(actionLabel('viewOwnState')).toBe('View own state');
  expect(actionLabel('read')).toBe('Read');
});
