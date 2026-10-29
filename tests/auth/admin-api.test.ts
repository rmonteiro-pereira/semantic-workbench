// Exercises administrative writes through the real handler without opening sockets.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { openAdminRepository } from '../../src/server/auth/admin-repo';
import { person, accessFixture } from './access-fixture';
import type { HandlerOptions } from '../../src/server/auth/middleware';
import type { Bootstrap } from '../../src/server/auth/grants';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

/** Opens an isolated handler with fixture identities and a recent human administrator. */
export async function adminFixture(options: Pick<HandlerOptions, 'groupName' | 'audit'> = {}, bootstrap: Bootstrap = { ids: [], emails: [] }) {
  const fixture = await authWorkspace();
  const access = createAccessControl({ ...accessFixture(), bootstrap });
  for (const name of ['dave', 'erin', 'hank', 'bob', 'alice'] as const) {
    fixture.ws.state.recordUser(access.principalFor(person(name)), new Date().toISOString());
  }
  let identity = 'dave' as Parameters<typeof person>[0];
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    principal: () => access.principalFor(person(identity)),
    ...options,
  });
  const repository = openAdminRepository({ root: fixture.root });
  await repository.ensure();
  async function request(path: string, method = 'GET', body?: unknown) {
    return handler(
      new Request('http://localhost' + path, {
        method,
        headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
  return {
    ...fixture,
    access,
    repository,
    request,
    identify: (name: typeof identity) => {
      identity = name;
    },
  };
}

test('Admin-only routes, matching dry run, concurrency, one authored commit and next-request access', async () => {
  using fixture = await adminFixture();
  fixture.identify('alice');
  expect((await fixture.request('/api/admin/grants')).status).toBe(403);
  fixture.identify('dave');
  const baseVersion = await fixture.repository.version();
  const grants = [
    ...fixture.repository.load().grants,
    {
      id: 'erin-viewer',
      roleId: 'viewer',
      member: { kind: 'email', email: 'ERIN@Example.org' },
      scope: { kind: 'workspace' },
      addedBy: 'dave',
      addedAt: new Date().toISOString(),
    },
  ];
  expect((await fixture.request('/api/admin/grants', 'PUT', { grants, baseVersion })).status).toBe(400);
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants });
  expect(preview.status).toBe(200);
  const { dryRunId, people } = await preview.json();
  expect(people.some((entry: any) => entry.principal === person('erin').id && entry.access === 'gained')).toBe(true);
  const saved = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    baseVersion,
    dryRunId,
  });
  expect(saved.status).toBe(200);
  expect(fixture.repository.load().grants.at(-1)?.member).toEqual({
    kind: 'email',
    email: 'erin@example.org',
  });
  const history = await fixture.repository.history();
  expect(history).toHaveLength(2);
  expect(history[0].author).toEqual({ name: 'Dave Dias', email: 'dave@example.org' });
  expect(history[0].message).toContain('grants:');
  expect((await fixture.request('/api/admin/grants', 'PUT', { grants, baseVersion, dryRunId })).status).toBe(409);
  fixture.identify('erin');
  expect((await fixture.request('/api/me')).status).toBe(200);
}, 30000);

test('custom role deletion requires confirmation and removes its grants in one commit', async () => {
  using fixture = await adminFixture();
  const baseVersion = await fixture.repository.version();
  const proposal = { roles: [] };
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', proposal);
  const { dryRunId } = await preview.json();
  const body = { ...proposal, baseVersion, dryRunId };
  const refused = await fixture.request('/api/admin/roles', 'PUT', body);
  expect(refused.status).toBe(409);
  expect((await refused.json()).inUse.people).toContainEqual({
    id: person('hank').id,
    name: person('hank').name,
  });
  expect((await fixture.request('/api/admin/roles', 'PUT', { ...body, confirmDeleteInUse: true })).status).toBe(200);
  expect(fixture.repository.load().grants.some(grant => grant.roleId === 'r_metric_reviewer')).toBe(false);
  expect(await fixture.repository.history()).toHaveLength(2);
}, 30000);

