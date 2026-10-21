// Clones a remote repository into a new project. The clone lands in a staging folder under
// data/projects/ and moves into place with the registry in one journaled step, so a failed,
// cancelled or interrupted clone leaves nothing behind.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GitError, hasControlCharacters, redactCredentials, remoteAddress, type Git } from './git';
import type { Journal, RecoveryOutcome } from './journal';
import { projectDir, slugify, uniqueName, type DataLayout } from './paths';
import type { ProjectEntry } from './state';

/** Prefix of the staging folders that hold a clone in progress. */
export const CLONE_STAGING = '.staging-clone-';

/** Progress and outcome of one clone, sent to the browser as `clone` events. */
export type CloneEvent = {
  op: string;
  phase: 'cloning' | 'scanning' | 'done' | 'failed' | 'cancelled';
  message?: string;
  repo?: string;
  name?: string;
  invalid?: string[];
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
  added: (slug: string) => void;
  emit: (event: CloneEvent) => void;
};

// A project name from the last segment of the address, without `.git`.
export function nameFromAddress(address: string) {
  const last = address
    .replace(/[/\\]+$/, '')
    .split(/[/\\:]/)
    .pop()!;
  return last.replace(/\.git$/i, '') || 'Cloned repository';
}

function checkName(name: unknown) {
  if (name === undefined || name === null || name === '') return undefined;
  if (typeof name !== 'string' || name.length > 120 || hasControlCharacters(name))
    throw Error('A project name is 1–120 characters without control characters.');
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
  // Clones in progress, so two clones started together never pick the same name or folder.
  const running = new Map<string, { staging: string; slug: string; name: string }>();

  // Runs the clone and reports every outcome as an event; it never throws.
  async function cloneInBackground(op: string, address: string, slug: string, name: string) {
    const staging = join(layout.projects, CLONE_STAGING + op);
    const stateStaging = join(layout.state, `.staging-${op}`);
    try {
      deps.emit({ op, phase: 'cloning', name });
      mkdirSync(staging, { recursive: true });
      await git.clone(staging, address, slug);
      deps.emit({ op, phase: 'scanning', name });
      await deps.lock('registry', async () => {
        const current = deps.projects();
        if (current.some(project => project.slug === slug) || existsSync(projectDir(layout, slug)))
          throw Error(`A project folder named ${slug} appeared meanwhile; clone again.`);
        const project: ProjectEntry = {
          slug,
          name,
          createdAt: new Date().toISOString(),
          origin: 'clone',
          remoteAddress: redactCredentials(address),
        };
        journal.run(
          'clone',
          [
            { from: join(staging, slug), to: projectDir(layout, slug) },
            ...deps.registrySteps(stateStaging, [...current, project]),
          ],
          [staging, stateStaging],
          op,
        );
      });
      await deps.scan(slug);
      deps.added(slug);
      deps.emit({ op, phase: 'done', repo: slug, name, invalid: deps.invalidFiles(slug) });
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      rmSync(stateStaging, { recursive: true, force: true });
      const cancelled = e instanceof GitError && e.cancelled;
      deps.emit({
        op,
        phase: cancelled ? 'cancelled' : 'failed',
        name,
        message: cancelled ? 'Clone cancelled.' : redactCredentials((e as Error).message),
      });
    } finally {
      running.delete(op);
    }
  }

  return {
    /** Starts a clone and returns at once; progress arrives as events. */
    start(url: unknown, requestedName?: unknown) {
      const address = remoteAddress(url);
      const current = deps.projects();
      const pending = [...running.values()];
      const name = uniqueName(checkName(requestedName) ?? nameFromAddress(address), [
        ...current.map(project => project.name),
        ...pending.map(clone => clone.name),
      ]);
      const taken = new Set([
        ...current.map(project => project.slug),
        ...pending.map(clone => clone.slug),
      ]);
      for (const folder of readdirSync(layout.projects)) taken.add(folder);
      const slug = slugify(name, taken);
      const op = journal.newId();
      running.set(op, { staging: join(layout.projects, CLONE_STAGING + op), slug, name });
      void cloneInBackground(op, address, slug, name);
      return { op, name, slug };
    },
    /** Stops a running clone; its staging folder is removed. */
    cancel(op: string) {
      const clone = running.get(op);
      return { cancelled: clone ? git.cancel(clone.staging) : false };
    },
  };
}
