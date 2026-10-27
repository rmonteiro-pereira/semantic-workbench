/** Caches parsed project files by content hash for lineage, skipping RDF serializations. */
import { parse } from 'yaml';
import { rdfSyntax } from '../../shared/validation/rdf';
import type { Doc } from '../projects/api';
import type { ProjectFile } from './lineage';
// Project files parsed once per content hash, for lineage (RDF files are not YAML/JSON and are
// skipped).
const parsedCache = new Map<string, any>();
/** Parses project definitions once per content hash, excluding RDF files. */
export function projectFiles(docs: Doc[]): ProjectFile[] {
  return docs.flatMap(d => {
    if (rdfSyntax(d.source, d.filename)) return [];
    const key = d.id + '#' + d.hash;
    if (!parsedCache.has(key)) {
      let v: any = null;
      try {
        v = parse(d.source);
      } catch {}
      parsedCache.set(key, v);
    }
    const data = parsedCache.get(key);
    return data && typeof data === 'object' ? [{ path: d.path, data }] : [];
  });
}
/** Builds a revision key from project file paths and content hashes. */
export const projectRevision = (docs: Doc[]) => docs.map(d => d.path + ':' + d.hash).join('|');
