/** Projects the published mesh into the projects and roots the caller can read. */
import { compareText } from '../../shared/tessera/canonical-json';
import { DEPENDENCY_MANIFEST_PATH, manifestIsCurrent, parseDependencyManifest } from '../../shared/tessera/dependency-manifest';
import { declaredImports } from '../../shared/tessera/imports';
import { validateInput } from '../../shared/validation/input';
import { locationOf } from '../projects/paths';
import type { PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { ProjectEntry } from '../projects/state';

/** A readable project and its configured domain. */
export type MeshProject = { project: string; name: string; domain: string | null };

/** An import between visible projects, or an unnamed unavailable target. */
export type MeshLink = { consumer: string; provider: string | null; items: string[] };

function importsIn(documents: Awaited<ReturnType<PublishedSnapshots['documents']>>) {
  const file = documents.find(document => document.path === DEPENDENCY_MANIFEST_PATH);
  if (!file) return [];
  const manifest = parseDependencyManifest(file.source);
  const root = documents.find(document => document.path === manifest.root);
  const model = root && validateInput(root.source, root.filename).model;
  if (!model || !('document' in model)) return [];
  const imports = declaredImports(model.document);
  return manifestIsCurrent(manifest, imports) ? manifest.providers : [];
}

/** Reads one consistent graph, omitting hidden metadata from every target. */
export async function readMeshGraph(snapshots: PublishedSnapshots, registry: ProjectEntry[], reader: Reader, domain: (project: string) => string | null) {
  const visible = registry.filter(project => !reader.view || reader.view.readableProjects.has(project.slug)).sort((first, next) => compareText(first.slug, next.slug));
  const projects: MeshProject[] = visible.map(entry => ({ project: entry.slug, name: entry.name, domain: domain(entry.slug) }));
  const known = new Set(projects.map(project => project.project));
  const links: MeshLink[] = [];
  await snapshots.withPin(async pin => {
    for (const consumer of visible) {
      if (!pin.commits.has(locationOf(consumer).repo)) continue;
      const { documents } = await snapshots.readableDocuments(pin, consumer.slug, reader);
      const targets = new Map<string | null, Set<string>>();
      for (const dependency of importsIn(documents)) {
        const provider = known.has(dependency.project) ? dependency.project : null;
        const items = targets.get(provider) ?? new Set<string>();
        if (provider) for (const item of dependency.concepts) items.add(item);
        targets.set(provider, items);
      }
      for (const [provider, items] of targets) links.push({ consumer: consumer.slug, provider, items: [...items].sort(compareText) });
    }
  });
  return { projects, links };
}
