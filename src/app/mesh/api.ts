/** Reads mesh responses through the same browser authentication boundary as other project APIs. */
import { isObject } from '../../shared/edit/source-text';
import type { UnitImport } from '../../shared/tessera/imports';
import { apiFetch } from '../projects/api';

/** Describes one published interface in the import picker. */
export type ProviderChoice = { project: string; ontology: string; version: string; concepts: string[] };

/** Describes the status the author can read for one importing root. */
export type DependencyState = { path: string; imports: UnitImport[]; state: 'current' | 'needs-update' };

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
export async function readDependencyState(project: string, path: string, signal?: AbortSignal): Promise<DependencyState | undefined> {
  const result = await read(`/api/projects/${encodeURIComponent(project)}/dependencies`, signal);
  if (!isObject(result) || !Array.isArray(result.roots)) throw new Error('Invalid dependency status.');
  const root = result.roots.find(item => isObject(item) && item.path === path);
  if (!root) return undefined;
  if (!Array.isArray(root.imports) || (root.state !== 'current' && root.state !== 'needs-update')) throw new Error('Invalid dependency status.');
  return root;
}
