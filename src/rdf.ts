import { DOMParser } from '@xmldom/xmldom';
import { Parser } from 'n3';
import { validateRdf } from './rdf-validation';
import { InputError } from './diagnostics';
import { graph, parse } from 'rdflib';
import type { Entity, Relationship } from './model';
import { namespaceOf, prefixMap } from './iri';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  RDFS = 'http://www.w3.org/2000/01/rdf-schema#',
  OWL = 'http://www.w3.org/2002/07/owl#',
  SH = 'http://www.w3.org/ns/shacl#';
export function rdfSyntax(source: string, filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (
    /^\s*(<\?xml|<rdf:RDF|<RDF\b)/.test(source) ||
    (['rdf', 'xml', 'owl'].includes(ext ?? '') &&
      /^\s*</.test(source) &&
      !/^\s*<https?:/.test(source))
  )
    return 'application/rdf+xml';
  if (
    ['ttl', 'nt', 'n3', 'owl', 'rdf', 'shacl'].includes(ext ?? '') ||
    /^\s*(@prefix|@base|PREFIX|BASE)\b/i.test(source) ||
    /^\s*<[^>]+>\s+<[^>]+>/.test(source)
  )
    return 'text/turtle';
  return null;
}
export function inspectRdf(source: string, filename: string, syntax: string) {
  const store = graph();
  if (syntax === 'application/rdf+xml' && /<!DOCTYPE|<!ENTITY/i.test(source))
    throw new InputError([
      {
        severity: 'error',
        code: 'xml-entity',
        path: '/',
        message:
          'RDF/XML DTDs and entity declarations are unsupported. Use explicit IRIs and literals.',
      },
    ]);
  try {
    if (syntax === 'application/rdf+xml')
      new DOMParser({
        onError: (_level, message) => {
          throw Error(message);
        },
      }).parseFromString(source, 'application/xml');
    if (filename.toLowerCase().endsWith('.nt')) new Parser({ format: 'N-Triples' }).parse(source);
    parse(source, store, 'https://workbench.local/import/', syntax);
  } catch (e) {
    throw new InputError([
      { severity: 'error', code: 'rdf-syntax', path: '/', message: (e as Error).message },
    ]);
  }
  const issues = validateRdf(store);
  if (!store.statements.length) throw Error('RDF document contains no triples');
  const subjects = new Map<string, any>();
  const statements = new Map<string, any[]>();
  for (const st of store.statements) {
    subjects.set(st.subject.value, st.subject);
    const list = statements.get(st.subject.value) ?? [];
    list.push(st);
    statements.set(st.subject.value, list);
  }
  const safeDecode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const short = (s: string) =>
    s.startsWith('n') && !s.includes(':') ? `_:${s}` : safeDecode(s.split(/[#/]/).pop() || s);
  const get = (id: string, p: string) =>
    statements
      .get(id)
      ?.filter(s => s.predicate.value === p)
      .map(s => s.object) ?? [];
  const types = (id: string) => get(id, RDF + 'type').map(t => t.value);
  const entities: Entity[] = Array.from(subjects.keys())
    .filter(id => !types(id).includes(OWL + 'Ontology'))
    .map(id => {
      const ts = types(id);
      const def: Record<string, any> = { iri: id };
      for (const st of statements.get(id) ?? []) {
        const key = st.predicate.value;
        (def[key] ??= []).push({
          value: st.object.value,
          type: st.object.termType,
          datatype: st.object.datatype?.value,
          language: st.object.language || undefined,
        });
      }
      return {
        id,
        name:
          get(id, RDFS + 'label')[0]?.value ??
          get(id, SH + 'name')[0]?.value ??
          (types(id).includes(OWL + 'Restriction')
            ? 'Restriction: ' + short(get(id, OWL + 'onProperty')[0]?.value ?? id)
            : short(id)),
        kind:
          ts.includes(OWL + 'Class') || ts.includes(RDFS + 'Class')
            ? 'OWL class'
            : ts.includes(OWL + 'ObjectProperty')
              ? 'Object property'
              : ts.includes(OWL + 'DatatypeProperty')
                ? 'Datatype property'
                : ts.includes(SH + 'NodeShape')
                  ? 'Node shape'
                  : ts.includes(SH + 'PropertyShape')
                    ? 'Property shape'
                    : subjects.get(id)?.termType === 'BlankNode'
                      ? 'Blank node'
                      : ts.length
                        ? short(ts[0])
                        : 'RDF resource',
        description:
          get(id, RDFS + 'comment')[0]?.value ?? get(id, SH + 'description')[0]?.value ?? '',
        path: [],
        fields: (statements.get(id) ?? [])
          .filter(s => s.object.termType === 'Literal')
          .map(s => `${short(s.predicate.value)}: ${s.object.value}`),
        definition: def,
        readOnlyForm: true,
      };
    });
  const prefixes = prefixMap((store as any).namespaces);
  for (const e of entities)
    if (subjects.get(e.id)?.termType === 'NamedNode') e.namespace = namespaceOf(e.id, prefixes);
  const ids = new Set(entities.map(e => e.id));
  const edges: Relationship[] = [];
  for (const st of store.statements)
    if (st.object.termType !== 'Literal' && ids.has(st.subject.value) && ids.has(st.object.value))
      edges.push({
        id: `triple-${edges.length}`,
        source: st.subject.value,
        target: st.object.value,
        label: short(st.predicate.value),
        data: {
          path: [],
          definition: {
            subject: st.subject.value,
            predicate: st.predicate.value,
            object: st.object.value,
            graph: st.why?.value,
          },
          kind: 'RDF statement',
          readOnlyForm: true,
        },
      });
  // Object properties describe links between domain and range classes.
  for (const id of subjects.keys())
    if (types(id).includes(OWL + 'ObjectProperty'))
      for (const domain of get(id, RDFS + 'domain'))
        for (const range of get(id, RDFS + 'range'))
          if (ids.has(domain.value) && ids.has(range.value))
            edges.push({
              id: `property-${edges.length}`,
              source: domain.value,
              target: range.value,
              label: get(id, RDFS + 'label')[0]?.value ?? short(id),
              data: {
                path: [],
                definition: {
                  iri: id,
                  ...Object.fromEntries(
                    (statements.get(id) ?? []).map(s => [s.predicate.value, s.object.value]),
                  ),
                },
                kind: 'OWL object property',
                readOnlyForm: true,
              },
            });
  const isShacl = store.statements.some(
    s => s.predicate.value.startsWith(SH) || s.object.value.startsWith(SH),
  );
  const isOwl = store.statements.some(
    s => s.predicate.value.startsWith(OWL) || s.object.value.startsWith(OWL),
  );
  const ontology = Array.from(subjects.keys()).find(id => types(id).includes(OWL + 'Ontology'));
  return {
    kind: isShacl ? 'SHACL' : isOwl ? 'OWL' : 'RDF',
    name: ontology
      ? (get(ontology, RDFS + 'label')[0]?.value ?? short(ontology))
      : filename || 'RDF graph',
    entities,
    edges,
    issues,
  };
}
