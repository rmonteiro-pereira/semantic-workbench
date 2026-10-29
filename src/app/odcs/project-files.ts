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
  return docs.flatMap(doc => {
    if (rdfSyntax(doc.source, doc.filename)) return [];
    const key = doc.id + '#' + doc.hash;
    if (!parsedCache.has(key)) {
      let value: any = null;
      try {
        value = parse(doc.source);
      } catch {}
      parsedCache.set(key, value);
    }
    const data = parsedCache.get(key);
    return data && typeof data === 'object' ? [{ path: doc.path, data }] : [];
  });
}
/** Builds a revision key from project file paths and content hashes. */
export const projectRevision = (docs: Doc[]) => docs.map(d => d.path + ':' + d.hash).join('|');
