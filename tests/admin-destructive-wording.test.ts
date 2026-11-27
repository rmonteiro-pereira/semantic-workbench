// Destructive Admin confirmations name what is removed and what the person loses.
import { expect, test } from 'bun:test';
import { removalTitle } from '../src/app/admin/change-review';
import { projectRemovals } from '../src/app/admin/ProjectAccessSection';
import { userOperationEffect } from '../src/app/admin/UsersSection';
import { originWords } from '../src/app/auth/AgentConnectionsDialog';
import type { ProjectsConfig } from '../src/app/admin/types';

test('project access names the domains and restricted paths a draft removes', () => {
  const before = {
    domains: [
      { id: 'sales', name: 'Sales' },
      { id: 'hr', name: 'People' },
    ],
    projects: { contracts: { stewards: [], protectedBranches: [], restricted: [{ pattern: 'private/**', groups: [], emails: [] }] } },
  } as unknown as ProjectsConfig;
  const after = { ...before, domains: [before.domains[0]], projects: { contracts: { ...before.projects.contracts, restricted: [] } } } as ProjectsConfig;
  expect(projectRemovals(before, after)).toEqual({ domains: ['domain People'], restrictions: ['restriction private/** on contracts'] });
  expect(projectRemovals(before, before)).toEqual({ domains: [], restrictions: [] });
});

test('a removal keeps a short title and leaves the long names to the dialog body', () => {
  expect(removalTitle({ domain: 0, restriction: 1 })).toBe('Remove a restriction');
  expect(removalTitle({ domain: 0, restriction: 2 })).toBe('Remove 2 restrictions');
  expect(removalTitle({ domain: 1, restriction: 0 })).toBe('Remove a domain');
  expect(removalTitle({ domain: 1, restriction: 1 })).toBe('Remove domains and restrictions');
  expect(removalTitle({ domain: 0, restriction: 0 })).toBeUndefined();
  expect(removalTitle({ program: 1 })).toBe('Remove a program');
});

test('deactivating, reactivating and ending sessions each say what happens to the person', () => {
  expect(userOperationEffect('Alice Andrade', 'deactivate')).toBe('Alice Andrade will no longer be able to sign in, and their open sessions end.');
  expect(userOperationEffect('Alice Andrade', 'reactivate')).toContain('able to sign in again');
  expect(userOperationEffect('Alice Andrade', 'sessions')).toContain('signed out everywhere');
});

test('a connection says how it reached the workbench in words', () => {
  expect(originWords('mcp')).toBe('the MCP server');
  expect(originWords('acp')).toBe('the agent panel');
});
