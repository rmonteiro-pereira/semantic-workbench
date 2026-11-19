/** Compares public concept definitions without evaluating compatibility. */
import { canonicalJson, compareText } from '../../shared/tessera/canonical-json';
import { sha256Hex } from '../../shared/tessera/digest';

/** A canonical digest used to compare one public concept across revisions. */
export type EntryDigest = string;

/** Computes independent hashes so a difference can name the changed concepts. */
export function digestOf(concepts: ReadonlyMap<string, Record<string, unknown>>): ReadonlyMap<string, EntryDigest> {
  return new Map([...concepts].map(([name, definition]) => [name, sha256Hex(canonicalJson(definition))]));
}

/** Reports observable differences in two public interfaces and leaves compatibility open. */
export function interfaceChanges(before: ReadonlyMap<string, EntryDigest>, after: ReadonlyMap<string, EntryDigest>) {
  return {
    added: [...after.keys()].filter(name => !before.has(name)).sort(compareText),
    removed: [...before.keys()].filter(name => !after.has(name)).sort(compareText),
    changed: [...after.keys()].filter(name => before.has(name) && before.get(name) !== after.get(name)).sort(compareText),
    compatibility: 'not judged' as const,
  };
}
