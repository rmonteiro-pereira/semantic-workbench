/** Derives the list of published importers from committed dependency manifests. */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compareText } from '../../shared/tessera/canonical-json';
import { atomicWriteJson, sha256 } from '../projects/atomic';
import { locationOf } from '../projects/paths';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { ProjectEntry } from '../projects/state';
import { LOCAL_READER } from '../projects/reader';
import { publishedImports } from './published-imports';

/** A published import with its resolved public items and immutable provider version. */
export type Dependent = { consumer: string; root: string; provider: string; ontology: string; concepts: string[]; version: string };

type State = { formatVersion: 2; fingerprint: string; entries: Dependent[] };

function readState(path: string, fingerprint: string): State | null {
  try {
    const state: State = JSON.parse(readFileSync(path, 'utf8'));
    return state.formatVersion === 2 && state.fingerprint === fingerprint && Array.isArray(state.entries) ? state : null;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function derive(snapshots: PublishedSnapshots, pin: PublishedPin, projects: ProjectEntry[]): Promise<Dependent[]> {
  const repositories = new Map(projects.map(project => [project.slug, locationOf(project).repo]));
  const entries = new Map<string, Dependent>();
  for (const project of projects) {
    const consumer = project.slug;
    if (!pin.commits.has(locationOf(project).repo)) continue;
    const documents = await snapshots.documents(pin, consumer);
    const imports = await publishedImports(snapshots, pin, project => repositories.get(project) ?? null, LOCAL_READER, consumer, documents);
    for (const { root, owner } of imports) {
      if (!owner || consumer === owner.project) continue;
      const key = JSON.stringify([consumer, root, owner.project, owner.ontology, owner.version]);
      const entry = entries.get(key) ?? { consumer, root, provider: owner.project, ontology: owner.ontology, version: owner.version, concepts: [] };
      if (!entry.concepts.includes(owner.concept)) entry.concepts.push(owner.concept);
      entries.set(key, entry);
    }
  }
  return [...entries.values()].map(entry => ({ ...entry, concepts: entry.concepts.sort(compareText) }));
}

/** Creates a rebuildable cache whose fingerprint includes the chosen commits and registered projects. */
export function createDependentsRegistry(directory: string, snapshots: PublishedSnapshots, projects: () => ProjectEntry[], lock: <T>(key: string, use: () => Promise<T>) => Promise<T>) {
  const path = join(directory, 'dependents.json');
  return {
    /** Invalidates the persisted derivative when registered projects change. */
    invalidate: () => rmSync(path, { force: true }),
    /** Uses one publication pin so a rebuild never mixes project versions. */
    read: () =>
      lock('mesh-dependents', () =>
        snapshots.withPin(async pin => {
          const registry = [...projects()].sort((left, right) => compareText(left.slug, right.slug));
          const fingerprint = sha256(
            JSON.stringify(
              registry.map(project => {
                const location = locationOf(project);
                return [project.slug, location, pin.commits.get(location.repo)?.commit ?? null];
              }),
            ),
          );
          const state = readState(path, fingerprint);
          if (state) return state.entries;
          const entries = await derive(snapshots, pin, registry);
          atomicWriteJson(path, { formatVersion: 2, fingerprint, entries } satisfies State);
          return [...entries.values()].map(entry => ({ ...entry, concepts: entry.concepts.sort(compareText) }));
        }),
      ),
  };
}
