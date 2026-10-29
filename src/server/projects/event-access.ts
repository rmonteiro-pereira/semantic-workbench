// Filters invalidations using publisher-supplied resource tags and the current access scope.
import type { AccessScope } from '../auth/authorize';
import type { EventTags, WorkbenchEvent } from './events';
import type { IndexedFile } from './suggestions';
import { readableTrash } from './trash';

/** Live authority and personal counter provider for a connection. */
export type EventAccess = {
  scope: AccessScope;
  owner: string;
  copy?: string;
  /** Counts this person's open suggestions, reusing the debounce round's shared file index. */
  suggestions?: (index: IndexedFile[]) => number;
};

// A removed project has no grants left to evaluate, so its readers were fixed at publication.
function readsProject(project: string, tags: EventTags, access: EventAccess): boolean {
  const fixed = tags.readers?.[project];
  if (fixed) return fixed.includes(access.owner);
  return access.scope.view().readableProjects.has(project);
}

// Trash payloads are opaque: the whole entry is visible, or the event is dropped.
function readableTrashEvent(event: WorkbenchEvent, access: EventAccess): WorkbenchEvent | null {
  const { tags } = event;
  const project = tags.projects?.[0] ?? tags.paths?.[0]?.project ?? '';
  const fixed = tags.readers?.[project];
  if (fixed) return fixed.includes(access.owner) ? event : null;
  // A trash event's owner tag is the person who deleted the entry.
  const entry = { project, deletedBy: tags.owner, paths: tags.paths };
  return readableTrash(entry, access.scope) ? event : null;
}

/** Reduces resource lists using tags; payload fields never grant access. */
export function readableEvent(event: WorkbenchEvent, access: EventAccess): WorkbenchEvent | null {
  const tags = event.tags;
  if (tags.copy && tags.copy !== access.copy) return null;
  if (event.event === 'trash') return readableTrashEvent(event, access);
  if (tags.owner && tags.owner !== access.owner) return null;
  if (tags.audience === 'all') return event;
  const view = access.scope.view();
  const paths = tags.paths?.filter(file => view.canRead(file.project, file.path));
  const projects = tags.projects?.filter(project => readsProject(project, tags, access));
  if (tags.paths?.length ? !paths?.length : !projects?.length) return null;
  if (['drafts', 'clone'].includes(event.event)) {
    if (paths?.length !== tags.paths?.length || projects?.length !== tags.projects?.length) return null;
  }
  const data = event.data as Record<string, any>;
  const next = { ...data };
  const allowedProjects = new Set(projects);
  const allowedPaths = new Set(paths?.map(file => file.project + '/' + file.path));
  for (const key of ['paths', 'added', 'changed', 'removed', 'altered', 'renamed', 'projects']) {
    if (!Array.isArray(data[key])) continue;
    next[key] = data[key].filter((item: string | { path: string; slug: string }) => {
      if (event.event === 'projects' || key === 'projects') {
        return allowedProjects.has(typeof item === 'string' ? item : item.slug);
      }
      const path = typeof item === 'string' ? item : item.path;
      return allowedPaths.has(data.project + '/' + path);
    });
  }
  if (event.event === 'git') delete next.changes;
  return { ...event, tags: { ...tags, paths, projects: projects ?? [] }, data: next };
}

/**
 * The connected principals who may hear of each tagged project now. Publishers call this before
 * a project leaves the registry, while its grants can still be evaluated.
 */
export function currentReaders(event: string, tags: EventTags, connections: Iterable<EventAccess>): Record<string, string[]> {
  const readers: Record<string, string[]> = {};
  for (const project of tags.projects ?? []) {
    const probeTags: EventTags = event === 'trash' ? { ...tags, readers: undefined } : { projects: [project] };
    const probe: WorkbenchEvent = { id: 0, event, data: {}, tags: probeTags };
    const owners = new Set<string>();
    for (const access of connections) {
      if (readableEvent(probe, access)) owners.add(access.owner);
    }
    readers[project] = [...owners];
  }
  return readers;
}
