/** Normalizes RDF terms across serializations using the workbench's parsers and base IRI. */
import { Parser } from 'n3';
import { graph, parse } from 'rdflib';
// RDF terms and graphs for item editing: one plain triple shape for every serialization, parsed
// with the same parsers the workbench reads files with (n3 for Turtle, N-Triples and N3, rdflib
// for RDF/XML) and the same base IRI, so a graph compares with itself across edits.
/** Represents an RDF term independently of the parser that produced it. */
export type Term = {
  termType: 'NamedNode' | 'BlankNode' | 'Literal' | 'Variable' | 'DefaultGraph';
  value: string;
  language?: string;
  datatype?: string;
};
/** Represents an RDF statement with an optional graph term. */
export type Triple = { s: Term; p: Term; o: Term; g?: Term };
/** Names an RDF serialization supported by the item patchers. */
export type RdfFormat = 'turtle' | 'ntriples' | 'n3' | 'rdfxml';
export const BASE = 'https://workbench.local/import/';
export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const SH = 'http://www.w3.org/ns/shacl#';
// Prefixes a user may type in any RDF file, besides the file's own.
export const WELL_KNOWN: Record<string, string> = {
  rdf: RDF,
  rdfs: RDFS,
  owl: OWL,
  xsd: XSD,
  sh: SH,
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
  schema: 'https://schema.org/',
};
/** Detects an RDF serialization from a filename and source text. */
export function formatOf(filename: string, source: string): RdfFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (/^\s*(<\?xml|<rdf:RDF|<RDF\b)/.test(source) || (['rdf', 'xml', 'owl'].includes(ext ?? '') && /^\s*</.test(source) && !/^\s*<https?:/.test(source))) return 'rdfxml';
  if (ext === 'nt') {
    return 'ntriples';
  }
  if (ext === 'n3') {
    return 'n3';
  }
  return 'turtle';
}
const plain = (parsedTerm: any): Term =>
  parsedTerm.termType === 'Literal'
    ? {
        termType: 'Literal',
        value: parsedTerm.value,
        language: parsedTerm.language || undefined,
        datatype: parsedTerm.language ? undefined : (parsedTerm.datatype?.value ?? XSD + 'string'),
      }
    : { termType: parsedTerm.termType === 'Collection' ? 'BlankNode' : parsedTerm.termType, value: parsedTerm.value };
// The format names the n3 parser expects.
const N3_FORMAT: Record<Exclude<RdfFormat, 'rdfxml'>, string> = {
  ntriples: 'N-Triples',
  n3: 'N3',
  turtle: 'Turtle',
};
/** Parses RDF using the shared base IRI and serialization-specific parser. */
export function parseGraph(source: string, format: RdfFormat): Triple[] {
  if (format === 'rdfxml') {
    const store = graph();
    parse(source, store, BASE, 'application/rdf+xml');
    return store.statements.map((statement: any) => ({
      s: plain(statement.subject),
      p: plain(statement.predicate),
      o: plain(statement.object),
    }));
  }
  const quads = new Parser({
    format: N3_FORMAT[format],
    baseIRI: BASE,
  }).parse(source);
  return quads.map(quad => ({
    s: plain(quad.subject),
    p: plain(quad.predicate),
    o: plain(quad.object),
    ...(quad.graph.termType === 'DefaultGraph' ? {} : { g: plain(quad.graph) }),
  }));
}
/** Builds a comparable identity from a term's kind, value and literal metadata. */
export const termKey = (term: Term) => {
  if (term.termType === 'NamedNode') {
    return `<${term.value}>`;
  }
  if (term.termType === 'BlankNode') {
    return `_:${term.value}`;
  }
  if (term.termType === 'Variable') {
    return `?${term.value}`;
  }
  if (term.termType === 'Literal') {
    const suffix = term.language ? '@' + term.language.toLowerCase() : '^^<' + term.datatype + '>';
    return `${JSON.stringify(term.value)}${suffix}`;
  }
  return '';
};
/** Identifies blank nodes and variables requiring graph-local identity handling. */
export const isBlank = (t: Term) => t.termType === 'BlankNode' || t.termType === 'Variable';

