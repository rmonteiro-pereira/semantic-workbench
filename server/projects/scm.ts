// Connects project source control actions to Git and workspace updates. Checks after mutations
// detect bytes rewritten by hooks or filters.
import type { EventTags } from './events';
import type { AccessView } from '../auth/authorize';
import { LOCAL_READER, type Reader } from './reader';
import { HiddenResourceError } from './errors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GitError,
  redactCredentials,
  remoteAddress,
  remoteName,
  type Git,
  type StatusEntry,
} from './git';
import { MergingError } from './errors';
import { decode, sha256 } from './atomic';
import { assertNoLinks, projectPath, projectPrefix, repoDir, type DataLayout } from './paths';
import { serializationOf } from './scanner';
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
};
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
      throw Error('Expected 1–5000 paths.');
    const pre = base === 'repository' ? '' : prefix(slug);
    return list.map(p => pre + projectPath(String(p)));
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
    if (view && !readablePath(slug, path, view, base)) throw new HiddenResourceError();
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
      ahead: s.ahead,
      behind: s.behind,
      gitAvailable: true,
      identityConfigured: await git.identity(d),
      merging,
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
  const remoteOf = async (d: string, upstream: string) => {
    const remotes = await git.remotes(d);
    const name = upstream
      ? upstream.slice(0, upstream.indexOf('/'))
      : remotes.has('origin')
        ? 'origin'
        : [...remotes.keys()][0];
    if (!name) throw new GitError('This project has no remote. Add one under Remote first.');
    return name;
  };
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
  // A pull is checked before any file changes: the branch is fetched, and what it would bring in
  // is decided as if the person wrote it. It returns the checked commit, which is then merged
  // instead of fetching again, or Git's message when the fetch failed.
  async function guardIncoming(
    slug: string,
    d: string,
    source: { remote: string; branch: string },
    guard: ContentGuard,
  ) {
    const fetched = await git.run(d, ['fetch', source.remote, source.branch], {
      remote: true,
      allowFailure: true,
    });
    if (fetched.code !== 0) {
      const failed = { ok: false, conflicted: [], altered: [], stderr: fetched.stderr.trim() };
      return { failed };
    }
    const fetchedTip = await git.run(d, ['rev-parse', '-q', '--verify', 'FETCH_HEAD'], {
      readOnly: true,
    });
    const tip = fetchedTip.stdout.trim();
    // A merge brings in what the tip changed since the common ancestor.
    const merged = await git.run(d, ['merge-base', 'HEAD', tip], {
      readOnly: true,
      allowFailure: true,
    });
    const base = merged.code === 0 ? merged.stdout.trim() : null;
    guard(await incomingChanges(slug, d, base, tip), { operation: 'pull' });
    return { tip };
  }
  async function pullIn(slug: string, d: string, guard?: ContentGuard) {
    const s = await git.status(d);
    const blocked = blockers(deps.drafts(slug), s.entries);
    if (blocked) throw blocked;
    const remote = await remoteOf(d, s.upstream);
    let args = ['pull', '--no-rebase', '--no-edit', ...(s.upstream ? [] : [remote, s.branch])];
    if (guard) {
      const branch = s.upstream ? s.upstream.slice(remote.length + 1) : s.branch;
      const checked = await guardIncoming(slug, d, { remote, branch }, guard);
      if (checked.failed) return checked.failed;
      // Merging the checked commit keeps commits pushed after the check out of this pull.
      args = ['merge', '--no-edit', checked.tip!];
    }
    const before = await git.head(d);
    const r = await git.run(d, args, { remote: true, allowFailure: true });
    const now = await git.status(d);
    const conflicted = now.entries.filter(e => e.conflicted).map(e => e.path);
    const head = await git.head(d);
    const altered =
      head && head !== before
        ? await alteredAfter(d, await git.changedBetween(d, before, head))
        : [];
    return { ok: r.code === 0, conflicted, altered, stderr: r.stderr.trim() };
  }
  // Remote actions report Git's result instead of throwing, so the panel can show stderr; Cancel
  // (or the 10-minute limit) ends them.
  async function remoteAction(
    slug: string,
    kind: 'fetch' | 'pull' | 'push' | 'sync',
    guard?: ContentGuard,
  ) {
    const d = dir(slug);
    try {
      let result = { ok: true, conflicted: [] as string[], altered: [] as string[], stderr: '' };
      if (kind === 'fetch') {
        const s = await git.status(d);
        const r = await git.run(d, ['fetch', '--prune', await remoteOf(d, s.upstream)], {
          remote: true,
          allowFailure: true,
        });
        result = { ...result, ok: r.code === 0, stderr: r.stderr.trim() };
      }
      if (kind === 'pull' || kind === 'sync') {
        const s = await git.status(d);
        if (kind === 'pull' || s.upstream) result = await pullIn(slug, d, guard);
      }
      if ((kind === 'push' || kind === 'sync') && result.ok) {
        const s = await git.status(d);
        const r = await git.run(d, ['push', '-u', await remoteOf(d, s.upstream), s.branch], {
          remote: true,
          allowFailure: true,
        });
        result = {
          ...result,
          ok: r.code === 0,
          stderr: [result.stderr, r.stderr.trim()].filter(Boolean).join('\n'),
        };
      }
      const s = await after(slug, result.altered);
      return { ...result, ahead: s.ahead, behind: s.behind };
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
      throw Error('Revision must be HEAD, index, worktree or a commit id.');
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
  async function commitIndex(slug: string, message: string) {
    const d = dir(slug);
    const s = await git.status(d);
    if (s.entries.some(e => e.conflicted))
      throw new GitError('Resolve the conflicted files and stage them before committing.');
    const staged = s.entries.filter(e => e.index !== '.' && !e.untracked);
    if (!staged.length && !(await git.merging(d)))
      throw new GitError('Nothing is staged. Stage the changes to include, then commit.');
    const clean = staged.filter(e => e.worktree === '.').map(e => e.path);
    const before = await git.worktreeIds(
      d,
      clean.filter(p => existsSync(join(d, p))),
    );
    const parent = await git.head(d);
    await git.commit(d, message);
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
  async function commitChosen(slug: string, message: string, list: unknown, base: PathBase) {
    const d = dir(slug);
    const chosen = paths(slug, list, base);
    if (await git.merging(d)) {
      const s = await git.status(d);
      throw new MergingError(
        s.entries.filter(e => e.conflicted).map(e => fromRepo(slug, e.path).path),
      );
    }
    const clean = chosen.filter(p => existsSync(join(d, p)));
    const before = await git.worktreeIds(d, clean);
    const r = await git.commitPaths(d, chosen, message);
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
    async stage(slug: string, list: unknown, base: PathBase = 'project') {
      const d = dir(slug);
      await git.stage(d, paths(slug, list, base));
      await after(slug);
      return status(slug, LOCAL_READER);
    },
    async unstage(slug: string, list: unknown, base: PathBase = 'project') {
      const d = dir(slug);
      await git.unstage(d, paths(slug, list, base));
      await after(slug);
      return status(slug, LOCAL_READER);
    },
    async stageAll(slug: string, stage: boolean) {
      const d = dir(slug);
      const s = await git.status(d);
      const list = s.entries
        .filter(e => (stage ? e.worktree !== '.' : e.index !== '.' && !e.untracked))
        .map(e => e.path);
      if (list.length) await (stage ? git.stage(d, list) : git.unstage(d, list));
      await after(slug);
      return status(slug, LOCAL_READER);
    },
    // Selected paths use `git commit --only` to preserve unrelated staged and unstaged work.
    // Without paths, commit the index; during a merge, refuse selected-path commits.
    // Report push failures separately because the commit already exists.
    async commit(
      slug: string,
      message: unknown,
      options: { paths?: unknown; push?: boolean; base?: PathBase } = {},
    ) {
      if (typeof message !== 'string' || !message.trim())
        throw new GitError('A commit message is required.');
      const result =
        options.paths === undefined
          ? await commitIndex(slug, message)
          : await commitChosen(slug, message, options.paths, options.base ?? 'project');
      if (!options.push) return result;
      let pushed: { ok: boolean; message: string };
      try {
        const r = await remoteAction(slug, 'push');
        pushed = { ok: r.ok, message: r.stderr || (r.ok ? 'Pushed.' : 'Push failed.') };
      } catch (e) {
        pushed = { ok: false, message: (e as Error).message };
      }
      return { ...result, pushed };
    },
    refresh: (slug: string) => after(slug),
    async branches(slug: string) {
      const d = dir(slug);
      const b = await git.branches(d);
      const s = await git.status(d);
      return { current: s.branch, ...b };
    },
    async switchBranch(slug: string, branch: unknown, create = false, { guard }: Reader) {
      // Trimmed before any check, so a leading space cannot smuggle an option such as `--detach`.
      const name = typeof branch === 'string' ? branch.trim() : '';
      if (!name || name.startsWith('-') || name.length > 200) throw Error('Give a branch name.');
      const d = dir(slug);
      if (
        (
          await git.run(d, ['check-ref-format', '--branch', name], {
            allowFailure: true,
            readOnly: true,
          })
        ).code !== 0
      )
        throw Error(`"${name}" is not a valid branch name.`);
      const s = await git.status(d);
      const blocked = blockers(deps.drafts(slug), s.entries);
      if (blocked) throw blocked;
      // A remote branch (`origin/x`) is checked out as the local tracking branch `x`.
      const b = await git.branches(d);
      const local =
        !create && !b.local.includes(name) && b.remote.includes(name)
          ? name.slice(name.indexOf('/') + 1)
          : name;
      const before = await git.head(d);
      // Everyone works in one tree, so the branch's content is checked as if the person wrote it.
      if (guard && !create) {
        const target = b.local.includes(local) ? local : name;
        guard(await incomingChanges(slug, d, before, target), { operation: 'switch' });
      }
      await git.run(d, create ? ['switch', '-c', local] : ['switch', local]);
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
      if (!(await git.remotes(d)).has(name)) throw Error(`There is no remote named ${name}.`);
      await git.run(d, ['remote', 'remove', name]);
      await after(slug);
      return { removed: name };
    },
    fetch: (slug: string) => remoteAction(slug, 'fetch'),
    // The reader's guard, given in server mode, refuses a pull that brings in a guarded change.
    pull: (slug: string, reader: Reader) => remoteAction(slug, 'pull', reader.guard),
    push: (slug: string) => remoteAction(slug, 'push'),
    sync: (slug: string, reader: Reader) => remoteAction(slug, 'sync', reader.guard),
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
      if (!REV.test(commit)) throw Error('commit must be a commit id.');
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
