// Connects project source control actions to Git and workspace updates. Checks after mutations
// detect bytes rewritten by hooks or filters.
import type { AccessView } from '../auth/authorize';
import { LOCAL_READER, type Reader } from './reader';
import { BadRequestError, HiddenResourceError } from './errors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GitError, redactCredentials, type CommitAuthor, type CommitPathsResult, type Git } from './git';
import { MergingError } from './errors';
import { decode, sha256 } from './atomic';
import { assertExactCase, assertNoLinks, projectPath, repoDir } from './paths';
import { serializationOf } from './scanner';
import { HIDDEN_LABEL, asText, createScmContext, type PathBase, type CredentialFor, type ScmDeps } from './scm-context';
import { createScmRemote } from './scm-remote';
import { createScmBranches } from './scm-branches';
export { BlockedError, HIDDEN_LABEL, blockers, type CredentialFor, type FollowRequest, type FollowResult, type PathBase, type ScmDeps } from './scm-context';
const REV = /^(HEAD|[0-9a-f]{7,64})$/;
const NOT_COMMITTED_MESSAGE: Record<Extract<CommitPathsResult, { committed: false }>['reason'], string> = {
  'no-identity': 'Not committed: set your Git identity (user.name and user.email) for this repository.',
  merging: 'A merge is in progress.',
  nothing: 'Nothing to commit: the chosen files match the last commit.',
};

