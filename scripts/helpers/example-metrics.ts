// Builds the SEMANTIC_WORKBENCH extension entries that example generators attach to metrics and
// to mapping roots, in the same text layout the metric wizard writes.
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
