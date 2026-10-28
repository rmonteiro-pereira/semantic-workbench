// Builds the SEMANTIC_WORKBENCH extension entries that example generators attach to metrics and
// to mapping roots, in the same text layout the metric wizard writes.
import { stringify } from 'yaml';
import {
  METRIC_SCHEMA,
  VENDOR,
  type KpiBinding,
  type MetricExtension,
} from '../../src/metrics/extension';
import { bindingsText, sortedBindings } from '../../src/metrics/metric-save';

/** Describes a governed metric as an example generator declares it. */
export type GovernedMetric = {
  name: string;
  datatype?: string;
  description?: string;
  expression: string;
  extension: Omit<MetricExtension, 'schema'>;
  binding: Omit<KpiBinding, 'metric'>;
};

/** Returns the custom_extensions list that holds one metric's governance attributes. */
export function metricExtensionEntries(extension: GovernedMetric['extension']) {
  const data = JSON.stringify({ schema: METRIC_SCHEMA, ...extension }, null, 2) + '\n';
  return [{ vendor_name: VENDOR, data }];
}

/** Returns the custom_extensions list that holds a mapping's metric bindings, sorted by metric. */
export function bindingEntries(metrics: GovernedMetric[]) {
  const bindings = metrics.reduce<KpiBinding[]>(
    (sorted, metric) => sortedBindings(sorted, { metric: metric.name, ...metric.binding }),
    [],
  );
  return [{ vendor_name: VENDOR, data: bindingsText(bindings) }];
}

/** Builds the semantic model metric a generator writes for a governed metric. */
export function ossieMetric(metric: GovernedMetric) {
  return {
    name: metric.name,
    ...(metric.description ? { description: metric.description } : {}),
    ...(metric.datatype ? { datatype: metric.datatype } : {}),
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: metric.expression }] },
    custom_extensions: metricExtensionEntries(metric.extension),
  };
}

/** Describes an example mapping document: concept mappings and metric bindings. */
export type ExampleMapping = {
  name: string;
  ontology: { name: string; iri: string };
  semanticModel: { name: string; iri: string };
  metrics: GovernedMetric[];
  /** Ossie concept mappings from ontology concepts to semantic-model fields. */
  conceptMappings: unknown[];
  /** The comment lines that say why the file exists, written after the first line. */
  comment: string[];
};

/** A link from the subject identified by one column to the target identified by another. */
export function linkMapping(
  subject: string,
  relationship: string,
  target: string,
  targetColumn: string,
) {
  return {
    object_mapping: { expression: subject },
    children: [{ relationship, object_mapping: { concept: target, expression: targetColumn } }],
  };
}

/** Writes a mapping document that maps concepts to fields and binds metrics to concepts. */
export function exampleMappingText(mapping: ExampleMapping) {
  const header = mapping.comment.map((line, index) =>
    index === 0 ? `# Workbench addition: ${line}` : `# ${line}`,
  );
  const document = {
    version: '0.2.0.dev0',
    name: mapping.name,
    ontology_ref: mapping.ontology,
    semantic_model_ref: mapping.semanticModel,
    concept_mappings: mapping.conceptMappings,
    custom_extensions: bindingEntries(mapping.metrics),
  };
  return header.join('\n') + '\n' + stringify(document);
}