/** Creates project source control operations with draft checks and workspace notifications. */
export function createScm(deps: ScmDeps) {
  const context = createScmContext(deps);
  const { layout, git, dir, prefix, ownerOf, sparseProjectFolder, after } = context;
  const remote = createScmRemote(context);
  const { chosenRemote, chooseRemote, remoteAction } = remote;
  // Paths arrive relative to the project, or relative to the repository root when the panel
  // acts on a file of a sibling project or on a file that belongs to no project.
  const paths = (slug: string, list: unknown, base: PathBase = 'project') => {
    if (!Array.isArray(list) || !list.length || list.length > 5000) throw new BadRequestError('Expected 1–5000 paths.');
    const pre = base === 'repository' ? '' : prefix(slug);
    const chosen = list.map(p => pre + projectPath(String(p)));
    for (const path of chosen) assertExactCase(repoDir(layout, slug), path);
    return chosen;
  };
  // Show changes across the repository; paths outside this project keep repository-relative names.
  const fromRepo = (slug: string, path: string) => {
    const pre = prefix(slug);
    if (!pre) {
      return { path };
    }
    if (path.startsWith(pre)) {
      return { path: path.slice(pre.length) };
    }
    return { path, outside: true };
  };
  // The project a changed file belongs to, and its path inside that project.
  const ownership = (owner: { project: string; prefix: string } | undefined, path: string) => (owner ? { project: owner.project, projectPath: path.slice(owner.prefix.length) } : {});
  function readablePath(slug: string, path: string, view: AccessView, base: PathBase = 'project') {
    const repoPath = (base === 'project' ? prefix(slug) : '') + projectPath(path);
    const owner = ownerOf(slug, repoPath)?.project;
    return Boolean(owner && view.readableProjects.has(owner) && view.canRead(owner, repoPath.slice(prefix(owner).length)));
  }

  function requireReadable(slug: string, path: string, view?: AccessView, base?: PathBase) {
    const repoPath = (base === 'repository' ? '' : prefix(slug)) + projectPath(path);
    assertExactCase(repoDir(layout, slug), repoPath);
    if (view && !readablePath(slug, path, view, base)) throw new HiddenResourceError();
  }
  // Where Pull takes from when it is not the upstream, such as `origin/main` for a personal
  // branch, so the panel can name it.
  async function pullSource(slug: string, directory: string, gitStatus: Awaited<ReturnType<Git['status']>>): Promise<{ pullSource?: string }> {
    if (gitStatus.upstream || !deps.untrackedPull) return {};
    const target = await deps.untrackedPull(slug, gitStatus.branch);
    const remote = target ? await chosenRemote(directory, '') : null;
    return remote ? { pullSource: `${remote.name}/${target}` } : {};
  }
  // Commits touch only the project's folder: a path outside it never reaches a sparse checkout's
  // commit, because the rest of the repository belongs to other people's projects.
  async function assertInsideFolder(slug: string, directory: string, repoPaths: string[]) {
    const { folder } = await sparseProjectFolder(slug, directory);
    if (!folder) return;
    const outside = repoPaths.filter(path => !path.startsWith(folder + '/'));
    if (outside.length) throw new BadRequestError(`Only files inside ${folder} can be committed from this project. Outside: ${outside.join(', ')}`);
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
    const directory = dir(slug);
    const gitStatus = await git.status(directory);
    const merging = await git.merging(directory);
    const changes = gitStatus.entries.map(entry => ({
      ...entry,
      ...fromRepo(slug, entry.path),
      repoPath: entry.path,
      ...ownership(ownerOf(slug, entry.path), entry.path),
      hidden: serializationOf(entry.path) === 'unsupported',
      ...(serializationOf(entry.path) === 'unsupported' ? { label: HIDDEN_LABEL } : {}),
    }));
    return {
      branch: gitStatus.branch,
      upstream: gitStatus.upstream,
      ...(await pullSource(slug, directory, gitStatus)),
      ahead: gitStatus.ahead,
      behind: gitStatus.behind,
      gitAvailable: true,
      ...(await sparseProjectFolder(slug, directory)),
      identityConfigured: deps.signedCommits || (await git.identity(directory)),
      merging,
      hasCommits: gitStatus.hasCommits,
      remotes: Object.fromEntries([...(await git.remotes(directory))].map(([n, u]) => [n, redactCredentials(u)])),
      changes: view
        ? changes
            .filter(change => readablePath(slug, change.repoPath, view, 'repository'))
            .map(change => {
              if (!change.orig || readablePath(slug, change.orig, view, 'repository')) return change;
              const { orig: _original, ...visible } = change;
              return visible;
            })
        : changes,
    };
  }
  // The bytes of a path at `HEAD`, a commit, `index` or `worktree`, for the diff view.
  async function content(directory: string, rev: string, path: string) {
    if (rev === 'worktree') {
      assertNoLinks(directory, path);
      const filePath = join(directory, path);
      return existsSync(filePath) ? new Uint8Array(readFileSync(filePath)) : null;
    }
    if (rev !== 'index' && !REV.test(rev)) throw new BadRequestError('Revision must be HEAD, index, worktree or a commit id.');
    return git.blob(directory, rev === 'index' ? '' : rev, path);
  }
  async function commitIndex(slug: string, message: string, author?: CommitAuthor) {
    const directory = dir(slug);
    const gitStatus = await git.status(directory);
    if (gitStatus.entries.some(e => e.conflicted)) throw new GitError('Resolve the conflicted files and stage them before committing.');
    const staged = gitStatus.entries.filter(e => e.index !== '.' && !e.untracked);
    const merging = await git.merging(directory);
    // A merge commit holds everything the merge brought in, so only a plain commit is limited.
    if (!merging)
      await assertInsideFolder(
        slug,
        directory,
        staged.map(e => e.path),
      );
    if (!staged.length && !merging) throw new GitError('Nothing is staged. Stage the changes to include, then commit.');
    const clean = staged.filter(e => e.worktree === '.').map(e => e.path);
    const before = await git.worktreeIds(
      directory,
      clean.filter(p => existsSync(join(directory, p))),
    );
    const parent = await git.head(directory);
    await git.commit(directory, message, false, author);
    const head = (await git.head(directory))!;
    const committed = await git.changedBetween(directory, parent, head);
    // A hook that rewrote a file, or a clean filter whose committed bytes differ from the saved
    // file.
    const checked = committed.filter(p => before.has(p));
    const [disk, tree] = await Promise.all([
      git.worktreeIds(
        directory,
        checked.filter(p => existsSync(join(directory, p))),
      ),
      git.treeIds(directory, 'HEAD', checked),
    ]);
    const altered = checked.filter(p => disk.get(p) !== before.get(p) || (tree.has(p) && disk.get(p) !== tree.get(p)));
    await after(slug, altered);
    return { commit: head, altered };
  }
  async function commitChosen(slug: string, message: string, list: unknown, base: PathBase, author?: CommitAuthor) {
    const directory = dir(slug);
    const chosen = paths(slug, list, base);
    await assertInsideFolder(slug, directory, chosen);
    if (await git.merging(directory)) {
      const gitStatus = await git.status(directory);
      throw new MergingError(gitStatus.entries.filter(e => e.conflicted).map(e => fromRepo(slug, e.path).path));
    }
    const clean = chosen.filter(p => existsSync(join(directory, p)));
    const before = await git.worktreeIds(directory, clean);
    const commitPathsResult = await git.commitPaths(directory, chosen, message, author);
    if (!commitPathsResult.committed) throw new GitError(NOT_COMMITTED_MESSAGE[commitPathsResult.reason]);
    const checked = clean.filter(p => before.has(p));
    const [disk, tree] = await Promise.all([
      git.worktreeIds(
        directory,
        checked.filter(p => existsSync(join(directory, p))),
      ),
      git.treeIds(directory, 'HEAD', checked),
    ]);
    const altered = checked.filter(p => disk.get(p) !== before.get(p) || (tree.has(p) && disk.get(p) !== tree.get(p))).map(p => fromRepo(slug, p).path);
    await after(slug, altered);
    return { commit: commitPathsResult.commit, altered };
  }
  return {
    ...remote.actions,
    ...createScmBranches(context, remote),
    status,
    async diff(slug: string, path: string, from: string | undefined, to: string | undefined, base: PathBase | undefined, { view }: Reader) {
      from ??= 'HEAD';
      to ??= 'worktree';
      base ??= 'project';
      requireReadable(slug, path, view, base);
      const directory = dir(slug);
      const projectRelativePath = projectPath(path);
      const pre = base === 'repository' ? '' : prefix(slug);
      const [bytes, afterBytes] = await Promise.all([content(directory, from, pre + projectRelativePath), content(directory, to, pre + projectRelativePath)]);
      const before = asText(bytes);
      const after = asText(afterBytes);
      return {
        path: projectRelativePath,
        from,
        to,
        before: before.text,
        after: after.text,
        binary: before.binary || after.binary,
        beforeExists: !!bytes,
        afterExists: !!afterBytes,
      };
    },
    // The gitStatus they return is the caller's own view, so staging never reveals a hidden path.
    async stage(slug: string, list: unknown, base: PathBase = 'project', reader: Reader = LOCAL_READER) {
      const directory = dir(slug);
      const chosen = paths(slug, list, base);
      await assertInsideFolder(slug, directory, chosen);
      await git.stage(directory, chosen);
      await after(slug);
      return status(slug, reader);
    },
    async unstage(slug: string, list: unknown, base: PathBase = 'project', reader: Reader = LOCAL_READER) {
      const directory = dir(slug);
      await git.unstage(directory, paths(slug, list, base));
      await after(slug);
      return status(slug, reader);
    },
    async stageAll(slug: string, stage: boolean, reader: Reader = LOCAL_READER) {
      const directory = dir(slug);
      const gitStatus = await git.status(directory);
      const { folder } = await sparseProjectFolder(slug, directory);
      const insideProject = (path: string) => !folder || path.startsWith(folder + '/');
      const list = gitStatus.entries
        .filter(e => (stage ? e.worktree !== '.' : e.index !== '.' && !e.untracked))
        .map(e => e.path)
        .filter(insideProject);
      if (list.length) await (stage ? git.stage(directory, list) : git.unstage(directory, list));
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
      if (typeof message !== 'string' || !message.trim()) throw new GitError('A commit message is required.');
      // A missing credential stops the request before the commit, so a retry commits only once.
      const choice = options.push ? await chooseRemote(slug, options.credentialFor) : null;
      const { author } = options;
      const result = options.paths === undefined ? await commitIndex(slug, message, author) : await commitChosen(slug, message, options.paths, options.base ?? 'project', author);
      if (!options.push) return result;
      let pushed: { ok: boolean; message: string };
      try {
        const action = await remoteAction(slug, 'push', { choice });
        pushed = {
          ok: action.ok,
          message: action.stderr || (action.ok ? 'Pushed.' : 'Push failed.'),
        };
      } catch (error) {
        pushed = { ok: false, message: (error as Error).message };
      }
      return { ...result, pushed };
    },
    refresh: (slug: string) => after(slug),
    cancel: (slug: string) => ({ cancelled: git.cancel(dir(slug)) }),
    async log(slug: string, path: string | undefined, limit: number | undefined, { view }: Reader) {
      if (path) requireReadable(slug, path, view);
      const commits = await git.log(dir(slug), path === undefined ? prefix(slug) || undefined : prefix(slug) + projectPath(path), limit);
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
      const directory = dir(slug);
      const repoPath = prefix(slug) + projectPath(path);
      const log = await git.log(directory, repoPath, Math.max(1, Math.min(50, limit ?? 20)));
      const out: {
        commit: string;
        author: string;
        date: string;
        message: string;
        source: string;
      }[] = [];
      for (const entry of log) {
        const bytes = await git.blob(directory, entry.commit, repoPath);
        if (!bytes) continue;
        try {
          const { paths: _paths, ...commit } = entry;
          out.push({ ...commit, source: decode(bytes) });
        } catch {}
      }
      return out;
    },
    // Git keeps tracking files even after an ignore pattern matches them.
    async ignoredButTracked(slug: string) {
      const gitResult = await git.run(dir(slug), ['--no-optional-locks', '-c', 'core.quotepath=off', 'ls-files', '-ci', '--exclude-standard', '-z'], { readOnly: true, allowFailure: true });
      return gitResult.stdout.split('\0').filter(Boolean);
    },
  };
}
/** Project source control operations, gitStatus, and history. */
export type Scm = ReturnType<typeof createScm>;
