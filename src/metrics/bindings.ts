/** Resolves metric-to-concept bindings from extensions and standard mapping expressions. */
import { expandIri, prefixMap } from '../iri';
import { readKpiBindings, type KpiBinding } from './extension';
// Bindings live in a mapping root extension or an embedded semantic model root. They resolve
// against the referenced ontology and model. Exact metric-name mapping expressions also provide
// evidence but are never written here.
/** Pairs a declared concept reference with its resolved name, or null if unresolved. */
export type ConceptRef = { input: string; concept: string | null };
/** Records metric-to-concept resolution, its evidence source and any problems. */
export type ResolvedBinding = {
  metric: string;
  measures: ConceptRef;
  of?: ConceptRef;
  source: 'kpi-binding' | 'mapping-expression';
  problems: string[];
};
/** Exports the shared metric-binding reader and data types. */
export { readKpiBindings };
/** Exports the shared metric-binding reader and data types. */
export type { KpiBinding };
// Concept name, full IRI or a QName declared in the ontology's prefixes.
/** Resolves a concept name, full IRI or declared qualified name against the ontology. */
export function resolveConcept(input: string, ontology: any): string | null {
  const concepts: any[] = Array.isArray(ontology?.ontology) ? ontology.ontology : [];
  if (concepts.some(c => c?.concept === input)) return input;
  const prefixes = prefixMap(ontology?.prefixes);
  const target = expandIri(input, prefixes);
  if ('error' in target) return null;
  const hit = concepts.find(c => {
    if (typeof c?.iri !== 'string') return false;
    const own = expandIri(c.iri, prefixes);
    return 'iri' in own && own.iri === target.iri;
  });
  return hit?.concept ?? null;
}
/** Validates metric bindings against known metrics and ontology concepts. */
export function resolveBindings(
  bindings: KpiBinding[],
  ontology: any,
  metricNames: Set<string>,
): ResolvedBinding[] {
  return bindings.map(b => {
    const problems: string[] = [];
    if (!metricNames.has(b.metric))
      problems.push(`Metric "${b.metric}" is not in the referenced semantic model.`);
    const measures = { input: b.measures, concept: resolveConcept(b.measures, ontology) };
    if (!measures.concept)
      problems.push(`Concept "${b.measures}" is not in the referenced ontology.`);
    const of =
      b.of === undefined ? undefined : { input: b.of, concept: resolveConcept(b.of, ontology) };
    if (of && !of.concept) problems.push(`Concept "${b.of}" is not in the referenced ontology.`);
    return {
      metric: b.metric,
      measures,
      ...(of ? { of } : {}),
      source: 'kpi-binding' as const,
      problems,
    };
  });
}

/** Reads concept mappings whose expression is exactly a governed metric's name. */
export function mappingExpressionBindings(
  mapping: any,
  metricNames: Set<string>,
): ResolvedBinding[] {
  const out: ResolvedBinding[] = [];
  for (const cm of Array.isArray(mapping?.concept_mappings) ? mapping.concept_mappings : [])
    for (const om of Array.isArray(cm?.object_mappings) ? cm.object_mappings : [])
      if (
        typeof om?.expression === 'string' &&
        metricNames.has(om.expression.trim()) &&
        typeof cm.concept === 'string'
      )
        out.push({
          metric: om.expression.trim(),
          measures: { input: cm.concept, concept: cm.concept },
          source: 'mapping-expression',
          problems: [],
        });
  return out;
}
