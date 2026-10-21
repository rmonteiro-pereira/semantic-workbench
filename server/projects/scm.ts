// Connects project source control actions to Git and workspace updates. Checks after mutations
// detect bytes rewritten by hooks or filters.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GitError, redactCredentials, type Git, type StatusEntry } from './git';
import { MergingError } from './errors';
import { decode, sha256 } from './atomic';
import { assertNoLinks, projectPath, projectPrefix, repoDir, type DataLayout } from './paths';
import { serializationOf } from './scanner';
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
/** Workspace services needed to run Git actions and refresh project state. */
export type ScmDeps = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  identityConfigured: boolean;
  drafts: (slug: string) => string[];
  rescan: (slug: string) => Promise<unknown>;
  emit: (event: string, data: unknown) => void;
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
  const paths = (slug: string, list: unknown) => {
    if (!Array.isArray(list) || !list.length || list.length > 5000)
      throw Error('Expected 1–5000 paths.');
    const pre = prefix(slug);
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
  async function status(slug: string) {
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
      hidden: serializationOf(e.path) === 'unsupported',
      ...(serializationOf(e.path) === 'unsupported' ? { label: HIDDEN_LABEL } : {}),
    }));
    return {
      branch: s.branch,
      upstream: s.upstream,
      ahead: s.ahead,
      behind: s.behind,
      gitAvailable: true,
      identityConfigured: deps.identityConfigured,
      merging,
      remotes: Object.fromEntries(
        [...(await git.remotes(d))].map(([n, u]) => [n, redactCredentials(u)]),
      ),
      changes,
    };
  }
  async function after(slug: string, altered: string[] = []) {
    await deps.rescan(slug);
    const s = await git.status(repoDir(layout, slug));
    deps.emit('git', {
      project: slug,
      branch: s.branch,
      ahead: s.ahead,
      behind: s.behind,
      changes: s.changes,
      altered,
    });
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
  async function pullIn(slug: string, d: string) {
    const s = await git.status(d);
    const blocked = blockers(deps.drafts(slug), s.entries);
    if (blocked) throw blocked;
    const remote = await remoteOf(d, s.upstream);
    const before = await git.head(d);
    const r = await git.run(
      d,
      ['pull', '--no-rebase', '--no-edit', ...(s.upstream ? [] : [remote, s.branch])],
      { remote: true, allowFailure: true },
    );
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
  async function remoteAction(slug: string, kind: 'fetch' | 'pull' | 'push' | 'sync') {
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
        if (kind === 'pull' || s.upstream) result = await pullIn(slug, d);
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
  async function commitChosen(slug: string, message: string, list: unknown) {
    const d = dir(slug);
    const chosen = paths(slug, list);
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
    async diff(slug: string, path: string, from = 'HEAD', to = 'worktree') {
      const d = dir(slug);
      const p = projectPath(path);
      const [a, b] = await Promise.all([
        content(d, from, prefix(slug) + p),
        content(d, to, prefix(slug) + p),
      ]);
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
    async stage(slug: string, list: unknown) {
      const d = dir(slug);
      await git.stage(d, paths(slug, list));
      await after(slug);
      return status(slug);
    },
    async unstage(slug: string, list: unknown) {
      const d = dir(slug);
      await git.unstage(d, paths(slug, list));
      await after(slug);
      return status(slug);
    },
    async stageAll(slug: string, stage: boolean) {
      const d = dir(slug);
      const s = await git.status(d);
      const list = s.entries
        .filter(e => (stage ? e.worktree !== '.' : e.index !== '.' && !e.untracked))
        .map(e => e.path);
      if (list.length) await (stage ? git.stage(d, list) : git.unstage(d, list));
      await after(slug);
      return status(slug);
    },
    // Selected paths use `git commit --only` to preserve unrelated staged and unstaged work.
    // Without paths, commit the index; during a merge, refuse selected-path commits.
    // Report push failures separately because the commit already exists.
    async commit(
      slug: string,
      message: unknown,
      options: { paths?: unknown; push?: boolean } = {},
    ) {
      if (typeof message !== 'string' || !message.trim())
        throw new GitError('A commit message is required.');
      const result =
        options.paths === undefined
          ? await commitIndex(slug, message)
          : await commitChosen(slug, message, options.paths);
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
    async switchBranch(slug: string, branch: unknown, create = false) {
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
      await git.run(d, create ? ['switch', '-c', local] : ['switch', local]);
      const head = await git.head(d);
      const altered =
        head && head !== before
          ? await alteredAfter(d, await git.changedBetween(d, before, head))
          : [];
      await after(slug, altered);
      return { branch: local, altered };
    },
    async setRemote(slug: string, name: unknown, url: unknown) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name))
        throw Error('A remote name uses letters, digits, dot, dash or underscore.');
      if (
        typeof url !== 'string' ||
        !url.trim() ||
        url.trim().startsWith('-') ||
        /[\r\n]/.test(url) ||
        url.length > 2000
      )
        throw Error('Give the remote URL or path.');
      // `<transport>::<address>` runs a helper program (`ext::` runs any command); only URLs, scp-
      // like addresses and local paths are accepted.
      if (/^[A-Za-z][A-Za-z0-9+.-]*::/.test(url.trim()))
        throw Error('Remote helper addresses (transport::address) are not accepted.');
      const d = dir(slug);
      const remotes = await git.remotes(d);
      await git.run(
        d,
        remotes.has(name)
          ? ['remote', 'set-url', name, url.trim()]
          : ['remote', 'add', name, url.trim()],
      );
      await after(slug);
      return { name, url: url.trim() };
    },
    fetch: (slug: string) => remoteAction(slug, 'fetch'),
    pull: (slug: string) => remoteAction(slug, 'pull'),
    push: (slug: string) => remoteAction(slug, 'push'),
    sync: (slug: string) => remoteAction(slug, 'sync'),
    cancel: (slug: string) => ({ cancelled: git.cancel(dir(slug)) }),
    log: (slug: string, path?: string, limit?: number) =>
      git.log(
        dir(slug),
        path === undefined ? prefix(slug) || undefined : prefix(slug) + projectPath(path),
        limit,
      ),
    async show(slug: string, commit: string, path: string) {
      if (!REV.test(commit)) throw Error('commit must be a commit id.');
      const bytes = await git.blob(dir(slug), commit, prefix(slug) + projectPath(path));
      if (!bytes) return { source: '', exists: false };
      return { source: decode(bytes), exists: true, hash: sha256(bytes) };
    },
    // Skip binary and missing versions because the history view displays text.
    async versions(slug: string, path: string, limit = 20) {
      const d = dir(slug);
      const p = prefix(slug) + projectPath(path);
      const log = await git.log(d, p, Math.max(1, Math.min(50, limit)));
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
          out.push({ ...c, source: decode(bytes) });
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
