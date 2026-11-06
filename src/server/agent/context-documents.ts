// Parses stored documents and lists the mappings, ontologies and semantic models they define.
import { inspect } from '../../shared/core/model';
import { rdfSyntax } from '../../shared/validation/rdf';
import { isMapping } from '../../shared/mappings/mapping-schema';
import type { StoredDocument } from './context-types';
export function parseDocuments(documents: StoredDocument[]) {
  return documents.map(doc => {
    try {
      if (rdfSyntax(doc.source, doc.filename)) return { doc, data: null };
      const model = inspect(doc.source, doc.filename);
      return { doc, data: 'document' in model ? model.document : null };
    } catch {
      return { doc, data: null };
    }
  });
}
export type Parsed = ReturnType<typeof parseDocuments>[number];
export type Target = { doc: StoredDocument; data: any; path: (string | number)[] };
// References can target standalone models or models inside legacy wrappers by logical name.
export function targets(parsed: Parsed[], kind: 'ontology' | 'semantic'): Target[] {
  return parsed.flatMap(parsedDocument => {
    if (!parsedDocument.data || isMapping(parsedDocument.data)) return [];
    if (kind === 'ontology') return Array.isArray(parsedDocument.data.ontology) ? [{ doc: parsedDocument.doc, data: parsedDocument.data, path: [] }] : [];
    if (Array.isArray(parsedDocument.data.datasets)) return [{ doc: parsedDocument.doc, data: parsedDocument.data, path: [] }];
    return Array.isArray(parsedDocument.data.semantic_model)
      ? parsedDocument.data.semantic_model.flatMap((m: any, i: number) => (m && Array.isArray(m.datasets) ? [{ doc: parsedDocument.doc, data: m, path: ['semantic_model', i] }] : []))
      : [];
  });
}
export const identity = (target: Target) => {
  const name = target.data.name ?? '(unnamed)';
  const project = target.doc.project;
  const projectPrefix = project ? `${project}/` : '';
  const file = project ? target.doc.id.slice(project.length + 1) : target.doc.filename;
  const pointer = target.path.length ? '#/' + target.path.join('/') : '';
  return `"${name}" in ${projectPrefix}${file}${pointer}`;
};
export function mappingEntries(parsed: Parsed[]) {
  return parsed.flatMap(parsedDocument => {
    if (isMapping(parsedDocument.data))
      return [
        {
          id: parsedDocument.doc.id,
          doc: parsedDocument.doc,
          data: parsedDocument.data,
          ontology: null as Parsed | null,
          path: [] as (string | number)[],
        },
      ];
    return (parsedDocument.data?.ontology_mappings ?? []).map((mappingEntry: any, i: number) => ({
      id: `${parsedDocument.doc.id}#ontology_mappings/${i}`,
      doc: parsedDocument.doc,
      data: mappingEntry,
      ontology: parsedDocument,
      path: ['ontology_mappings', i] as (string | number)[],
    }));
  });
}
export type Entry = ReturnType<typeof mappingEntries>[number] & { semanticPath?: (string | number)[] };
