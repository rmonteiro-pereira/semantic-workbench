/** Reads mesh responses through the same browser authentication boundary as other project APIs. */
import { isObject } from '../../shared/edit/source-text';
import type { ResolvedImportInterface, UnitImport } from '../../shared/tessera/imports';
import { apiFetch } from '../projects/api';

/** Describes one published interface in the import picker. */
export type ProviderChoice = { project: string; name: string; ontology: string; version: string; concepts: string[] };

/** Describes the status the author can read for one importing root. */
export type DependencyState = { path: string; imports: UnitImport[]; state: 'current' | 'needs-update' | 'update-available'; manifestHash?: string | null };

async function read(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await apiFetch(path, { signal });
  if (!response.ok) throw new Error(`Could not load ontology mesh data (${response.status}).`);
  return response.json();
}

function isProvider(value: unknown): value is ProviderChoice {
  return (
    isObject(value) &&
    typeof value.project === 'string' &&
    value.project.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.ontology === 'string' &&
    value.ontology.length > 0 &&
    typeof value.version === 'string' &&
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.version) &&
    Array.isArray(value.concepts) &&
    value.concepts.every(concept => typeof concept === 'string' && concept.length > 0)
  );
}

/** Reads each cursor-bounded page of published providers for the import editor. */
export async function readProviders(signal?: AbortSignal): Promise<ProviderChoice[]> {
  const providers: ProviderChoice[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = cursor === null ? '' : '?' + new URLSearchParams({ cursor });
    const result = await read('/api/mesh/providers' + params, signal);
    if (!isObject(result) || !Array.isArray(result.providers) || !result.providers.every(isProvider) || (result.cursor !== null && (typeof result.cursor !== 'string' || !result.cursor))) {
      throw new Error('Invalid provider listing.');
    }
    providers.push(...result.providers);
    cursor = result.cursor;
    if (cursor !== null) {
      if (seen.has(cursor)) throw new Error('The provider listing repeated a page.');
      seen.add(cursor);
    }
  } while (cursor !== null);
  return providers;
}

/** Reads the dependency state of one root in the editing workspace. */
export async function readDependencyState(project: string, path: string | undefined, signal?: AbortSignal): Promise<DependencyState | undefined> {
  const result = await read(`/api/projects/${encodeURIComponent(project)}/dependencies`, signal);
  if (!isObject(result) || !Array.isArray(result.roots)) throw new Error('Invalid dependency status.');
  const root = result.roots.find(item => isObject(item) && (path === undefined || item.path === path));
  if (!root) return undefined;
  if (!Array.isArray(root.imports) || (root.state !== 'current' && root.state !== 'needs-update' && root.state !== 'update-available')) throw new Error('Invalid dependency status.');
  if (result.manifestHash !== null && (typeof result.manifestHash !== 'string' || !/^[a-f0-9]{64}$/.test(result.manifestHash))) throw new Error('Invalid dependency manifest hash.');
  return { ...root, manifestHash: result.manifestHash };
}

/** Lists interface changes observable in the selected public versions. */
export type DependencyChange = { project: string; ontology: string; added: string[]; removed: string[]; changed: string[]; compatibility: 'not judged' };

/** Identifies the exact preview subsequently confirmed by the author. */
export type DependencyPreview = { preview: string; changes: DependencyChange[] };

function isChange(value: unknown): value is DependencyChange {
  if (!isObject(value) || typeof value.project !== 'string' || typeof value.ontology !== 'string' || value.compatibility !== 'not judged') return false;
  return [value.added, value.removed, value.changed].every(items => Array.isArray(items) && items.every(name => typeof name === 'string'));
}

/** Previews or confirms an update using the editing workspace's lock hash. */
export async function updateDependencies(project: string, baseHash: string | null, confirm?: string): Promise<DependencyPreview | undefined> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(project)}/dependencies/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseHash, confirm }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (isObject(result) && typeof result.error === 'string' && response.status === 400) throw new Error(result.error);
    throw new Error('Could not update dependencies. Reload the current status and review again.');
  }
  if (confirm && isObject(result) && typeof result.hash === 'string' && /^[a-f0-9]{64}$/.test(result.hash)) return;
  if (!isObject(result) || typeof result.preview !== 'string' || !/^[a-f0-9]{64}$/.test(result.preview) || !Array.isArray(result.changes) || !result.changes.every(isChange)) {
    throw new Error('Invalid dependency update response.');
  }
  return { preview: result.preview, changes: result.changes };
}