test('last Admin guard applies to grants and deactivation, and secrets never appear', async () => {
  using fixture = await adminFixture();
  const grants = fixture.repository.load().grants.filter(grant => grant.roleId !== 'admin');
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants })).json();
  const response = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('last-admin');
  const disabled = await fixture.request('/api/admin/users/' + encodeURIComponent(person('dave').id) + '/deactivate', 'POST', { reason: 'test' });
  expect(disabled.status).toBe(400);
  for (const path of ['settings', 'sessions', 'provider', 'users']) {
    const response = await fixture.request('/api/admin/' + path);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/accessToken|refreshToken|clientSecret|sessionKey/);
  }
}, 30000);

test('invalid grants and custom roles never create a dry-run receipt or a commit', async () => {
  using fixture = await adminFixture();
  const config = fixture.repository.load();
  const original = config.grants[0];
  const proposals = [
    { grants: [...config.grants, { ...original, id: 'duplicate' }] },
    { grants: [{ ...original, roleId: 'unknown' }] },
    { grants: [{ ...original, scope: { kind: 'domains', domains: ['unknown'] } }] },
    { grants: [{ ...original, scope: { kind: 'projects', projects: ['unknown'] } }] },
    { grants: [{ ...original, roleId: 'admin', scope: { kind: 'domains', domains: ['sales'] } }] },
    { roles: [{ ...config.roles[0], id: 'admin' }] },
    { roles: [{ ...config.roles[0], permissions: [{ actions: ['admin'] }] }] },
    { rules: [{ id: 'invalid', enabled: true, text: 'not Cedar' }] },
  ];
  for (const proposal of proposals) {
    const response = await fixture.request('/api/admin/policies/dry-run', 'POST', proposal);
    expect(response.status).toBe(400);
  }
  expect(await fixture.repository.history()).toHaveLength(1);
}, 30000);

test('preview cannot activate a different proposal; rollback restores decisions in a new commit', async () => {
  using fixture = await adminFixture();
  const baseVersion = await fixture.repository.version();
  const grants = fixture.repository.load().grants;
  const changed = grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants: changed })).json();
  expect((await fixture.request('/api/admin/grants', 'PUT', { grants, baseVersion, dryRunId })).status).toBe(400);
  const saved = await fixture.request('/api/admin/grants', 'PUT', {
    grants: changed,
    baseVersion,
    dryRunId,
  });
  expect(saved.status).toBe(200);
  expect(fixture.access.principalFor(person('hank')).grants).toHaveLength(0);
  const review = await fixture.request('/api/admin/policies/dry-run', 'POST', {
    rollbackTo: baseVersion,
  });
  const rollback = await fixture.request(`/api/admin/versions/${baseVersion}/rollback`, 'POST', {
    baseVersion: (await saved.json()).version,
    dryRunId: (await review.json()).dryRunId,
  });
  expect(rollback.status).toBe(200);
  expect(fixture.access.principalFor(person('hank')).grants.length).toBeGreaterThan(0);
  expect((await rollback.json()).version).not.toBe(baseVersion);
  expect(await fixture.repository.history()).toHaveLength(3);
}, 30000);

test('Steward audit paging and both exports exclude other domains and workspace events', async () => {
  using fixture = await adminFixture();
  const { createAuditLog } = await import('../../src/server/auth/audit');
  const audit = createAuditLog({ dir: fixture.ws.layout.state + '/audit' });
  for (const project of ['sales-metrics', 'hr-people', undefined]) {
    audit.append({
      requestId: project ?? 'workspace',
      principal: { id: 'test', kind: 'person' },
      action: 'edit',
      resource: { type: 'project', project },
      decision: 'allow',
      rules: [],
    });
  }
  fixture.identify('bob');
  const response = await fixture.request('/api/audit');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.entries.map((entry: any) => entry.requestId)).toEqual(['sales-metrics']);
  for (const format of ['jsonl', 'csv']) {
    const exported = await fixture.request('/api/audit/export?format=' + format);
    expect(exported.status).toBe(200);
    const text = await exported.text();
    expect(text).toContain('sales-metrics');
    expect(text).not.toContain('hr-people');
    expect(text).not.toContain('workspace');
  }
  fixture.identify('alice');
  expect((await fixture.request('/api/audit')).status).toBe(403);
}, 30000);

