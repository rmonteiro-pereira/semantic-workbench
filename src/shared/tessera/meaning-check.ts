// Checks that compiling changed nothing but the marker and the additions: the same data, the same items and addresses, and the same names pointing at the same documents.
import { formatAddress, type Address } from '../core/item-address';
import { inspect } from '../core/model';
import { deepEqual, isObject } from '../edit/source-text';
import { isMapping } from '../mappings/mapping-schema';
import { additionSites, withoutAdditions, type CompileFailure } from './compile-document';

function meaningFailure(document: string, message: string): CompileFailure {
  return { code: 'meaning', document, message };
}

/** The items of a document: entity and edge identifiers and the address of each item. */
export type ItemSummary = { entities: string[]; edges: string[]; addresses: string[] };

/** A document as the meaning check reads it: its text, its parsed data and its items. */
export type DocumentReading = { path: string; source: string; data: unknown; summary: ItemSummary };

/** Lists the items of an inspected document. */
export function summarizeItems(model: ReturnType<typeof inspect>): ItemSummary {
  const items = [...model.entities, ...model.edges];
  return {
    entities: model.entities.map(entity => entity.id),
    edges: model.edges.map(edge => edge.id),
    addresses: items.flatMap(item => ('address' in item ? [formatAddress(item.address as Address)] : [])),
  };
}

/** Checks a compiled document against its source: the output holds equal data and the same items with the same addresses. */
export function documentMeaningFailures(source: DocumentReading, output: DocumentReading): CompileFailure[] {
  const failures: CompileFailure[] = [];
  const expected = withoutAdditions(source.data, additionSites(source.data));
  if (!deepEqual(expected, output.data)) failures.push(meaningFailure(source.path, 'The compiled text does not hold the same data as the source without the marker and the additions.'));
  if (!deepEqual(source.summary, output.summary)) failures.push(meaningFailure(source.path, 'The compiled document has different items, relationships or item addresses than its source.'));
  return failures;
}

/** Maps each ontology and semantic model name to the document that defines it. */
function nameIndex(documents: Pick<DocumentReading, 'path' | 'data'>[]): string[] {
  const index: string[] = [];
  for (const document of documents) {
    if (!isObject(document.data) || isMapping(document.data)) continue;
    if (Array.isArray(document.data.ontology)) index.push(`ontology:${String(document.data.name)} -> ${document.path}`);
    else if (Array.isArray(document.data.datasets)) index.push(`model:${String(document.data.name)} -> ${document.path}`);
  }
  return index.sort();
}

/** Checks the whole set: the same names point at the same document paths, and every mapping is copied byte for byte. */
export function unitMeaningFailures(sources: Pick<DocumentReading, 'path' | 'source' | 'data'>[], outputs: Pick<DocumentReading, 'path' | 'source' | 'data'>[]): CompileFailure[] {
  const failures: CompileFailure[] = [];
  if (!deepEqual(nameIndex(sources), nameIndex(outputs))) failures.push(meaningFailure('', 'The compiled set resolves ontology and semantic model names to different documents than the source set.'));
  const outputByPath = new Map(outputs.map(output => [output.path, output.source]));
  for (const source of sources) {
    if (isMapping(source.data) && outputByPath.get(source.path) !== source.source) failures.push(meaningFailure(source.path, 'A mapping document was changed or left out of the compiled set.'));
  }
  return failures;
}
