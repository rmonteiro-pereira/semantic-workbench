// Narrows a resolved context to the concepts, fields and metrics a question needs.
import { BadRequestError } from '../projects/errors';
import type { Binding, RuntimeContext } from './context-types';
/** A context with the ids of the metrics bound to its concepts directly, before the metrics they depend on are added. */
export type SelectedContext = RuntimeContext & { boundMetricIds: string[] };
/** Lists the metrics a binding names or a metric binding attaches to one of the concepts, or to any concept when none is named. */
function directlyBoundMetricIds(context: RuntimeContext, names: Set<string>, bindings: Binding[]) {
  // A metric can also be bound straight to a concept, without a mapping expression of its own.
  const boundStraight = context.metricBindings.filter(binding => names.size === 0 || [binding.measures.concept, binding.of?.concept].some(concept => !!concept && names.has(concept)));
  return [...new Set([...bindings.flatMap(binding => binding.metrics), ...boundStraight.map(binding => binding.metric)])];
}
/** Returns the whole mapping context, unnarrowed, with the metrics bound to any of its concepts. */
export function wholeContext(context: RuntimeContext): SelectedContext {
  return { ...context, boundMetricIds: directlyBoundMetricIds(context, new Set(), context.bindings) };
}
/** Narrows context to named concepts and their referenced fields and metrics, including metrics bound to those concepts. `boundMetricIds` lists the metrics bound to the concepts directly, before the metrics they depend on are added. */
export function selectContext(context: RuntimeContext, conceptNames: string[]): SelectedContext {
  const names = new Set(conceptNames);
  for (const name of names) if (!context.concepts.some(c => c.concept === name)) throw new BadRequestError(`Unknown concept ${name}.`);
  const bindings = context.bindings.filter(b => names.size === 0 || names.has(b.rootConcept) || names.has(b.concept));
  const boundMetricIds = directlyBoundMetricIds(context, names, bindings);
  const metricNames = new Set(boundMetricIds);
  const pending = [...metricNames];
  for (let i = 0; i < pending.length; i++)
    for (const dep of context.metrics.find(m => m.id === pending[i])?.dependsOn ?? [])
      if (!metricNames.has(dep)) {
        metricNames.add(dep);
        pending.push(dep);
      }
  const metrics = context.metrics.filter(m => metricNames.has(m.id));
  const fieldIds = new Set([...bindings.flatMap(b => b.fields), ...metrics.flatMap(m => m.fields)]);
  const fields = context.fields.filter(f => fieldIds.has(f.id));
  return {
    ...context,
    concepts: context.concepts.filter(c => names.size === 0 || names.has(c.concept) || bindings.some(b => b.concept === c.concept || b.rootConcept === c.concept)),
    bindings,
    boundMetricIds,
    metrics,
    fields,
    datasets: context.datasets,
    joins: context.joins,
  };
}
