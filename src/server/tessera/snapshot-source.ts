// Reads one project folder as it is in a commit on the default branch, from Git objects only. The working tree, the index and other branches are never read.
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { UnitFile } from '../../shared/tessera/compile-unit';
import { commitOf, createGit, isBranchName, type Git } from '../projects/git';
import { parsePublishedState } from '../projects/published-pointer';
import { SNAPSHOT_LIMITS, type SnapshotLimits } from '../projects/snapshot-index';
import { UnknownDefaultBranchError, defaultBranchAt } from '../projects/worktrees';
import { TesseraRefusal } from './refusal';

/** What the person asked to read. */
export type SnapshotRequest = {
  repository: string;
  projectFolder?: string;
  branch?: string;
  commit?: string;
  dataRoot?: string;
};

/** A committed project folder: where it came from and the bytes of its files. */
export type SnapshotSource = {
  kind: 'published-snapshot';
  branch: string;
  commit: string;
  projectFolder: string;
  files: UnitFile[];
};

const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REMOTE_PREFIX = 'refs/remotes/origin/';

/** Creates the Git helper for a repository: its parent folder is the one place Git may run. */
export function gitFor(repository: string): Git {
  return createGit({ projectsRoot: dirname(resolve(repository)) });
}

/** Names the default branch: the one asked for, else the one the workbench itself would publish. */
async function defaultBranch(git: Git, directory: string, requested: string | undefined): Promise<string> {
  if (requested !== undefined) {
    if (!(await isBranchName(git, directory, requested))) throw new TesseraRefusal(`${requested} is not a branch name.`);
    return requested;
  }
  try {
    return await defaultBranchAt(git, directory, basename(directory));
  } catch (error) {
    if (error instanceof UnknownDefaultBranchError) throw new TesseraRefusal(`The default branch of ${basename(directory)} is unknown. Name it with --branch.`);
    throw error;
  }
}

async function branchTip(git: Git, directory: string, branch: string): Promise<string> {
  const tip = (await commitOf(git, directory, `refs/heads/${branch}`)) ?? (await commitOf(git, directory, `${REMOTE_PREFIX}${branch}`));
  if (!tip) throw new TesseraRefusal(`The branch ${branch} has no commit, so there is no published snapshot to compile.`);
  return tip;
}

async function chosenCommit(git: Git, directory: string, branch: string, tip: string, requested: string | undefined): Promise<string> {
  if (requested === undefined) return tip;
  if (!FULL_COMMIT.test(requested)) throw new TesseraRefusal('--commit needs a full commit identifier.');
  if ((await commitOf(git, directory, requested)) !== requested) throw new TesseraRefusal(`The commit ${requested} does not exist in this repository.`);
  if (!(await git.isAncestor(directory, requested, tip))) throw new TesseraRefusal(`The commit ${requested} is not on the history of ${branch}.`);
  return requested;
}

/** With a data root, the commit must be the one the workbench has published for this repository. */
function checkPublishedPointer(dataRoot: string, directory: string, branch: string, commit: string) {
  let state;
  try {
    state = parsePublishedState(JSON.parse(readFileSync(join(dataRoot, 'state', 'published.json'), 'utf8')));
  } catch (error) {
    throw new TesseraRefusal(`The data root has no readable publication record: ${(error as Error).message}`);
  }
  const projectsRoot = resolve(dataRoot, 'projects');
  const inside = resolve(directory).startsWith(projectsRoot + '/');
  const pointer = state.repositories[inside ? relative(projectsRoot, resolve(directory)) : basename(directory)];
  if (!pointer?.commit) throw new TesseraRefusal('The workbench has not published this repository.');
  if (pointer.branch !== branch) throw new TesseraRefusal(`The workbench publishes ${pointer.branch}, not ${branch}.`);
  if (pointer.commit !== commit) throw new TesseraRefusal(`The workbench has published ${pointer.commit}, not ${commit}.`);
}

function folderPrefix(projectFolder: string | undefined): string {
  if (projectFolder === undefined || projectFolder === '.' || projectFolder === '') return '';
  const parts = projectFolder.split('/');
  const unsafe = projectFolder.startsWith('/') || projectFolder.includes('\\') || parts.some(part => part === '' || part === '.' || part === '..' || part.toLowerCase() === '.git');
  if (unsafe) throw new TesseraRefusal(`${projectFolder} is not a folder inside the repository.`);
  return projectFolder + '/';
}

/** Resolves the commit, checks the limits before any blob is read, then reads the project folder's files. */
export async function readSnapshot(request: SnapshotRequest, git: Git = gitFor(request.repository), limits: SnapshotLimits = SNAPSHOT_LIMITS): Promise<SnapshotSource> {
  const directory = resolve(request.repository);
  const inside = await git.run(directory, ['rev-parse', '--git-dir'], { readOnly: true, allowFailure: true });
  if (inside.code !== 0) throw new TesseraRefusal(`${request.repository} is not a Git repository.`);
  const branch = await defaultBranch(git, directory, request.branch);
  const commit = await chosenCommit(git, directory, branch, await branchTip(git, directory, branch), request.commit);
  if (request.dataRoot) checkPublishedPointer(resolve(request.dataRoot), directory, branch, commit);
  const prefix = folderPrefix(request.projectFolder);
  const entries = await git.lsTree(directory, commit, prefix);
  if (entries.length > limits.projectFiles) throw new TesseraRefusal(`The folder holds ${entries.length} files, and the limit is ${limits.projectFiles}.`);
  const tooLarge = entries.find(entry => entry.size > limits.documentBytes);
  if (tooLarge) throw new TesseraRefusal(`${tooLarge.path} holds ${tooLarge.size} bytes, and the limit is ${limits.documentBytes}.`);
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > limits.totalBytes) throw new TesseraRefusal(`The folder holds ${total} bytes, and the limit is ${limits.totalBytes}.`);
  const blobs = await git.catFileBatch(
    directory,
    entries.map(entry => entry.id),
    limits,
  );
  const files = entries.map(entry => ({ path: entry.path.slice(prefix.length), bytes: blobs.get(entry.id)! }));
  return { kind: 'published-snapshot', branch, commit, projectFolder: prefix ? prefix.slice(0, -1) : '.', files };
}
