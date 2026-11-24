// Checks which authority each proposal operation needs, for built-in and custom roles, with no
// new permission: contributing is a commit on the proposal branch, promoting is publishing.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { authorizeProposal, proposalRequirements, type ProposalAccessInput, type ProposalOperation } from '../../src/server/auth/proposal-access';
import { attachIdentity } from '../../src/server/auth/request-scope';
import { WriteAccessError } from '../../src/server/auth/write-access-error';
import { accessFixture, person } from './access-fixture';
import type { TestUserName } from '../helpers/auth-identities';

const input: ProposalAccessInput = {
  id: 'rename-customer',
  declaredProjects: ['sales-contracts', 'sales-metrics'],
  repositoryProjects: ['sales-contracts', 'sales-metrics'],
  defaultBranch: 'main',
};
const sharedWithHr: ProposalAccessInput = { ...input, repositoryProjects: ['sales-contracts', 'sales-metrics', 'hr-people'] };

function accessWithProposerRole() {
  const options = accessFixture();
  options.config.roles.push({
    id: 'r_proposer',
    name: 'Proposer',
    description: 'Reads and edits, and commits only on proposal branches.',
    permissions: [{ actions: ['read', 'edit'] }, { actions: ['commit', 'branch', 'pull'], conditions: { branch: 'proposal/*' } }],
    createdBy: 'bootstrap',
    createdAt: '2026-10-21T09:00:00Z',
  } as never);
  options.config.grants.push({
    id: 'g-proposer',
    roleId: 'r_proposer',
    member: { kind: 'email', email: 'gina@partner.example' },
    scope: { kind: 'domains', domains: ['sales'] },
    addedBy: 'bootstrap',
    addedAt: '2026-10-21T09:00:00Z',
  } as never);
  return createAccessControl(options);
}

function allowed(who: TestUserName | 'gina', operation: ProposalOperation, facts = input, access = createAccessControl(accessFixture())) {
  const identity = who === 'gina' ? { ...person('carol'), email: 'gina@partner.example', verifiedEmail: 'gina@partner.example', username: 'gina@partner.example', groups: [] } : person(who);
  const principal = access.principalFor(identity);
  const request = new Request('http://operation.internal/api/projects/sales-contracts/proposals');
  attachIdentity(request, { principal, origin: 'http', sourceIp: '127.0.0.1', session: null } as never, { scope: access.forRequest(principal), requestId: 'proposal-access', remote: 'local' });
  try {
    authorizeProposal(request, operation, facts);
    return true;
  } catch (error) {
    if (error instanceof WriteAccessError) return false;
    throw error;
  }
}

test('each operation names the action and the projects it needs', () => {
  const needs = (operation: ProposalOperation, facts = input) =>
    proposalRequirements(operation, facts).map(requirement => `${requirement.action}@${requirement.branch ?? '-'}:${requirement.resources.length}`);
  expect(needs('create')).toEqual(['branch@proposal/rename-customer:2', 'edit@-:2']);
  expect(needs('work')).toEqual(['branch@proposal/rename-customer:2', 'pull@proposal/rename-customer:2']);
  expect(needs('synchronize')).toEqual(['pull@proposal/rename-customer:2']);
  expect(needs('contribute')).toEqual(['commit@proposal/rename-customer:2']);
  for (const operation of ['check', 'promote', 'close', 'restore'] as const) expect(needs(operation, sharedWithHr)).toEqual(['publish@main:3']);
});

test('an Editor creates and contributes but cannot promote, check, close or restore', () => {
  for (const operation of ['create', 'work', 'synchronize', 'contribute'] as const) expect(allowed('alice', operation), operation).toBe(true);
  for (const operation of ['check', 'promote', 'close', 'restore'] as const) expect(allowed('alice', operation), operation).toBe(false);
});

test('a Steward promotes a repository whose projects it covers', () => {
  for (const operation of ['check', 'promote', 'close', 'restore'] as const) expect(allowed('bob', operation), operation).toBe(true);
});

test('a Steward limited to some projects cannot promote a repository that also holds others', () => {
  for (const operation of ['check', 'promote', 'close', 'restore'] as const) expect(allowed('bob', operation, sharedWithHr), operation).toBe(false);
  expect(allowed('dave', 'promote', sharedWithHr)).toBe(true);
});

test('a Viewer of the projects does nothing with a proposal but read it', () => {
  for (const operation of ['create', 'work', 'synchronize', 'contribute', 'promote'] as const) expect(allowed('carol', operation), operation).toBe(false);
});

test('a role limited to proposal branches contributes there and has no authority elsewhere', () => {
  const access = accessWithProposerRole();
  for (const operation of ['create', 'work', 'synchronize', 'contribute'] as const) expect(allowed('gina', operation, input, access), operation).toBe(true);
  expect(allowed('gina', 'promote', input, access)).toBe(false);
});
