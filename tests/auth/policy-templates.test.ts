// Tests complete-set validation and baseline precedence for administrator-authored policies.
import { expect, test } from 'bun:test';
import { validatePolicies, policyTemplate, policyTemplateFrom, policyTexts } from '../../src/server/auth/policies';
import { accessFixture, person } from './access-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { clientPrincipal } from '../../src/server/auth/principal';

test('Git action template validates and unrestricted Admin forbids are refused', () => {
  const config = accessFixture().config;
  const rule = policyTemplate({
    template: 'git-limits',
    id: 'limit',
    role: 'editor',
    actions: ['push'],
    branch: 'main',
  });
  expect(validatePolicies([rule], config.roles).ok).toBe(true);
  expect(
    validatePolicies(
      [
        {
          id: 'lockout',
          text: 'forbid(principal in SW::RoleHolder::"admin@workspace", action, resource);',
          enabled: true,
        },
      ],
      config.roles,
    ).ok,
  ).toBe(false);
  expect(validatePolicies([{ id: 'bad', text: 'not cedar', enabled: false }], config.roles).ok).toBe(false);
});

test('an Admin permit cannot override baseline deactivation', () => {
  const options = accessFixture();
  options.config.adminRules = { broad: '@id("broad") permit(principal, action, resource);' };
  options.config.deactivated.principals.push({
    id: person('alice').id,
    by: 'dave',
    at: new Date().toISOString(),
    reason: 'disabled',
  });
  const access = createAccessControl(options);
  expect(
    access.authorize(access.principalFor(person('alice')), 'read', {
      type: 'project',
      project: 'sales-metrics',
    }).allow,
  ).toBe(false);
});

test('classification, ownership, UTC hours and source network templates validate', () => {
  const config = accessFixture().config;
  const templates = [
    { template: 'classification' as const, id: 'level', domain: 'sales', level: 2 },
    { template: 'metric-ownership' as const, id: 'owners', domain: 'sales', groups: ['approvers'] },
    { template: 'time' as const, id: 'hours', actions: ['edit' as const], hours: [9, 10] },
    {
      template: 'network' as const,
      id: 'network',
      actions: ['edit' as const],
      ranges: ['10.0.0.0/8'],
    },
  ];
  for (const input of templates) {
    const result = validatePolicies([policyTemplate(input)], config.roles);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  }
});

test('raw policy validation returns the rule and source position', () => {
  const result = validatePolicies([{ id: 'broken', enabled: true, text: '\n\nnot cedar' }], []);
  expect(result.ok).toBe(false);
  expect(result.errors[0].id).toBe('broken');
  expect(result.errors[0].line).toBe(3);
  expect(result.errors[0].column).toBeGreaterThan(1);
});

test('branch protection and agent scope templates produce ordinary versioned documents', async () => {
  const { policyDataTemplate } = await import('../../src/server/auth/policies');
  const { validateAccessDocument } = await import('../../src/server/auth/access-config');
  const config = accessFixture().config;
  const projects = policyDataTemplate(config, {
    template: 'branch-protection',
    projects: ['sales-metrics'],
    patterns: ['main', 'release/*'],
  });
  expect(() => validateAccessDocument('projectsFile', projects)).not.toThrow();
  const agents = policyDataTemplate(config, {
    template: 'agent-scope',
    clientId: 'new-agent',
    name: 'New agent',
    projects: ['sales-metrics'],
    domains: [],
  });
  expect(() => validateAccessDocument('agentsFile', agents)).not.toThrow();
});

test('an Admin permit cannot override self-approval or bearer-scope baseline forbids', () => {
  const options = accessFixture();
  options.config.adminRules = { broad: '@id("broad") permit(principal, action, resource);' };
  const access = createAccessControl(options);
  const ownMetric = {
    type: 'file' as const,
    project: 'sales-metrics',
    path: 'metric.yaml',
    metric: { name: 'Revenue', status: 'proposed', owner: 'bob@example.org' },
  };
  const selfApproval = access.authorize(access.principalFor(person('bob')), 'approveMetric', ownMetric);
  expect(selfApproval.allow).toBe(false);
  expect(selfApproval.rules).toContain('F1-no-self-approval');
  const agent = access.principalFor(clientPrincipal('sw-agent', 'Sales agent'));
  const edit = access.authorize(agent, 'edit', { type: 'project', project: 'sales-contracts' });
  expect(edit.allow).toBe(false);
});

/** Decides `push` on a project for Dave, the fixture Admin, under one generated rule. */
function pushDecision(rule: { id: string; text: string; enabled: boolean }, context: object) {
  const options = accessFixture();
  options.config.adminRules = policyTexts([rule]);
  const access = createAccessControl(options);
  const project = { type: 'project' as const, project: 'sales-metrics' };
  return access.authorize(access.principalFor(person('dave')), 'push', project, context);
}

test('git limits quote the branch pattern and refuse an injected role identifier', () => {
  const input = {
    template: 'git-limits' as const,
    id: 'limit',
    role: 'editor',
    actions: ['push' as const],
    branch: 'main"',
  };
  expect(policyTemplate(input).text).toContain('context.branch like "main\\""');
  expect(() => policyTemplate({ ...input, role: 'admin || true' })).toThrow('Invalid role.');
});

test('time windows accept hours across midnight and refuse hours outside zero to twenty-three', () => {
  const night = policyTemplate({
    template: 'time',
    id: 'night',
    actions: ['push'],
    hours: [22, 23, 0, 1],
  });
  expect(pushDecision(night, { hour: 23 }).allow).toBe(true);
  expect(pushDecision(night, { hour: 0 }).allow).toBe(true);
  const midday = pushDecision(night, { hour: 12 });
  expect(midday.allow).toBe(false);
  expect(midday.rules).toContain('night');
  for (const hours of [[], [24], [-1], [1.5]]) {
    expect(() => policyTemplate({ template: 'time', id: 't', actions: ['push'], hours })).toThrow('UTC hours');
  }
});

test('network ranges compare the ipaddr source directly and refuse malformed ranges', () => {
  const office = policyTemplate({
    template: 'network',
    id: 'office',
    actions: ['push'],
    ranges: ['10.0.0.0/8', '2001:db8::/32'],
  });
  expect(office.text).toContain('context.sourceIp.isInRange(ip("10.0.0.0/8"))');
  expect(validatePolicies([office], accessFixture().config.roles).ok).toBe(true);
  expect(pushDecision(office, { sourceIp: '10.1.2.3' }).allow).toBe(true);
  expect(pushDecision(office, { sourceIp: '2001:db8::1' }).allow).toBe(true);
  expect(pushDecision(office, { sourceIp: '192.168.1.1' }).allow).toBe(false);
  for (const ranges of [[], ['10.0.0.0/33'], ['not-an-address'], ['10.0.0.0/8/1']]) {
    expect(() => policyTemplate({ template: 'network', id: 'n', actions: ['push'], ranges })).toThrow();
  }
});

test('templates need approver groups and never restrict the admin action', () => {
  expect(() => policyTemplate({ template: 'metric-ownership', id: 'o', domain: 'sales', groups: [] })).toThrow('approver group');
  expect(() => policyTemplate({ template: 'time', id: 't', actions: ['edit', 'admin'], hours: [9] })).toThrow('admin');
  expect(() => policyTemplateFrom({ template: 'time', id: 't', actions: [], hours: [9] })).toThrow('at least one action');
  expect(policyTemplateFrom({ template: 'time', id: 't', actions: ['push'], hours: [9] })).toEqual({
    template: 'time',
    id: 't',
    actions: ['push'],
    hours: [9],
  });
});
