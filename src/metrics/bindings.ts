import {expandIri,prefixMap} from '../iri';
import {readKpiBindings,type KpiBinding} from './extension';
// KPI-to-concept bindings (research R12): stored in the mapping document's root extension (or the
// embedded semantic model's root in a consolidated file). Resolved against the ontology and the
// semantic model the mapping references. Standard concept mappings whose expression is exactly a
// metric name are read as evidence too, labelled as such, but never written.
export type ConceptRef={input:string;concept:string|null};
export type ResolvedBinding={metric:string;measures:ConceptRef;of?:ConceptRef;source:'kpi-binding'|'mapping-expression';problems:string[]};
export {readKpiBindings};
export type {KpiBinding};
// Concept name, full IRI or a QName declared in the ontology's prefixes.
export function resolveConcept(input:string,ontology:any):string|null{
 const concepts:any[]=Array.isArray(ontology?.ontology)?ontology.ontology:[];
 if(concepts.some(c=>c?.concept===input))return input;
 const prefixes=prefixMap(ontology?.prefixes),target=expandIri(input,prefixes);
 if('error'in target)return null;
 const hit=concepts.find(c=>{if(typeof c?.iri!=='string')return false;const own=expandIri(c.iri,prefixes);return 'iri'in own&&own.iri===target.iri;});
 return hit?.concept??null;
}
export function resolveBindings(bindings:KpiBinding[],ontology:any,metricNames:Set<string>):ResolvedBinding[]{
 return bindings.map(b=>{
  const problems:string[]=[];
  if(!metricNames.has(b.metric))problems.push(`Metric "${b.metric}" is not in the referenced semantic model.`);
  const measures={input:b.measures,concept:resolveConcept(b.measures,ontology)};if(!measures.concept)problems.push(`Concept "${b.measures}" is not in the referenced ontology.`);
  const of=b.of===undefined?undefined:{input:b.of,concept:resolveConcept(b.of,ontology)};if(of&&!of.concept)problems.push(`Concept "${b.of}" is not in the referenced ontology.`);
  return {metric:b.metric,measures,...(of?{of}:{}),source:'kpi-binding' as const,problems};
 });
}
// Concept mappings whose object-mapping expression is exactly the name of a governed metric.
export function mappingExpressionBindings(mapping:any,metricNames:Set<string>):ResolvedBinding[]{
 const out:ResolvedBinding[]=[];
 for(const cm of Array.isArray(mapping?.concept_mappings)?mapping.concept_mappings:[])
  for(const om of Array.isArray(cm?.object_mappings)?cm.object_mappings:[])
   if(typeof om?.expression==='string'&&metricNames.has(om.expression.trim())&&typeof cm.concept==='string')out.push({metric:om.expression.trim(),measures:{input:cm.concept,concept:cm.concept},source:'mapping-expression',problems:[]});
 return out;
}
