// Runs the installed Git with argument arrays, timeouts, and a queue per repository. In local
// mode credentials come from Git configuration; in server mode a remote command receives the
// signed-in person's credential for that command only. Terminal prompts are disabled.
import { AsyncLocalStorage } from 'node:async_hooks';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadRequestError } from './errors';
import { observeGitCommand } from '../observability/git-command';
/** Default time limit for local Git commands. */
export const LOCAL_TIMEOUT_MS = 30_000;
/** Default time limit for remote Git commands. */
export const REMOTE_TIMEOUT_MS = 600_000;
/** A blob entry listed from an immutable Git tree. */
export type GitTreeEntry = { path: string; id: string; size: number };
/** Maximum bytes accepted when reading immutable definition objects. */
export type GitObjectLimits = { documentBytes: number; totalBytes: number };
const OBJECT_LIMITS: GitObjectLimits = { documentBytes: 2_000_000, totalBytes: 64_000_000 };
/** Git exit status, decoded output, and raw stdout bytes. */
export type GitResult = { code: number; stdout: string; stderr: string; bytes: Uint8Array };
/** Reports Git failure or cancellation with optional command output. */
export class GitError extends Error {
  constructor(
    message: string,
    public result?: GitResult,
    public cancelled = false,
  ) {
    super(message);
    this.name = 'GitError';
  }
}
/** A refusal a person can act on, such as nothing to commit, rather than a failure of Git. */
export class GitRefusalError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = 'GitRefusalError';
  }
}
/** Configures the allowed repository root, Git binary, environment, and timeouts. */
export type GitOptions = {
  projectsRoot: string;
  /** Root of the per-person working copies; Git may also run there in server mode. */
  worktreesRoot?: string;
  binary?: string;
  timeoutMs?: number;
  remoteTimeoutMs?: number;
  env?: Record<string, string | undefined>;
};
export type RunOptions = {
  stdin?: string;
  timeout?: number;
  allowFailure?: boolean;
  readOnly?: boolean;
  remote?: boolean;
  /** Server mode only: the credential this one remote command may use. */
  credential?: RemoteCredential;
  /** Extra variables for this one command, such as the commit author. */
  env?: Record<string, string>;
};
/**
 * A server-mode credential for one remote command: a person's token, or none for a public
 * remote. Local mode passes no credential, so Git's own helpers answer as before.
 */
export type RemoteCredential = { kind: 'token'; username: string; token: string; host: string } | { kind: 'none' };
/** The fetch and push addresses of one remote, as Git resolves them. */
export type RemoteAddresses = { name: string; fetchUrl: string; pushUrl: string };
/** The program Git runs to ask for a username and password; it reads them from its environment. */
export const ASKPASS_PROGRAM = fileURLToPath(new URL('../bin/sw-askpass', import.meta.url));
/**
 * Global options and environment that hand one command its credential. The empty helper list
 * keeps every configured credential helper from answering or storing anything, and the askpass
 * program answers from variables that exist only in this child process, and only for the host
 * the credential belongs to. Redirects and submodules could lead Git to another host, so they
 * are not followed.
 */
export function credentialSetup(credential: RemoteCredential) {
  const env: Record<string, string> = { GIT_ASKPASS: ASKPASS_PROGRAM };
  if (credential.kind === 'token') {
    env.SW_GIT_USERNAME = credential.username;
    env.SW_GIT_TOKEN = credential.token;
    env.SW_GIT_HOST = credential.host;
  }
  const args = ['-c', 'credential.helper='];
  args.push('-c', 'http.followRedirects=false');
  args.push('-c', 'submodule.recurse=false', '-c', 'fetch.recurseSubmodules=false');
  // The prompt then names only the host, which is what the askpass program checks.
  args.push('-c', 'credential.useHttpPath=false');
  // Hooks would inherit the token from this command's environment.
  args.push('-c', 'core.hooksPath=/dev/null');
  return { args, env };
}
/** Replaces a credential's token wherever Git's output repeats it. */
export function maskToken(text: string, credential?: RemoteCredential) {
  if (credential?.kind !== 'token' || !credential.token) return text;
  return text.replaceAll(credential.token, '***');
}
/** The signed-in person a server-mode commit is written for. */
export type CommitAuthor = { name: string; email: string; id: string };
/** The committer of every server-mode commit: the workbench service itself. */
export const SERVICE_COMMITTER = { name: 'Semantic Workbench', email: 'workbench@localhost' };
/** The trailer naming the stable id of the person a server-mode commit was written for. */
export const SIGNED_IN_TRAILER = 'Signed-in-user';
// Names and addresses come from the identity provider; a line break would forge a header line.
const oneLine = (text: string) => [...text].filter(char => !hasControlCharacters(char)).join('');
/**
 * The configuration, environment and trailer that make a commit authored by the person and
 * committed by the service. Without a person the repository's own identity is used, as in local
 * mode.
 */