/** Holds the public metadata disclosed to the provider's publishers. */
export type DependentView = { name: string; domain: string | null; items: string[]; version: string };

function isDependent(value: unknown): value is DependentView {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    (value.domain === null || typeof value.domain === 'string') &&
    Array.isArray(value.items) &&
    value.items.every(item => typeof item === 'string' && item.length > 0) &&
    typeof value.version === 'string' &&
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.version)
  );
}

/** Reads the provider's published dependent entries in cursor order. */
export async function readDependents(project: string, signal?: AbortSignal): Promise<DependentView[]> {
  const dependents: DependentView[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const path = `/api/projects/${encodeURIComponent(project)}/dependents`;
    const result = await read(cursor ? path + '?' + new URLSearchParams({ cursor }) : path, signal);
    if (!isObject(result) || !Array.isArray(result.dependents) || !result.dependents.every(isDependent) || (result.cursor !== null && typeof result.cursor !== 'string')) {
      throw new Error('Invalid published dependents listing.');
    }
    dependents.push(...result.dependents);
    cursor = result.cursor;
    if (cursor !== null) {
      if (!cursor || seen.has(cursor)) throw new Error('The dependents listing repeated a page.');
      seen.add(cursor);
    }
  } while (cursor !== null);
  return dependents;
}

/** One project shown in the ontology mesh. */
export type MeshProjectView = { project: string; name: string; domain: string | null };

/** One scoped published link in the ontology mesh. */
export type MeshLinkView = { consumer: string; provider: string | null; items: string[] };

/** The readable projects and visible links of one published view. */
export type MeshGraphView = { projects: MeshProjectView[]; links: MeshLinkView[] };

function isMeshProject(value: unknown): value is MeshProjectView {
  return isObject(value) && typeof value.project === 'string' && !!value.project && typeof value.name === 'string' && !!value.name && (typeof value.domain === 'string' || value.domain === null);
}

function isMeshLink(value: unknown): value is MeshLinkView {
  return (
    isObject(value) &&
    typeof value.consumer === 'string' &&
    !!value.consumer &&
    (typeof value.provider === 'string' || value.provider === null) &&
    Array.isArray(value.items) &&
    value.items.every(item => typeof item === 'string')
  );
}

/** Reads the ontology mesh as one caller-scoped publication snapshot. */
export async function readMeshGraph(signal?: AbortSignal): Promise<MeshGraphView> {
  const result = await read('/api/mesh', signal);
  if (!isObject(result) || !Array.isArray(result.projects) || !result.projects.every(isMeshProject) || !Array.isArray(result.links) || !result.links.every(isMeshLink)) {
    throw new Error('Invalid ontology mesh response.');
  }
  return { projects: result.projects, links: result.links };
}

/** Parses the published interface payload without importing server or private source metadata. */
export async function readPublishedInterfaces(project: string, signal?: AbortSignal) {
  const result = await read(`/api/projects/${encodeURIComponent(project)}/dependencies?interfaces=1`, signal);
  if (!isObject(result) || !Array.isArray(result.interfaces)) throw new Error('Invalid published interface response.');
  const roots = new Map<string, ResolvedImportInterface[]>();
  for (const entry of result.interfaces) {
    if (!isObject(entry) || typeof entry.path !== 'string' || !Array.isArray(entry.providers)) throw new Error('Invalid published interface root.');
    roots.set(entry.path, entry.providers.map(parseInterface));
  }
  return roots;
}

function parseInterface(value: unknown): ResolvedImportInterface {
  if (
    !isObject(value) ||
    typeof value.project !== 'string' ||
    !value.project ||
    typeof value.ontology !== 'string' ||
    !value.ontology ||
    typeof value.version !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.version) ||
    !Array.isArray(value.concepts)
  ) {
    throw new Error('Invalid published provider interface.');
  }
  const concepts = new Map<string, Record<string, unknown>>();
  for (const pair of value.concepts) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || !pair[0] || !isObject(pair[1]) || concepts.has(pair[0])) throw new Error('Invalid published concept.');
    concepts.set(pair[0], pair[1]);
  }
  const ontologyName = typeof value.ontologyName === 'string' ? value.ontologyName : undefined;
  return { project: value.project, ontology: value.ontology, version: value.version, ontologyName, concepts, exports: new Set(concepts.keys()) };
}
