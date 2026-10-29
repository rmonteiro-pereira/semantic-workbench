// Verifies proposal binding and decision deltas independently of HTTP and persistence.
import { expect, test } from 'bun:test';
import { compareAccess } from '../../src/server/auth/dry-run';
import { accessFixture, person } from './access-fixture';

test('grant removal reports exactly the changed people and project actions', () => {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.grants = next.grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
  const result = compareAccess(options, next, {
    users: [person('hank'), person('dave')],
    audit: [],
  });
  expect(result.matrixCases).toBeGreaterThan(0);
  expect(result.people.length).toBeGreaterThan(0);
  expect(result.people.every(entry => entry.principal === person('hank').id)).toBe(true);
  expect(result.people.some(entry => entry.lost.includes('read'))).toBe(true);
  expect(result.auditCases).toBe(0);
}, 30000);

test('audit replay is bounded to the newest thousand snapshots including unknown people', () => {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.adminRules = {
    deny: '@id("deny") forbid(principal, action == SW::Action::"read", resource);',
  };
  const audit = Array.from({ length: 1005 }, (_, index) => ({
    type: 'audit' as const,
    at: '2026-10-22T00:00:00Z',
    prev: '',
    requestId: String(index),
    principal: { id: person('alice').id, kind: 'person' },
    action: 'read',
    resource: { type: 'project', project: 'sales-metrics' },
    decision: 'allow' as const,
    rules: [],
    snapshot: {
      groups: person('alice').groups,
      grants: [],
      roles: [],
      emailMatched: false,
      resourceAttrs: { type: 'project', project: 'sales-metrics' },
    },
  }));
  const result = compareAccess(options, next, { users: [], audit });
  expect(result.auditCases).toBe(1000);
  const replay = result.changed.filter(entry => /^\d+$/.test(entry.case));
  expect(replay).toHaveLength(1000);
  expect(replay[0].case).toBe('5');
}, 30000);

test('a conditional custom role edit lists exactly the lost metric approval actions', () => {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.roles[0].permissions = next.roles[0].permissions.filter(permission => !permission.actions.includes('approveMetric'));
  const result = compareAccess(options, next, {
    users: [person('hank'), person('dave')],
    audit: [],
  });
  expect(result.people).toEqual(
    ['sales-metrics', 'sales-contracts'].map(project => ({
      principal: person('hank').id,
      name: person('hank').id,
      project,
      gained: [],
      lost: ['approveMetric'],
      access: 'kept',
    })),
  );
}, 30000);

test('a new client grant lists only its newly readable project', () => {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.agents.clients.push({
    clientId: 'new-client',
    name: 'New',
    projects: ['sales-metrics'],
    domains: [],
  });
  expect(compareAccess(options, next, { users: [], audit: [] }).people).toEqual([
    {
      principal: 'client:new-client',
      name: 'client:new-client',
      project: 'sales-metrics',
      gained: ['agentRead'],
      lost: [],
      access: 'gained',
    },
  ]);
}, 30000);

test('rollback restores every shipped matrix decision through the administration service', async () => {
  const { cpSync } = await import('node:fs');
  const { tempDataDir } = await import('../helpers/temp-data-dir');
  const { openAdminRepository } = await import('../../src/server/auth/admin-repo');
  const { createAccessControl } = await import('../../src/server/auth/authorize');
  const { createAccessAdmin } = await import('../../src/server/auth/access-admin');
  const { createAuditLog } = await import('../../src/server/auth/audit');
  const dir = tempDataDir();
  try {
    cpSync('tests/fixtures/auth-workspace/admin', dir.root + '/admin', { recursive: true });
    const repository = openAdminRepository({ root: dir.root });
    await repository.ensure();
    const original = await repository.version();
    const options = { ...accessFixture(), bootstrap: { ids: ['recovery'], emails: [] } };
    const access = createAccessControl(options);
    const service = createAccessAdmin({
      repository,
      access,
      users: () => [],
      audit: createAuditLog({ dir: dir.root + '/audit' }),
    });
    const actor = access.principalFor(person('dave'));
    const rules = [
      {
        id: 'deny-edit',
        enabled: true,
        text: 'forbid(principal, action == SW::Action::"edit", resource);',
      },
    ];
    const preview = await service.dryRun({ rules });
    expect(preview.changed.length).toBeGreaterThan(0);
    const saved = await service.save('policies', { rules, baseVersion: original, dryRunId: preview.dryRunId }, { principal: actor, requestId: 'save' });
    const review = await service.dryRun({ rollbackTo: original });
    await service.rollback(original, { baseVersion: saved.version, dryRunId: review.dryRunId }, { principal: actor, requestId: 'rollback' });
    const comparison = compareAccess(options, repository.load(), { users: [], audit: [] });
    expect(comparison.matrixCases).toBeGreaterThan(500);
    expect(comparison.changed).toEqual([]);
  } finally {
    dir.cleanup();
  }
}, 30000);

