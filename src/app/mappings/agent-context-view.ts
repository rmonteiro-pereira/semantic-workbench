import type { Binding, RuntimeContext } from '../../server/agent/runtime';

/** What the Mappings tab shows under "AI context": the metadata an agent receives for a selection. */
export type AgentContextView = {
  scope: string;
  /** Concepts with their own definition and how many bindings each has. */
  concepts: { concept: string; description?: string; bindings: number; definition?: unknown }[];
  datasets: string[];
  fields: string[];
  metrics: string[];
  /** The `ai_context` blocks the documents declare for this selection; empty when none do. */
  declaredAiContext: RuntimeContext['aiContext'];
};

/**
 * Collects the metadata an agent receives for the selected concept, or for every concept when none
 * is selected. A mapping whose documents declare no `ai_context` still gives an agent the concept
 * definitions, fields and metrics, so the view lists those instead of an empty list.
 */
export function agentContextView(context: RuntimeContext, selectedConcept: string, bindings: Binding[]): AgentContextView {
  const fieldIds = new Set(bindings.flatMap(binding => binding.fields));
  const metricIds = new Set(bindings.flatMap(binding => binding.metrics));
  // A metric can also be bound to a concept directly, without a mapping expression of its own.
  for (const metricBinding of context.metricBindings) {
    const names = [metricBinding.measures.concept, metricBinding.of?.concept];
    if (!selectedConcept || names.includes(selectedConcept)) metricIds.add(metricBinding.metric);
  }
  const fields = context.fields.filter(field => fieldIds.has(field.id));
  const metrics = context.metrics.filter(metric => metricIds.has(metric.id));
  const concepts = context.concepts
    .map(definition => ({ definition, bindingCount: bindings.filter(binding => binding.rootConcept === definition.concept || binding.concept === definition.concept).length }))
    .filter(({ definition, bindingCount }) => (selectedConcept ? definition.concept === selectedConcept : bindingCount > 0))
    .map(({ definition, bindingCount }) => ({
      concept: definition.concept,
      description: definition.description,
      bindings: bindingCount,
      ...(selectedConcept ? { definition } : {}),
    }));
  const inScope = new Set([
    'ontology',
    'semantic model',
    ...concepts.map(entry => `concept:${entry.concept}`),
    ...fields.map(field => `field:${field.dataset}.${field.name}`),
    ...metrics.map(metric => `metric:${metric.name}`),
  ]);
  return {
    scope: selectedConcept || 'All concepts',
    concepts,
    datasets: [...new Set(fields.map(field => field.dataset))],
    fields: fields.map(field => `${field.dataset}.${field.name}`),
    metrics: metrics.map(metric => metric.name),
    declaredAiContext: context.aiContext.filter(entry => inScope.has(entry.scope)),
  };
}
