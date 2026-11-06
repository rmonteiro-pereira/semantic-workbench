import { type Reader } from './reader';
import { BadRequestError } from './errors';
import { GitError, redactCredentials, remoteAddress, remoteName, type Git, type GitResult, type RemoteAddresses, type RemoteCredential } from './git';
import { sparseFolders } from './sparse-folder';
import type { ContentGuard, FileChange } from '../auth/guards';
import { asText, blockers, type CredentialFor, type FollowRequest, type FollowResult, type RemoteChoice, type RemoteRequest, type ScmContext } from './scm-context';

/** Remote actions: fetch, pull, push and sync, with the guards that check what a pull brings in. */
export function createScmRemote(ctx: ScmContext) {
  const { deps, git, dir, ownerOf, after, alteredAfter, fetchFolderContents } = ctx;
  // A project moved into a folder of a team repository has history of its own, which the team's
  // branch does not contain. While everything the project holds is inside its folder, its first
  // pull may join the two; once it holds the team's other folders the histories are related, and
  // a pull from an unrelated repository is refused as usual.
  async function unrelatedHistories(directory: string) {
    const folders = await sparseFolders(git, directory);
    if (!folders.length) return [];
    const tree = await git.run(directory, ['ls-tree', '--name-only', 'HEAD'], {
      readOnly: true,
      allowFailure: true,
    });
    const top = tree.stdout.split('\n').filter(Boolean);
    const onlyTheFolder = top.every(name => folders.some(folder => folder.split('/')[0] === name));
    return tree.code === 0 && onlyTheFolder ? ['--allow-unrelated-histories'] : [];
  }
  // The one choice of remote for fetch, pull and push: the branch's upstream, else origin, else
  // the first remote, with the addresses Git resolves for it; null without a remote.
  async function chosenRemote(directory: string, upstream: string): Promise<RemoteAddresses | null> {
    const remotes = await git.remoteAddresses(directory);
    let name = remotes.find(remote => remote.name === 'origin')?.name ?? remotes[0]?.name;
    if (upstream) name = upstream.slice(0, upstream.indexOf('/'));
    if (name === undefined) return null;
    // A remote's name comes from the repository's own configuration, so a repository registered
    // from disk could name one like an option. Only a plain name reaches the Git commands.
    remoteName(name);
    // An upstream whose remote was removed leaves no remote to use.
    return remotes.find(remote => remote.name === name) ?? null;
  }
  async function chosenRemoteAddresses(slug: string) {
    const directory = dir(slug);
    return chosenRemote(directory, (await git.status(directory)).upstream);
  }
  // Chooses the remote once for the whole request, and its credential when one is needed.
  async function chooseRemote(slug: string, credentialFor?: CredentialFor): Promise<RemoteChoice | null> {
    const chosen = await chosenRemoteAddresses(slug);
    if (!chosen) return null;
    const choice: RemoteChoice = { name: chosen.name, credential: await credentialFor?.(chosen) };
    return choice;
  }
  function chosenName(choice: RemoteChoice | null) {
    if (!choice) throw new GitError('This project has no remote. Add one under Remote first.');
    return choice.name;
  }
  // Text of a document at a revision, or null when it is absent or not directory.
  async function textAt(directory: string, rev: string | null, path: string) {
    if (!rev) return null;
    const bytes = await git.blob(directory, rev, path);
    if (!bytes) return null;
    const text = asText(bytes);
    return text.binary ? null : text.text;
  }
  // What moving from `base` to `tip` would bring into each project of the repository: every
  // file changed between them, as `base` has it and as `tip` has it.
  async function incomingChanges(slug: string, directory: string, base: string | null, tip: string): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    for (const path of await git.changedBetween(directory, base, tip)) {
      const owner = ownerOf(slug, path);
      if (!owner) continue;
      changes.push({
        project: owner.project,
        path: path.slice(owner.prefix.length),
        before: await textAt(directory, base, path),
        after: await textAt(directory, tip, path),
      });
    }
    return changes;
  }
  // A merge brings in what the tip changed since the common ancestor, so that is what is judged,
  // as if the person wrote it.
  async function guardMerge(slug: string, directory: string, tip: string, guard: ContentGuard) {
    const merged = await git.run(directory, ['merge-base', 'HEAD', tip], {
      readOnly: true,
      allowFailure: true,
    });
    const base = merged.code === 0 ? merged.stdout.trim() : null;
    guard(await incomingChanges(slug, directory, base, tip), { operation: 'pull' });
  }
  // A pull is checked before any file changes: the branch is fetched and what it would bring in
  // is judged. The checked commit is then merged instead of fetching again, so commits pushed
  // after the check stay out of this pull. A failed fetch is reported as the pull's result.
  async function guardedPull(slug: string, directory: string, source: { remote: string; branch: string; credential?: RemoteCredential }, guard: ContentGuard) {
    const refspec = 'refs/heads/' + source.branch;
    const fetched = await git.run(directory, ['fetch', '--end-of-options', source.remote, refspec], {
      remote: true,
      allowFailure: true,
      credential: source.credential,
    });
    if (fetched.code !== 0) return fetched;
    const fetchedTip = await git.run(directory, ['rev-parse', '-q', '--verify', 'FETCH_HEAD'], {
      readOnly: true,
    });
    const tip = fetchedTip.stdout.trim();
    await fetchFolderContents(directory, tip, async () => ({
      name: source.remote,
      credential: source.credential,
    }));
    await guardMerge(slug, directory, tip, guard);
    // The merge is local: filters and merge drivers it runs never see the person's token.
    return git.run(directory, ['merge', '--no-edit', ...(await unrelatedHistories(directory)), tip], {
      allowFailure: true,
    });
  }
  // Unsaved edits and uncommitted changes block a merge; conflicts and bytes rewritten by hooks
  // are reported, whichever merge runs.
  async function mergeIn(slug: string, directory: string, merge: (gitStatus: Awaited<ReturnType<Git['status']>>) => Promise<GitResult>) {
    const gitStatus = await git.status(directory);
    const blocked = blockers(deps.drafts(slug), gitStatus.entries);
    if (blocked) throw blocked;
    const before = await git.head(directory);
    const gitResult = await merge(gitStatus);
    const now = await git.status(directory);
    const conflicted = now.entries.filter(e => e.conflicted).map(e => e.path);
    const head = await git.head(directory);
    const altered = head && head !== before ? await alteredAfter(directory, await git.changedBetween(directory, before, head)) : [];
    return { ok: gitResult.code === 0, conflicted, altered, stderr: gitResult.stderr.trim() };
  }
  const pullIn = (slug: string, directory: string, { choice, guard }: RemoteRequest) =>
    mergeIn(slug, directory, async gitStatus => {
      const remote = chosenName(choice);
      const credential = choice?.credential;
      // A personal branch exists only here, so without an upstream it takes the remote's default
      // branch, which the copy started from.
      const untracked = (await deps.untrackedPull?.(slug, gitStatus.branch)) ?? gitStatus.branch;
      if (guard) {
        const branch = gitStatus.upstream ? gitStatus.upstream.slice(remote.length + 1) : untracked;
        return guardedPull(slug, directory, { remote, branch, credential }, guard);
      }
      // A full ref name, so no branch name is ever read as an option.
      const pullRefspec = gitStatus.upstream ? [] : ['--end-of-options', remote, 'refs/heads/' + untracked];
      const unrelated = await unrelatedHistories(directory);
      const pull = ['pull', '--no-rebase', '--no-edit', ...unrelated, ...pullRefspec];
      return git.run(directory, pull, { remote: true, allowFailure: true, credential });
    });
  // The published default branch follows the remote's after a fetch, and that move is judged on
  // the files it brings, so a sparse checkout downloads them first.
  async function fetchDefaultBranchContents(slug: string, directory: string, choice: RemoteChoice | null) {
    if (!deps.defaultBranch) return;
    const tip = `refs/remotes/${chosenName(choice)}/${await deps.defaultBranch(slug)}`;
    await fetchFolderContents(directory, tip, async () => choice);
  }
  // Remote actions report Git's result instead of throwing, so the panel can show stderr; Cancel
  // (or the 10-minute limit) ends them.
  async function remoteAction(slug: string, kind: 'fetch' | 'pull' | 'push' | 'sync', request: RemoteRequest) {
    const directory = dir(slug);
    const choice = request.choice;
    const credential = choice?.credential;
    try {
      let result = { ok: true, conflicted: [] as string[], altered: [] as string[], stderr: '' };
      let follow: FollowResult | null = null;
      if (kind === 'fetch') {
        const gitResult = await git.run(directory, ['fetch', '--prune', '--end-of-options', chosenName(choice)], {
          remote: true,
          allowFailure: true,
          credential,
        });
        result = { ...result, ok: gitResult.code === 0, stderr: gitResult.stderr.trim() };
        if (gitResult.code === 0 && request.follow && deps.fetched) {
          await fetchDefaultBranchContents(slug, directory, choice);
          follow = await deps.fetched(slug, chosenName(choice), request.follow);
        }
      }
      if (kind === 'pull' || kind === 'sync') {
        const gitStatus = await git.status(directory);
        if (kind === 'pull' || gitStatus.upstream) result = await pullIn(slug, directory, request);
      }
      if ((kind === 'push' || kind === 'sync') && result.ok) {
        const gitStatus = await git.status(directory);
        const gitResult = await git.run(directory, ['push', '-u', '--end-of-options', chosenName(choice), gitStatus.branch], {
          remote: true,
          allowFailure: true,
          credential,
        });
        result = {
          ...result,
          ok: gitResult.code === 0,
          stderr: [result.stderr, gitResult.stderr.trim()].filter(Boolean).join('\n'),
        };
      }
      const gitStatus = await after(slug, result.altered);
      return { ...result, ahead: gitStatus.ahead, behind: gitStatus.behind, ...(follow ? { follow } : {}) };
    } catch (error) {
      if (error instanceof GitError && error.cancelled) {
        const gitStatus = await after(slug);
        return {
          ok: false,
          cancelled: true,
          conflicted: [],
          altered: [],
          stderr: error.message,
          ahead: gitStatus.ahead,
          behind: gitStatus.behind,
        };
      }
      throw error;
    }
  }
  const actions = {
    async setRemote(slug: string, requestedName: unknown, url: unknown) {
      const name = remoteName(requestedName);
      const directory = dir(slug);
      const remotes = await git.remotes(directory);
      const current = remotes.get(name);
      // The panel shows addresses with credentials masked; saving one unchanged keeps the original.
      if (current !== undefined && typeof url === 'string' && url.trim() === redactCredentials(current)) return { name, url: url.trim() };
      const address = remoteAddress(url);
      await git.run(directory, remotes.has(name) ? ['remote', 'set-url', name, address] : ['remote', 'add', name, address]);
      await after(slug);
      return { name, url: address };
    },
    async removeRemote(slug: string, requestedName: unknown) {
      const name = remoteName(requestedName);
      const directory = dir(slug);
      if (!(await git.remotes(directory)).has(name)) throw new BadRequestError(`There is no remote named ${name}.`);
      await git.run(directory, ['remote', 'remove', name]);
      await after(slug);
      return { removed: name };
    },
    chosenRemoteAddresses,
    /** Every remote of the project's repository with its fetch and push addresses. */
    remoteAddresses: (slug: string) => git.remoteAddresses(dir(slug)),
    /**
     * Server mode: pushes the local default branch, which only publishing moves, to the remote
     * with the person's credential. Its full ref name keeps it from being read as an option.
     */
    async pushDefault(slug: string, credentialFor?: CredentialFor) {
      if (!deps.defaultBranch) throw new BadRequestError('This workspace has no default branch to push.');
      const ref = 'refs/heads/' + (await deps.defaultBranch(slug));
      const choice = await chooseRemote(slug, credentialFor);
      const pushed = await git.run(dir(slug), ['push', '--end-of-options', chosenName(choice), `${ref}:${ref}`], {
        remote: true,
        allowFailure: true,
        credential: choice?.credential,
      });
      const gitStatus = await after(slug);
      const result = { ok: pushed.code === 0, conflicted: [], altered: [] };
      return { ...result, stderr: pushed.stderr.trim(), ahead: gitStatus.ahead, behind: gitStatus.behind };
    },
    /** Fetches; `follow` lets the published default branch follow the remote in server mode. */
    fetch: async (slug: string, credentialFor?: CredentialFor, follow?: FollowRequest) => remoteAction(slug, 'fetch', { choice: await chooseRemote(slug, credentialFor), follow }),
    /**
     * Merges the default branch into the person's branch, as a pull does: the exact commit
     * merged is the one the guard judged.
     */
    async pullDefault(slug: string, { guard, copy }: Reader) {
      const merge = deps.mergeDefault;
      if (!merge) throw new BadRequestError('Pull from the default branch works on a personal working copy.');
      const directory = dir(slug);
      const check = async (tip: string) => {
        if (guard) await guardMerge(slug, directory, tip, guard);
      };
      const result = await mergeIn(slug, directory, () => merge(slug, copy?.author, check));
      const gitStatus = await after(slug, result.altered);
      return { ...result, ahead: gitStatus.ahead, behind: gitStatus.behind };
    },
    /** What moving the repository from `base` to `tip` changes, file by file, per project. */
    changesBetween: (slug: string, base: string | null, tip: string) => incomingChanges(slug, dir(slug), base, tip),
    // The reader's guard, given in server mode, refuses a pull that brings in a guarded change.
    pull: async (slug: string, reader: Reader, credentialFor?: CredentialFor) => {
      const choice = await chooseRemote(slug, credentialFor);
      return remoteAction(slug, 'pull', { choice, guard: reader.guard });
    },
    push: async (slug: string, credentialFor?: CredentialFor) => remoteAction(slug, 'push', { choice: await chooseRemote(slug, credentialFor) }),
    sync: async (slug: string, reader: Reader, credentialFor?: CredentialFor) => {
      const choice = await chooseRemote(slug, credentialFor);
      return remoteAction(slug, 'sync', { choice, guard: reader.guard });
    },
  };
  return { chosenRemote, chooseRemote, incomingChanges, remoteAction, actions };
}
/** Remote actions of Source Control. */
export type ScmRemote = ReturnType<typeof createScmRemote>;
