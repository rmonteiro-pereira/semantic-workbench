// Clones a remote repository into a new project. The clone lands in a staging folder under
// data/projects/ and moves into place with the registry in one journaled step, so a failed,
// cancelled or interrupted clone leaves nothing behind.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { GitError, hasControlCharacters, redactCredentials, remoteAddress, type Git, type RemoteCredential } from './git';
import type { Journal, RecoveryOutcome } from './journal';
import { projectDir, slugify, uniqueName, type DataLayout } from './paths';
import type { ProjectEntry } from './state';
import { BadRequestError, MissingFolderError } from './errors';
import { checkOutFolder, repositoryFolder } from './sparse-folder';

/** Prefix of the staging folders that hold a clone in progress. */
export const CLONE_STAGING = '.staging-clone-';

/** Progress and outcome of one clone, sent to the browser as `clone` events. */
export type CloneEvent = CloneEventFields &
  (
    | { phase: 'cloning' | 'scanning' | 'failed' | 'cancelled' }
    | {
        phase: 'done';
        /** How many definition files the clone holds, valid or not. */
        definitions: number;
        /** False when the repository has no commits yet. */
        hasCommits: boolean;
      }
  );

type CloneEventFields = {
  op: string;
  message?: string;
  repo?: string;
  name?: string;
  /** The folder of the repository the project lives in, when only that folder was checked out. */
  folder?: string;
  /** A folder the remote branch does not have; the person may ask to create it with a push. */
  missingFolder?: string;
  invalid?: string[];
  /** Folders proposed as projects when the repository has no manifest. */
  candidates?: { path: string; files: number }[];
  /** The projects a manifest declared; they are registered at once. */
  manifest?: { projects: { path: string; name?: string }[] };
  /** The slugs of the projects registered from the manifest. */
  projects?: string[];
  /** A manifest that could not be read, and why. */
  manifestError?: string;
};

/**
 * Gives every project a clone created its access metadata, all at once, before the clone reports
 * done. A failure fails the clone.
 */
export type AssignProject = (slugs: string[]) => Promise<void>;
/** The optional folder of a repository to check out instead of the whole repository. */
export type FolderRequest = {
  /** Check out only this folder; it becomes the project root. */
  folder?: unknown;
  /** With a folder: accept one the remote branch lacks, to be created by the first push. */
  createFolder?: boolean;
};
/** Workspace services a clone needs. */
export type CloneDeps = {
  layout: DataLayout;
  git: Git;
  journal: Journal;
  projects: () => ProjectEntry[];
  lock: <Result>(key: string, fn: () => Promise<Result> | Result) => Promise<Result>;
  registrySteps: (stateStaging: string, next: ProjectEntry[]) => { from: string; to: string }[];
  scan: (slug: string) => Promise<unknown>;
  invalidFiles: (slug: string) => string[];
  definitionCount: (slug: string) => number;
  added: (slug: string) => void;
  /** Reads the repository's manifest or proposes folders, and registers declared projects. */
  afterClone: (slug: string) => Promise<Pick<CloneEvent, 'candidates' | 'manifest' | 'manifestError' | 'projects'>>;
  emit: (event: CloneEvent, owner?: string) => void;
};

// A project name from the last segment of the address, without `.git`.
export function nameFromAddress(address: string) {
  const last = address
    .replace(/[/\\]+$/, '')
    .split(/[/\\:]/)
    .pop()!;
  return last.replace(/\.git$/i, '') || 'Cloned repository';
}

// A project cloned from a folder is named after that folder, otherwise after the repository.
function nameFromSource(address: string, folder: string) {
  return folder ? posix.basename(folder) : nameFromAddress(address);
}

function checkName(name: unknown) {
  if (name === undefined || name === null || name === '') return undefined;
  if (typeof name !== 'string' || name.length > 120 || hasControlCharacters(name)) throw new BadRequestError('A project name is 1–120 characters without control characters.');
  return name.trim() || undefined;
}

/** Removes clone staging folders left by a stopped workbench and reports each as rolled back. */
export function rollBackInterruptedClones(layout: DataLayout): RecoveryOutcome[] {
  let names: string[] = [];
  try {
    names = readdirSync(layout.projects);
  } catch {
    return [];
  }
  return names
    .filter(name => name.startsWith(CLONE_STAGING))
    .map(name => {
      rmSync(join(layout.projects, name), { recursive: true, force: true });
      return {
        opId: name.slice(CLONE_STAGING.length),
        kind: 'clone',
        outcome: 'rolled-back' as const,
        paths: [],
      };
    });
}

