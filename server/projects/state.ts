// Stores durable application state in versioned JSON files replaced atomically. This state survives
// deletion of the SQLite cache.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson, readJsonFile, sha256 } from './atomic';
import { assertSlug, projectPath, type DataLayout } from './paths';
/** Format version accepted by the durable JSON state files. */
export const STATE_FORMAT = 1;
// Missing folder and repository paths default to the slug.
// The remote address records where a cloned repository came from.
/** A registered project’s name, identity, storage locations, and origin. */
export type ProjectEntry = {
  slug: string;
  name: string;
  createdAt: string;
  origin: string;
  folder?: string;
  repo?: string;
  remoteAddress?: string;
};
/** Versioned list of registered projects. */
export type Registry = { formatVersion: 1; projects: ProjectEntry[] };
/** Versioned per-file view settings for a project. */
export type ViewState = { formatVersion: 1; files: Record<string, unknown> };
/** A text replacement using a half-open range of UTF-16 offsets in the base source. */
export type Patch = { from: number; to: number; insert: string };
/** Durable unsaved text and patches with the hash of the version they were based on. */
export type Draft = {
  formatVersion: 1;
  project: string;
  path: string;
  baseHash: string | null;
  text: string;
  patches: Patch[];
  updatedAt: string;
};
/** Records a rejected move for a particular file hash and destination. */
export type RejectedSuggestion = {
  hash: string;
  target: string;
  project: string;
  path: string;
  rejectedAt: string;
};
/** Versioned record of rejected file grouping suggestions. */
export type SuggestionState = { formatVersion: 1; rejected: RejectedSuggestion[] };
/** Maps old document identifiers to project paths after migration. */
export type LegacyIds = {
  formatVersion: 1;
  ids: Record<string, { project: string; path: string }>;
};
function load<T extends { formatVersion: number }>(path: string, empty: () => T): T {
  const value = readJsonFile<T>(path);
  if (value === null) return empty();
  if (!value || typeof value !== 'object' || value.formatVersion !== STATE_FORMAT)
    throw Error(`Unsupported state file format in ${path}.`);
  return value;
}
/** Creates readers and atomic writers for durable workspace state. */
export function createState(layout: DataLayout) {
  const viewFile = (slug: string) => join(layout.views, assertSlug(slug) + '.json');
  const draftFile = (slug: string, path: string) =>
    join(layout.drafts, assertSlug(slug), sha256(projectPath(path)) + '.json');
  return {
    viewFile,
    draftFile,
    draftDir: (slug: string) => join(layout.drafts, assertSlug(slug)),
    registry: () =>
      load<Registry>(layout.registry, () => ({ formatVersion: STATE_FORMAT, projects: [] })),
    hasRegistry: () => readJsonFile(layout.registry) !== null,
    writeRegistry: (projects: ProjectEntry[]) =>
      atomicWriteJson(layout.registry, { formatVersion: STATE_FORMAT, projects }),
    view: (slug: string) =>
      load<ViewState>(viewFile(slug), () => ({ formatVersion: STATE_FORMAT, files: {} })),
    writeView: (slug: string, files: Record<string, unknown>) =>
      atomicWriteJson(viewFile(slug), { formatVersion: STATE_FORMAT, files }),
    draft: (slug: string, path: string) => {
      const d = readJsonFile<Draft>(draftFile(slug, path));
      if (d && d.formatVersion !== STATE_FORMAT) throw Error('Unsupported draft format.');
      return d;
    },
    writeDraft: (
      slug: string,
      path: string,
      draft: { baseHash: string | null; text: string; patches: Patch[] },
    ) => {
      const value: Draft = {
        formatVersion: STATE_FORMAT,
        project: slug,
        path: projectPath(path),
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      atomicWriteJson(draftFile(slug, path), value);
      return value;
    },
    deleteDraft: (slug: string, path: string) => rmSync(draftFile(slug, path), { force: true }),
    drafts: (): Draft[] => {
      let slugs: string[] = [];
      try {
        slugs = readdirSync(layout.drafts);
      } catch {
        return [];
      }
      return slugs.flatMap(slug =>
        readdirSync(join(layout.drafts, slug))
          .filter(f => f.endsWith('.json'))
          .map(f => readJsonFile<Draft>(join(layout.drafts, slug, f))!)
          .filter(d => d?.formatVersion === STATE_FORMAT),
      );
    },
    suggestions: () =>
      load<SuggestionState>(join(layout.state, 'suggestions.json'), () => ({
        formatVersion: STATE_FORMAT,
        rejected: [],
      })),
    writeSuggestions: (rejected: RejectedSuggestion[]) =>
      atomicWriteJson(join(layout.state, 'suggestions.json'), {
        formatVersion: STATE_FORMAT,
        rejected,
      }),
    legacyIds: () =>
      load<LegacyIds>(layout.legacyIds, () => ({ formatVersion: STATE_FORMAT, ids: {} })),
    writeLegacyIds: (ids: LegacyIds['ids']) =>
      atomicWriteJson(layout.legacyIds, { formatVersion: STATE_FORMAT, ids }),
  };
}
/** Access to durable registry, view, draft, suggestion, and legacy ID state. */
export type State = ReturnType<typeof createState>;
