import type { EventTags } from './events';
import { type Reader } from './reader';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GitError, type CommitAuthor, type Git, type GitResult, type RemoteAddresses, type RemoteCredential, type StatusEntry } from './git';
import { decode } from './atomic';
import { projectPrefix, repoDir, type DataLayout } from './paths';
import { fetchMissingContents, sparseFolders } from './sparse-folder';
import type { ContentGuard } from '../auth/guards';
/** Reports drafts or uncommitted changes that prevent a source control operation. */
export class BlockedError extends Error {
  constructor(
    public reason: 'drafts' | 'dirty',
    public paths: string[],
  ) {
    super(reason === 'drafts' ? 'Save or discard the unsaved edits first.' : 'Commit or discard the changes first; nothing is stashed automatically.');
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
/** Whether request paths are relative to the project or to its repository root. */
export type PathBase = 'project' | 'repository';
/** Picks the credential for the remote a command reaches; server mode only. */
export type CredentialFor = (remote: RemoteAddresses) => Promise<RemoteCredential>;
// The remote a request uses, chosen once, with the credential for it.
export type RemoteChoice = { name: string; credential?: RemoteCredential };
// A remote command's chosen remote, and the content guard that checks what a pull brings in.
export type RemoteRequest = {
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
  mergeDefault?: (slug: string, author: CommitAuthor | undefined, check: (tip: string) => Promise<void>) => Promise<GitResult>;
};
/** The helpers every Source Control module shares: Git access, repository paths and refreshes. */
export type ScmContext = {
  deps: ScmDeps;
  layout: DataLayout;
  git: Git;
  /** The repository folder of a project; refuses when Git is not available. */
  dir: (slug: string) => string;
  prefix: (slug: string) => string;
  ownerOf: (slug: string, path: string) => { project: string; prefix: string } | undefined;
  sparseProjectFolder: (slug: string, directory: string) => Promise<{ folder?: string }>;
  fetchFolderContents: (directory: string, tip: string, chooseRemote: () => Promise<RemoteChoice | null>) => Promise<void>;
  after: (slug: string, altered?: string[]) => Promise<Awaited<ReturnType<Git['status']>>>;
  alteredAfter: (directory: string, changed: string[]) => Promise<string[]>;
};

/** Whether bytes are text, and the text when they are. */
export const asText = (bytes: Uint8Array | null) => {
  if (!bytes) return { text: '', binary: false };
  if (bytes.subarray(0, 8000).includes(0)) return { text: '', binary: true };
  try {
    return { text: decode(bytes), binary: false };
  } catch {
    return { text: '', binary: true };
  }
};

/** Builds the helpers that the remote, branch and local Source Control modules share. */
export function createScmContext(deps: ScmDeps): ScmContext {
  const { layout, git } = deps;
  // Projects sharing a repository also share its Git queue to avoid interleaving index changes.
  // Project paths gain their repository prefix before reaching Git.
  function dir(slug: string) {
    deps.project(slug);
    if (!deps.gitAvailable) throw new GitError('Git is not available on this machine. Install Git 2.40 or newer and restart the workbench.');
    return repoDir(layout, slug);
  }
  const prefix = (slug: string) => projectPrefix(layout, slug);
  const locationRepo = (slug: string) => {
    const dir = repoDir(layout, slug);
    return dir.slice(layout.projects.length + 1);
  };
  function ownerOf(slug: string, path: string) {
    return deps
      .siblings(slug)
      .map(project => ({ project, prefix: prefix(project) }))
      .filter(owner => path.startsWith(owner.prefix))
      .sort((left, right) => right.prefix.length - left.prefix.length)[0];
  }
  // The folder of the repository a sparse project lives in, for the panel header and the rule
  // below; nothing when the whole repository is checked out. A project in a folder of a repository
  // that is checked out in full, as in a shared monorepo, is deliberately not limited: its
  // sibling projects are on disk and their files are committed from the same panel.
  async function sparseProjectFolder(slug: string, directory: string): Promise<{ folder?: string }> {
    const folders = await sparseFolders(git, directory);
    const folder = prefix(slug).replace(/\/$/, '');
    return folders.length && folder ? { folder } : {};
  }
  // Downloads what a judged change brings before it is read, when the repository holds only a
  // folder; a full clone has every file already.
  async function fetchFolderContents(directory: string, tip: string, chooseRemote: () => Promise<RemoteChoice | null>) {
    const folders = await sparseFolders(git, directory);
    if (!folders.length) return;
    const choice = await chooseRemote();
    if (!choice) return;
    await fetchMissingContents(git, directory, {
      tip,
      folders,
      remote: choice.name,
      credential: choice.credential,
    });
  }
  // Every Git change concerns the whole repository, so all of its projects rescan.
  async function after(slug: string, altered: string[] = []) {
    const projects = deps.siblings(slug);
    for (const project of projects) await deps.rescan(project);
    const gitStatus = await git.status(repoDir(layout, slug));
    deps.emit(
      'git',
      {
        project: slug,
        repo: locationRepo(slug),
        projects,
        branch: gitStatus.branch,
        ahead: gitStatus.ahead,
        behind: gitStatus.behind,
        changes: gitStatus.changes,
        altered,
      },
      { projects, paths: altered.map(path => ({ project: slug, path })) },
    );
    return gitStatus;
  }
  // Hooks and filters can change saved bytes even when Git reports a clean file.
  // Skip files with uncommitted edits so normal editing is not reported as a rewrite.
  async function alteredAfter(directory: string, changed: string[]) {
    if (!changed.length) return [];
    const gitStatus = await git.status(directory);
    const busy = new Set(gitStatus.entries.filter(e => e.worktree !== '.' || e.conflicted).map(e => e.path));
    const candidates = changed.filter(p => !busy.has(p) && existsSync(join(directory, p)));
    const [disk, tree] = await Promise.all([git.worktreeIds(directory, candidates), git.treeIds(directory, 'HEAD', candidates)]);
    return candidates.filter(p => tree.has(p) && disk.get(p) !== tree.get(p));
  }
  return { deps, layout, git, dir, prefix, ownerOf, sparseProjectFolder, fetchFolderContents, after, alteredAfter };
}