/** Serializes a term as N-Triples text that is also valid Turtle. */
export function ntTerm(term: Term) {
  if (term.termType === 'NamedNode') return `<${term.value}>`;
  if (term.termType === 'BlankNode') return `_:${term.value.replace(/[^\w-]/g, '_')}`;
  const value = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  let label: string;
  if (term.language) {
    label = '@' + term.language;
  } else if (term.datatype && term.datatype !== XSD + 'string') {
    label = '^^<' + term.datatype + '>';
  } else {
    label = '';
  }
  return `"${value}"${label}`;
}

/** Uses a declared prefix when the local part is a valid plain name. */
export function shortIri(iri: string, prefixes: Record<string, string>) {
  let best: [string, string] | null = null;
  for (const [prefix, ns] of Object.entries(prefixes)) if (iri.startsWith(ns) && /^[A-Za-z_][\w-]*$/.test(iri.slice(ns.length)) && (!best || ns.length > best[1].length)) best = [prefix, ns];
  return best ? `${best[0]}:${iri.slice(best[1].length)}` : `<${iri}>`;
}
/** Serializes an RDF term using available prefixes. */
export function turtleTerm(term: Term, prefixes: Record<string, string>) {
  if (term.termType === 'NamedNode') return shortIri(term.value, prefixes);
  if (term.termType !== 'Literal') return ntTerm(term);
  const value = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (term.language) return `"${value}"@${term.language}`;
  if (!term.datatype || term.datatype === XSD + 'string') return `"${value}"`;
  if (term.datatype === XSD + 'integer' && /^[+-]?\d+$/.test(term.value)) return term.value;
  return `"${value}"^^${shortIri(term.datatype, prefixes)}`;
}
// The terms a user types (Turtle syntax: prefixed names, <IRIs>, literals, nested [ ] and ( )),
// read with the file's prefixes plus the well-known ones.
/** Contains a parsed object term and any nested triples it introduces. */
export type ParsedObject = { term: Term; nested: boolean; triples: Triple[] };
const directives = (prefixes: Record<string, string>) =>
  Object.entries({ ...WELL_KNOWN, ...prefixes })
    .map(([p, ns]) => `@prefix ${p}: <${ns}> .\n`)
    .join('');
/** Parses Turtle object input with declared and well-known prefixes. */
export function parseObject(text: string, prefixes: Record<string, string>, base = BASE): ParsedObject {
  const triples = parseGraph(`@base <${base}> .\n${directives(prefixes)}<urn:workbench:s> <urn:workbench:p> ${text} .`, 'turtle');
  const top = triples.find(t => t.s.value === 'urn:workbench:s' && t.p.value === 'urn:workbench:p');
  if (!top || triples.filter(t => t.s.value === 'urn:workbench:s').length !== 1) throw Error(`"${text}" is not one RDF term.`);
  return { term: top.o, nested: triples.length > 1, triples: triples.filter(t => t !== top) };
}
/** Parses a Turtle predicate using the prefixes available to the file. */
export function parsePredicate(text: string, prefixes: Record<string, string>, base = BASE): string {
  if (text.trim() === 'a') return RDF + 'type';
  const triples = parseGraph(`@base <${base}> .\n${directives(prefixes)}<urn:workbench:s> ${text} <urn:workbench:o> .`, 'turtle');
  if (triples.length !== 1) throw Error(`"${text}" is not one predicate.`);
  return triples[0].p.value;
}
// Whether a typed prefix is known (the file's, or a well-known one that will be declared).
/** Lists prefix names used by Turtle text. */
export const usedPrefixes = (text: string) => [...new Set([...text.replace(/"(?:[^"\\]|\\.)*"|<[^>]*>/g, ' ').matchAll(/(?:^|[\s,;([^])([A-Za-z][\w-]*):(?![/])/g)].map(m => m[1]))];