export function authorship(author?: CommitAuthor): {
  config: string[];
  env: Record<string, string>;
  trailer: string[];
} {
  if (!author) return { config: [], env: {}, trailer: [] };
  return {
    config: ['-c', `user.name=${SERVICE_COMMITTER.name}`, '-c', `user.email=${SERVICE_COMMITTER.email}`],
    env: { GIT_AUTHOR_NAME: oneLine(author.name), GIT_AUTHOR_EMAIL: oneLine(author.email) },
    trailer: ['--trailer', `${SIGNED_IN_TRAILER}: ${oneLine(author.id)}`],
  };
}
/** Removes repository overrides and injected Git configuration, then disables terminal prompts. */
export function gitEnv(base: Record<string, string | undefined> = process.env) {
  const env: Record<string, string> = {};
  // Variables that redirect the repository, inject configuration or swap Git's helper programs.
  for (const [key, value] of Object.entries(base))
    if (
      value !== undefined &&
      !['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_EXEC_PATH'].includes(key) &&
      !/^GIT_CONFIG_(KEY|VALUE)_/.test(key)
    )
      env[key] = value;
  return { ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}
// A line of `git remote -v`: name, address and direction. A partial clone adds its filter after
// the direction, such as `[blob:none]`.
const REMOTE_LINE = /^(\S+)\t(.*) \((fetch|push)\)(?: \[[^\]]*\])?$/;
// Remote commands require explicit opt-in with `remote: true` to prevent incidental network access.
const REMOTE_COMMANDS = new Set(['fetch', 'pull', 'push', 'ls-remote', 'clone', 'remote-update']);
/** Masks credentials embedded in URLs before output is shown to users. */
export function redactCredentials(text: string) {
  return text.replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^@/\s]+@/g, '$1***@');
}
/** Tells whether text holds a control character (a newline, a tab, NUL, DEL and the like). */
export const hasControlCharacters = (text: string) => [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
/** Checks a remote's name: letters, digits, dot, dash or underscore. */
export function remoteName(name: unknown) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) throw new BadRequestError('A remote name uses letters, digits, dot, dash or underscore.');
  return name;
}
/** The branch HEAD names, also before its first commit; null when HEAD is detached. */
export async function symbolicBranch(git: Git, dir: string) {
  const result = await git.run(dir, ['symbolic-ref', '-q', '--short', 'HEAD'], {
    readOnly: true,
    allowFailure: true,
  });
  return result.code === 0 ? result.stdout.trim() : null;
}

/** The commit a revision names in a folder, or null when it names none. */
export async function commitOf(git: Git, dir: string, rev: string) {
  const result = await git.run(dir, ['rev-parse', '-q', '--verify', rev + '^{commit}'], {
    readOnly: true,
    allowFailure: true,
  });
  return result.code === 0 ? result.stdout.trim() : null;
}

/**
 * Whether a name is a branch name Git accepts that cannot be read as an option or as a reference
 * to an earlier checkout such as `@{-1}`.
 */
export async function isBranchName(git: Git, dir: string, name: string) {
  if (name.startsWith('-') || name.includes('@{')) return false;
  const checked = await git.run(dir, ['check-ref-format', '--branch', name], {
    readOnly: true,
    allowFailure: true,
  });
  return checked.code === 0;
}
/** Checks a remote URL or path and returns it trimmed. Helper addresses (`transport::address`)
 * are refused because they run a program; so are values Git could read as an option, and the
 * masked form the app shows, which would replace a working address with one that cannot sign in. */
