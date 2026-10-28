// Connects project source control actions to Git and workspace updates. Checks after mutations
// detect bytes rewritten by hooks or filters.
import type { EventTags } from './events';
import type { AccessView } from '../auth/authorize';
import { LOCAL_READER, type Reader } from './reader';
import { BadRequestError, HiddenResourceError, MissingFolderError } from './errors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GitError,
  isBranchName,
  redactCredentials,
  remoteAddress,
  remoteName,
  type CommitAuthor,
  type Git,
  type GitResult,
  type RemoteAddresses,
  type RemoteCredential,
  type StatusEntry,
} from './git';
import { MergingError } from './errors';
import { decode, sha256 } from './atomic';
import {
  assertExactCase,
  assertNoLinks,
  projectPath,
  projectPrefix,
  repoDir,
  type DataLayout,
} from './paths';
import { serializationOf } from './scanner';
import { branchShownTo, branchSpelledDifferently } from './worktrees';
import { fetchMissingContents, folderExistsAt, sparseFolders } from './sparse-folder';
import type { ContentGuard, FileChange } from '../auth/guards';
/** Reports drafts or uncommitted changes that prevent a source control operation. */
export class BlockedError extends Error {
  constructor(
    public reason: 'drafts' | 'dirty',
    public paths: string[],
  ) {
    super(
      reason === 'drafts'
        ? 'Save or discard the unsaved edits first.'
        : 'Commit or discard the changes first; nothing is stashed automatically.',
    );
    this.name = 'BlockedError';
  }
}
/** Label for repository files omitted from the workspace view. */
export const HIDDEN_LABEL = 'not shown in workspace';
// Untracked files do not block pull or switch because Git refuses to overwrite them.
/** Returns the first draft or tracked-change blocker for pull and branch switching. */
export function blockers(drafts: string[], entries: StatusEntry[]): BlockedError | null {
  if (drafts.length) return new BlockedError('drafts', drafts);
  const dirty = entries.filter(e => !e.untracked).map(e => e.path);
  return dirty.length ? new BlockedError('dirty', dirty) : null;
}
const REV = /^(HEAD|[0-9a-f]{7,64})$/;
/** Whether request paths are relative to the project or to its repository root. */
export type PathBase = 'project' | 'repository';
/** Picks the credential for the remote a command reaches; server mode only. */
export type CredentialFor = (remote: RemoteAddresses) => Promise<RemoteCredential>;
// The remote a request uses, chosen once, with the credential for it.
type RemoteChoice = { name: string; credential?: RemoteCredential };
// A remote command's chosen remote, and the content guard that checks what a pull brings in.
type RemoteRequest = {
  choice: RemoteChoice | null;
  guard?: ContentGuard;
  /** Fetch only: who fetched, for the published default branch that may follow the remote. */
  follow?: FollowRequest;
};
/** Who fetched, and whether they hold `publish` on the repository's default branch. */
export type FollowRequest = { reader: Reader; mayPublish: () => Promise<boolean> };
/**
 * What a fetch did to the published default branch when the remote's was ahead: followed it, or
 * not, because the person may not publish or the guards refused what the remote brings.
 */