/** Creates the clone service: start a clone, cancel it, and list the ones running. */
export function createCloner(deps: CloneDeps) {
  const { layout, git, journal } = deps;
  /** The repository address and the project it becomes, with the person who asked. */
  /**
   * Who receives the clone's events, how each new project gets its access metadata, and in
   * server mode the credential the clone command uses.
   */
  type CloneOptions = FolderRequest & {
    owner?: string;
    assign?: AssignProject;
    credential?: RemoteCredential;
  };
  type CloneRequest = {
    address: string;
    slug: string;
    name: string;
    folder: string;
    createFolder: boolean;
  } & Pick<CloneOptions, 'owner' | 'assign' | 'credential'>;
  // Clones in progress, so two clones started together never pick the same name or folder.
  const running = new Map<string, { staging: string; slug: string; name: string }>();

  // Runs the clone and reports every outcome as an event; it never throws.
  async function cloneInBackground(op: string, request: CloneRequest) {
    const { address, slug, name, folder, createFolder, owner, assign, credential } = request;
    const staging = join(layout.projects, CLONE_STAGING + op);
    const stateStaging = join(layout.state, `.staging-${op}`);
    try {
      deps.emit({ op, phase: 'cloning', name }, owner);
      mkdirSync(staging, { recursive: true });
      await git.clone(staging, address, slug, credential, { partial: folder !== '' });
      if (folder) await checkOutFolder(git, join(staging, slug), folder, { createFolder, credential });
      deps.emit({ op, phase: 'scanning', name }, owner);
      await deps.lock('registry', async () => {
        const current = deps.projects();
        if (current.some(project => project.slug === slug) || existsSync(projectDir(layout, slug))) throw new BadRequestError(`A project folder named ${slug} appeared meanwhile; clone again.`);
        const project: ProjectEntry = {
          slug,
          name,
          createdAt: new Date().toISOString(),
          origin: 'clone',
          remoteAddress: redactCredentials(address),
          ...(folder ? { folder: `${slug}/${folder}`, repo: slug } : {}),
        };
        journal.run('clone', [{ from: join(staging, slug), to: projectDir(layout, slug) }, ...deps.registrySteps(stateStaging, [...current, project])], [staging, stateStaging], op);
      });
      await deps.scan(slug);
      deps.added(slug);
      const invalid = deps.invalidFiles(slug);
      const definitions = deps.definitionCount(slug);
      const hasCommits = (await git.head(projectDir(layout, slug))) !== null;
      // A folder is the project root; the repository's manifest and layout do not apply to it.
      const projects = folder ? {} : await deps.afterClone(slug);
      await assign?.(projects.projects ?? [slug]);
      const done: CloneEvent = {
        op,
        phase: 'done',
        repo: slug,
        name,
        invalid,
        definitions,
        hasCommits,
        ...projects,
      };
      deps.emit(folder ? { ...done, folder } : done, owner);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      rmSync(stateStaging, { recursive: true, force: true });
      const cancelled = error instanceof GitError && error.cancelled;
      deps.emit(
        {
          op,
          phase: cancelled ? 'cancelled' : 'failed',
          name,
          message: cancelled ? 'Clone cancelled.' : redactCredentials((error as Error).message),
          ...(error instanceof MissingFolderError ? { missingFolder: error.folder } : {}),
        },
        owner,
      );
    } finally {
      running.delete(op);
    }
  }

  return {
    /** Starts a clone and returns at once; progress arrives as events. */
    start(url: unknown, requestedName?: unknown, options: CloneOptions = {}) {
      const address = remoteAddress(url);
      const folder = repositoryFolder(options.folder);
      const current = deps.projects();
      const pending = [...running.values()];
      const name = uniqueName(checkName(requestedName) ?? nameFromSource(address, folder), [...current.map(project => project.name), ...pending.map(clone => clone.name)]);
      const taken = new Set([...current.map(project => project.slug), ...pending.map(clone => clone.slug)]);
      for (const folder of readdirSync(layout.projects)) taken.add(folder);
      const slug = slugify(name, taken);
      const op = journal.newId();
      running.set(op, { staging: join(layout.projects, CLONE_STAGING + op), slug, name });
      const { owner, assign, credential } = options;
      const createFolder = options.createFolder === true;
      void cloneInBackground(op, {
        address,
        slug,
        name,
        folder,
        createFolder,
        owner,
        assign,
        credential,
      });
      return { op, name, slug };
    },
    /** Stops a running clone; its staging folder is removed. */
    cancel(op: string) {
      const clone = running.get(op);
      return { cancelled: clone ? git.cancel(clone.staging) : false };
    },
  };
}