test('Steward audit pages and exports omit restricted paths the Steward cannot read', async () => {
  using fixture = await adminFixture();
  const { createAuditLog } = await import('../../src/server/auth/audit');
  // Bob stays Steward of sales-contracts but is no longer listed on its restricted finance path.
  const config = structuredClone(fixture.access.snapshot().config);
  config.projects.projects['sales-contracts'].restricted[0].emails = [];
  fixture.access.reload(config);
  const audit = createAuditLog({ dir: fixture.ws.layout.state + '/audit' });
  const resources = [
    { type: 'file', project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml' },
    { type: 'file', project: 'sales-contracts', path: 'orders.odcs.yaml' },
    { type: 'project', project: 'sales-contracts' },
  ];
  for (const [index, resource] of resources.entries()) {
    audit.append({
      requestId: 'entry-' + index,
      principal: { id: 'test', kind: 'person', name: 'Opened By' },
      action: 'read',
      resource,
      decision: 'allow',
      rules: [],
    });
  }
  fixture.identify('bob');
  const body = await (await fixture.request('/api/audit')).json();
  expect(body.entries.map((entry: any) => entry.requestId).sort()).toEqual(['entry-1', 'entry-2']);
  for (const format of ['jsonl', 'csv']) {
    const text = await (await fixture.request('/api/audit/export?format=' + format)).text();
    expect(text).toContain('orders.odcs.yaml');
    expect(text).not.toContain('finance/');
  }
  fixture.identify('dave');
  const admin = await (await fixture.request('/api/audit')).json();
  expect(admin.entries.map((entry: any) => entry.requestId)).toContain('entry-0');
}, 30000);

test('custom role creation, group membership and role edits activate together on the next request', async () => {
  using fixture = await adminFixture();
  async function save(area: string, document: object) {
    const dryRun = await fixture.request('/api/admin/policies/dry-run', 'POST', document);
    expect(dryRun.status).toBe(200);
    const { dryRunId } = await dryRun.json();
    const response = await fixture.request('/api/admin/' + area, 'PUT', {
      ...document,
      dryRunId,
      baseVersion: await fixture.repository.version(),
    });
    expect(response.status).toBe(200);
  }
  const config = fixture.repository.load();
  const role = {
    id: 'r_auditor',
    name: 'Project auditor',
    description: 'Domain audit reader',
    permissions: [{ actions: ['readAudit'] }],
    createdBy: person('dave').id,
    createdAt: new Date().toISOString(),
  };
  await save('roles', { roles: [...config.roles, role] });
  await save('grants', {
    grants: [
      ...config.grants,
      {
        id: 'auditors',
        roleId: role.id,
        member: { kind: 'group', groupId: person('alice').groups[0] },
        scope: { kind: 'projects', projects: ['sales-metrics'] },
        addedBy: person('dave').id,
        addedAt: new Date().toISOString(),
      },
    ],
  });
  fixture.identify('alice');
  expect((await fixture.request('/api/audit')).status).toBe(200);
  fixture.identify('dave');
  await save('roles', {
    roles: [...config.roles, { ...role, permissions: [{ actions: ['read'] }] }],
  });
  fixture.identify('alice');
  expect((await fixture.request('/api/audit')).status).toBe(403);
  expect(await fixture.repository.history()).toHaveLength(4);
}, 30000);

test('simulator explains matching grants and preserves metric baseline forbids', async () => {
  using fixture = await adminFixture();
  const response = await fixture.request('/api/admin/check', 'POST', {
    principal: { groups: [], email: 'BOB@example.org' },
    action: 'approveMetric',
    resource: {
      type: 'file',
      project: 'sales-metrics',
      path: 'metric.yaml',
      metric: { name: 'Revenue', status: 'proposed', owner: 'bob@example.org' },
    },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.roles).toContain('steward');
  expect(body.decision.allow).toBe(false);
  expect(body.rules).toContain('F1-no-self-approval');
  expect(body.grants.some((grant: any) => grant.via === 'email')).toBe(true);
  const who = await (await fixture.request('/api/admin/who-can?project=sales-contracts')).json();
  expect(who.some((entry: any) => entry.email === 'bob@example.org')).toBe(true);
  expect(who.some((entry: any) => entry.client)).toBe(true);
}, 30000);

test('Stewards and Editors cannot open administration routes', async () => {
  using fixture = await adminFixture();
  for (const name of ['bob', 'alice', 'hank'] as const) {
    fixture.identify(name);
    for (const path of ['users', 'roles', 'grants', 'settings', 'versions']) {
      expect((await fixture.request('/api/admin/' + path)).status).toBe(403);
    }
    const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants: [] });
    expect(preview.status).toBe(403);
  }
}, 30000);

