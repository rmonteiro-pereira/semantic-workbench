// Runs socketless assertions against the supplied candidate module, never changing live sources.
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { tempDataDir } from '../tests/helpers/temp-data-dir';
import { accessFixture, person } from '../tests/auth/access-fixture';
import { openAdminRepository } from '../src/server/auth/admin-repo';
import { createAccessControl } from '../src/server/auth/authorize';
import { createAuditLog } from '../src/server/auth/audit';
import builtin from '../policies/builtin-roles.json';

async function proposals(candidate: any) {
  const dir = tempDataDir();
  try {
    cpSync('tests/fixtures/auth-workspace/admin', dir.root + '/admin', { recursive: true });
    const repository = openAdminRepository({ root: dir.root });
    await repository.ensure();
    const access = createAccessControl({
      ...accessFixture(),
      bootstrap: { ids: ['recovery'], emails: [] },
    });
    const service = candidate.createAccessAdmin({
      repository,
      access,
      users: () => [],
      audit: createAuditLog({ dir: dir.root + '/audit' }),
    });
    const actor = { principal: access.principalFor(person('dave')), requestId: 'test' };
    const baseVersion = await repository.version();
    const grants = repository.load().grants;
    for (const [area, body] of [
      ['grants', { grants }],
      ['roles', { roles: repository.load().roles }],
      ['policies', { rules: [] }],
    ] as const) {
      await assert.rejects(service.save(area, { ...body, baseVersion }, actor), /dry run/);
    }
    const invalid = [{ id: 'broken', enabled: true, text: 'permit(principal, action, resource' }];
    await assert.rejects(service.dryRun({ rules: invalid }), /Invalid policies/);
    const preview = await service.dryRun({ grants });
    await assert.rejects(
      service.save(
        'grants',
        {
          grants: grants.filter(grant => grant.roleId !== 'viewer'),
          baseVersion,
          dryRunId: preview.dryRunId,
        },
        actor,
      ),
      /dry run/,
    );
    const deletion = await service.dryRun({ roles: [] });
    await assert.rejects(service.save('roles', { roles: [], baseVersion, dryRunId: deletion.dryRunId }, actor));
    await service.save('roles', { roles: [], baseVersion, dryRunId: deletion.dryRunId, confirmDeleteInUse: true }, actor);
    assert(!repository.load().grants.some(grant => grant.roleId === 'r_metric_reviewer'));
  } finally {
    dir.cleanup();
  }
}

/** Executes one administration category against a dynamically imported candidate module. */
export async function adminMutationCase(candidate: any, category: string) {
  if (category === 'admin-proposals') return proposals(candidate);
  if (category === 'admin-policy-validation') {
    assert.equal(candidate.validatePolicies([{ id: 'invalid', enabled: true, text: 'not cedar' }], []).ok, false);
  }
  if (category === 'admin-builtins') {
    assert.throws(() => candidate.validateCustomRole(builtin.roles[0]));
  }
  if (category === 'admin-audit-scope') {
    const entry = { principal: { id: 'bob' }, resource: { project: 'hr-people' } };
    const readsAll = { authorize: () => ({ allow: true }) };
    const access = { scope: readsAll, projects: new Set(['sales-metrics']) };
    assert.deepEqual(candidate.queryAudit([entry], {}, access), []);
    // A Steward of the project still must not see a record of a restricted path they cannot read.
    const restricted = {
      principal: { id: 'bob' },
      resource: { type: 'file', project: 'sales-contracts', path: 'finance/plan.yaml' },
    };
    const readsNoFiles = {
      authorize: (action: string) => ({ allow: action === 'readAudit' }),
    };
    const steward = { scope: readsNoFiles, projects: new Set(['sales-contracts']) };
    assert.deepEqual(candidate.queryAudit([restricted], {}, steward), []);
  }
  if (category === 'admin-forbids') {
    const options = accessFixture();
    const access = createAccessControl(options);
    const policy = candidate.loadPolicySet({
      builtinRoles: builtin.roles,
      customRoles: options.config.roles,
      adminRules: { broad: '@id("broad") permit(principal, action, resource);' },
    });
    const evaluate = candidate.createPolicyEvaluator(policy, {
      config: options.config,
      roles: policy.roles,
      projects: options.knownProjects(),
      groupMatch: options.groupMatch,
    });
    const principal = access.principalFor(person('bob'));
    const context = { mode: 'server', branch: '', protectedBranch: false, level: 0, guardKind: '' };
    assert.equal(evaluate({ ...principal, deactivated: true }, 'read', { type: 'project', project: 'sales-metrics' }, context).allow, false);
    assert.equal(
      evaluate(
        principal,
        'approveMetric',
        {
          type: 'file',
          project: 'sales-metrics',
          path: 'metric.yaml',
          metric: { name: 'Revenue', status: 'proposed', owner: 'bob@example.org' },
        },
        context,
      ).allow,
      false,
    );
  }
}
