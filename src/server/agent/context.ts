// Entry points for resolving stored documents into agent context. The steps live in context-documents.ts,
// context-assembly.ts and context-selection.ts; the types and policy in context-types.ts.
import { BadRequestError } from '../projects/errors';
import { policy, type RuntimeContext, type StoredDocument } from './context-types';
import { mappingEntries, parseDocuments, type Entry } from './context-documents';
import { assemble } from './context-assembly';
export * from './context-types';
export * from './context-selection';
/** Lists available mappings and the policy clients must follow when planning queries. */
export function agentCatalog(documents: StoredDocument[]) {
  const parsed = parseDocuments(documents);
  return {
    mappings: mappingEntries(parsed).map(mapping => ({
      id: mapping.id,
      name: mapping.data.name ?? `${mapping.doc.filename} mapping`,
      filename: mapping.doc.filename,
      embedded: !!mapping.ontology,
      project: mapping.doc.project,
      ontologyRef: mapping.data.ontology_ref ?? { name: mapping.ontology?.data.name },
      semanticModelRef: mapping.data.semantic_model_ref ?? { name: mapping.data.semantic_model?.name },
    })),
    policy,
  };
}
/** Resolves a mapping by ID into semantic context with source evidence. */
export function buildContext(documents: StoredDocument[], mappingId: string): RuntimeContext {
  const parsed = parseDocuments(documents);
  const entry = mappingEntries(parsed).find(m => m.id === mappingId);
  if (!entry) throw new BadRequestError('Mapping not found. Import a standalone mapping or an ontology with embedded mappings.');
  return assemble(parsed, entry);
}
/** Builds context for a model at a document path when no mapping is required. */
export function modelContext(documents: StoredDocument[], documentId: string, path: (string | number)[] = []): RuntimeContext {
  const parsed = parseDocuments(documents);
  const parsedDocument = parsed.find(x => x.doc.id === documentId);
  if (!parsedDocument?.data) throw new BadRequestError('Semantic model not found.');
  let model: any = parsedDocument.data;
  for (const segment of path) model = model?.[segment];
  if (!model || !Array.isArray(model.datasets)) throw new BadRequestError('Semantic model not found.');
  const entry: Entry = {
    id: `${documentId}#model`,
    doc: parsedDocument.doc,
    data: { name: model.name, semantic_model: model, concept_mappings: [] },
    ontology: { doc: parsedDocument.doc, data: { name: '(none)', ontology: [] } },
    path: [],
    semanticPath: path,
  };
  return assemble(parsed, entry);
}
