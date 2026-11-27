/**
 * Rules of the Ossie 0.3.0 draft that its JSON schema cannot express: dataset-scoped metrics share a
 * namespace with their dataset's fields and resolve inside that dataset, `AGG` is allowed only in the
 * forms a metric may use, and `METRIC` is reserved. Only the portable OSSIE_SQL_2026 text is checked;
 * vendor dialects stay opaque.
 */
import { datasetReferences, functionCalls, type FunctionCall } from '../metrics/deps';
import { readMetricExtension } from '../metrics/extension';
import type { Issue } from './diagnostics';

/** Where an expression sits, which decides the `AGG` form it may use. */
type ExpressionScope = { kind: 'field' } | { kind: 'dataset-metric'; dataset: string } | { kind: 'model-metric' };

/** One portable text of an expression and the document path it sits at. */
type PortableText = { text: string; path: string };

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/** Whether a qualifier is the reserved `source`, which the draft reads in any letter case. */
export function isSourceQualifier(qualifier: unknown): boolean {
  return typeof qualifier === 'string' && qualifier.toLowerCase() === 'source';
}

/**
 * Whether a dataset's metrics may read its source as `source.column`. A dataset that declares a field
 * named source takes the name for that field, so its metrics cannot refer to source columns.
 */
export function readsSourceColumns(dataset: unknown): boolean {
  return !list(isObject(dataset) ? dataset.fields : []).some(field => isSourceQualifier(field?.name));
}

function error(code: string, path: string, message: string): Issue {
  return { severity: 'error', code, path, message };
}

/** The OSSIE_SQL_2026 texts of an expression: the `sql` field and any dialect entry in that language. */
function portableTexts(expression: unknown, path: string): PortableText[] {
  if (!isObject(expression)) return [];
  const texts: PortableText[] = [];
  if (typeof expression.sql === 'string') texts.push({ text: expression.sql, path: `${path}/sql` });
  list(expression.dialects).forEach((entry, index) => {
    if (isObject(entry) && entry.dialect === 'OSSIE_SQL_2026' && typeof entry.expression === 'string') texts.push({ text: entry.expression, path: `${path}/dialects/${index}/expression` });
  });
  return texts;
}

function aggregateCallIssue(call: FunctionCall, scope: ExpressionScope, datasetMetrics: Map<string, Set<string>>, path: string): Issue | null {
  const argument = call.argument;
  if (scope.kind === 'field') return error('reserved-function', path, 'AGG is reserved outside metrics. A field expression cannot call it.');
  if (scope.kind === 'dataset-metric') {
    if (isSourceQualifier(argument?.table) && call.filtered)
      return error('reserved-function', path, `In a dataset metric, AGG over a source measure cannot have a FILTER clause. Dataset "${scope.dataset}" adds one.`);
    if (isSourceQualifier(argument?.table)) return null;
    return error('reserved-function', path, `In a dataset metric, AGG takes one source measure, as in AGG(source.total). Dataset "${scope.dataset}" gives it something else.`);
  }
  if (!argument?.table || argument.table.includes('.')) return error('reserved-function', path, 'In a model metric, AGG takes one dataset metric, as in AGG(orders.total_revenue).');
  if (!datasetMetrics.get(argument.table)?.has(argument.column)) return error('reference', path, `AGG(${argument.table}.${argument.column}) names no metric of dataset "${argument.table}".`);
  return null;
}

/** Checks the reserved functions in one expression's portable texts. */
function expressionIssues(expression: unknown, path: string, scope: ExpressionScope, datasetMetrics: Map<string, Set<string>>): Issue[] {
  const issues: Issue[] = [];
  for (const portable of portableTexts(expression, path)) {
    for (const call of functionCalls(portable.text)) {
      const name = call.name.toUpperCase();
      if (name === 'METRIC')
        issues.push(error('reserved-function', portable.path, 'METRIC is reserved in OSSIE_SQL_2026 expressions. A metric expression is the operand of METRIC, not a call to it.'));
      if (name !== 'AGG') continue;
      const issue = aggregateCallIssue(call, scope, datasetMetrics, portable.path);
      if (issue) issues.push(issue);
    }
  }
  return issues;
}

/** A dataset metric must not reach into another dataset. Columns of the dataset's source are read as source.column. */
function crossDatasetIssues(metric: Record<string, any>, path: string, dataset: string, datasetNames: Set<string>): Issue[] {
  const others = new Set([...datasetNames].filter(name => name !== dataset && !isSourceQualifier(name)));
  const issues: Issue[] = [];
  for (const portable of portableTexts(metric.expression, `${path}/expression`)) {
    for (const other of datasetReferences(portable.text, others))
      issues.push(error('reference', portable.path, `Dataset metric "${metric.name}" reads dataset "${other}". A dataset metric resolves within "${dataset}"; move it to the model metrics.`));
  }
  return issues;
}

/** Names of each dataset's metrics, for checking `AGG(dataset.metric)`. */
function datasetMetricNames(datasets: any[]): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const dataset of datasets.filter(isObject))
    names.set(
      dataset.name,
      new Set(
        list(dataset.metrics)
          .filter(isObject)
          .map(metric => metric.name),
      ),
    );
  return names;
}

/** Checks one dataset's metrics: one namespace with the fields, no reach into other datasets, and the reserved functions. */
function datasetIssues(dataset: Record<string, any>, path: string, datasetNames: Set<string>, datasetMetrics: Map<string, Set<string>>): Issue[] {
  const issues: Issue[] = [];
  const taken = new Set(
    list(dataset.fields)
      .filter(isObject)
      .map(field => field.name),
  );
  list(dataset.fields).forEach((field, index) => {
    if (isObject(field)) issues.push(...expressionIssues(field.expression, `${path}/fields/${index}/expression`, { kind: 'field' }, datasetMetrics));
  });
  list(dataset.metrics).forEach((metric, index) => {
    if (!isObject(metric)) return;
    const metricPath = `${path}/metrics/${index}`;
    if (taken.has(metric.name))
      issues.push(error('duplicate', `${metricPath}/name`, `"${metric.name}" is already a field or metric of dataset "${dataset.name}". Fields and metrics share one namespace.`));
    taken.add(metric.name);
    issues.push(...crossDatasetIssues(metric, metricPath, dataset.name, datasetNames));
    // Workbench attributes on a dataset metric get the same schema check as on a model metric.
    issues.push(...readMetricExtension(metric, metricPath).issues);
    issues.push(...expressionIssues(metric.expression, `${metricPath}/expression`, { kind: 'dataset-metric', dataset: dataset.name }, datasetMetrics));
  });
  return issues;
}

/** Gives the findings of the 0.3 draft rules for one semantic model at `modelPath`. */
export function draftModelIssues(model: unknown, modelPath: string): Issue[] {
  if (!isObject(model)) return [];
  const datasets = list(model.datasets);
  const datasetNames = new Set<string>(datasets.filter(isObject).map(dataset => dataset.name));
  const datasetMetrics = datasetMetricNames(datasets);
  const issues: Issue[] = [];
  datasets.forEach((dataset, index) => {
    if (isObject(dataset)) issues.push(...datasetIssues(dataset, `${modelPath}/datasets/${index}`, datasetNames, datasetMetrics));
  });
  list(model.metrics).forEach((metric, index) => {
    if (isObject(metric)) issues.push(...expressionIssues(metric.expression, `${modelPath}/metrics/${index}/expression`, { kind: 'model-metric' }, datasetMetrics));
  });
  return issues;
}