test('saving refuses invalid grants and roles before any dry run and commits nothing', async () => {
  using fixture = await adminFixture();
  const config = fixture.repository.load();
  const original = config.grants[0];
  const baseVersion = await fixture.repository.version();
  const grantProposals = [
    [{ id: 'no-member', roleId: 'viewer' }],
    [...config.grants, { ...original, id: 'duplicate' }],
    [{ ...original, roleId: 'unknown' }],
    [{ ...original, scope: { kind: 'domains', domains: ['unknown'] } }],
    [{ ...original, scope: { kind: 'projects', projects: ['unknown'] } }],
    [{ ...original, roleId: 'admin', scope: { kind: 'projects', projects: ['sales-metrics'] } }],
  ];
  for (const grants of grantProposals) {
    const response = await fixture.request('/api/admin/grants', 'PUT', { grants, baseVersion });
    expect(response.status).toBe(400);
  }
  const builtInEdit = { ...config.roles[0], id: 'viewer', name: 'Viewer' };
  const adminAction = { ...config.roles[0], permissions: [{ actions: ['admin'] }] };
  for (const role of [builtInEdit, adminAction]) {
    const response = await fixture.request('/api/admin/roles', 'PUT', {
      roles: [role],
      baseVersion,
    });
    expect(response.status).toBe(400);
  }
  expect(await fixture.repository.history()).toHaveLength(1);
}, 30000);

test('an e-mail grant gives a person without access the role at the next request', async () => {
  using fixture = await adminFixture();
  fixture.identify('erin');
  expect((await fixture.request('/api/me')).status).toBe(403);
  fixture.identify('dave');
  const noAccess = await (await fixture.request('/api/admin/users?access=none')).json();
  expect(noAccess.map((user: any) => user.id)).toContain(person('erin').id);
  expect(noAccess.every((user: any) => user.access === 'none')).toBe(true);
  const grant = {
    id: 'erin-viewer',
    roleId: 'viewer',
    member: { kind: 'email', email: 'Erin@Example.ORG' },
    scope: { kind: 'domains', domains: ['sales'] },
    addedBy: person('dave').id,
    addedAt: new Date().toISOString(),
  };
  const grants = [...fixture.repository.load().grants, grant];
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants })).json();
  const baseVersion = await fixture.repository.version();
  const saved = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    baseVersion,
    dryRunId,
  });
  expect(saved.status).toBe(200);
  const [latest] = await fixture.repository.history();
  expect(latest.message).toBe('grants: Add grant erin-viewer (viewer to erin@example.org)');
  fixture.identify('erin');
  const me = await (await fixture.request('/api/me')).json();
  expect(me.roles.projects['sales-metrics']).toEqual(['viewer']);
}, 30000);

