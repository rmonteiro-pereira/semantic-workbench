/** Reads and compares the committed snapshot of resolved Tessera dependencies. */
import { tesseraDependencies } from '../../generated/validators.js';
import { canonicalJson, compareText } from './canonical-json';
import type { UnitImport } from './imports';

/** Name of the project metadata file that freezes resolved imports. */
export const DEPENDENCY_MANIFEST_PATH = 'tessera-dependencies.json';

/** Identifies a locked dependency of a provider. */
export type TransitiveDependency = { project: string; commit: string; interfaceHash: string };

/** Identifies a public interface and the exact version selected for its consumer. */
export type LockedProvider = {
  project: string;
  ontology: string;
  repository: string;
  tag: string | null;
  interfaceHash: string;
  concepts: string[];
  dependsOn: TransitiveDependency[];
} & ({ sameRepository: true; choice: 'latest'; commit?: never } | { sameRepository: false; choice: 'latest' | 'pin'; commit: string });

/** Gives the complete dependency lock for an ontology root. */
export type DependencyManifest = { manifestVersion: 1; root: string; providers: LockedProvider[] };

/** Validates the parsed lock with the bundled schema and rejects ambiguous provider identities. */
export function isDependencyManifest(data: unknown): data is DependencyManifest {
  if (!tesseraDependencies(data)) return false;
  const manifest = data as DependencyManifest;
  const identities = manifest.providers.map(provider => JSON.stringify([provider.project, provider.ontology]));
  return new Set(identities).size === identities.length;
}

/** Reads strict JSON and rejects malformed or unsupported locks. */
export function parseDependencyManifest(text: string): DependencyManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new Error('The dependency manifest is not valid JSON.', { cause });
  }
  if (!isDependencyManifest(data)) throw new Error('The dependency manifest does not match its supported format.');
  return data;
}

/** Prints equivalent locks as identical canonical JSON. */
export function printDependencyManifest(manifest: DependencyManifest): string {
  const providers = manifest.providers.map(provider => ({
    ...provider,
    concepts: [...provider.concepts].sort(compareText),
    dependsOn: [...provider.dependsOn].sort((left, right) => compareText(canonicalJson(left), canonicalJson(right))),
  }));
  providers.sort((left, right) => compareText(left.project, right.project) || compareText(left.ontology, right.ontology));
  return canonicalJson({ ...manifest, providers });
}

function matches(provider: LockedProvider, entry: UnitImport): boolean {
  if (provider.project !== entry.project || (entry.ontology !== undefined && provider.ontology !== entry.ontology)) return false;
  if (provider.concepts.length !== entry.concepts.length || !provider.concepts.every(name => entry.concepts.includes(name))) return false;
  if (entry.version === 'latest') return provider.choice === 'latest';
  return !provider.sameRepository && provider.choice === 'pin' && (provider.tag ?? provider.commit) === entry.version.pin;
}

/** Checks that a lock covers exactly the current import declarations. */
export function manifestIsCurrent(manifest: DependencyManifest, imports: readonly UnitImport[]): boolean {
  if (manifest.providers.length !== imports.length) return false;
  const matched = new Set<LockedProvider>();
  for (const entry of imports) {
    const candidates = manifest.providers.filter(provider => matches(provider, entry));
    if (candidates.length !== 1 || matched.has(candidates[0])) return false;
    matched.add(candidates[0]);
  }
  return true;
}
