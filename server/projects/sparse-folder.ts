// The Git steps that keep a project in one folder of a larger repository. The repository is cloned
// without file contents, and a cone-mode sparse checkout limits the disk to the project's folder,
// plus the files at the repository root and directly inside the folder's parents, which cone mode
// always includes. The steps run through the shared Git runner, so they get its argument lists,
// timeouts and per-repository queue.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkRepositoryFolder } from '../../src/scm/repository-folder';
import { BadRequestError, MissingFolderError } from './errors';
import { commitOf, symbolicBranch, type Git, type RemoteCredential } from './git';

/** Validates a folder typed by a person; '' means the whole repository. */
export function repositoryFolder(input: unknown): string {
  const checked = checkRepositoryFolder(input);
  if (!checked.ok) throw new BadRequestError(checked.message);
  return checked.folder;
}

/** The Git arguments that limit a working copy to these folders (cone mode, option-safe). */
export function sparseSetArguments(folders: string[]): string[] {
  return ['sparse-checkout', 'set', '--cone', '--', ...folders];
}

/**
 * The pathspecs that cover everything cone mode puts on disk for these folders: the folders
 * themselves, the files at the root and the files directly inside each parent folder.
 */
export function conePathspecs(folders: string[]): string[] {
  const specs = new Set<string>([':(glob)*']);
  for (const folder of folders) {
    specs.add(folder);
    const parts = folder.split('/');
    for (let depth = 1; depth < parts.length; depth++)
      specs.add(`:(glob)${parts.slice(0, depth).join('/')}/*`);
  }
  return [...specs];
}

/** The folders a working copy is limited to; empty when it is not sparse. */
export async function sparseFolders(git: Git, dir: string): Promise<string[]> {
  const listed = await git.run(dir, ['sparse-checkout', 'list'], {
    readOnly: true,
    allowFailure: true,
  });
  return listed.code === 0 ? listed.stdout.split('\n').filter(Boolean) : [];
}

/** Whether a revision holds the folder as a directory. */
export async function folderExistsAt(git: Git, dir: string, revision: string, folder: string) {
  const kind = await git.run(dir, ['cat-file', '-t', `${revision}:${folder}`], {
    readOnly: true,
    allowFailure: true,
  });
  return kind.code === 0 && kind.stdout.trim() === 'tree';
}

/**
 * Limits a working copy to these folders. Each working copy keeps its own sparse settings
 * (`extensions.worktreeConfig`), so the per-person copies of server mode can differ from the
 * published checkout.
 */
export async function limitToFolders(git: Git, dir: string, folders: string[]) {
  await git.run(dir, ['config', 'extensions.worktreeConfig', 'true']);
  await git.run(dir, sparseSetArguments(folders));
}

/**
 * Limits a working copy made without a checkout to these folders and checks out its branch. A
 * partial clone downloads the files lazily while checking them out, so the command carries the
 * credential the person's remote needs.
 */
export async function checkOutFolders(
  git: Git,
  dir: string,
  folders: string[],
  credential?: RemoteCredential,
) {
  await limitToFolders(git, dir, folders);
  const branch = await symbolicBranch(git, dir);
  if (branch && (await commitOf(git, dir, 'HEAD')))
    await git.run(dir, ['switch', '-q', '--end-of-options', branch], { remote: true, credential });
}

/**
 * Finishes a clone made without a checkout: limits it to the folder and checks out the branch.
 * A folder the branch does not have is refused, unless `createFolder` says the first push will
 * create it; it is then made empty on disk.
 */
export async function checkOutFolder(
  git: Git,
  dir: string,
  folder: string,
  options: { createFolder: boolean; credential?: RemoteCredential },
) {
  const committed = (await commitOf(git, dir, 'HEAD')) !== null;
  const present = committed && (await folderExistsAt(git, dir, 'HEAD', folder));
  if (!present && !options.createFolder) {
    const branch = await symbolicBranch(git, dir);
    throw new MissingFolderError(folder, branch ?? 'the default branch');
  }
  await checkOutFolders(git, dir, [folder], options.credential);
  if (!present) mkdirSync(join(dir, folder), { recursive: true });
}

/** The commit whose folder contents are needed, and the remote and credential to get them. */
export type WantedContents = {
  tip: string;
  folders: string[];
  remote: string;
  credential?: RemoteCredential;
};

/**
 * Downloads the file contents a pull is about to judge and merge. A partial clone fetches a
 * commit's trees but not its files, and Git would fetch a missing file lazily while reading it,
 * which in server mode has no credential. One explicit fetch with the person's credential
 * avoids that. Nothing happens when every file is already here.
 */
export async function fetchMissingContents(git: Git, dir: string, wanted: WantedContents) {
  const { tip, folders, remote, credential } = wanted;
  const listed = await git.run(
    dir,
    [
      'rev-list',
      '--objects',
      '--missing=print',
      tip,
      '--not',
      'HEAD',
      '--',
      ...conePathspecs(folders),
    ],
    { readOnly: true, allowFailure: true },
  );
  const missing = listed.stdout
    .split('\n')
    .filter(line => line.startsWith('?'))
    .map(line => line.slice(1));
  if (!missing.length) return;
  await git.run(
    dir,
    [
      'fetch',
      '--no-tags',
      '--no-write-fetch-head',
      '--recurse-submodules=no',
      '--filter=blob:none',
      '--stdin',
      '--end-of-options',
      remote,
    ],
    { remote: true, credential, stdin: missing.join('\n') + '\n' },
  );
}
