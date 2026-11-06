import { LOCAL_READER, type Reader } from './reader';
import { BadRequestError, MissingFolderError } from './errors';
import { isBranchName } from './git';
import { branchShownTo, branchSpelledDifferently } from './worktrees';
import { folderExistsAt } from './sparse-folder';
import type { ContentGuard } from '../auth/guards';
import { blockers, type CredentialFor, type ScmContext } from './scm-context';
import type { ScmRemote } from './scm-remote';

// The local branch name a full ref stands for: `refs/heads/x` and `refs/remotes/origin/x` are both
// `x`. Null for any other kind of ref.
function localBranchOf(ref: string): string | null {
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (!ref.startsWith('refs/remotes/')) return null;
  const remoteAndBranch = ref.slice('refs/remotes/'.length);
  return remoteAndBranch.slice(remoteAndBranch.indexOf('/') + 1);
}

/** Branch actions: listing branches and switching to or creating one. */
export function createScmBranches(ctx: ScmContext, remote: Pick<ScmRemote, 'chooseRemote' | 'incomingChanges'>) {
  const { deps, git, dir, after, alteredAfter, sparseProjectFolder, fetchFolderContents } = ctx;
  const { chooseRemote, incomingChanges } = remote;
  // The local branch a switch checks out for the name the person gave, found by asking Git what
  // the name is. `origin/x` is the remote branch whose local branch is `x`; a name that is a tag,
  // a commit, or `@{-1}` is no branch and is refused, so the name that is authorized is the name
  // that is checked out.
  async function branchTarget(directory: string, name: string, create: boolean) {
    const target = await resolvedBranch(directory, name, create);
    // A volume that ignores case keeps `Work/bob` and `work/bob` in one file, so a spelling that
    // differs only in case from an existing branch is that branch under a name no rule matches.
    const known = await git.branches(directory);
    const existing = [...known.local, ...known.remote.map(remote => remote.slice(remote.indexOf('/') + 1))];
    const clash = branchSpelledDifferently(target.local, existing);
    if (clash) throw new BadRequestError(`"${target.local}" differs only in letter case from "${clash}".`);
    return target;
  }
  // A branch without the project's folder would remove the project from the disk on a sparse
  // checkout, so the switch is refused with the reason.
  async function assertBranchHasFolder(slug: string, directory: string, tip: string, branch: string) {
    const { folder } = await sparseProjectFolder(slug, directory);
    if (folder && !(await folderExistsAt(git, directory, tip, folder))) throw new MissingFolderError(folder, branch);
  }
  async function judgeSwitch(
    slug: string,
    directory: string,
    switching: {
      tip: string;
      before: string | null;
      guard: ContentGuard;
      credentialFor?: CredentialFor;
    },
  ) {
    const { tip, before, guard, credentialFor } = switching;
    await fetchFolderContents(directory, tip, () => chooseRemote(slug, credentialFor));
    guard(await incomingChanges(slug, directory, before, tip), { operation: 'switch' });
  }
  async function resolvedBranch(directory: string, name: string, create: boolean) {
    if (create) {
      if (!(await isBranchName(git, directory, name))) throw new BadRequestError(`"${name}" is not a valid branch name.`);
      return { local: name, ref: '' };
    }
    if (name.includes('@{')) throw new BadRequestError(`"${name}" is not a valid branch name.`);
    const resolved = await git.run(directory, ['rev-parse', '--symbolic-full-name', name], {
      readOnly: true,
      allowFailure: true,
    });
    const ref = resolved.code === 0 ? resolved.stdout.trim() : '';
    const local = localBranchOf(ref);
    if (local === null) throw new BadRequestError(`"${name}" is not a branch.`);
    if (!(await isBranchName(git, directory, local))) throw new BadRequestError(`"${local}" is not a valid branch name.`);
    return { local, ref };
  }
  return {
    // Another person's personal branch is not listed for someone who may not use it. A reader
    // with no view is the local person, who sees every branch of their own repository.
    async branches(slug: string, { view }: Reader = LOCAL_READER) {
      const directory = dir(slug);
      const branches = await git.branches(directory);
      const gitStatus = await git.status(directory);
      if (!view) return { current: gitStatus.branch, ...branches };
      const own = deps.ownBranch?.() ?? null;
      return {
        current: gitStatus.branch,
        local: branches.local.filter(name => branchShownTo(name, own)),
        remote: branches.remote.filter(name => branchShownTo(name, own, true)),
      };
    },
    // The caller authorizes the branch actually checked out: `origin/x` becomes the local `x`.
    async switchBranch(slug: string, branch: unknown, create: boolean, { guard }: Reader, authorizeBranch?: (local: string) => void, credentialFor?: CredentialFor) {
      // Trimmed before any check, so a leading space cannot smuggle an option such as `--detach`.
      const name = typeof branch === 'string' ? branch.trim() : '';
      if (!name || name.startsWith('-') || name.length > 200) throw new BadRequestError('Give a branch name.');
      const directory = dir(slug);
      const { local, ref } = await branchTarget(directory, name, create);
      const gitStatus = await git.status(directory);
      const blocked = blockers(deps.drafts(slug), gitStatus.entries);
      if (blocked) throw blocked;
      authorizeBranch?.(local);
      await deps.assertBranchFree?.(slug, local);
      const before = await git.head(directory);
      // Everyone works in one tree, so the branch's content is checked as if the person wrote it.
      if (!create) {
        const exists = (await git.branches(directory)).local.includes(local);
        const tip = exists ? 'refs/heads/' + local : ref;
        await assertBranchHasFolder(slug, directory, tip, local);
        if (guard) await judgeSwitch(slug, directory, { tip, before, guard, credentialFor });
      }
      await git.run(directory, create ? ['switch', '-c', local] : ['switch', '--end-of-options', local]);
      deps.branchesMoved?.(slug);
      const head = await git.head(directory);
      const altered = head && head !== before ? await alteredAfter(directory, await git.changedBetween(directory, before, head)) : [];
      await after(slug, altered);
      return { branch: local, altered };
    },
  };
}
