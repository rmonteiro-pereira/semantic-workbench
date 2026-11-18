// Checks that compiling changed nothing but the marker and the additions: the same data, the same items and addresses, and the same names pointing at the same documents.
import { formatAddress, type Address } from '../core/item-address';
import { inspect } from '../core/model';
import { deepEqual, isObject } from '../edit/source-text';
import { isMapping } from '../mappings/mapping-schema';
import { additionSites, parseSourceDocument, syntaxOf, withoutAdditions, type CompileFailure, type SourceDocument } from './compile-document';

function meaningFailure(document: string, message: string): CompileFailure {
  return { code: 'meaning', document, message };
}

function itemSummary(source: string, path: string) {
  const model = inspect(source, path.split('/').at(-1)!);
  const items = [...model.entities, ...model.edges];
  return {
    entities: model.entities.map(entity => entity.id),
    edges: model.edges.map(edge => edge.id),
    addresses: items.flatMap(item => ('address' in item ? [formatAddress(item.address as Address)] : [])),
  };
}

/** Checks the text of one compiled document against its source: the text read back holds equal data and the same items with the same addresses. */
export function documentMeaningFailures(source: SourceDocument, output: SourceDocument): CompileFailure[] {
  const parsed = parseSourceDocument(source, syntaxOf(source.path));
  if ('code' in parsed) return [parsed];
  const reparsed = parseSourceDocument(output, syntaxOf(output.path));
  if ('code' in reparsed) return [meaningFailure(source.path, `The compiled text cannot be read back: ${reparsed.message}`)];
  const failures: CompileFailure[] = [];
  const expected = withoutAdditions(parsed.data, additionSites(parsed.data));
  if (!deepEqual(expected, reparsed.data)) failures.push(meaningFailure(source.path, 'The compiled text does not hold the same data as the source without the marker and the additions.'));
  try {
    if (!deepEqual(itemSummary(source.source, source.path), itemSummary(output.source, output.path)))
      failures.push(meaningFailure(source.path, 'The compiled document has different items, relationships or item addresses than its source.'));
  } catch (error) {
    failures.push(meaningFailure(source.path, `The compiled document cannot be read as the source can: ${(error as Error).message}`));
  }
  return failures;
}

/** Maps each ontology and semantic model name to the document that defines it. */
function nameIndex(documents: SourceDocument[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const document of documents) {
    const parsed = parseSourceDocument(document, syntaxOf(document.path));
    if ('code' in parsed || !isObject(parsed.data) || isMapping(parsed.data)) continue;
    if (Array.isArray(parsed.data.ontology)) index.set(`ontology:${String(parsed.data.name)}`, document.path);
    else if (Array.isArray(parsed.data.datasets)) index.set(`model:${String(parsed.data.name)}`, document.path);
  }
  return index;
}

function indexText(index: Map<string, string>): string[] {
  return [...index].map(([name, path]) => `${name} -> ${path}`).sort();
}

/** Checks the whole set: the same names point at the same document paths, and every mapping is copied byte for byte. */
export function unitMeaningFailures(sources: SourceDocument[], outputs: SourceDocument[]): CompileFailure[] {
  const failures: CompileFailure[] = [];
  if (!deepEqual(indexText(nameIndex(sources)), indexText(nameIndex(outputs))))
    failures.push(meaningFailure('', 'The compiled set resolves ontology and semantic model names to different documents than the source set.'));
  const outputByPath = new Map(outputs.map(output => [output.path, output.source]));
  for (const source of sources) {
    const parsed = parseSourceDocument(source, syntaxOf(source.path));
    if ('code' in parsed || !isMapping(parsed.data)) continue;
    if (outputByPath.get(source.path) !== source.source) failures.push(meaningFailure(source.path, 'A mapping document was changed or left out of the compiled set.'));
  }
  return failures;
}
