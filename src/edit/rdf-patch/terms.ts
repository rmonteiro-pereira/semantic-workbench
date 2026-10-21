import { Parser } from 'n3';
import { graph, parse } from 'rdflib';
// RDF terms and graphs for item editing (FR-055): one plain triple shape for every serialization,
// parsed with the same parsers the workbench reads files with (n3 for Turtle, N-Triples and N3,
// rdflib for RDF/XML) and the same base IRI, so a graph compares with itself across edits.
export type Term = {
  termType: 'NamedNode' | 'BlankNode' | 'Literal' | 'Variable' | 'DefaultGraph';
  value: string;
  language?: string;
  datatype?: string;
};
export type Triple = { s: Term; p: Term; o: Term; g?: Term };
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
export function formatOf(filename: string, source: string): RdfFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (
    /^\s*(<\?xml|<rdf:RDF|<RDF\b)/.test(source) ||
    (['rdf', 'xml', 'owl'].includes(ext ?? '') &&
      /^\s*</.test(source) &&
      !/^\s*<https?:/.test(source))
  )
    return 'rdfxml';
  return ext === 'nt' ? 'ntriples' : ext === 'n3' ? 'n3' : 'turtle';
}
const plain = (t: any): Term =>
  t.termType === 'Literal'
    ? {
        termType: 'Literal',
        value: t.value,
        language: t.language || undefined,
        datatype: t.language ? undefined : (t.datatype?.value ?? XSD + 'string'),
      }
    : { termType: t.termType === 'Collection' ? 'BlankNode' : t.termType, value: t.value };
export function parseGraph(source: string, format: RdfFormat): Triple[] {
  if (format === 'rdfxml') {
    const store = graph();
    parse(source, store, BASE, 'application/rdf+xml');
    return store.statements.map((s: any) => ({
      s: plain(s.subject),
      p: plain(s.predicate),
      o: plain(s.object),
    }));
  }
  const quads = new Parser({
    format: format === 'ntriples' ? 'N-Triples' : format === 'n3' ? 'N3' : 'Turtle',
    baseIRI: BASE,
  }).parse(source);
  return quads.map(q => ({
    s: plain(q.subject),
    p: plain(q.predicate),
    o: plain(q.object),
    ...(q.graph.termType === 'DefaultGraph' ? {} : { g: plain(q.graph) }),
  }));
}
export const termKey = (t: Term) =>
  t.termType === 'NamedNode'
    ? `<${t.value}>`
    : t.termType === 'BlankNode'
      ? `_:${t.value}`
      : t.termType === 'Variable'
        ? `?${t.value}`
        : t.termType === 'Literal'
          ? `${JSON.stringify(t.value)}${t.language ? '@' + t.language.toLowerCase() : '^^<' + t.datatype + '>'}`
          : '';
export const isBlank = (t: Term) => t.termType === 'BlankNode' || t.termType === 'Variable';
// N-Triples text of a ground term (also valid Turtle).
export function ntTerm(t: Term) {
  if (t.termType === 'NamedNode') return `<${t.value}>`;
  if (t.termType === 'BlankNode') return `_:${t.value.replace(/[^\w-]/g, '_')}`;
  const v = t.value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `"${v}"${t.language ? '@' + t.language : t.datatype && t.datatype !== XSD + 'string' ? '^^<' + t.datatype + '>' : ''}`;
}
// A prefixed name when a prefix covers the IRI and the local part is a plain name.
export function shortIri(iri: string, prefixes: Record<string, string>) {
  let best: [string, string] | null = null;
  for (const [p, ns] of Object.entries(prefixes))
    if (
      iri.startsWith(ns) &&
      /^[A-Za-z_][\w-]*$/.test(iri.slice(ns.length)) &&
      (!best || ns.length > best[1].length)
    )
      best = [p, ns];
  return best ? `${best[0]}:${iri.slice(best[1].length)}` : `<${iri}>`;
}
export function turtleTerm(t: Term, prefixes: Record<string, string>) {
  if (t.termType === 'NamedNode') return shortIri(t.value, prefixes);
  if (t.termType !== 'Literal') return ntTerm(t);
  const v = t.value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  if (t.language) return `"${v}"@${t.language}`;
  if (!t.datatype || t.datatype === XSD + 'string') return `"${v}"`;
  if (t.datatype === XSD + 'integer' && /^[+-]?\d+$/.test(t.value)) return t.value;
  return `"${v}"^^${shortIri(t.datatype, prefixes)}`;
}
// The terms a user types (Turtle syntax: prefixed names, <IRIs>, literals, nested [ ] and ( )),
// read with the file's prefixes plus the well-known ones.
export type ParsedObject = { term: Term; nested: boolean; triples: Triple[] };
const directives = (prefixes: Record<string, string>) =>
  Object.entries({ ...WELL_KNOWN, ...prefixes })
    .map(([p, ns]) => `@prefix ${p}: <${ns}> .\n`)
    .join('');
export function parseObject(
  text: string,
  prefixes: Record<string, string>,
  base = BASE,
): ParsedObject {
  const triples = parseGraph(
    `@base <${base}> .\n${directives(prefixes)}<urn:workbench:s> <urn:workbench:p> ${text} .`,
    'turtle',
  );
  const top = triples.find(t => t.s.value === 'urn:workbench:s' && t.p.value === 'urn:workbench:p');
  if (!top || triples.filter(t => t.s.value === 'urn:workbench:s').length !== 1)
    throw Error(`"${text}" is not one RDF term.`);
  return { term: top.o, nested: triples.length > 1, triples: triples.filter(t => t !== top) };
}
export function parsePredicate(
  text: string,
  prefixes: Record<string, string>,
  base = BASE,
): string {
  if (text.trim() === 'a') return RDF + 'type';
  const triples = parseGraph(
    `@base <${base}> .\n${directives(prefixes)}<urn:workbench:s> ${text} <urn:workbench:o> .`,
    'turtle',
  );
  if (triples.length !== 1) throw Error(`"${text}" is not one predicate.`);
  return triples[0].p.value;
}
// Whether a typed prefix is known (the file's, or a well-known one that will be declared).
export const usedPrefixes = (text: string) => [
  ...new Set(
    [
      ...text
        .replace(/"(?:[^"\\]|\\.)*"|<[^>]*>/g, ' ')
        .matchAll(/(?:^|[\s,;([^])([A-Za-z][\w-]*):(?![/])/g),
    ].map(m => m[1]),
  ),
];