test('users list agent clients, search by name and Steward audit capability', async () => {
  using fixture = await adminFixture();
  const users = await (await fixture.request('/api/admin/users')).json();
  const client = users.find((user: any) => user.id === 'client:sw-agent');
  expect(client).toMatchObject({ kind: 'client', name: 'Sales agent', access: 'granted' });
  const found = await (await fixture.request('/api/admin/users?q=HANK')).json();
  expect(found.map((user: any) => user.id)).toEqual([person('hank').id]);
  fixture.identify('bob');
  expect((await (await fixture.request('/api/me')).json()).can.audit).toBe(true);
  fixture.identify('alice');
  expect((await (await fixture.request('/api/me')).json()).can.audit).toBe(false);
}, 30000);

test('version history filters by area, including the policies folder, and diffs a version', async () => {
  using fixture = await adminFixture();
  const rules = [
    {
      id: 'no-friday-push',
      enabled: true,
      text: 'forbid(principal, action == SW::Action::"push", resource) when { context.hour == 3 };',
    },
  ];
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { rules })).json();
  const saved = await fixture.request('/api/admin/policies', 'PUT', {
    rules,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  expect(saved.status).toBe(200);
  const { version } = await saved.json();
  const policies = await (await fixture.request('/api/admin/versions?area=policies')).json();
  expect(policies.map((entry: any) => entry.version)).toEqual([version]);
  expect(policies[0].message).toBe('policies: Add rule no-friday-push');
  const grants = await (await fixture.request('/api/admin/versions?area=grants')).json();
  expect(grants.map((entry: any) => entry.version)).not.toContain(version);
  const diff = await (await fixture.request(`/api/admin/versions/${version}/diff`)).json();
  expect(Object.keys(diff)).toEqual(['policies/no-friday-push.cedar']);
}, 30000);

test('narrowing the only Admin grant is refused with the last-Admin message', async () => {
  using fixture = await adminFixture();
  const grants = fixture.repository.load().grants.map(grant => (grant.roleId === 'admin' ? { ...grant, member: { kind: 'group', groupId: 'nobody-signs-in-with-this-group' } } : grant));
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants })).json();
  const response = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ error: 'last-admin', bootstrap: false });
  expect(body.message).toContain('last active Admin');
  expect(await fixture.repository.history()).toHaveLength(1);
}, 30000);

test('a bootstrap Admin is shown, cannot be deactivated and keeps recovery possible', async () => {
  using fixture = await adminFixture({}, { ids: [], emails: ['erin@example.org'] });
  const users = await (await fixture.request('/api/admin/users')).json();
  expect(users.find((user: any) => user.id === person('erin').id).bootstrap).toBe(true);
  const deactivate = await fixture.request('/api/admin/users/' + encodeURIComponent(person('erin').id) + '/deactivate', 'POST', { reason: 'Leaving' });
  expect(deactivate.status).toBe(400);
  expect((await deactivate.json()).error).toBe('bootstrap-admin');
  const grants = fixture.repository.load().grants.filter(grant => grant.roleId !== 'admin');
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants })).json();
  const saved = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  expect(saved.status).toBe(200);
}, 30000);

test('users show role sources in the /api/me shape, with the group name when known', async () => {
  const groupName = async (id: string) => ({ id, displayName: 'Group ' + id, resolved: true });
  using fixture = await adminFixture({ groupName });
  const users = await (await fixture.request('/api/admin/users')).json();
  const sources = users.flatMap((user: any) => user.roleSources);
  const viaGroup = sources.find((source: any) => source.via === 'group');
  expect(viaGroup.group).toEqual({ id: viaGroup.group.id, name: 'Group ' + viaGroup.group.id });
  expect(sources.every((source: any) => !('grantId' in source))).toBe(true);
}, 30000);

test('a document is proposed without the version it was read with, which is the baseVersion', async () => {
  using fixture = await adminFixture();
  const read = await (await fixture.request('/api/admin/projects')).json();
  expect(read.version).toBe(await fixture.repository.version());
  const withVersion = await fixture.request('/api/admin/policies/dry-run', 'POST', read);
  expect(withVersion.status).toBe(400);
  const { version, ...document } = read;
  const review = await fixture.request('/api/admin/policies/dry-run', 'POST', document);
  expect(review.status).toBe(200);
  const { dryRunId } = await review.json();
  const saved = await fixture.request('/api/admin/projects', 'PUT', {
    ...document,
    baseVersion: version,
    dryRunId,
  });
  expect(saved.status).toBe(200);
}, 30000);

