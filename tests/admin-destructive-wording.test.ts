// Destructive Admin confirmations name what is removed and what the person loses.
import { expect, test } from 'bun:test';
import { changeDescription, lowerFirst } from '../src/app/admin/change-review';
import { projectRemovals } from '../src/app/admin/ProjectAccessSection';
import { userOperationEffect } from '../src/app/admin/UsersSection';
import { originWords } from '../src/app/auth/AgentConnectionsDialog';
import type { ProjectsConfig } from '../src/app/admin/types';

test('a save that removes something says so in its name', () => {
  expect(changeDescription('Save agent programs', [])).toBe('Save agent programs');
  expect(changeDescription('Save agent programs', ['Catalog sync'])).toBe('Save agent programs and remove Catalog sync');
  expect(`Confirm ${lowerFirst(changeDescription('Save agent programs', ['Catalog sync']))}`).toBe('Confirm save agent programs and remove Catalog sync');
});

test('project access names the domains and restricted paths a draft removes', () => {
  const before = {
    domains: [
      { id: 'sales', name: 'Sales' },
      { id: 'hr', name: 'People' },
    ],
    projects: { contracts: { stewards: [], protectedBranches: [], restricted: [{ pattern: 'private/**', groups: [], emails: [] }] } },
  } as unknown as ProjectsConfig;
  const after = { ...before, domains: [before.domains[0]], projects: { contracts: { ...before.projects.contracts, restricted: [] } } } as ProjectsConfig;
  expect(projectRemovals(before, after)).toEqual(['domain People', 'restriction private/** on contracts']);
  expect(projectRemovals(before, before)).toEqual([]);
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
