// Working on a proposal and contributing to it. A person works on a private contribution branch of
// their own working copy; contributing moves the proposal's ref to that branch's head only when the
// proposal is still where the person last saw it, and only for files in the declared projects.
import { contributionBranch } from '../../shared/proposals/contribution-branch';
import { judgeScope } from '../../shared/proposals/contribution-scope';
import type { ProposalRecord, ProposalView } from '../../shared/proposals/proposal';
import { BadRequestError, ProposalRefusalError } from './errors';
import { commitOf, symbolicBranch } from './git';
import type { Mutation, ProposalCaller, ProposalContext } from './proposal-context';
import { describeProposal, readRepositoryRefs } from './proposal-views';

/** The branch and head the person's copy had when they last looked. */
export type CopyPosition = { expectedBranch: unknown; expectedHead: unknown };

/** The proposal tip and contribution branch head the person reviewed. */
export type ContributionRequest = { expectedTip: unknown; branchHead: unknown };

const nonEmpty = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value) throw new BadRequestError(`${name} is required.`);
  return value;
};

/** Creates the operations that put a person's work on a proposal. */
export function createContributions(context: ProposalContext) {
  const { deps } = context;
  const { git, refs, store, worktrees } = deps;

  // The contribution branch only exists for someone with a working copy, named for them and the proposal.
  function branchFor(caller: ProposalCaller, record: ProposalRecord) {
    const owner = deps.ownerOf(caller.reader);
    if (!owner) throw new BadRequestError('Working on a proposal needs your own working copy of the repository.');
    return { owner, branch: contributionBranch(owner.handle, record.id) };
  }

  // Refuses when the copy is not where the person last saw it, so no one else's work is swept in.
  async function assertPosition(copyDirectory: string, position: CopyPosition) {
    const branch = await symbolicBranch(git, copyDirectory);
    const head = await git.head(copyDirectory);
    if (branch !== nonEmpty(position.expectedBranch, 'expectedBranch') || head !== nonEmpty(position.expectedHead, 'expectedHead')) {
      throw new ProposalRefusalError('wrong-branch', 'Your working copy changed since you looked. Reload it and try again.');
    }
    return { branch, head };
  }

  async function work(slug: string, id: string, position: CopyPosition, caller: ProposalCaller): Promise<Mutation<{ branch: string; head: string | null }>> {
    const { repository, record } = context.find(slug, id, caller);
    const tip = await context.openTip(repository, record);
    caller.authority.check('work', await context.facts(repository, record));
    const { owner, branch } = branchFor(caller, record);
    const copyDirectory = worktrees.copyDir(owner.key, repository);
    // A person's first copy starts at the published tip, so there is no earlier position to compare.
    const hadCopy = worktrees.exists(owner.key, repository);
    const scm = await deps.scmFor(slug, caller.reader);
    const current = hadCopy ? await assertPosition(copyDirectory, position) : { branch: await symbolicBranch(git, copyDirectory), head: await git.head(copyDirectory) };
    const baseDirectory = worktrees.baseDir(repository);
    const created = await deps.serialized(repository, async () => {
      if (await commitOf(git, baseDirectory, `refs/heads/${branch}`)) return false;
      await git.run(baseDirectory, ['branch', '--no-track', branch, tip]);
      return true;
    });
    try {
      if (current.branch !== branch) await scm.switchBranch(slug, branch, false, caller.reader, local => caller.authority.checkout(local));
    } catch (error) {
      // A refused switch leaves no new branch behind.
      if (created) await git.run(baseDirectory, ['branch', '-D', '--', branch]);
      throw error;
    }
    return { result: { branch, head: await git.head(copyDirectory) }, audit: context.audit(record, [tip]) };
  }

  async function synchronize(slug: string, id: string, position: CopyPosition, caller: ProposalCaller): Promise<Mutation<{ merged: boolean; head: string | null; conflicted: string[] }>> {
    const { repository, record } = context.find(slug, id, caller);
    const tip = await context.openTip(repository, record);
    caller.authority.check('synchronize', await context.facts(repository, record));
    const { owner, branch } = branchFor(caller, record);
    const copyDirectory = worktrees.copyDir(owner.key, repository);
    if (!worktrees.exists(owner.key, repository)) throw new ProposalRefusalError('work-first', 'Work on this proposal first.');
    const current = await assertPosition(copyDirectory, position);
    if (current.branch !== branch) throw new ProposalRefusalError('work-first', 'Work on this proposal first, then synchronize it.');
    const scm = await deps.scmFor(slug, caller.reader);
    const merged = await scm.mergeCommit(slug, caller.reader, { tip, label: `proposal ${id}` });
    return { result: { merged: merged.ok, head: await git.head(copyDirectory), conflicted: merged.conflicted }, audit: context.audit(record, [tip]) };
  }

  // Names only projects the contributor may read; anything else stays unnamed so a refusal reveals nothing.
  function outsideRefusal(caller: ProposalCaller, outside: string[], projectless: boolean) {
    const named = [...new Set(outside)].filter(project => context.canRead(caller.reader, project)).map(project => deps.projectName(project));
    const where = named.length ? ` in ${named.join(', ')}` : '';
    const loose = projectless ? ' It also changes files that belong to no project.' : '';
    return new ProposalRefusalError(
      'outside-declared-projects',
      `This contribution changes files${where} that this proposal does not declare. Remove those changes or start a proposal that declares them.${loose}`,
      403,
    );
  }

  async function contribute(slug: string, id: string, request: ContributionRequest, caller: ProposalCaller): Promise<Mutation<ProposalView>> {
    const expectedTip = nonEmpty(request.expectedTip, 'expectedTip');
    const branchHead = nonEmpty(request.branchHead, 'branchHead');
    const { repository, record } = context.find(slug, id, caller);
    await context.openTip(repository, record);
    caller.authority.check('contribute', await context.facts(repository, record));
    const { branch } = branchFor(caller, record);
    const head = await commitOf(git, worktrees.baseDir(repository), `refs/heads/${branch}`);
    if (!head) throw new ProposalRefusalError('work-first', 'Work on this proposal first.');
    // Only this proposal's own contribution branch is read, so another personal branch never moves it.
    if (head !== branchHead) throw new ProposalRefusalError('wrong-branch', 'Your contribution branch changed since you looked. Reload it and try again.');
    return deps.serialized(repository, async () => {
      const current = store.read(repository).find(candidate => candidate.id === id)!;
      const tip = await context.openTip(repository, current);
      if (tip !== expectedTip) throw new ProposalRefusalError('stale-tip', 'Someone else changed this proposal. Synchronize it and review it again.');
      const directory = worktrees.baseDir(repository);
      if (!(await git.isAncestor(directory, tip, head))) throw new ProposalRefusalError('not-descendant', 'Your contribution branch does not contain the proposal. Synchronize it first.');
      if (head === tip) throw new ProposalRefusalError('nothing-to-contribute', 'Your contribution branch has nothing the proposal lacks.');
      const changed = await refs.changedPaths(repository, tip, head);
      const scope = judgeScope(changed, context.folders(repository), current.projects);
      if (scope.outside.length || scope.projectless.length)
        throw outsideRefusal(
          caller,
          scope.outside.map(file => file.project),
          scope.projectless.length > 0,
        );
      caller.authority.files(scope.inside.map(file => ({ project: file.project, path: file.path })));
      const paths = changed.map(change => change.path);
      caller.reader.guard?.(await deps.changes(slug, tip, head, paths), { operation: 'contribute' });
      if (!(await refs.moveRef(repository, id, tip, head))) throw new ProposalRefusalError('stale-tip', 'Someone else changed this proposal. Synchronize it and review it again.');
      const actor = context.actorOf(caller.reader);
      const contributors = [...current.contributors.filter(person => person.id !== actor.id), { id: actor.id, name: actor.name, at: context.timestamp() }];
      const updated = { ...current, contributors };
      store.write(
        repository,
        store.read(repository).map(candidate => (candidate.id === id ? updated : candidate)),
      );
      context.notify('contributed', repository, updated);
      const view = await describeProposal(context, caller, repository, updated, await readRepositoryRefs(context, repository));
      return { result: view, audit: context.audit(updated, [tip, head]) };
    });
  }

  return { work, synchronize, contribute };
}