/** Previews a proposal and saves it with the receipt, returning the save response. */
async function reviewAndSave(fixture: Awaited<ReturnType<typeof adminFixture>>, area: string, document: object) {
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', document);
  const { dryRunId } = await preview.json();
  return fixture.request('/api/admin/' + area, 'PUT', {
    ...document,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
}

test('rules that could forbid the admin action are refused by validation, dry run and save', async () => {
  using fixture = await adminFixture();
  const refused = [
    'forbid(principal, action == SW::Action::"admin", resource);',
    'forbid(principal in SW::RoleHolder::"admin@workspace", action, resource) when { true };',
    'forbid(principal, action, resource) when { context.hour == 3 };',
    'forbid(principal, action in [SW::Action::"edit", SW::Action::"admin"], resource)\n' + 'unless { [9, 10].contains(context.hour) };',
    'forbid(principal, action in [SW::Action::"admin"], resource)\n' + 'unless { context.sourceIp.isInRange(ip("10.0.0.0/8")) };',
    'forbid(principal, action in SW::Action::"admin", resource);',
  ];
  const baseVersion = await fixture.repository.version();
  for (const text of refused) {
    const rules = [{ id: 'lockout', enabled: true, text }];
    const validation = await fixture.request('/api/admin/policies/validate', 'POST', { rules });
    expect((await validation.json()).ok).toBe(false);
    const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { rules });
    expect(preview.status).toBe(400);
    const saved = await fixture.request('/api/admin/policies', 'PUT', {
      rules,
      baseVersion,
      dryRunId: 'any',
    });
    expect(saved.status).toBe(400);
  }
  expect(await fixture.repository.history()).toHaveLength(1);
}, 30000);

test('the template route returns the server-generated rule and refuses invalid parameters', async () => {
  using fixture = await adminFixture();
  const template = { template: 'time', id: 'night', actions: ['push'], hours: [22, 23, 0] };
  const response = await fixture.request('/api/admin/policies/template', 'POST', template);
  expect(response.status).toBe(200);
  const rule = await response.json();
  expect(rule).toMatchObject({ id: 'night', enabled: true, template: 'time' });
  expect(rule.text).toContain('[0,22,23].contains(context.hour)');
  const invalid = [
    { ...template, hours: [24] },
    { ...template, hours: [] },
    { ...template, actions: ['admin'] },
    { ...template, actions: ['unknown'] },
    { template: 'network', id: 'net', actions: ['push'], ranges: ['10.0.0.0/33'] },
    { template: 'network', id: 'net', actions: ['push'], ranges: [] },
    { template: 'metric-ownership', id: 'owners', domain: 'sales', groups: [] },
    { template: 'unknown', id: 'x' },
  ];
  for (const body of invalid) {
    const refused = await fixture.request('/api/admin/policies/template', 'POST', body);
    expect(refused.status).toBe(400);
  }
  fixture.identify('bob');
  expect((await fixture.request('/api/admin/policies/template', 'POST', template)).status).toBe(403);
}, 30000);

test('a rollback is previewed, lists people it reactivates and needs the matching receipt', async () => {
  using fixture = await adminFixture();
  const original = await fixture.repository.version();
  const alice = person('alice');
  const deactivated = await fixture.request('/api/admin/users/' + encodeURIComponent(alice.id) + '/deactivate', 'POST', { reason: 'Leaving' });
  expect(deactivated.status).toBe(200);
  const current = (await deactivated.json()).version;
  const unreviewed = await fixture.request(`/api/admin/versions/${original}/rollback`, 'POST', {
    baseVersion: current,
  });
  expect(unreviewed.status).toBe(400);
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', {
    rollbackTo: original,
  });
  expect(preview.status).toBe(200);
  const review = await preview.json();
  const reactivated = review.people.filter((entry: any) => entry.principal === alice.id);
  expect(reactivated.length).toBeGreaterThan(0);
  expect(reactivated.every((entry: any) => entry.name === alice.name)).toBe(true);
  expect(reactivated.some((entry: any) => entry.access === 'gained')).toBe(true);
  const other = await fixture.request('/api/admin/policies/dry-run', 'POST', {
    grants: fixture.repository.load().grants.slice(1),
  });
  const mismatch = await fixture.request(`/api/admin/versions/${original}/rollback`, 'POST', {
    baseVersion: current,
    dryRunId: (await other.json()).dryRunId,
  });
  expect(mismatch.status).toBe(400);
  const rollback = await fixture.request(`/api/admin/versions/${original}/rollback`, 'POST', {
    baseVersion: current,
    dryRunId: review.dryRunId,
  });
  expect(rollback.status).toBe(200);
  expect(fixture.repository.load().deactivated.principals).toEqual([]);
  expect(await fixture.repository.history()).toHaveLength(3);
}, 30000);