export type FollowResult = {
  branch: string;
  remote: string;
  followed: boolean;
  reason?: 'publish' | 'guard';
};
/** Workspace services needed to run Git actions and refresh project state. */
export type ScmDeps = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  drafts: (slug: string) => string[];
  rescan: (slug: string) => Promise<unknown>;
  /** The projects that share this project's repository, itself included. */
  siblings: (slug: string) => string[];
  emit: (event: string, data: unknown, tags: EventTags) => void;
  project: (slug: string) => unknown;
  /** Refuses a branch another working copy has checked out; absent in local mode. */
  assertBranchFree?: (slug: string, branch: string) => Promise<void>;
  /** The person's own `work/<handle>` branch, the only personal branch they may see or use. */
  ownBranch?: () => string | null;
  /**
   * The remote branch a pull takes into `branch` when it has no upstream: the default branch for
   * the person's own `work/<handle>` branch, null for any other branch.
   */
  untrackedPull?: (slug: string, branch: string) => Promise<string | null>;
  /** The repository's default branch, which Push <default> sends. */
  defaultBranch?: (slug: string) => Promise<string>;
  /** After a successful fetch, so the published default branch can follow the remote. */
  fetched?: (slug: string, remote: string, follow: FollowRequest) => Promise<FollowResult | null>;
  /** After a branch switch, so the record of who holds which branch is read again. */
  branchesMoved?: (slug: string) => void;
  /** Commits here carry the signed-in person, so no repository identity is needed. */
  signedCommits?: boolean;
  /**
   * Merges the default branch into a working copy's branch; absent in local mode. `check` judges
   * the exact commit before it is merged.
   */
  mergeDefault?: (
    slug: string,
    author: CommitAuthor | undefined,
    check: (tip: string) => Promise<void>,
  ) => Promise<GitResult>;
};
// The local branch name a full ref stands for: `refs/heads/x` and `refs/remotes/origin/x` are both
// `x`. Null for any other kind of ref.
function localBranchOf(ref: string): string | null {
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (!ref.startsWith('refs/remotes/')) return null;
  const remoteAndBranch = ref.slice('refs/remotes/'.length);
  return remoteAndBranch.slice(remoteAndBranch.indexOf('/') + 1);
}
/** Creates project source control operations with draft checks and workspace notifications. */
export function createScm(deps: ScmDeps) {
  const { layout, git } = deps;
  // Projects sharing a repository also share its Git queue to avoid interleaving index changes.
  // Project paths gain their repository prefix before reaching Git.
  function dir(slug: string) {
    deps.project(slug);
    if (!deps.gitAvailable)
      throw new GitError(
        'Git is not available on this machine. Install Git 2.40 or newer and restart the workbench.',
      );
    return repoDir(layout, slug);
  }
  const prefix = (slug: string) => projectPrefix(layout, slug);
  const locationRepo = (slug: string) => {
    const dir = repoDir(layout, slug);
    return dir.slice(layout.projects.length + 1);
  };
  // Paths arrive relative to the project, or relative to the repository root when the panel
  // acts on a file of a sibling project or on a file that belongs to no project.
  const paths = (slug: string, list: unknown, base: PathBase = 'project') => {
    if (!Array.isArray(list) || !list.length || list.length > 5000)
      throw new BadRequestError('Expected 1–5000 paths.');
    const pre = base === 'repository' ? '' : prefix(slug);
    const chosen = list.map(p => pre + projectPath(String(p)));
    for (const path of chosen) assertExactCase(repoDir(layout, slug), path);
    return chosen;
  };
  // Show changes across the repository; paths outside this project keep repository-relative names.
  const fromRepo = (slug: string, path: string) => {
    const pre = prefix(slug);
    return !pre
      ? { path }
      : path.startsWith(pre)
        ? { path: path.slice(pre.length) }
        : { path, outside: true };
  };
  // The project a changed file belongs to, and its path inside that project.
  const ownership = (owner: { project: string; prefix: string } | undefined, path: string) =>
    owner ? { project: owner.project, projectPath: path.slice(owner.prefix.length) } : {};
  function ownerOf(slug: string, path: string) {
    return deps
      .siblings(slug)
      .map(project => ({ project, prefix: prefix(project) }))
      .filter(owner => path.startsWith(owner.prefix))
      .sort((left, right) => right.prefix.length - left.prefix.length)[0];
  }
  function readablePath(slug: string, path: string, view: AccessView, base: PathBase = 'project') {
    const repoPath = (base === 'project' ? prefix(slug) : '') + projectPath(path);
    const owner = ownerOf(slug, repoPath)?.project;
    return Boolean(
      owner &&
      view.readableProjects.has(owner) &&
      view.canRead(owner, repoPath.slice(prefix(owner).length)),
    );
  }

  function requireReadable(slug: string, path: string, view?: AccessView, base?: PathBase) {
    const repoPath = (base === 'repository' ? '' : prefix(slug)) + projectPath(path);
    assertExactCase(repoDir(layout, slug), repoPath);
    if (view && !readablePath(slug, path, view, base)) throw new HiddenResourceError();
  }
  // Where Pull takes from when it is not the upstream, such as `origin/main` for a personal
  // branch, so the panel can name it.
  async function pullSource(
    slug: string,
    d: string,
    s: Awaited<ReturnType<Git['status']>>,
  ): Promise<{ pullSource?: string }> {
    if (s.upstream || !deps.untrackedPull) return {};
    const target = await deps.untrackedPull(slug, s.branch);
    const remote = target ? await chosenRemote(d, '') : null;
    return remote ? { pullSource: `${remote.name}/${target}` } : {};
  }
  // The folder of the repository a sparse project lives in, for the panel header and the rule
  // below; nothing when the whole repository is checked out. A project in a folder of a repository
  // that is checked out in full, as in a shared monorepo, is deliberately not limited: its
  // sibling projects are on disk and their files are committed from the same panel.
  async function sparseProjectFolder(slug: string, d: string): Promise<{ folder?: string }> {
    const folders = await sparseFolders(git, d);
    const folder = prefix(slug).replace(/\/$/, '');
    return folders.length && folder ? { folder } : {};
  }
  // Commits touch only the project's folder: a path outside it never reaches a sparse checkout's
  // commit, because the rest of the repository belongs to other people's projects.
  async function assertInsideFolder(slug: string, d: string, repoPaths: string[]) {
    const { folder } = await sparseProjectFolder(slug, d);
    if (!folder) return;
    const outside = repoPaths.filter(path => !path.startsWith(folder + '/'));
    if (outside.length)
      throw new BadRequestError(
        `Only files inside ${folder} can be committed from this project. Outside: ${outside.join(', ')}`,
      );
  }
  // A project moved into a folder of a team repository has history of its own, which the team's
  // branch does not contain. While everything the project holds is inside its folder, its first
  // pull may join the two; once it holds the team's other folders the histories are related, and
  // a pull from an unrelated repository is refused as usual.
  async function unrelatedHistories(d: string) {
    const folders = await sparseFolders(git, d);
    if (!folders.length) return [];
    const tree = await git.run(d, ['ls-tree', '--name-only', 'HEAD'], {
      readOnly: true,
      allowFailure: true,
    });
    const top = tree.stdout.split('\n').filter(Boolean);
    const onlyTheFolder = top.every(name => folders.some(folder => folder.split('/')[0] === name));
    return tree.code === 0 && onlyTheFolder ? ['--allow-unrelated-histories'] : [];
  }
  // Downloads what a judged change brings before it is read, when the repository holds only a
  // folder; a full clone has every file already.
  async function fetchFolderContents(
    d: string,
    tip: string,
    chooseRemote: () => Promise<RemoteChoice | null>,
  ) {
    const folders = await sparseFolders(git, d);
    if (!folders.length) return;
    const choice = await chooseRemote();
    if (!choice) return;
    await fetchMissingContents(git, d, {
      tip,
      folders,
      remote: choice.name,
      credential: choice.credential,
    });
  }
  async function status(slug: string, { view }: Reader) {
    if (!deps.gitAvailable)
      return {
        branch: '',
        upstream: '',
        ahead: 0,
        behind: 0,
        gitAvailable: false,
        identityConfigured: false,
        merging: false,
        hasCommits: false,
        remotes: {},
        changes: [],
      };
    const d = dir(slug);
    const s = await git.status(d);
    const merging = await git.merging(d);
    const changes = s.entries.map(e => ({
      ...e,
      ...fromRepo(slug, e.path),
      repoPath: e.path,
      ...ownership(ownerOf(slug, e.path), e.path),
      hidden: serializationOf(e.path) === 'unsupported',
      ...(serializationOf(e.path) === 'unsupported' ? { label: HIDDEN_LABEL } : {}),
    }));
    return {
      branch: s.branch,
      upstream: s.upstream,
      ...(await pullSource(slug, d, s)),
      ahead: s.ahead,
      behind: s.behind,
      gitAvailable: true,
      ...(await sparseProjectFolder(slug, d)),
      identityConfigured: deps.signedCommits || (await git.identity(d)),
      merging,
      hasCommits: s.hasCommits,
      remotes: Object.fromEntries(
        [...(await git.remotes(d))].map(([n, u]) => [n, redactCredentials(u)]),
      ),
      changes: view
        ? changes
            .filter(change => readablePath(slug, change.repoPath, view, 'repository'))
            .map(change => {
              if (!change.orig || readablePath(slug, change.orig, view, 'repository'))
                return change;
              const { orig: _original, ...visible } = change;
              return visible;
            })
        : changes,
    };
  }
  // Every Git change concerns the whole repository, so all of its projects rescan.
  async function after(slug: string, altered: string[] = []) {
    const projects = deps.siblings(slug);
    for (const project of projects) await deps.rescan(project);
    const s = await git.status(repoDir(layout, slug));
    deps.emit(
      'git',
      {
        project: slug,
        repo: locationRepo(slug),
        projects,
        branch: s.branch,
        ahead: s.ahead,
        behind: s.behind,
        changes: s.changes,
        altered,
      },
      { projects, paths: altered.map(path => ({ project: slug, path })) },
    );
    return s;
  }
  // Hooks and filters can change saved bytes even when Git reports a clean file.
  // Skip files with uncommitted edits so normal editing is not reported as a rewrite.
  async function alteredAfter(d: string, changed: string[]) {
    if (!changed.length) return [];
    const s = await git.status(d);
    const busy = new Set(
      s.entries.filter(e => e.worktree !== '.' || e.conflicted).map(e => e.path),
    );
    const candidates = changed.filter(p => !busy.has(p) && existsSync(join(d, p)));
    const [disk, tree] = await Promise.all([
      git.worktreeIds(d, candidates),
      git.treeIds(d, 'HEAD', candidates),
    ]);
    return candidates.filter(p => tree.has(p) && disk.get(p) !== tree.get(p));
  }
  // The one choice of remote for fetch, pull and push: the branch's upstream, else origin, else
  // the first remote, with the addresses Git resolves for it; null without a remote.
  async function chosenRemote(d: string, upstream: string): Promise<RemoteAddresses | null> {
    const remotes = await git.remoteAddresses(d);
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
    const d = dir(slug);
    return chosenRemote(d, (await git.status(d)).upstream);
  }
  // Chooses the remote once for the whole request, and its credential when one is needed.
  async function chooseRemote(
    slug: string,
    credentialFor?: CredentialFor,
  ): Promise<RemoteChoice | null> {
    const chosen = await chosenRemoteAddresses(slug);
    if (!chosen) return null;
    const choice: RemoteChoice = { name: chosen.name, credential: await credentialFor?.(chosen) };
    return choice;
  }
  function chosenName(choice: RemoteChoice | null) {
    if (!choice) throw new GitError('This project has no remote. Add one under Remote first.');
    return choice.name;
  }
  // Text of a document at a revision, or null when it is absent or not text.
  async function textAt(d: string, rev: string | null, path: string) {
    if (!rev) return null;
    const bytes = await git.blob(d, rev, path);
    if (!bytes) return null;
    const text = asText(bytes);
    return text.binary ? null : text.text;
  }
  // What moving from `base` to `tip` would bring into each project of the repository: every
  // file changed between them, as `base` has it and as `tip` has it.
  async function incomingChanges(
    slug: string,
    d: string,
    base: string | null,
    tip: string,
  ): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    for (const path of await git.changedBetween(d, base, tip)) {
      const owner = ownerOf(slug, path);
      if (!owner) continue;
      changes.push({
        project: owner.project,
        path: path.slice(owner.prefix.length),
        before: await textAt(d, base, path),
        after: await textAt(d, tip, path),
      });
    }
    return changes;
  }
  // A merge brings in what the tip changed since the common ancestor, so that is what is judged,
  // as if the person wrote it.
  async function guardMerge(slug: string, d: string, tip: string, guard: ContentGuard) {
    const merged = await git.run(d, ['merge-base', 'HEAD', tip], {
      readOnly: true,
      allowFailure: true,
    });
    const base = merged.code === 0 ? merged.stdout.trim() : null;
    guard(await incomingChanges(slug, d, base, tip), { operation: 'pull' });
  }
  // A pull is checked before any file changes: the branch is fetched and what it would bring in
  // is judged. The checked commit is then merged instead of fetching again, so commits pushed
  // after the check stay out of this pull. A failed fetch is reported as the pull's result.
  async function guardedPull(
    slug: string,
    d: string,
    source: { remote: string; branch: string; credential?: RemoteCredential },
    guard: ContentGuard,
  ) {
    const refspec = 'refs/heads/' + source.branch;
    const fetched = await git.run(d, ['fetch', '--end-of-options', source.remote, refspec], {
      remote: true,
      allowFailure: true,
      credential: source.credential,
    });
    if (fetched.code !== 0) return fetched;
    const fetchedTip = await git.run(d, ['rev-parse', '-q', '--verify', 'FETCH_HEAD'], {
      readOnly: true,
    });
    const tip = fetchedTip.stdout.trim();
    await fetchFolderContents(d, tip, async () => ({
      name: source.remote,
      credential: source.credential,
    }));
    await guardMerge(slug, d, tip, guard);
    // The merge is local: filters and merge drivers it runs never see the person's token.
    return git.run(d, ['merge', '--no-edit', ...(await unrelatedHistories(d)), tip], {
      allowFailure: true,
    });
  }
  // Unsaved edits and uncommitted changes block a merge; conflicts and bytes rewritten by hooks
  // are reported, whichever merge runs.
  async function mergeIn(
    slug: string,
    d: string,
    merge: (status: Awaited<ReturnType<Git['status']>>) => Promise<GitResult>,
  ) {
    const s = await git.status(d);
    const blocked = blockers(deps.drafts(slug), s.entries);
    if (blocked) throw blocked;
    const before = await git.head(d);
    const r = await merge(s);
    const now = await git.status(d);
    const conflicted = now.entries.filter(e => e.conflicted).map(e => e.path);
    const head = await git.head(d);
    const altered =
      head && head !== before
        ? await alteredAfter(d, await git.changedBetween(d, before, head))
        : [];
    return { ok: r.code === 0, conflicted, altered, stderr: r.stderr.trim() };
  }
  const pullIn = (slug: string, d: string, { choice, guard }: RemoteRequest) =>
    mergeIn(slug, d, async s => {
      const remote = chosenName(choice);
      const credential = choice?.credential;
      // A personal branch exists only here, so without an upstream it takes the remote's default
      // branch, which the copy started from.
      const untracked = (await deps.untrackedPull?.(slug, s.branch)) ?? s.branch;
      if (guard) {
        const branch = s.upstream ? s.upstream.slice(remote.length + 1) : untracked;
        return guardedPull(slug, d, { remote, branch, credential }, guard);
      }
      // A full ref name, so no branch name is ever read as an option.
      const target = s.upstream ? [] : ['--end-of-options', remote, 'refs/heads/' + untracked];
      const unrelated = await unrelatedHistories(d);
      const pull = ['pull', '--no-rebase', '--no-edit', ...unrelated, ...target];
      return git.run(d, pull, { remote: true, allowFailure: true, credential });
    });
  // The published default branch follows the remote's after a fetch, and that move is judged on
  // the files it brings, so a sparse checkout downloads them first.
  async function fetchDefaultBranchContents(slug: string, d: string, choice: RemoteChoice | null) {
    if (!deps.defaultBranch) return;
    const tip = `refs/remotes/${chosenName(choice)}/${await deps.defaultBranch(slug)}`;
    await fetchFolderContents(d, tip, async () => choice);
  }
  // Remote actions report Git's result instead of throwing, so the panel can show stderr; Cancel
  // (or the 10-minute limit) ends them.
  async function remoteAction(
    slug: string,
    kind: 'fetch' | 'pull' | 'push' | 'sync',
    request: RemoteRequest,
  ) {
    const d = dir(slug);
    const choice = request.choice;
    const credential = choice?.credential;
    try {
      let result = { ok: true, conflicted: [] as string[], altered: [] as string[], stderr: '' };
      let follow: FollowResult | null = null;
      if (kind === 'fetch') {
        const r = await git.run(d, ['fetch', '--prune', '--end-of-options', chosenName(choice)], {
          remote: true,
          allowFailure: true,
          credential,
        });
        result = { ...result, ok: r.code === 0, stderr: r.stderr.trim() };
        if (r.code === 0 && request.follow && deps.fetched) {
          await fetchDefaultBranchContents(slug, d, choice);
          follow = await deps.fetched(slug, chosenName(choice), request.follow);
        }
      }
      if (kind === 'pull' || kind === 'sync') {
        const s = await git.status(d);
        if (kind === 'pull' || s.upstream) result = await pullIn(slug, d, request);
      }
      if ((kind === 'push' || kind === 'sync') && result.ok) {
        const s = await git.status(d);
        const r = await git.run(
          d,
          ['push', '-u', '--end-of-options', chosenName(choice), s.branch],
          {
            remote: true,
            allowFailure: true,
            credential,
          },
        );
        result = {
          ...result,
          ok: r.code === 0,
          stderr: [result.stderr, r.stderr.trim()].filter(Boolean).join('\n'),
        };
      }
      const s = await after(slug, result.altered);
      return { ...result, ahead: s.ahead, behind: s.behind, ...(follow ? { follow } : {}) };
    } catch (e) {
      if (e instanceof GitError && e.cancelled) {
        const s = await after(slug);
        return {
          ok: false,
          cancelled: true,
          conflicted: [],
          altered: [],
          stderr: e.message,
          ahead: s.ahead,
          behind: s.behind,
        };
      }
      throw e;
    }
  }
  // The bytes of a path at `HEAD`, a commit, `index` or `worktree`, for the diff view.
  async function content(d: string, rev: string, path: string) {
    if (rev === 'worktree') {
      assertNoLinks(d, path);
      const f = join(d, path);
      return existsSync(f) ? new Uint8Array(readFileSync(f)) : null;
    }
    if (rev !== 'index' && !REV.test(rev))
      throw new BadRequestError('Revision must be HEAD, index, worktree or a commit id.');
    return git.blob(d, rev === 'index' ? '' : rev, path);
  }
  const asText = (bytes: Uint8Array | null) => {
    if (!bytes) return { text: '', binary: false };
    if (bytes.subarray(0, 8000).includes(0)) return { text: '', binary: true };
    try {
      return { text: decode(bytes), binary: false };
    } catch {
      return { text: '', binary: true };
    }
  };
  async function commitIndex(slug: string, message: string, author?: CommitAuthor) {
    const d = dir(slug);
    const s = await git.status(d);
    if (s.entries.some(e => e.conflicted))
      throw new GitError('Resolve the conflicted files and stage them before committing.');
    const staged = s.entries.filter(e => e.index !== '.' && !e.untracked);
    const merging = await git.merging(d);
    // A merge commit holds everything the merge brought in, so only a plain commit is limited.
    if (!merging)
      await assertInsideFolder(
        slug,
        d,
        staged.map(e => e.path),
      );
    if (!staged.length && !merging)
      throw new GitError('Nothing is staged. Stage the changes to include, then commit.');
    const clean = staged.filter(e => e.worktree === '.').map(e => e.path);
    const before = await git.worktreeIds(
      d,
      clean.filter(p => existsSync(join(d, p))),
    );
    const parent = await git.head(d);
    await git.commit(d, message, false, author);
    const head = (await git.head(d))!;
    const committed = await git.changedBetween(d, parent, head);
    // A hook that rewrote a file, or a clean filter whose committed bytes differ from the saved
    // file.
    const checked = committed.filter(p => before.has(p));
    const [disk, tree] = await Promise.all([
      git.worktreeIds(
        d,
        checked.filter(p => existsSync(join(d, p))),
      ),
      git.treeIds(d, 'HEAD', checked),
    ]);
    const altered = checked.filter(
      p => disk.get(p) !== before.get(p) || (tree.has(p) && disk.get(p) !== tree.get(p)),
    );
    await after(slug, altered);
    return { commit: head, altered };
  }
  async function commitChosen(
    slug: string,
    message: string,
    list: unknown,
    base: PathBase,
    author?: CommitAuthor,
  ) {
    const d = dir(slug);
    const chosen = paths(slug, list, base);
    await assertInsideFolder(slug, d, chosen);
    if (await git.merging(d)) {
      const s = await git.status(d);
      throw new MergingError(
        s.entries.filter(e => e.conflicted).map(e => fromRepo(slug, e.path).path),
      );
    }
    const clean = chosen.filter(p => existsSync(join(d, p)));
    const before = await git.worktreeIds(d, clean);
    const r = await git.commitPaths(d, chosen, message, author);
    if (!r.committed)
      throw new GitError(
        r.reason === 'no-identity'
          ? 'Not committed: set your Git identity (user.name and user.email) for this repository.'
          : r.reason === 'merging'
            ? 'A merge is in progress.'
            : 'Nothing to commit: the chosen files match the last commit.',
      );
    const checked = clean.filter(p => before.has(p));
    const [disk, tree] = await Promise.all([
      git.worktreeIds(
        d,
        checked.filter(p => existsSync(join(d, p))),
      ),
      git.treeIds(d, 'HEAD', checked),
    ]);
    const altered = checked
      .filter(p => disk.get(p) !== before.get(p) || (tree.has(p) && disk.get(p) !== tree.get(p)))
      .map(p => fromRepo(slug, p).path);
    await after(slug, altered);
    return { commit: r.commit, altered };
  }
  // The local branch a switch checks out for the name the person gave, found by asking Git what
  // the name is. `origin/x` is the remote branch whose local branch is `x`; a name that is a tag,
  // a commit, or `@{-1}` is no branch and is refused, so the name that is authorized is the name
  // that is checked out.
  async function branchTarget(d: string, name: string, create: boolean) {
    const target = await resolvedBranch(d, name, create);
    // A volume that ignores case keeps `Work/bob` and `work/bob` in one file, so a spelling that
    // differs only in case from an existing branch is that branch under a name no rule matches.
    const known = await git.branches(d);
    const existing = [
      ...known.local,
      ...known.remote.map(remote => remote.slice(remote.indexOf('/') + 1)),
    ];
    const clash = branchSpelledDifferently(target.local, existing);
    if (clash)
      throw new BadRequestError(`"${target.local}" differs only in letter case from "${clash}".`);
    return target;
  }
  // A branch without the project's folder would remove the project from the disk on a sparse
  // checkout, so the switch is refused with the reason.
  async function assertBranchHasFolder(slug: string, d: string, tip: string, branch: string) {
    const { folder } = await sparseProjectFolder(slug, d);
    if (folder && !(await folderExistsAt(git, d, tip, folder)))
      throw new MissingFolderError(folder, branch);
  }
  async function judgeSwitch(
    slug: string,
    d: string,
    switching: {
      tip: string;
      before: string | null;
      guard: ContentGuard;
      credentialFor?: CredentialFor;
    },
  ) {
    const { tip, before, guard, credentialFor } = switching;
    await fetchFolderContents(d, tip, () => chooseRemote(slug, credentialFor));
    guard(await incomingChanges(slug, d, before, tip), { operation: 'switch' });
  }
  async function resolvedBranch(d: string, name: string, create: boolean) {
    if (create) {
      if (!(await isBranchName(git, d, name)))
        throw new BadRequestError(`"${name}" is not a valid branch name.`);
      return { local: name, ref: '' };
    }
    if (name.includes('@{')) throw new BadRequestError(`"${name}" is not a valid branch name.`);
    const resolved = await git.run(d, ['rev-parse', '--symbolic-full-name', name], {
      readOnly: true,
      allowFailure: true,
    });
    const ref = resolved.code === 0 ? resolved.stdout.trim() : '';
    const local = localBranchOf(ref);
    if (local === null) throw new BadRequestError(`"${name}" is not a branch.`);
    if (!(await isBranchName(git, d, local)))
      throw new BadRequestError(`"${local}" is not a valid branch name.`);
    return { local, ref };
  }
  return {
    status,
    async diff(
      slug: string,
      path: string,
      from: string | undefined,
      to: string | undefined,
      base: PathBase | undefined,
      { view }: Reader,
    ) {
      from ??= 'HEAD';
      to ??= 'worktree';
      base ??= 'project';
      requireReadable(slug, path, view, base);
      const d = dir(slug);
      const p = projectPath(path);
      const pre = base === 'repository' ? '' : prefix(slug);
      const [a, b] = await Promise.all([content(d, from, pre + p), content(d, to, pre + p)]);
      const before = asText(a);
      const after = asText(b);
      return {
        path: p,
        from,
        to,
        before: before.text,
        after: after.text,
        binary: before.binary || after.binary,
        beforeExists: !!a,
        afterExists: !!b,
      };
    },
    // The status they return is the caller's own view, so staging never reveals a hidden path.
    async stage(
      slug: string,
      list: unknown,
      base: PathBase = 'project',
      reader: Reader = LOCAL_READER,
    ) {
      const d = dir(slug);
      const chosen = paths(slug, list, base);
      await assertInsideFolder(slug, d, chosen);
      await git.stage(d, chosen);
      await after(slug);
      return status(slug, reader);
    },
    async unstage(
      slug: string,
      list: unknown,
      base: PathBase = 'project',
      reader: Reader = LOCAL_READER,
    ) {
      const d = dir(slug);
      await git.unstage(d, paths(slug, list, base));
      await after(slug);
      return status(slug, reader);
    },
    async stageAll(slug: string, stage: boolean, reader: Reader = LOCAL_READER) {
      const d = dir(slug);
      const s = await git.status(d);
      const { folder } = await sparseProjectFolder(slug, d);
      const insideProject = (path: string) => !folder || path.startsWith(folder + '/');
      const list = s.entries
        .filter(e => (stage ? e.worktree !== '.' : e.index !== '.' && !e.untracked))
        .map(e => e.path)
        .filter(insideProject);
      if (list.length) await (stage ? git.stage(d, list) : git.unstage(d, list));
      await after(slug);
      return status(slug, reader);
    },
    // Selected paths use `git commit --only` to preserve unrelated staged and unstaged work.
    // Without paths, commit the index; during a merge, refuse selected-path commits.
    // Report push failures separately because the commit already exists.
    async commit(
      slug: string,
      message: unknown,
      options: {
        paths?: unknown;
        push?: boolean;
        base?: PathBase;
        credentialFor?: CredentialFor;
        author?: CommitAuthor;
      } = {},
    ) {
      if (typeof message !== 'string' || !message.trim())
        throw new GitError('A commit message is required.');
      // A missing credential stops the request before the commit, so a retry commits only once.
      const choice = options.push ? await chooseRemote(slug, options.credentialFor) : null;
      const { author } = options;
      const result =
        options.paths === undefined
          ? await commitIndex(slug, message, author)
          : await commitChosen(slug, message, options.paths, options.base ?? 'project', author);
      if (!options.push) return result;
      let pushed: { ok: boolean; message: string };
      try {
        const r = await remoteAction(slug, 'push', { choice });
        pushed = { ok: r.ok, message: r.stderr || (r.ok ? 'Pushed.' : 'Push failed.') };
      } catch (e) {
        pushed = { ok: false, message: (e as Error).message };
      }
      return { ...result, pushed };
    },
    refresh: (slug: string) => after(slug),
    // Another person's personal branch is not listed for someone who may not use it. A reader
    // with no view is the local person, who sees every branch of their own repository.
    async branches(slug: string, { view }: Reader = LOCAL_READER) {
      const d = dir(slug);
      const b = await git.branches(d);
      const s = await git.status(d);
      if (!view) return { current: s.branch, ...b };
      const own = deps.ownBranch?.() ?? null;
      return {
        current: s.branch,
        local: b.local.filter(name => branchShownTo(name, own)),
        remote: b.remote.filter(name => branchShownTo(name, own, true)),
      };
    },
    // The caller authorizes the branch actually checked out: `origin/x` becomes the local `x`.
    async switchBranch(
      slug: string,
      branch: unknown,
      create: boolean,
      { guard }: Reader,
      authorizeBranch?: (local: string) => void,
      credentialFor?: CredentialFor,
    ) {
      // Trimmed before any check, so a leading space cannot smuggle an option such as `--detach`.
      const name = typeof branch === 'string' ? branch.trim() : '';
      if (!name || name.startsWith('-') || name.length > 200)
        throw new BadRequestError('Give a branch name.');
      const d = dir(slug);
      const { local, ref } = await branchTarget(d, name, create);
      const s = await git.status(d);
      const blocked = blockers(deps.drafts(slug), s.entries);
      if (blocked) throw blocked;
      authorizeBranch?.(local);
      await deps.assertBranchFree?.(slug, local);
      const before = await git.head(d);
      // Everyone works in one tree, so the branch's content is checked as if the person wrote it.
      if (!create) {
        const exists = (await git.branches(d)).local.includes(local);
        const tip = exists ? 'refs/heads/' + local : ref;
        await assertBranchHasFolder(slug, d, tip, local);
        if (guard) await judgeSwitch(slug, d, { tip, before, guard, credentialFor });
      }
      await git.run(d, create ? ['switch', '-c', local] : ['switch', '--end-of-options', local]);
      deps.branchesMoved?.(slug);
      const head = await git.head(d);
      const altered =
        head && head !== before
          ? await alteredAfter(d, await git.changedBetween(d, before, head))
          : [];
      await after(slug, altered);
      return { branch: local, altered };
    },
    async setRemote(slug: string, requestedName: unknown, url: unknown) {
      const name = remoteName(requestedName);
      const d = dir(slug);
      const remotes = await git.remotes(d);
      const current = remotes.get(name);
      // The panel shows addresses with credentials masked; saving one unchanged keeps the original.
      if (
        current !== undefined &&
        typeof url === 'string' &&
        url.trim() === redactCredentials(current)
      )
        return { name, url: url.trim() };
      const address = remoteAddress(url);
      await git.run(
        d,
        remotes.has(name) ? ['remote', 'set-url', name, address] : ['remote', 'add', name, address],
      );
      await after(slug);
      return { name, url: address };
    },
    async removeRemote(slug: string, requestedName: unknown) {
      const name = remoteName(requestedName);
      const d = dir(slug);
      if (!(await git.remotes(d)).has(name))
        throw new BadRequestError(`There is no remote named ${name}.`);
      await git.run(d, ['remote', 'remove', name]);
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
      if (!deps.defaultBranch)
        throw new BadRequestError('This workspace has no default branch to push.');
      const ref = 'refs/heads/' + (await deps.defaultBranch(slug));
      const choice = await chooseRemote(slug, credentialFor);
      const pushed = await git.run(
        dir(slug),
        ['push', '--end-of-options', chosenName(choice), `${ref}:${ref}`],
        {
          remote: true,
          allowFailure: true,
          credential: choice?.credential,
        },
      );
      const s = await after(slug);
      const result = { ok: pushed.code === 0, conflicted: [], altered: [] };
      return { ...result, stderr: pushed.stderr.trim(), ahead: s.ahead, behind: s.behind };
    },
    /** Fetches; `follow` lets the published default branch follow the remote in server mode. */
    fetch: async (slug: string, credentialFor?: CredentialFor, follow?: FollowRequest) =>
      remoteAction(slug, 'fetch', { choice: await chooseRemote(slug, credentialFor), follow }),
    /**
     * Merges the default branch into the person's branch, as a pull does: the exact commit
     * merged is the one the guard judged.
     */
    async pullDefault(slug: string, { guard, copy }: Reader) {
      const merge = deps.mergeDefault;
      if (!merge)
        throw new BadRequestError('Pull from the default branch works on a personal working copy.');
      const d = dir(slug);
      const check = async (tip: string) => {
        if (guard) await guardMerge(slug, d, tip, guard);
      };
      const result = await mergeIn(slug, d, () => merge(slug, copy?.author, check));
      const s = await after(slug, result.altered);
      return { ...result, ahead: s.ahead, behind: s.behind };
    },
    /** What moving the repository from `base` to `tip` changes, file by file, per project. */
    changesBetween: (slug: string, base: string | null, tip: string) =>
      incomingChanges(slug, dir(slug), base, tip),
    // The reader's guard, given in server mode, refuses a pull that brings in a guarded change.
    pull: async (slug: string, reader: Reader, credentialFor?: CredentialFor) => {
      const choice = await chooseRemote(slug, credentialFor);
      return remoteAction(slug, 'pull', { choice, guard: reader.guard });
    },
    push: async (slug: string, credentialFor?: CredentialFor) =>
      remoteAction(slug, 'push', { choice: await chooseRemote(slug, credentialFor) }),
    sync: async (slug: string, reader: Reader, credentialFor?: CredentialFor) => {
      const choice = await chooseRemote(slug, credentialFor);
      return remoteAction(slug, 'sync', { choice, guard: reader.guard });
    },
    cancel: (slug: string) => ({ cancelled: git.cancel(dir(slug)) }),
    async log(slug: string, path: string | undefined, limit: number | undefined, { view }: Reader) {
      if (path) requireReadable(slug, path, view);
      const commits = await git.log(
        dir(slug),
        path === undefined ? prefix(slug) || undefined : prefix(slug) + projectPath(path),
        limit,
      );
      if (!view) return commits.map(({ paths: _paths, ...commit }) => commit);
      const visible = [];
      let hiddenCommits = 0;
      for (const commit of commits) {
        const paths = commit.paths.filter(path => readablePath(slug, path, view, 'repository'));
        if (paths.length) visible.push({ ...commit, paths });
        else hiddenCommits++;
      }
      return { commits: visible, hiddenCommits };
    },
    async show(slug: string, commit: string, path: string, { view }: Reader) {
      requireReadable(slug, path, view);
      if (!REV.test(commit)) throw new BadRequestError('commit must be a commit id.');
      const bytes = await git.blob(dir(slug), commit, prefix(slug) + projectPath(path));
      if (!bytes) return { source: '', exists: false };
      return { source: decode(bytes), exists: true, hash: sha256(bytes) };
    },
    // Skip binary and missing versions because the history view displays text.
    async versions(slug: string, path: string, limit: number | undefined, { view }: Reader) {
      requireReadable(slug, path, view);
      const d = dir(slug);
      const p = prefix(slug) + projectPath(path);
      const log = await git.log(d, p, Math.max(1, Math.min(50, limit ?? 20)));
      const out: {
        commit: string;
        author: string;
        date: string;
        message: string;
        source: string;
      }[] = [];
      for (const c of log) {
        const bytes = await git.blob(d, c.commit, p);
        if (!bytes) continue;
        try {
          const { paths: _paths, ...commit } = c;
          out.push({ ...commit, source: decode(bytes) });
        } catch {}
      }
      return out;
    },
    // Git keeps tracking files even after an ignore pattern matches them.
    async ignoredButTracked(slug: string) {
      const r = await git.run(
        dir(slug),
        [
          '--no-optional-locks',
          '-c',
          'core.quotepath=off',
          'ls-files',
          '-ci',
          '--exclude-standard',
          '-z',
        ],
        { readOnly: true, allowFailure: true },
      );
      return r.stdout.split('\0').filter(Boolean);
    },
  };
}
/** Project source control operations, status, and history. */
export type Scm = ReturnType<typeof createScm>;
