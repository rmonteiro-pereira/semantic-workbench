/** Projects the published mesh into the projects and roots the caller can read. */
import { compareText } from '../../shared/tessera/canonical-json';
import { locationOf } from '../projects/paths';
import type { PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { ProjectEntry } from '../projects/state';
import { publishedImports } from './published-imports';

/** A readable project and its configured domain. */
export type MeshProject = { project: string; name: string; domain: string | null };

/** An import between visible projects, or an unnamed unavailable target. */
export type MeshLink = { consumer: string; provider: string | null; version: string | null; items: string[] };

/** Reads one consistent graph, omitting hidden metadata from every target. */
export async function readMeshGraph(snapshots: PublishedSnapshots, registry: ProjectEntry[], reader: Reader, domain: (project: string) => string | null) {
  const visible = registry.filter(project => !reader.view || reader.view.readableProjects.has(project.slug)).sort((first, next) => compareText(first.slug, next.slug));
  const projects: MeshProject[] = visible.map(entry => ({ project: entry.slug, name: entry.name, domain: domain(entry.slug) }));
  const repositories = new Map(registry.map(entry => [entry.slug, locationOf(entry).repo]));
  const links: MeshLink[] = [];
  await snapshots.withPin(async pin => {
    for (const consumer of visible) {
      if (!pin.commits.has(locationOf(consumer).repo)) continue;
      const { documents } = await snapshots.readableDocuments(pin, consumer.slug, reader);
      const targets = new Map<string | null, { provider: string | null; version: string | null; items: Set<string> }>();
      const imports = await publishedImports(snapshots, pin, project => repositories.get(project) ?? null, reader, consumer.slug, documents);
      for (const { owner } of imports) {
        const provider = owner?.project ?? null;
        const version = owner?.version ?? null;
        const key = provider && version ? JSON.stringify([provider, version]) : null;
        const target = targets.get(key) ?? { provider: key ? provider : null, version, items: new Set<string>() };
        if (owner) target.items.add(owner.concept);
        targets.set(key, target);
      }
      for (const target of targets.values()) links.push({ ...target, consumer: consumer.slug, items: [...target.items].sort(compareText) });
    }
  });
  return { projects, links };
}