test('dry-run people carry the display name the panel shows', async () => {
  using fixture = await adminFixture();
  const grants = fixture.repository.load().grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants });
  const { people } = await preview.json();
  expect(people.length).toBeGreaterThan(0);
  for (const entry of people) {
    expect(entry).toMatchObject({ principal: person('hank').id, name: person('hank').name });
  }
}, 30000);

test('group names are looked up before the save waits for other administration changes', async () => {
  let release = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let lookups = 0;
  const groupName = async (id: string) => {
    lookups++;
    await gate;
    return { id, displayName: 'Group ' + id, resolved: true };
  };
  using fixture = await adminFixture({ groupName });
  const grants = [
    ...fixture.repository.load().grants,
    {
      id: 'g_new_group',
      roleId: 'viewer',
      member: { kind: 'group', groupId: 'new-group' },
      scope: { kind: 'workspace' },
      addedBy: person('dave').id,
      addedAt: new Date().toISOString(),
    },
  ];
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants });
  const { dryRunId } = await preview.json();
  const saving = fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  // A second change is previewed while the first save still waits for the directory.
  const other = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants });
  expect(other.status).toBe(200);
  expect(lookups).toBeGreaterThan(0);
  release();
  expect((await saving).status).toBe(200);
  const stored = fixture.repository.load().grants.find(grant => grant.id === 'g_new_group');
  expect(stored?.member).toMatchObject({ kind: 'group', displayName: 'Group new-group' });
}, 30000);

test('audit queries read the current month by default and only the months in range', async () => {
  using fixture = await adminFixture();
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dir = fixture.ws.layout.state + '/audit';
  mkdirSync(dir, { recursive: true });
  const old = {
    type: 'audit',
    at: '2020-01-15T00:00:00.000Z',
    prev: '',
    requestId: 'old-request',
    principal: { id: 'test', kind: 'person' },
    action: 'edit',
    resource: { type: 'workspace' },
    decision: 'allow',
    rules: [],
  };
  writeFileSync(dir + '/2020-01.jsonl', JSON.stringify(old) + '\n');
  // A month outside every query below is unreadable, so reading it would fail the request.
  writeFileSync(dir + '/2019-06.jsonl', 'not json\n');
  const current = await (await fixture.request('/api/audit')).json();
  expect(current.entries.some((entry: any) => entry.requestId === 'old-request')).toBe(false);
  const range = '/api/audit?from=2020-01-01T00:00:00Z&to=2020-01-31T00:00:00Z';
  const older = await fixture.request(range);
  expect(older.status).toBe(200);
  expect((await older.json()).entries.map((entry: any) => entry.requestId)).toEqual(['old-request']);
}, 30000);