test('the shipped matrix matches the route inventory it is generated from', async () => {
  const { accessMatrix } = await import('../../scripts/generate-access-matrix');
  const shipped = await Bun.file('policies/matrix-cases.json').json();
  expect(JSON.parse(JSON.stringify(accessMatrix()))).toEqual(shipped);
});

test('deleting a custom role with its grants lists exactly the people who lose it', () => {
  const options = accessFixture();
  const next = structuredClone(options.config);
  next.roles = [];
  next.grants = next.grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
  const result = compareAccess(options, next, {
    users: [person('hank'), person('dave'), person('bob')],
    audit: [],
  });
  expect(new Set(result.people.map(entry => entry.principal))).toEqual(new Set([person('hank').id]));
  for (const entry of result.people) {
    expect(entry.access).toBe('lost');
    expect(entry.gained).toEqual([]);
    expect(entry.lost).toContain('read');
  }
  expect(result.people.some(entry => entry.lost.includes('approveMetric'))).toBe(true);
}, 30000);

test('activation needs a matching dry run and a valid policy set in every area', async () => {
  const { cpSync } = await import('node:fs');
  const { tempDataDir } = await import('../helpers/temp-data-dir');
  const { openAdminRepository } = await import('../../src/server/auth/admin-repo');
  const { createAccessControl } = await import('../../src/server/auth/authorize');
  const { createAccessAdmin } = await import('../../src/server/auth/access-admin');
  const { createAuditLog } = await import('../../src/server/auth/audit');
  const dir = tempDataDir();
  try {
    cpSync('tests/fixtures/auth-workspace/admin', dir.root + '/admin', { recursive: true });
    const repository = openAdminRepository({ root: dir.root });
    await repository.ensure();
    const access = createAccessControl({
      ...accessFixture(),
      bootstrap: { ids: ['recovery'], emails: [] },
    });
    const service = createAccessAdmin({
      repository,
      access,
      users: () => [],
      audit: createAuditLog({ dir: dir.root + '/audit' }),
    });
    const actor = { principal: access.principalFor(person('dave')), requestId: 'test' };
    const baseVersion = await repository.version();
    const config = repository.load();
    const rules = [
      {
        id: 'quiet',
        enabled: true,
        text: 'forbid(principal, action == SW::Action::"push", resource);',
      },
    ];
    const proposals = [
      ['policies', { rules }],
      ['roles', { roles: [{ ...config.roles[0], description: 'Edited' }] }],
      ['grants', { grants: config.grants.slice(1) }],
      ['projects', { ...config.projects, domains: [...config.projects.domains, { id: 'ops', name: 'Ops' }] }],
      ['agents', { clients: [] }],
    ] as const;
    for (const [area, body] of proposals) {
      await expect(service.save(area, { ...body, baseVersion }, actor)).rejects.toThrow(/dry run/);
      // A preview of a different proposal cannot activate this one.
      const other = await service.dryRun({ rules: [{ ...rules[0], id: 'other' }] });
      const mismatch = { ...body, baseVersion, dryRunId: other.dryRunId };
      await expect(service.save(area, mismatch, actor)).rejects.toThrow(/dry run/);
    }
    const invalid = [{ id: 'broken', enabled: true, text: 'permit(principal, action, resource' }];
    await expect(service.save('policies', { rules: invalid, baseVersion }, actor)).rejects.toThrow('Invalid policies.');
    expect(await repository.history()).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
}, 30000);
