// Decides what authority each proposal operation needs. No new permission exists: the operations
// reuse the existing actions, with the logical branch `proposal/<id>` as the branch a role may be
// limited to, and publication authority over every project that shares the repository.
import type { Action } from '../../shared/auth/actions';
import type { OperationEffect } from './operation-inventory';
import type { ResourceRef } from './resource';
import { requireEffect } from './connection-scope';
import { authorizeWrite } from './write-access';

/** The proposal operations that need an authority decision before the service runs. */
export type ProposalOperation = 'create' | 'work' | 'synchronize' | 'contribute' | 'check' | 'promote' | 'close' | 'restore';

/** The facts a decision needs: the proposal, its declared projects and the repository's other projects. */
export type ProposalAccessInput = {
  id: string;
  declaredProjects: string[];
  repositoryProjects: string[];
  defaultBranch: string;
};

/** One action the person needs on a set of resources, on a branch when the action has one. */
export type ProposalRequirement = { action: Action; resources: ResourceRef[]; branch?: string };

const projectResources = (slugs: string[]): ResourceRef[] => slugs.map(project => ({ type: 'project', project }));

/** The logical branch name a proposal has in access decisions; it is never a Git branch. */
export const proposalBranch = (id: string) => `proposal/${id}`;

/**
 * What an operation needs. Creating, working, synchronizing and contributing act on the declared
 * projects. Checking, promoting, closing and restoring change what every project of the
 * repository publishes, so they need publication authority over all of them.
 */
export function proposalRequirements(operation: ProposalOperation, input: ProposalAccessInput): ProposalRequirement[] {
  const declared = projectResources(input.declaredProjects);
  const branch = proposalBranch(input.id);
  if (operation === 'create') {
    return [
      { action: 'branch', resources: declared, branch },
      { action: 'edit', resources: declared },
    ];
  }
  if (operation === 'work') {
    return [
      { action: 'branch', resources: declared, branch },
      { action: 'pull', resources: declared, branch },
    ];
  }
  if (operation === 'synchronize') return [{ action: 'pull', resources: declared, branch }];
  if (operation === 'contribute') return [{ action: 'commit', resources: declared, branch }];
  return [{ action: 'publish', resources: projectResources(input.repositoryProjects), branch: input.defaultBranch }];
}

const EFFECTS: Partial<Record<ProposalOperation, OperationEffect>> = {
  create: 'localWrite',
  work: 'localWrite',
  synchronize: 'localWrite',
  contribute: 'localWrite',
  promote: 'publish',
  close: 'localWrite',
  restore: 'localWrite',
};

/** Checks the connection's consent and every requirement of the operation, refusing before any change. */
export function authorizeProposal(request: Request, operation: ProposalOperation, input: ProposalAccessInput): void {
  const effect = EFFECTS[operation];
  if (effect) requireEffect(request, effect);
  for (const requirement of proposalRequirements(operation, input)) {
    authorizeWrite(request, requirement.action, requirement.resources, requirement.branch === undefined ? {} : { branch: requirement.branch });
  }
}

/** Checks that the contributor may edit each file a contribution changes, naming the owning project. */
export function authorizeContributedFiles(request: Request, files: { project: string; path: string }[]): void {
  authorizeWrite(
    request,
    'edit',
    files.map(file => ({ type: 'file' as const, project: file.project, path: file.path })),
  );
}
