/** Runs SHACL shapes, including SPARQL constraints, against a data graph held in memory. */
import { DataFactory, Parser, Store, type Quad_Object, type Term } from 'n3';
import { InputError } from './diagnostics';
import { rdfSyntax } from './rdf';

const SH = 'http://www.w3.org/ns/shacl#';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const SH_PROPERTY = SH + 'property';
const SH_MESSAGE = SH + 'message';

/** A file whose text is parsed as RDF. */
export type RdfSource = { filename: string; source: string };

/** One violation reported by a shape, with the node it was found on and the rule that found it. */
export type ShaclFinding = {
  severity: 'error' | 'warning' | 'info';
  focusNode: string;
  focusLabel: string;
  shape: string;
  rule: string;
  message: string;
};

/** The outcome of running one shapes file against one data file. */
export type ShaclReport = {
  conforms: boolean;
  findings: ShaclFinding[];
};

type ParsedRdf = { store: Store; prefixes: Record<string, string> };

/** Parses Turtle, N-Triples or N3 into an in-memory store and remembers the file's prefixes. */
function parseRdf({ filename, source }: RdfSource): ParsedRdf {
  const syntax = rdfSyntax(source, filename);
  if (syntax === null) throw new InputError([{ severity: 'error', code: 'rdf-syntax', path: '/', message: `${filename} is not an RDF file.` }]);
  if (syntax === 'application/rdf+xml') {
    const message = `${filename} is RDF/XML. Shapes run against Turtle, N-Triples or N3 files; convert it to Turtle first.`;
    throw new InputError([{ severity: 'error', code: 'rdf-syntax', path: '/', message }]);
  }
  const prefixes: Record<string, string> = {};
  const store = new Store();
  try {
    const quads = new Parser().parse(source, null, (prefix, namespace) => {
      prefixes[prefix] = namespace.value;
    });
    store.addQuads(quads);
  } catch (error) {
    throw new InputError([{ severity: 'error', code: 'rdf-syntax', path: '/', message: `${filename}: ${(error as Error).message}` }]);
  }
  return { store, prefixes };
}

/** Shortens an IRI to prefix:name using the file's own prefixes, else to its last segment. */
function compactIri(iri: string, prefixes: Record<string, string>): string {
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (namespace && iri.startsWith(namespace) && iri.length > namespace.length) return `${prefix}:${iri.slice(namespace.length)}`;
  }
  return iri.split(/[#/]/).pop() || iri;
}

function literalOf(store: Store, subject: Term, predicate: string): string | undefined {
  const [object] = store.getObjects(subject as Quad_Object, DataFactory.namedNode(predicate), null);
  return object?.value;
}

/** Names a shape by its IRI; a property shape without one is named after the shape that owns it. */
function shapeName(shapes: ParsedRdf, shape: Term): string {
  if (shape.termType === 'NamedNode') return compactIri(shape.value, shapes.prefixes);
  const [owner] = shapes.store.getSubjects(DataFactory.namedNode(SH_PROPERTY), shape as Quad_Object, null);
  if (owner?.termType === 'NamedNode') return compactIri(owner.value, shapes.prefixes);
  return 'anonymous shape';
}

/** Describes the constraint that failed, such as "sh:minCount on ex:customer" or a SPARQL rule's own label. */
function ruleName(shapes: ParsedRdf, result: any): string {
  const component: string = result.constraintComponent.value;
  if (component === SH + 'SPARQLConstraintComponent') {
    const constraint: Term | undefined = result.source?.[0];
    const label = constraint ? (literalOf(shapes.store, constraint, RDFS_LABEL) ?? literalOf(shapes.store, constraint, SH_MESSAGE)) : undefined;
    return label ? `SPARQL rule "${label}"` : 'SPARQL rule';
  }
  const name = component.slice(SH.length).replace(/ConstraintComponent$/, '');
  const constraint = `sh:${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  const path: Term | undefined = result.path?.[0]?.predicates?.[0];
  return path ? `${constraint} on ${compactIri(path.value, shapes.prefixes)}` : constraint;
}

const SEVERITIES: Record<string, ShaclFinding['severity']> = { [SH + 'Violation']: 'error', [SH + 'Warning']: 'warning', [SH + 'Info']: 'info' };

function toFinding(shapes: ParsedRdf, data: ParsedRdf, result: any): ShaclFinding {
  const focusNode: Term = result.focusNode.term;
  const message: string = result.message?.[0]?.value ?? 'The data does not satisfy this shape.';
  return {
    severity: SEVERITIES[result.severity?.value] ?? 'error',
    focusNode: focusNode.value,
    focusLabel: literalOf(data.store, focusNode, RDFS_LABEL) ?? compactIri(focusNode.value, data.prefixes),
    shape: shapeName(shapes, result.shape.ptr.term),
    rule: ruleName(shapes, result),
    message,
  };
}

/** Runs every shape in the shapes file against the data file and lists what the data breaks. */
export async function runShaclShapes(shapesFile: RdfSource, dataFile: RdfSource): Promise<ShaclReport> {
  const shapes = parseRdf(shapesFile);
  const data = parseRdf(dataFile);
  // The engine and its SPARQL runtime are large, so they load only when a check is requested.
  const [{ Validator }, { targetResolvers, validations }] = await Promise.all([import('shacl-engine'), import('shacl-engine/sparql.js')]);
  const validator = new Validator(shapes.store, { factory: DataFactory, targetResolvers, validations });
  const report = await validator.validate({ dataset: data.store });
  const findings = report.results.map((result: any) => toFinding(shapes, data, result));
  return { conforms: report.conforms, findings };
}
