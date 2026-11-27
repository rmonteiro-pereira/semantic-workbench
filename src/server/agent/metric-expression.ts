// How the governed planner reads a metric's expression: the Ossie 0.3 draft's portable `sql` first,
// then ANSI SQL; and where a model metric evaluates a dataset-scoped metric with AGG(dataset.metric).
import { BadRequestError } from '../projects/errors';
import { isSourceQualifier } from '../../shared/validation/metric-scoping';
import { walk } from './sql';

/** An AGG call over one dataset metric, with the syntax node to replace when it is inlined. */
export type AggregateCall = { node: any; argument: any; dataset: string; metric: string };

/**
 * The expression the planner compiles. An Ossie 0.3 draft expression's `sql` is authoritative
 * upstream, so it wins; otherwise the ANSI_SQL dialect, as before.
 */
export function plannerExpression(definition: any): string | undefined {
  if (typeof definition?.expression?.sql === 'string') return definition.expression.sql;
  const dialects = Array.isArray(definition?.expression?.dialects) ? definition.expression.dialects : [];
  return dialects.find((dialect: any) => dialect?.dialect === 'ANSI_SQL')?.expression;
}

function functionName(node: any): string | undefined {
  const parts = node?.name?.name;
  return Array.isArray(parts) && parts.length === 1 ? String(parts[0]?.value ?? '') : undefined;
}

function columnName(node: any): string | undefined {
  return typeof node?.column === 'string' ? node.column : node?.column?.expr?.value;
}

/** Reads the single dataset.metric argument of an AGG call, or refuses the call. */
function aggregateArgument(node: any): Omit<AggregateCall, 'node'> {
  const args = node.args?.value;
  const argument = Array.isArray(args) && args.length === 1 ? args[0] : null;
  const table = argument?.table;
  const dataset = typeof table === 'string' ? table : table?.value;
  const metric = columnName(argument);
  if (argument?.type !== 'column_ref' || typeof dataset !== 'string' || typeof metric !== 'string') throw new BadRequestError('AGG takes one dataset metric, as in AGG(orders.total_revenue).');
  if (isSourceQualifier(dataset)) throw new BadRequestError('AGG over a source measure needs a measure relation, which the planner cannot preview.');
  return { argument, dataset, metric };
}

/** Finds each AGG call in a parsed expression. One that does not name a single dataset.metric is refused. */
export function aggregateCalls(ast: any): AggregateCall[] {
  const calls: AggregateCall[] = [];
  walk(ast, node => {
    if (node.type === 'function' && functionName(node)?.toUpperCase() === 'AGG') calls.push({ node, ...aggregateArgument(node) });
  });
  return calls;
}

/** The definition of a dataset's own metric, or a refusal that names what is missing. */
export function datasetMetric(datasets: any[], dataset: string, metric: string): any {
  const owner = datasets.find(candidate => candidate?.name === dataset);
  const definition = Array.isArray(owner?.metrics) ? owner.metrics.find((candidate: any) => candidate?.name === metric) : undefined;
  if (!definition) throw new BadRequestError(`AGG(${dataset}.${metric}) names no metric of dataset ${dataset}.`);
  return definition;
}