export function remoteAddress(url: unknown) {
  if (typeof url !== 'string' || !url.trim() || url.trim().startsWith('-') || hasControlCharacters(url) || url.length > 2000) throw new BadRequestError('Give the remote URL or path.');
  if (/^[A-Za-z][A-Za-z0-9+.-]*::/.test(url.trim())) throw new BadRequestError('Remote helper addresses (transport::address) are not accepted.');
  if (url.includes('://***@')) throw new BadRequestError('This address shows *** in place of credentials; give the full address.');
  return url.trim();
}
/** Finds the Git subcommand after global options, recognizing remote update separately. */
export function subcommandOf(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-c' || arg === '-C') {
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return arg === 'remote' && args[i + 1] === 'update' ? 'remote-update' : arg;
  }
  return '';
}
/** Creates a Git runner restricted to project repositories with serialized mutations. */
export function createGit(options: GitOptions) {
  const root = resolve(options.projectsRoot);
  const copiesRoot = options.worktreesRoot ? resolve(options.worktreesRoot) : null;
  const binary = options.binary ?? 'git';
  const timeoutMs = options.timeoutMs ?? LOCAL_TIMEOUT_MS;
  const remoteTimeoutMs = options.remoteTimeoutMs ?? REMOTE_TIMEOUT_MS;
  const queues = new Map<string, Promise<unknown>>();
  const cancels = new Map<string, () => void>();
  // The turn the running code holds. Async work started inside a turn keeps this object after the turn ends, so the turn says whether it is still open.
  const holding = new AsyncLocalStorage<{ key: string; open: boolean }>();
  function insideProjects(cwd: string) {
    const dir = resolve(cwd);
    if (dir.startsWith(root + sep)) return dir;
    if (copiesRoot && dir.startsWith(copiesRoot + sep)) return dir;
    throw new GitError('Git may only run inside data/projects/ or data/worktrees/.');
  }
  // Every working copy of a repository shares its refs and objects, so the copies queue behind
  // the base repository: `worktrees/<userKey>/<repo>` waits with `projects/<repo>`.
  function queueKey(dir: string) {
    if (!copiesRoot || !dir.startsWith(copiesRoot + sep)) return dir;
    const [, ...repository] = relative(copiesRoot, dir).split(sep);
    return repository.length ? resolve(root, ...repository) : dir;
  }
  // Every Git process starts here, so every command is traced and timed once. A cancellable
  // command is a remote one.
  function spawnGit(cwd: string, args: string[], stdin?: string, timeout = timeoutMs, cancellable = false, credential?: RemoteCredential, extraEnv: Record<string, string> = {}): Promise<GitResult> {
    return observeGitCommand(subcommandOf(args) || 'unknown', args, cancellable, () => spawnGitProcess(cwd, args, stdin, timeout, cancellable, credential, extraEnv));
  }
  async function spawnGitProcess(
    cwd: string,
    args: string[],
    stdin?: string,
    timeout = timeoutMs,
    cancellable = false,
    credential?: RemoteCredential,
    extraEnv: Record<string, string> = {},
  ): Promise<GitResult> {
    if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new GitError('Git arguments must be an array of strings.');
    let proc;
    try {
      proc = Bun.spawn([binary, ...args], {
        cwd,
        env: {
          ...gitEnv(options.env),
          ...extraEnv,
          ...(credential ? credentialSetup(credential).env : {}),
        },
        stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
        stdout: 'pipe',
        stderr: 'pipe',
      });
    } catch (error) {
      throw new GitError(`Git is not available: ${(error as Error).message}`);
    }
    // On timeout or Cancel, kill Git and stop waiting: a child process (hook, credential helper)
    // may keep the pipes open.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<'timeout' | 'cancelled'>(res => {
      timer = setTimeout(() => {
        proc.kill('SIGKILL');
        res('timeout');
      }, timeout);
      if (cancellable)
        cancels.set(cwd, () => {
          proc.kill('SIGKILL');
          res('cancelled');
        });
    });
    const done = Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited]);
    const result = await Promise.race([done, stopped]);
    clearTimeout(timer);
    if (cancellable) cancels.delete(cwd);
    if (result === 'cancelled') throw new GitError(`git ${subcommandOf(args)} was cancelled.`, undefined, true);
    if (result === 'timeout') throw new GitError(`git ${subcommandOf(args)} timed out after ${Math.round(timeout / 1000)} s.`);
    const [out, stderr, code] = result;
    const bytes = new Uint8Array(out);
    return {
      code,
      stdout: new TextDecoder().decode(bytes),
      stderr: maskToken(redactCredentials(stderr), credential),
      bytes,
    };
  }
  // Serialize per repository so two operations never interleave on one index. Read-only commands
  // skip the queue, so status stays live while a push waits for a credential window.
  async function run(cwd: string, args: string[], opts: RunOptions = {}): Promise<GitResult> {
    const dir = insideProjects(cwd);
    if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new GitError('Git arguments must be an array of strings.');
    if (REMOTE_COMMANDS.has(subcommandOf(args)) && !opts.remote) throw new GitError('Remote Git commands run only from an explicit fetch, pull, push or sync.');
    if (opts.credential && !opts.remote) throw new GitError('A credential is passed only to a remote command.');
    // Remote commands never run transport helpers that execute programs (`ext::`).
    const credentialArgs = opts.credential ? credentialSetup(opts.credential).args : [];
    const argv = opts.remote ? ['-c', 'protocol.ext.allow=never', ...credentialArgs, ...args] : args;
    const exec = async () => {
      const gitResult = await spawnGit(dir, argv, opts.stdin, opts.timeout ?? (opts.remote ? remoteTimeoutMs : timeoutMs), !!opts.remote, opts.credential, opts.env);
      if (gitResult.code !== 0 && !opts.allowFailure) throw new GitError(gitResult.stderr.trim() || `git ${subcommandOf(args)} failed with exit code ${gitResult.code}.`, gitResult);
      return gitResult;
    };
    if (opts.readOnly) return exec();
    const key = queueKey(dir);
    // Work that holds the repository's turn runs its own commands inside that turn.
    const turn = holding.getStore();
    if (turn?.open && turn.key === key) return exec();
    return enqueue(key, exec);
  }
  function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(key, next);
    next
      .catch(() => {})
      .finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
    return next;
  }
  /** Runs several commands as one turn of the repository's queue, so no other command interleaves with them. */
  function exclusive<T>(cwd: string, work: () => Promise<T>): Promise<T> {
    const key = queueKey(insideProjects(cwd));
    return enqueue(key, async () => {
      const turn = { key, open: true };
      try {
        return await holding.run(turn, work);
      } finally {
        turn.open = false;
      }
    });
  }
  const read = (cwd: string, args: string[], allowFailure = false) =>
    run(cwd, ['--no-optional-locks', '-c', 'core.quotepath=off', ...args], {
      readOnly: true,
      allowFailure,
    });
  // One configuration value as Git sees it here; `scope` limits the lookup to one file.
  async function configValue(cwd: string, key: string, scope?: 'local' | 'global') {
    try {
      const gitResult = await spawnGit(cwd, ['config', ...(scope ? [`--${scope}`] : []), '--get', key]);
      const value = gitResult.stdout.trim();
      return gitResult.code === 0 && value ? value : null;
    } catch {
      return null;
    }
  }
  // The identity a commit in this repository would use, and which configuration file sets it.
  async function identityOf(cwd: string): Promise<GitIdentity> {
    const name = await configValue(cwd, 'user.name');
    const email = await configValue(cwd, 'user.email');
    if (!name || !email) return { name, email, scope: 'none' };
    const local = (await configValue(cwd, 'user.name', 'local')) && (await configValue(cwd, 'user.email', 'local'));
    return { name, email, scope: local ? 'local' : 'global' };
  }
  // Whether commits here have an author, read each time so an identity set meanwhile counts.
  const identity = async (cwd = root) => (await identityOf(cwd)).scope !== 'none';
  // Writes the identity into this repository's own configuration, never the user's global one,
  // so every write stays inside the data folder.
  async function setIdentity(cwd: string, name: string, email: string) {
    await run(cwd, ['config', '--local', 'user.name', name]);
    await run(cwd, ['config', '--local', 'user.email', email]);
  }
  const merging = async (cwd: string) => (await read(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], true)).code === 0;
  // Commit only these paths from the working tree to preserve unrelated staged and unstaged
  // changes. Skip ignored or unchanged paths; report missing identity, active merges, or no changes
  // as outcomes.
  async function commitPaths(cwd: string, paths: string[], message: string, author?: CommitAuthor): Promise<CommitPathsResult> {
    if (typeof message !== 'string' || !message.trim()) throw new GitError('A commit message is required.');
    if (!Array.isArray(paths) || !paths.length) throw new GitError('Name the files to commit.');
    // A server-mode commit is authored by the signed-in person, so no repository identity is needed.
    if (!author && !(await identity(cwd))) return { committed: false, reason: 'no-identity' };
    if (await merging(cwd)) return { committed: false, reason: 'merging' };
    const changed = new Set<string>();
    for (const chunk of chunks(paths)) {
      const gitResult = await read(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...chunk]);
      for (const statusLine of gitResult.stdout.split('\0')) if (statusLine.length > 3) changed.add(statusLine.slice(3));
    }
    const list = paths.filter(p => changed.has(p));
    if (!list.length) return { committed: false, reason: 'nothing' };
    const untracked: string[] = [];
    for (const chunk of chunks(list)) {
      const gitResult = await read(cwd, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...chunk]);
      untracked.push(...gitResult.stdout.split('\0').filter(Boolean));
    }
    for (const chunk of chunks(untracked)) await run(cwd, ['add', '--', ...chunk]);
    const signed = authorship(author);
    await run(cwd, [...signed.config, 'commit', '-q', ...signed.trailer, '--only', '-F', '-', '--', ...list], { stdin: message, env: signed.env });
    const head = await read(cwd, ['rev-parse', '-q', '--verify', 'HEAD']);
    return { committed: true, commit: head.stdout.trim() };
  }
  async function lsTree(cwd: string, revision: string, prefix = ''): Promise<GitTreeEntry[]> {
    const result = await run(cwd, ['ls-tree', '-r', '-l', '-z', revision, '--', ...(prefix ? [prefix] : [])], {
      env: { GIT_NO_LAZY_FETCH: '1' },
    });
    return result.stdout
      .split('\0')
      .filter(Boolean)
      .flatMap(entry => {
        const tab = entry.indexOf('\t');
        const fields = entry.slice(0, tab).trim().split(/\s+/);
        if (fields[1] !== 'blob') return [];
        return [{ path: entry.slice(tab + 1), id: fields[2], size: Number(fields[3]) }];
      });
  }
  async function catFileBatch(cwd: string, ids: string[], limits = OBJECT_LIMITS) {
    const unique = [...new Set(ids)];
    if (unique.some(id => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id))) {
      throw new GitError('Blob reads require full object identifiers.');
    }
    if (!unique.length) return new Map<string, Uint8Array>();
    const stdin = unique.join('\n') + '\n';
    const options = { stdin, env: { GIT_NO_LAZY_FETCH: '1' } };
    const checked = await run(cwd, ['cat-file', '--batch-check'], options);
    let total = 0;
    for (const line of checked.stdout.trim().split('\n')) {
      const [id, kind, length] = line.split(' ');
      const size = Number(length);
      if (kind !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
        throw new GitError(`Blob ${id} is unavailable.`);
      }
      total += size;
      if (size > limits.documentBytes || total > limits.totalBytes) {
        throw new GitError('Git objects exceed the snapshot byte limits.');
      }
    }
    const result = await run(cwd, ['cat-file', '--batch'], options);
    return parseBlobBatch(result.bytes, unique);
  }
  const chunks = <T>(list: T[], n = 200) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
  return {
    run,
    lsTree,
    catFileBatch,
    /** Tests commit ancestry without accepting other command failures as a negative answer. */
    async isAncestor(cwd: string, ancestor: string, descendant: string) {
      const result = await run(cwd, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true });
      if (result.code > 1) throw new GitError('Cannot determine Git ancestry.', result);
      return result.code === 0;
    },
    /** Resolves a revision to a full object id, or null when it does not exist. */
    async revParse(cwd: string, ref: string) {
      const result = await run(cwd, ['rev-parse', '--verify', '--end-of-options', ref], { allowFailure: true });
      return result.code === 0 ? result.stdout.trim() : null;
    },
    /** Resolves only a tag, peeling annotated tags to their commit. */
    async peelTag(cwd: string, name: string) {
      const ref = name.startsWith('refs/tags/') ? name : `refs/tags/${name}`;
      const result = await run(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { allowFailure: true });
      return result.code === 0 ? result.stdout.trim() : null;
    },
    // Kill the running remote operation of this repository (the UI's Cancel).
    cancel(cwd: string) {
      const kill = cancels.get(insideProjects(cwd));
      if (kill) kill();
      return !!kill;
    },
    // Global facts, checked without a repository.
    async available() {
      try {
        const gitResult = await spawnGit(root, ['--version']);
        const match = gitResult.stdout.match(/(\d+)\.(\d+)/);
        return gitResult.code === 0 && !!match && (+match[1] > 2 || (+match[1] === 2 && +match[2] >= 40));
      } catch {
        return false;
      }
    },
    identity,
    identityOf,
    setIdentity,
    configValue,
    // Clones into `folder` inside `parent` (a staging folder under data/projects/). Line endings are kept as committed, symbolic links arrive as plain files and submodules are not fetched. A partial
    // clone leaves out file contents and the checkout, so a sparse checkout can fetch only the folder it needs.
    async clone(parent: string, url: string, folder: string, credential?: RemoteCredential, options: { partial?: boolean } = {}) {
      const partial = options.partial ? ['--filter=blob:none', '--no-checkout'] : [];
      await run(parent, ['-c', 'core.autocrlf=false', '-c', 'core.symlinks=false', 'clone', '-q', '--no-recurse-submodules', ...partial, '--', url, folder], { remote: true, credential });
      const dir = resolve(parent, folder);
      await run(dir, ['config', 'core.autocrlf', 'false']);
      await run(dir, ['config', 'core.safecrlf', 'false']);
      await run(dir, ['config', 'core.symlinks', 'false']);
    },
    async init(cwd: string) {
      await run(cwd, ['init', '-q', '-b', 'main']);
      // Managed repositories keep committed bytes equal to saved bytes.
      await run(cwd, ['config', 'core.autocrlf', 'false']);
      await run(cwd, ['config', 'core.safecrlf', 'false']);
    },
    addAll: (cwd: string) => run(cwd, ['add', '-A', '--', '.']),
    commit: async (cwd: string, message: string, allowEmpty = false, author?: CommitAuthor) => {
      if (typeof message !== 'string' || !message.trim()) throw new GitError('A commit message is required.');
      const signed = authorship(author);
      const empty = allowEmpty ? ['--allow-empty'] : [];
      return run(cwd, [...signed.config, 'commit', '-q', ...empty, ...signed.trailer, '-F', '-'], {
        stdin: message,
        env: signed.env,
      });
    },
    // Tracked and untracked files, with .gitignore applied by Git itself.
    async lsFiles(cwd: string) {
      const gitResult = await read(cwd, ['ls-files', '-co', '--exclude-standard', '-z']);
      return [...new Set(gitResult.stdout.split('\0').filter(Boolean))];
    },
    // The full name of the checked-out branch, or null when HEAD points at a commit directly.
    async currentRef(cwd: string) {
      const gitResult = await read(cwd, ['symbolic-ref', '-q', 'HEAD'], true);
      return gitResult.code === 0 ? gitResult.stdout.trim() : null;
    },
    // Every path any commit reachable from the revision ever touched, in repository spelling.
    async historyPaths(cwd: string, rev: string) {
      const gitResult = await read(cwd, ['log', '--format=', '--name-only', '--no-renames', '-z', rev]);
      return [...new Set(gitResult.stdout.split('\0').filter(Boolean))];
    },
    // Writes the revisions and their history into a bundle file that `git clone` can read.
    async bundle(cwd: string, file: string, revs: string[]) {
      await run(cwd, ['bundle', 'create', '-q', file, ...revs]);
    },
    async status(cwd: string) {
      const gitResult = await read(cwd, ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all']);
      return parseStatus(gitResult.stdout);
    },
    async stage(cwd: string, paths: string[]) {
      for (const chunk of chunks(paths)) await run(cwd, ['add', '-A', '--', ...chunk]);
    },
    async unstage(cwd: string, paths: string[]) {
      const head = (await read(cwd, ['rev-parse', '-q', '--verify', 'HEAD'], true)).code === 0;
      for (const chunk of chunks(paths)) await run(cwd, head ? ['restore', '--staged', '--', ...chunk] : ['rm', '-q', '-r', '--cached', '--', ...chunk]);
    },
    // A file's bytes at a revision (`HEAD`, a commit, or '' for the index); null when it is absent.
    async blob(cwd: string, rev: string, path: string) {
      const gitResult = await read(cwd, ['cat-file', 'blob', `${rev}:${path}`], true);
      return gitResult.code === 0 ? gitResult.bytes : null;
    },
    async head(cwd: string) {
      const gitResult = await read(cwd, ['rev-parse', '-q', '--verify', 'HEAD'], true);
      return gitResult.code === 0 ? gitResult.stdout.trim() : null;
    },
    merging,
    commitPaths,
    exclusive,
    async branches(cwd: string) {
      const gitResult = await read(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']);
      const refs = gitResult.stdout.split('\n').filter(Boolean);
      return {
        local: refs.filter(x => x.startsWith('refs/heads/')).map(x => x.slice(11)),
        remote: refs.filter(x => x.startsWith('refs/remotes/') && !x.endsWith('/HEAD')).map(x => x.slice(13)),
      };
    },
    // Every remote with the fetch and push addresses Git resolves (`insteadOf`, `pushurl`).
    async remoteAddresses(cwd: string) {
      const gitResult = await read(cwd, ['remote', '-v']);
      const out = new Map<string, RemoteAddresses>();
      for (const line of gitResult.stdout.split('\n')) {
        const match = line.match(REMOTE_LINE);
        if (!match) continue;
        const entry = out.get(match[1]) ?? { name: match[1], fetchUrl: '', pushUrl: '' };
        if (match[3] === 'fetch') entry.fetchUrl = match[2];
        else entry.pushUrl = match[2];
        out.set(match[1], entry);
      }
      return [...out.values()];
    },
    async remotes(cwd: string) {
      const gitResult = await read(cwd, ['remote', '-v']);
      const out = new Map<string, string>();
      for (const remoteLine of gitResult.stdout.split('\n')) {
        const match = remoteLine.match(REMOTE_LINE);
        if (match && match[3] === 'fetch') out.set(match[1], match[2]);
      }
      return out;
    },
    // Raw blob ids of working-tree files (no filters applied) and of a revision's tree entries.
    async worktreeIds(cwd: string, paths: string[]) {
      const out = new Map<string, string>();
      for (const chunk of chunks(paths)) {
        if (!chunk.length) continue;
        const gitResult = await read(cwd, ['hash-object', '--no-filters', '--', ...chunk]);
        gitResult.stdout
          .split('\n')
          .filter(Boolean)
          .forEach((id, i) => out.set(chunk[i], id));
      }
      return out;
    },
    async treeIds(cwd: string, rev: string, paths: string[]) {
      const out = new Map<string, string>();
      for (const chunk of chunks(paths)) {
        if (!chunk.length) continue;
        const gitResult = await read(cwd, ['ls-tree', '-r', '-z', rev, '--', ...chunk], true);
        for (const treeEntry of gitResult.stdout.split('\0').filter(Boolean)) {
          const tab = treeEntry.indexOf('\t');
          out.set(treeEntry.slice(tab + 1), treeEntry.slice(0, tab).split(' ')[2]);
        }
      }
      return out;
    },
    async changedBetween(cwd: string, from: string | null, to: string) {
      const gitResult = from ? await read(cwd, ['diff', '--no-ext-diff', '--name-only', '-z', from, to]) : await read(cwd, ['ls-tree', '-r', '-z', '--name-only', to]);
      return gitResult.stdout.split('\0').filter(Boolean);
    },
    async log(cwd: string, path?: string, limit = 50) {
      const gitResult = await read(
        cwd,
        ['log', '-z', '--name-only', `-n${Math.max(1, Math.min(500, limit))}`, '--format=%x1e%H%x1f%an%x1f%aI%x1f%s%x00', ...(path ? [...(path.endsWith('/') ? [] : ['--follow']), '--', path] : [])],
        true,
      );
      if (gitResult.code !== 0) return [];
      return gitResult.stdout
        .split('\x1e')
        .filter(Boolean)
        .map(record => {
          const [header, ...names] = record.split('\0');
          const [commit, author, date, message] = header.split('\x1f');
          const paths = names.map(name => name.replace(/^\n/, '')).filter(Boolean);
          return { commit, author, date, message, paths };
        });
    },
  };
}
function parseBlobBatch(bytes: Uint8Array, ids: string[]): Map<string, Uint8Array> {
  const blobs = new Map<string, Uint8Array>();
  let offset = 0;
  for (const id of ids) {
    const newline = bytes.indexOf(10, offset);
    if (newline < 0) throw new GitError('Incomplete Git blob header.');
    const [actual, kind, length] = new TextDecoder().decode(bytes.subarray(offset, newline)).split(' ');
    const size = Number(length);
    const start = newline + 1;
    const end = start + size;
    if (actual !== id || kind !== 'blob' || !Number.isSafeInteger(size) || size < 0 || bytes[end] !== 10) {
      throw new GitError(`Incomplete Git blob ${id}.`);
    }
    blobs.set(id, bytes.slice(start, end));
    offset = end + 1;
  }
  if (offset !== bytes.length) throw new GitError('Unexpected trailing Git blob data.');
  return blobs;
}
/** A repository's user.name and user.email and the configuration that sets them. */
export type GitIdentity = {
  name: string | null;
  email: string | null;
  scope: 'local' | 'global' | 'none';
};
/** Repository operations backed by the installed Git executable. */
export type Git = ReturnType<typeof createGit>;
/** A selected-path commit result or the reason no commit was made. */
export type CommitPathsResult = { committed: true; commit: string } | { committed: false; reason: 'no-identity' | 'merging' | 'nothing' };
/** Workspace status of a file relative to Git’s index and working tree. */
export type FileGitState = 'clean' | 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
/** A changed path with Git index and worktree codes, including rename and conflict details. */
export type StatusEntry = {
  path: string;
  orig?: string;
  index: string;
  worktree: string;
  conflicted: boolean;
  untracked: boolean;
};
// Rename records include the original path as a separate NUL-terminated element.
/** Parses NUL-delimited porcelain status into branch metadata and changed paths. */
export function parseStatus(output: string) {
  const parts = output.split('\0');
  let branch = '';
  let head: string | null = null;
  let upstream = '';
  let hasCommits = true;
  let ahead = 0;
  let behind = 0;
  const files = new Map<string, FileGitState>();
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    if (entry.startsWith('# branch.oid ')) {
      hasCommits = entry.slice(13) !== '(initial)';
      head = hasCommits ? entry.slice(13) : null;
    } else if (entry.startsWith('# branch.head ')) branch = entry.slice(14);
    else if (entry.startsWith('# branch.upstream ')) upstream = entry.slice(18);
    else if (entry.startsWith('# branch.ab ')) {
      const match = entry.match(/\+(\d+) -(\d+)/);
      if (match) {
        ahead = +match[1];
        behind = +match[2];
      }
    } else if (entry.startsWith('? ')) {
      const path = entry.slice(2);
      files.set(path, 'untracked');
      entries.push({ path, index: '?', worktree: '?', conflicted: false, untracked: true });
    } else if (entry.startsWith('1 ')) {
      const fields = entry.split(' ');
      const xy = fields[1];
      const path = fields.slice(8).join(' ');
      let fileState: FileGitState;
      if (xy[0] === 'A') {
        fileState = 'added';
      } else if (xy.includes('D')) {
        fileState = 'deleted';
      } else {
        fileState = 'modified';
      }
      files.set(path, fileState);
      entries.push({ path, index: xy[0], worktree: xy[1], conflicted: false, untracked: false });
    } else if (entry.startsWith('2 ')) {
      const fields = entry.split(' ');
      const path = fields.slice(9).join(' ');
      files.set(path, 'renamed');
      entries.push({
        path,
        orig: parts[i + 1],
        index: fields[1][0],
        worktree: fields[1][1],
        conflicted: false,
        untracked: false,
      });
      i++;
    } else if (entry.startsWith('u ')) {
      const fields = entry.split(' ');
      const path = fields.slice(10).join(' ');
      files.set(path, 'conflicted');
      entries.push({
        path,
        index: fields[1][0],
        worktree: fields[1][1],
        conflicted: true,
        untracked: false,
      });
    }
  }
  return { branch, head, upstream, hasCommits, ahead, behind, changes: files.size, files, entries };
}
