// Compiles one Tessera ontology to standard Ossie: removes the marker and every addition according to its disposition.
import { parseDocument, type Document } from 'yaml';
import { isObject } from '../edit/source-text';
import { formatAddress } from '../core/item-address';
import { addressAtModelPath } from '../core/model-addresses';
import { sha256Hex } from './digest';
import { hasTesseraPrefix, TesseraNames } from './format';
import type { LossEntry } from './loss-report';
import { lossyNumbers, printJson, printYaml, type DocumentSyntax } from './serialize';
import type { AdditionPlace, Registry } from './registry';

/** The ways a compile fails. None of them can be accepted. */
export type CompileFailureCode = 'invalid-source' | 'output-schema' | 'meaning' | 'translation' | 'limit' | 'path-collision' | 'serialization';

/** One reason the compile cannot release its output. */
export type CompileFailure = { code: CompileFailureCode; document?: string; message: string };

/** One document handed to the compiler. */
export type SourceDocument = { path: string; source: string };

/** One addition found in a document: where, which, and the value it holds. */
export type AdditionSite = { path: (string | number)[]; name: string; place: AdditionPlace; value: unknown };

/** A compiled document: its text and what was lost. The caller reads the text back to check it. */
export type CompiledDocument = { ok: true; text: string; losses: LossEntry[] } | { ok: false; failures: CompileFailure[] };

/** A parsed document: its data and, for YAML, the document that keeps comments and scalar spelling. */
export type ParsedSource = { data: any; yaml?: Document.Parsed };

/** Tells which syntax a file name uses, as the editor does. */
export function syntaxOf(path: string): DocumentSyntax {
  return path.toLowerCase().endsWith('.json') ? 'json' : 'yaml';
}

function sitesIn(owner: unknown, path: (string | number)[], place: AdditionPlace): AdditionSite[] {
  if (!isObject(owner)) return [];
  return Object.keys(owner)
    .filter(hasTesseraPrefix)
    .map(name => ({ path: [...path, name], name, place, value: owner[name] }));
}

/** Finds every addition at the places where additions may appear. */
export function additionSites(data: unknown): AdditionSite[] {
  const sites = sitesIn(data, [], 'root');
  const concepts = isObject(data) && Array.isArray(data.ontology) ? data.ontology : [];
  concepts.forEach((concept, conceptIndex) => {
    sites.push(...sitesIn(concept, ['ontology', conceptIndex], 'concept'));
    const relationships = isObject(concept) && Array.isArray(concept.relationships) ? concept.relationships : [];
    relationships.forEach((relationship, relationshipIndex) => {
      sites.push(...sitesIn(relationship, ['ontology', conceptIndex, 'relationships', relationshipIndex], 'relationship'));
    });
  });
  return sites;
}

/** Returns a copy of the data without the marker and without the additions found at the given sites. */
export function withoutAdditions(data: unknown, sites: AdditionSite[]): unknown {
  const copy = structuredClone(data) as Record<string, unknown>;
  delete copy[TesseraNames.markerKey];
  for (const site of sites) {
    const owner = site.path.slice(0, -1).reduce<any>((node, key) => node[key], copy);
    delete owner[site.path.at(-1) as string];
  }
  return copy;
}

function pointerOf(path: (string | number)[]): string {
  return '/' + path.map(segment => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

function lossOf(documentPath: string, data: unknown, site: AdditionSite): LossEntry {
  const encoded = JSON.stringify(site.value);
  const owner = site.path.slice(0, -1);
  return {
    document: documentPath,
    item: formatAddress(addressAtModelPath(data, owner)),
    property: site.name,
    pointer: pointerOf(site.path),
    bytes: new TextEncoder().encode(encoded).length,
    sha256: sha256Hex(encoded),
  };
}

/** Parses a document's text by its file name, returning the data and, for YAML, the document that keeps comments and scalar spelling. */
export function parseSourceDocument(document: SourceDocument, syntax: DocumentSyntax): ParsedSource | CompileFailure {
  if (syntax === 'json') {
    try {
      return { data: JSON.parse(document.source) };
    } catch (error) {
      return { code: 'invalid-source', document: document.path, message: (error as Error).message };
    }
  }
  const yaml = parseDocument(document.source, { uniqueKeys: true });
  if (yaml.errors.length) return { code: 'invalid-source', document: document.path, message: yaml.errors[0].message };
  return { data: yaml.toJS({ maxAliasCount: 100 }), yaml };
}

/** Moves a comment that sat above the marker to the top of the document, so a license header survives. */
function keepHeaderComment(yaml: Document.Parsed) {
  const first = (yaml.contents as any)?.items?.[0];
  if (first?.key?.value === TesseraNames.markerKey && first.key.commentBefore && !yaml.commentBefore) yaml.commentBefore = first.key.commentBefore;
}

/** Decides what each addition becomes: dropped additions are reported as losses, the others fail the compile. */
function dispositions(document: SourceDocument, data: unknown, sites: AdditionSite[], registry: Registry): { losses: LossEntry[]; failures: CompileFailure[] } {
  const losses: LossEntry[] = [];
  const failures: CompileFailure[] = [];
  for (const site of sites) {
    const entry = registry.byName(site.name);
    if (!entry) failures.push({ code: 'invalid-source', document: document.path, message: `${site.name} at ${pointerOf(site.path)} is not a registered ${TesseraNames.product} property.` });
    else if (entry.disposition === 'drop') losses.push(lossOf(document.path, data, site));
    else failures.push({ code: 'translation', document: document.path, message: `${site.name} at ${pointerOf(site.path)} cannot be compiled: its disposition is ${entry.disposition}.` });
  }
  return { losses, failures };
}

/** Compiles one Tessera ontology into standard Ossie text, with the losses it caused, or says why it cannot. */
export function compileDocument(document: SourceDocument, registry: Registry): CompiledDocument {
  const syntax = syntaxOf(document.path);
  const parsed = parseSourceDocument(document, syntax);
  if ('code' in parsed) return { ok: false, failures: [parsed] };
  const sites = additionSites(parsed.data);
  const { losses, failures } = dispositions(document, parsed.data, sites, registry);
  const lossy = lossyNumbers(syntax, document.source, parsed.yaml);
  for (const token of lossy) failures.push({ code: 'serialization', document: document.path, message: `The number ${token} cannot be written without changing its digits.` });
  if (failures.length) return { ok: false, failures };
  if (syntax === 'json') {
    return { ok: true, text: printJson(withoutAdditions(parsed.data, sites)), losses };
  }
  const yaml = parsed.yaml!;
  keepHeaderComment(yaml);
  yaml.delete(TesseraNames.markerKey);
  for (const site of sites) yaml.deleteIn(site.path);
  return { ok: true, text: printYaml(yaml), losses };
}