test('a failed adminChange audit write is logged with the request id and the new version', async () => {
  const { createAuditLog } = await import('../../src/server/auth/audit');
  const { tempDataDir } = await import('../helpers/temp-data-dir');
  const dir = tempDataDir();
  const working = createAuditLog({ dir: dir.root });
  const audit = {
    ...working,
    append: (entry: Parameters<typeof working.append>[0]) => {
      if (entry.action === 'adminChange') throw new Error('disk full');
      return working.append(entry);
    },
  };
  using fixture = await adminFixture({ audit });
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    const grants = fixture.repository.load().grants.slice(0, -1);
    const saved = await reviewAndSave(fixture, 'grants', { grants });
    expect(saved.status).toBe(200);
    const { version } = await saved.json();
    const failure = lines.map(line => JSON.parse(line)).find(line => line.action === 'adminChange');
    expect(failure).toMatchObject({
      type: 'audit-failure',
      requestId: saved.headers.get('X-Request-Id'),
      version,
      reason: 'disk full',
    });
  } finally {
    console.error = original;
    dir.cleanup();
  }
}, 30000);

test('a failed administration setup is retried by the next request', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const repository = openAdminRepository({ root: fixture.root });
  const ensure = repository.ensure;
  let failures = 1;
  repository.ensure = async () => {
    if (failures-- > 0) throw new Error('administration folder unavailable');
    return ensure();
  };
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    administration: repository,
    principal: () => access.principalFor(person('dave')),
  });
  const request = () =>
    handler(
      new Request('http://localhost/api/admin/grants', {
        headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
      }),
    );
  expect((await request()).status).not.toBe(200);
  expect((await request()).status).toBe(200);
}, 30000);

test('a dry run taken before another save cannot activate its proposal', async () => {
  using fixture = await adminFixture();
  const settings = await (await fixture.request('/api/admin/settings')).json();
  const { version: settingsVersion, ...document } = settings;
  async function saveSettings(baseVersion: string): Promise<string> {
    const saved = await fixture.request('/api/admin/settings', 'PUT', {
      ...document,
      baseVersion,
    });
    expect(saved.status).toBe(200);
    return (await saved.json()).version;
  }
  // The second settings save commits the same files again, so the grants proposal is unchanged;
  // the receipt is still refused because another save happened after its dry run.
  const first = await saveSettings(settingsVersion);
  const grants = fixture.repository.load().grants.slice(1);
  const preview = await fixture.request('/api/admin/policies/dry-run', 'POST', { grants });
  expect(preview.status).toBe(200);
  const { dryRunId } = await preview.json();
  const version = await saveSettings(first);
  expect(version).not.toBe(first);
  const stale = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: version,
  });
  expect(stale.status).toBe(400);
  expect((await stale.json()).error).toBe('A matching dry run is required.');
}, 30000);

test('a Steward allowed to read audit records is audited with the rule that let them in', async () => {
  const { createAuditLog } = await import('../../src/server/auth/audit');
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: fixture.ws.layout.state + '/audit' });
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: 'http://localhost',
    access,
    audit,
    principal: () => access.principalFor(person('bob')),
  });
  const response = await handler(
    new Request('http://localhost/api/audit', {
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
    }),
  );
  expect(response.status).toBe(200);
  const month = new Date().toISOString().slice(0, 7);
  const record = audit.entries(month).find(entry => entry.action === 'readAudit');
  expect(record?.decision).toBe('allow');
  expect(record?.rules).toEqual(['steward-audit']);
}, 30000);

test('the last-Admin refusal reads as a sentence without the internal area name', async () => {
  using fixture = await adminFixture();
  const grants = fixture.repository.load().grants.map(grant => (grant.roleId === 'admin' ? { ...grant, member: { kind: 'group', groupId: 'nobody-signs-in-with-this-group' } } : grant));
  const { dryRunId } = await (await fixture.request('/api/admin/policies/dry-run', 'POST', { grants })).json();
  const response = await fixture.request('/api/admin/grants', 'PUT', {
    grants,
    dryRunId,
    baseVersion: await fixture.repository.version(),
  });
  const body = await response.json();
  expect(body.message).toBe('This change would remove the last active Admin.');
}, 30000);
