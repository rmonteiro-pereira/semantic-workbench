// Connects the usage recorder to one workspace: the published snapshot it reads definitions from and
// the address migration history it follows. This is the only usage module that knows the workspace.
import { readAddressMigrations } from '../projects/address-migrations';
import { LOCAL_READER } from '../projects/reader';
import type { Workspace } from '../projects/workspace';
import { parseDocuments } from '../agent/context-documents';
import { createUsageRecorder, type PublishedModelSource, type UsageRecorder } from './usage-recorder';
import { USAGE_OFF, type UsageSettings } from './usage-settings';
import { createUsageStore } from './usage-store';
import type { PublishedModels } from './usage-items';

/** Reads and parses the documents of one published commit, remembering the newest commit of each project. */
export function publishedModelSource(workspace: Pick<Workspace, 'published'>): PublishedModelSource {
  const newest = new Map<string, { commit: string; models: PublishedModels }>();
  return async (project, commit) => {
    const known = newest.get(project);
    if (known?.commit === commit) return known.models;
    try {
      const documents = await workspace.published.documentsAt(commit, project);
      const models = new Map(parseDocuments([...documents]).map(parsed => [parsed.doc.id, parsed.data]));
      newest.set(project, { commit, models });
      return models;
    } catch {
      return null;
    }
  };
}

/** Creates the recorder of a workspace; with counters off it is the no-op recorder. */
export function createWorkspaceUsage(workspace: Workspace, settings: UsageSettings = USAGE_OFF): UsageRecorder {
  return createUsageRecorder({
    settings,
    store: createUsageStore(workspace.layout),
    models: publishedModelSource(workspace),
    migrationRecords(project) {
      try {
        return readAddressMigrations(workspace.layout, project, LOCAL_READER);
      } catch {
        return null;
      }
    },
  });
}
