/** Derives the list of published importers from committed dependency manifests. */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compareText } from '../../shared/tessera/canonical-json';
import { DEPENDENCY_MANIFEST_PATH, manifestIsCurrent, parseDependencyManifest } from '../../shared/tessera/dependency-manifest';
import { declaredImports } from '../../shared/tessera/imports';
import { validateInput } from '../../shared/validation/input';
import { atomicWriteJson, sha256 } from '../projects/atomic';
import { locationOf } from '../projects/paths';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { ProjectEntry } from '../projects/state';

/** A published import with its resolved public items and immutable provider version. */
export type Dependent = { consumer: string; root: string; provider: string; ontology: string; concepts: string[]; version: string };

type State = { formatVersion: 1; fingerprint: string; entries: Dependent[] };

function readState(path: string, fingerprint: string): State | null {
  try {
    const state: State = JSON.parse(readFileSync(path, 'utf8'));
    return state.formatVersion === 1 && state.fingerprint === fingerprint && Array.isArray(state.entries) ? state : null;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function derive(snapshots: PublishedSnapshots, pin: PublishedPin, projects: ProjectEntry[]): Promise<Dependent[]> {
  const registered = new Set(projects.map(project => project.slug));
  const entries: Dependent[] = [];
  for (const project of projects) {
    const consumer = project.slug;
    const commit = pin.commits.get(locationOf(project).repo)?.commit;
    if (!commit) continue;
    const files = await snapshots.documents(pin, consumer);
    const file = files.find(entry => entry.path === DEPENDENCY_MANIFEST_PATH);
    if (!file) continue;
    const manifest = parseDependencyManifest(file.source);
    const source = files.find(definition => definition.path === manifest.root);
    if (!source) continue;
    const model = validateInput(source.source, source.filename).model;
    if (!model || !('document' in model)) continue;
    const imports = declaredImports(model.document);
    if (!manifestIsCurrent(manifest, imports)) continue;
    for (const provider of manifest.providers) {
      if (!registered.has(provider.project)) continue;
      entries.push({
        consumer,
        root: manifest.root,
        provider: provider.project,
        ontology: provider.ontology,
        concepts: [...provider.concepts].sort(compareText),
        version: provider.sameRepository ? commit : provider.commit,
      });
    }
  }
  return entries;
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
          atomicWriteJson(path, { formatVersion: 1, fingerprint, entries } satisfies State);
          return entries;
        }),
      ),
  };
}
