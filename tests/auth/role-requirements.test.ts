// The role an action needs is named the way the workspace names its roles to people.
import { expect, test } from 'bun:test';
import { roleRequirements } from '../../src/server/auth/role-requirements';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from './access-fixture';
import type { Role } from '../../src/server/auth/access-config';
import { openAdminRepository } from '../../src/server/auth/admin-repo';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

const reviewer: Role = {
  id: 'r_reviewer',
  name: 'Reviewer',
  description: 'Approves metrics.',
  createdBy: 'test',
  createdAt: '2026-10-22T00:00:00Z',
  permissions: [{ actions: ['approveMetric'] }],
} as Role;

test('requirements use the configured role names', () => {
  const names = { editor: 'Author', steward: 'Domain lead', r_reviewer: 'Metric reviewer' };
  const requirements = roleRequirements([reviewer], ['r_reviewer'], names);
  expect(requirements.edit).toBe('Requires Author');
  expect(requirements.createProject).toBe('Requires Domain lead');
  expect(requirements.approveMetric).toBe('Requires Metric reviewer');
});

test('requirements fall back to the role definition when no name is configured', () => {
  const requirements = roleRequirements([reviewer], ['r_reviewer'], {});
  expect(requirements.edit).toBe('Requires Editor');
  expect(requirements.approveMetric).toBe('Requires Reviewer');
});

test('/api/me names the needed role as the workspace calls it', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const origin = 'http://127.0.0.1:4310';
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    roleNames: { viewer: 'Reader', editor: 'Author', steward: 'Domain lead', admin: 'Admin' },
    principal: () => access.principalFor(person('alice')),
  });
  const response = await handler(new Request(origin + '/api/me', { headers: { Origin: origin, 'X-SW-Request': '1' } }));
  expect(response.status).toBe(200);
  const me = await response.json();
  expect(me.requires.edit).toBe('Requires Author');
  expect(me.requires.createProject).toBe('Requires Domain lead');
});

test('/api/me shows a renamed custom role without a restart', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const administration = openAdminRepository({
    root: fixture.root,
    committed: config => access.reload(config),
  });
  await administration.ensure();
  const origin = 'http://127.0.0.1:4310';
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    administration,
    principal: () => access.principalFor(person('hank')),
  });
  const me = async () => {
    const response = await handler(new Request(origin + '/api/me', { headers: { Origin: origin, 'X-SW-Request': '1' } }));
    return (await response.json()) as { roleNames: Record<string, string> };
  };
  const config = administration.load();
  const role = config.roles.find(candidate => candidate.id === 'r_metric_reviewer')!;
  const before = (await me()).roleNames.r_metric_reviewer;
  expect(before).toBe(role.name);
  role.name = 'Metric approver';
  await administration.write(
    { 'roles.json': JSON.stringify({ formatVersion: 1, roles: config.roles }) },
    {
      baseVersion: await administration.version(),
      author: { name: 'Admin', email: 'admin@example.org' },
      message: 'roles: rename the metric reviewer',
    },
  );
  expect((await me()).roleNames.r_metric_reviewer).toBe('Metric approver');
});
