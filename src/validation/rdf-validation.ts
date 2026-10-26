/** Validates RDF and SHACL structures without fetching external IRIs. */
import { type Issue, rejectIssues } from './diagnostics';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const SH = 'http://www.w3.org/ns/shacl#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
/** Checks RDF and SHACL structures without retrieving external resources. */
export function validateRdf(store: any): Issue[] {
  const issues: Issue[] = [];
  const fail = (id: string, p: string, message: string) =>
    issues.push({ severity: 'error', code: 'rdf-structure', path: `${id} / ${p}`, message });
  const propertyTargets = new Set<string>(
    store.statements
      .filter((s: any) => s.predicate.value === SH + 'property')
      .map((s: any) => s.object.value),
  );
  const bySubject = new Map<string, Map<string, any[]>>();
  for (const s of store.statements) {
    const ps = bySubject.get(s.subject.value) ?? new Map();
    const os = ps.get(s.predicate.value) ?? [];
    os.push(s.object);
    ps.set(s.predicate.value, os);
    bySubject.set(s.subject.value, ps);
  }
  const get = (id: string, p: string): any[] => bySubject.get(id)?.get(p) ?? [];
  const count = (id: string, p: string) => {
    const os = get(id, p);
    if (os.length > 1) fail(id, p, 'Expected at most one value.');
    return os[0];
  };
  const resource = (x: any) => x?.termType === 'NamedNode' || x?.termType === 'BlankNode';
  const integer = (x: any) =>
    x?.termType === 'Literal' &&
    x.datatype?.value?.startsWith(XSD) &&
    /^(integer|nonNegativeInteger|positiveInteger|int|long|short|byte|unsignedInt|unsignedLong|unsignedShort|unsignedByte)$/.test(
      x.datatype?.value?.slice(XSD.length),
    ) &&
    /^[+-]?\d+$/.test(x.value) &&
    BigInt(x.value) >= 0n;
  // Paths and RDF collections are checked without fetching external IRIs.
  const path = (term: any, active: Set<string> = new Set()): boolean => {
    if (term?.termType === 'NamedNode') return true;
    if (term?.termType === 'Collection') return list(term, active, 2);
    if (term?.termType !== 'BlankNode' || active.has(term.value) || active.size > 128) return false;
    const next = new Set(active);
    next.add(term.value);
    const ps = bySubject.get(term.value);
    if (!ps) return false;
    const operators = [
      'inversePath',
      'alternativePath',
      'zeroOrMorePath',
      'oneOrMorePath',
      'zeroOrOnePath',
    ].filter(p => get(term.value, SH + p).length);
    if (operators.length === 1 && ps.size === 1) {
      const os = get(term.value, SH + operators[0]);
      return (
        os.length === 1 &&
        (operators[0] === 'alternativePath' ? list(os[0], next, 2) : path(os[0], next))
      );
    }
    return operators.length === 0 && list(term, next, 2);
  };
  const list = (term: any, active: Set<string>, min: number): boolean => {
    if (term?.termType === 'Collection') {
      if (active.has(term.value) || active.size > 128) return false;
      const next = new Set(active);
      next.add(term.value);
      return term.elements.length >= min && term.elements.every((x: any) => path(x, next));
    }
    const seen = new Set<string>();
    let n = 0;
    while (term?.value !== RDF + 'nil') {
      if (!resource(term) || seen.has(term.value) || n > 10000) return false;
      seen.add(term.value);
      const first = get(term.value, RDF + 'first');
      const rest = get(term.value, RDF + 'rest');
      if (first.length !== 1 || rest.length !== 1 || !path(first[0], active)) return false;
      n++;
      term = rest[0];
    }
    return n >= min;
  };
  for (const [id, ps] of bySubject) {
    const types = get(id, RDF + 'type').map(x => x.value);
    const propertyShape =
      types.includes(SH + 'PropertyShape') || ps.has(SH + 'path') || propertyTargets.has(id);
    const nodeShape = types.includes(SH + 'NodeShape');
    if (propertyShape) {
      const paths = get(id, SH + 'path');
      if (paths.length !== 1 || !path(paths[0]))
        fail(id, SH + 'path', 'A property shape requires exactly one well-formed SHACL path.');
    }
    if (nodeShape && ps.has(SH + 'path'))
      fail(id, SH + 'path', 'A NodeShape cannot also have sh:path.');
    for (const p of [
      'minCount',
      'maxCount',
      'minLength',
      'maxLength',
      'qualifiedMinCount',
      'qualifiedMaxCount',
    ]) {
      const v = count(id, SH + p);
      if (v && !integer(v)) fail(id, SH + p, 'Expected a non-negative integer literal.');
      if (
        nodeShape &&
        ['minCount', 'maxCount', 'qualifiedMinCount', 'qualifiedMaxCount'].includes(p) &&
        v
      )
        fail(id, SH + p, 'This constraint requires a property shape.');
    }
    for (const [lo, hi] of [
      ['minCount', 'maxCount'],
      ['minLength', 'maxLength'],
      ['qualifiedMinCount', 'qualifiedMaxCount'],
    ]) {
      const l = get(id, SH + lo)[0];
      const h = get(id, SH + hi)[0];
      if (integer(l) && integer(h) && BigInt(l.value) > BigInt(h.value))
        fail(id, SH + hi, `${hi} must be greater than or equal to ${lo}.`);
    }
    for (const p of ['datatype', 'nodeKind', 'severity']) {
      const v = count(id, SH + p);
      if (v && v.termType !== 'NamedNode') fail(id, SH + p, 'Expected an IRI.');
    }
    for (const v of get(id, SH + 'class'))
      if (v.termType !== 'NamedNode') fail(id, SH + 'class', 'Expected a class IRI.');
    const nk = get(id, SH + 'nodeKind')[0];
    if (
      nk &&
      ![
        'IRI',
        'BlankNode',
        'Literal',
        'BlankNodeOrIRI',
        'BlankNodeOrLiteral',
        'IRIOrLiteral',
      ].includes(nk.value.slice(SH.length))
    )
      fail(id, SH + 'nodeKind', 'Unknown SHACL node kind.');
    for (const p of ['closed', 'deactivated', 'uniqueLang']) {
      const v = count(id, SH + p);
      if (
        v &&
        (v.termType !== 'Literal' ||
          v.datatype?.value !== XSD + 'boolean' ||
          !['true', 'false', '1', '0'].includes(v.value))
      )
        fail(id, SH + p, 'Expected an xsd:boolean literal.');
    }
    for (const v of get(id, SH + 'property'))
      if (!resource(v)) fail(id, SH + 'property', 'Expected a property-shape resource.');
    if (types.includes(OWL + 'Restriction')) {
      const on = get(id, OWL + 'onProperty');
      const qualifiers = [
        'someValuesFrom',
        'allValuesFrom',
        'hasValue',
        'hasSelf',
        'cardinality',
        'minCardinality',
        'maxCardinality',
        'qualifiedCardinality',
        'minQualifiedCardinality',
        'maxQualifiedCardinality',
      ];
      if (on.length !== 1 || !resource(on[0]))
        fail(id, OWL + 'onProperty', 'An OWL restriction requires exactly one property resource.');
      const qs = qualifiers.filter(p => ps.has(OWL + p));
      if (qs.length !== 1)
        fail(id, OWL + 'Restriction', 'Expected exactly one restriction constraint.');
      const self = count(id, OWL + 'hasSelf');
      if (self && (self.datatype?.value !== XSD + 'boolean' || !['true', '1'].includes(self.value)))
        fail(id, OWL + 'hasSelf', 'Expected boolean true.');
      for (const p of ['someValuesFrom', 'allValuesFrom']) {
        const v = count(id, OWL + p);
        if (v && !resource(v)) fail(id, OWL + p, 'Expected a class or data-range resource.');
      }
      if (
        qs.some(p => p.includes('Qualified') || p === 'qualifiedCardinality') &&
        get(id, OWL + 'onClass').length + get(id, OWL + 'onDataRange').length !== 1
      )
        fail(
          id,
          OWL + 'Restriction',
          'Qualified cardinality requires exactly one onClass or onDataRange.',
        );
      for (const p of qualifiers.filter(p => /cardinality/i.test(p))) {
        const v = count(id, OWL + p);
        if (v && !integer(v)) fail(id, OWL + p, 'Expected a non-negative integer cardinality.');
      }
    }
  }
  const shacl = store.statements.some(
    (s: any) => s.predicate.value.startsWith(SH) || s.object.value.startsWith(SH),
  );
  const owl = store.statements.some(
    (s: any) => s.predicate.value.startsWith(OWL) || s.object.value.startsWith(OWL),
  );
  if (shacl)
    issues.push({
      severity: 'warning',
      code: 'coverage',
      path: '/',
      message:
        'Coverage: RDF syntax and selected SHACL shape-definition checks. This does not execute shapes against a separate data graph; advanced/SPARQL constraints are not evaluated.',
    });
  if (owl)
    issues.push({
      severity: 'warning',
      code: 'coverage',
      path: '/',
      message:
        'Coverage: OWL RDF syntax and basic restriction checks. Logical consistency, imports, and OWL profile conformance require a reasoner and are not evaluated.',
    });
  rejectIssues(issues);
  return issues;
}
