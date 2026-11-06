// Builds an unexecuted SQL plan from a resolved context: picks governed metrics and dimensions, finds
// a fan-out-safe declared join path and compiles the expressions. The plan is a preview; nothing is run.
import { columnRefs, parseExpression, scalar, expressionSql, quoteIdentifier, sourceSql } from './sql';
import { BadRequestError } from '../projects/errors';
import { fieldKey, policy, selectContext, type Binding, type RuntimeContext, type RuntimeField, type RuntimeMetric } from './context';
/** Selects governed metrics and dimensions, with internal options for model-wide previews. */
export type PlanRequest = {
  mappingId: string;
  concepts?: string[];
  metrics: string[];
  dimensions: string[];
  // Workbench-internal options (not accepted by /api/agent/plan): plan over the whole model rather
  // than mapped concepts, and group by a time field truncated to a grain.
  scope?: 'model';
  timeGrain?: { field: string; grain: 'day' | 'week' | 'month' | 'quarter' | 'year' };
};
/** Builds an unexecuted SQL plan, refusing unsupported expressions or ambiguous joins. */
const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'];
const PARENTHESIZED_TYPES = ['binary_expr', 'unary_expr', 'case'];
type Selections = {
  selected: RuntimeContext;
  metrics: RuntimeMetric[];
  dimensions: RuntimeField[];
  timeField?: RuntimeField;
};
/** Maps the requested ids to the metrics, dimensions and time field reachable in the selected context. */
function resolveSelections(context: RuntimeContext, request: PlanRequest): Selections {
  const selected = request.scope === 'model' ? { ...context, bindings: [] as Binding[] } : selectContext(context, request.concepts ?? []);
  const metrics = request.metrics.map(id => {
    const runtimeMetric = selected.metrics.find(m => m.id === id);
    if (!runtimeMetric) throw new BadRequestError(`Metric ${id} is not reachable through the selected ontology mappings.`);
    return runtimeMetric;
  });
  const dimensions = request.dimensions.map(id => {
    const runtimeField = selected.fields.find(f => f.id === id);
    if (!runtimeField) throw new BadRequestError(`Field ${id} is not reachable through the selected ontology mappings.`);
    return runtimeField;
  });
  const timeField = request.timeGrain ? selected.fields.find(f => f.id === request.timeGrain!.field) : undefined;
  if (request.timeGrain && (!timeField || !TIME_GRAINS.includes(request.timeGrain.grain))) throw new BadRequestError('The time field or grain is not available in this model.');
  if (!metrics.length && !dimensions.length) throw new BadRequestError('Select at least one mapped field or governed metric.');
  if (new Set(request.metrics).size !== metrics.length || new Set(request.dimensions).size !== dimensions.length) throw new BadRequestError('Duplicate query selections.');
  const conditional = selected.bindings.filter(b => b.condition && (b.metrics.some(m => request.metrics.includes(m)) || b.fields.some(f => request.dimensions.includes(f))));
  if (conditional.length)
    throw new BadRequestError('Selected bindings have population conditions. Review their meaning before query generation; the planner will not silently turn them into query filters.');
  return { selected, metrics, dimensions, timeField };
}
/** The dataset the query starts from: the single metric dataset, or the first dimension's dataset. */
function chooseRootDataset({ metrics, dimensions }: Selections): string {
  const metricDatasets = new Set(metrics.flatMap(m => m.datasets));
  if (metricDatasets.size > 1) throw new BadRequestError('Multi-fact metric composition needs an explicit grain/aggregation model. No unsafe join was generated.');
  const root = [...metricDatasets][0] ?? dimensions[0]?.dataset;
  if (!root) throw new BadRequestError('No physical dataset was resolved.');
  return root;
}
function requiredDatasets({ metrics, dimensions, timeField }: Selections): Set<string> {
  return new Set([...metrics.flatMap(m => m.datasets), ...dimensions.map(f => f.dataset), ...(timeField ? [timeField.dataset] : [])]);
}
type JoinEdges = Map<string, any[]>;
function outgoingJoins(joins: any[]): JoinEdges {
  const outgoing: JoinEdges = new Map();
  for (const join of joins) {
    const list = outgoing.get(join.from) ?? [];
    list.push(join);
    outgoing.set(join.from, list);
  }
  return outgoing;
}
/** Breadth-first walk from the root: the hop count to each dataset and the join that first reached it. */
function shortestJoinTree(outgoing: JoinEdges, root: string) {
  const distances = new Map([[root, 0]]);
  const previous = new Map<string, any>();
  const queue = [root];
  for (let i = 0; i < queue.length; i++)
    for (const join of outgoing.get(queue[i]) ?? []) {
      if (!distances.has(join.to)) {
        distances.set(join.to, distances.get(join.from)! + 1);
        previous.set(join.to, join);
        queue.push(join.to);
      }
    }
  return { distances, previous };
}
function reachableWithout(outgoing: JoinEdges, root: string, removed: string, target: string) {
  const seen = new Set([root]);
  const pending = [root];
  for (let i = 0; i < pending.length; i++)
    for (const edge of outgoing.get(pending[i]) ?? []) {
      if (edge.name === removed || seen.has(edge.to)) continue;
      if (edge.to === target) return true;
      seen.add(edge.to);
      pending.push(edge.to);
    }
  return false;
}
/** Picks the declared joins that connect the root to every required dataset, refusing ambiguous paths. */
function planJoins(context: RuntimeContext, root: string, required: Set<string>) {
  // Reject joins with alternative directed paths, even longer ones, to avoid choosing a business
  // role by distance. Visited sets terminate cycles without introducing reverse edges.
  const outgoing = outgoingJoins(context.joins);
  const { distances, previous } = shortestJoinTree(outgoing, root);
  const joins = new Map<string, any>();
  for (const target of required) {
    if (!distances.has(target)) throw new BadRequestError(`No fan-out-safe declared join from ${root} to ${target}.`);
    let current = target;
    while (current !== root) {
      const join = previous.get(current);
      if (reachableWithout(outgoing, root, join.name, target)) throw new BadRequestError(`Ambiguous join paths from ${root} to ${target}. Model an explicit relationship before planning.`);
      joins.set(join.name, join);
      current = join.from;
    }
  }
  const orderedJoins = [...joins.values()].sort((a, b) => distances.get(a.to)! - distances.get(b.to)! || a.name.localeCompare(b.name));
  return { joins: orderedJoins, aliases: new Set([root, ...orderedJoinDatasets(joins)]) };
}
function orderedJoinDatasets(joins: Map<string, any>) {
  return [...joins.values()].flatMap(j => [j.from, j.to]);
}
function ansiSqlExpression(definition: any): string | undefined {
  return definition.expression?.dialects?.find((d: any) => d.dialect === 'ANSI_SQL')?.expression;
}
/** Replaces a node in place, so the parsed expression tree keeps its identity while its content changes. */
function replaceNode(node: any, replacement: any) {
  for (const key of Object.keys(node)) delete node[key];
  Object.assign(node, replacement);
}
/** The scalar physical expression of a field, with its columns pinned to the field's dataset. */
function physicalExpression(runtimeField: RuntimeField, aliases: Set<string>) {
  if (!aliases.has(runtimeField.dataset)) throw new BadRequestError(`Dataset ${runtimeField.dataset} is not in the declared join plan.`);
  const fieldExpr = ansiSqlExpression(runtimeField.definition);
  if (!fieldExpr) throw new BadRequestError(`Field ${runtimeField.dataset}.${runtimeField.name} has no ANSI_SQL expression.`);
  const physical = parseExpression(fieldExpr).expression;
  if (!scalar(physical)) throw new BadRequestError(`Field ${runtimeField.dataset}.${runtimeField.name} is not scalar.`);
  for (const column of columnRefs(physical)) {
    if (column.table && column.table !== runtimeField.dataset) throw new BadRequestError('Cross-dataset field expressions need an explicit physical binding.');
    column.node.table = runtimeField.dataset;
  }
  if (PARENTHESIZED_TYPES.includes(physical.type)) physical.parentheses = true;
  return physical;
}
type Compile = (expression: string, currentDataset?: string, active?: Set<string>) => any;
/** Builds the function that turns a logical expression into a physical one, inlining governed metrics and fields. */
function createCompiler(context: RuntimeContext, aliases: Set<string>): Compile {
  const metricMap = new Map(context.metrics.map(m => [m.id, m]));
  const fieldMap = new Map(context.fields.map(f => [f.id, f]));
  const compile: Compile = (expression, currentDataset, active = new Set<string>()) => {
    const ast = parseExpression(expression).expression;
    for (const ref of columnRefs(ast)) {
      if (!ref.table && !currentDataset && metricMap.has(ref.column)) {
        if (active.has(ref.column)) throw new BadRequestError('Metric cycle.');
        const next = new Set(active);
        next.add(ref.column);
        const dep = metricMap.get(ref.column)!;
        const replacement = compile(ansiSqlExpression(dep.definition)!, undefined, next);
        if (PARENTHESIZED_TYPES.includes(replacement.type)) replacement.parentheses = true;
        replaceNode(ref.node, replacement);
        continue;
      }
      const dataset = ref.table ?? currentDataset;
      const runtimeField = dataset ? fieldMap.get(fieldKey(dataset, ref.column)) : null;
      if (!runtimeField) throw new BadRequestError(`Unresolved query field ${dataset ?? ''}.${ref.column}.`);
      replaceNode(ref.node, physicalExpression(runtimeField, aliases));
    }
    return ast;
  };
  return compile;
}
const columnSql = (compile: Compile, dataset: string, column: string) => expressionSql(compile(`${quoteIdentifier(dataset)}.${quoteIdentifier(column)}`));
/** The grouping columns: the optional truncated time period, then each dimension. */
function selectColumns(compile: Compile, request: PlanRequest, { dimensions, timeField }: Selections) {
  const period = timeField
    ? [
        {
          alias: 'period',
          sql: `DATE_TRUNC('${request.timeGrain!.grain}', ${columnSql(compile, timeField.dataset, timeField.name)})`,
          fieldId: timeField.id,
          evidence: timeField.evidence,
        },
      ]
    : [];
  const dimensionColumns = dimensions.map((dimension, i) => ({
    alias: `dimension_${i + 1}`,
    sql: columnSql(compile, dimension.dataset, dimension.name),
    fieldId: dimension.id,
    evidence: dimension.evidence,
  }));
  return [...period, ...dimensionColumns];
}
function measureColumns(compile: Compile, metrics: RuntimeMetric[]) {
  return metrics.map((metric, i) => ({
    alias: `metric_${i + 1}`,
    sql: expressionSql(compile(ansiSqlExpression(metric.definition)!)),
    metricId: metric.id,
    governedExpression: metric.definition.expression,
    evidence: metric.evidence,
  }));
}
function joinSql(compile: Compile, join: any, modelDatasets: Map<string, any>) {
  const target = modelDatasets.get(join.to);
  const uniqueKeys = [...(target.primary_key?.length ? [target.primary_key] : []), ...(target.unique_keys ?? [])];
  if (!uniqueKeys.some((keys: string[]) => keys.length === join.to_columns.length && keys.every(k => join.to_columns.includes(k))))
    throw new BadRequestError(`Join ${join.name} has no declared unique target key. Add primary_key or unique_keys to ${join.to} before aggregating through it.`);
  const conditions = join.from_columns.map((column: string, i: number) => {
    const fromColumn = `${quoteIdentifier(join.from)}.${quoteIdentifier(column)}`;
    const toColumn = `${quoteIdentifier(join.to)}.${quoteIdentifier(join.to_columns[i])}`;
    return `${expressionSql(compile(fromColumn))} = ${expressionSql(compile(toColumn))}`;
  });
  // LEFT JOIN retains facts with missing dimensions. Inner-join filtering must be explicit.
  return `LEFT JOIN ${sourceSql(target.source)} AS ${quoteIdentifier(join.to)} ON ${conditions.join(' AND ')}`;
}
type RenderParts = { select: any[]; measures: any[]; joinSql: string[]; from: string; hasMetrics: boolean };
function renderSql({ select, measures, joinSql, from, hasMetrics }: RenderParts) {
  const columnList = [...select, ...measures].map(s => `${s.sql} AS ${quoteIdentifier(s.alias)}`).join(',\n  ');
  const joinClause = joinSql.length ? '\n' + joinSql.join('\n') : '';
  const groupByClause = hasMetrics && select.length ? '\nGROUP BY ' + select.map(s => s.sql).join(', ') : '';
  return `SELECT\n  ${columnList}\nFROM ${from}${joinClause}${groupByClause};`;
}
/** Builds an unexecuted SQL plan, refusing unsupported expressions or ambiguous joins. */
export function planQuery(context: RuntimeContext, request: PlanRequest) {
  if (context.findings.some(f => f.severity === 'error')) throw new BadRequestError('Resolve mapping context errors before planning.');
  const selections = resolveSelections(context, request);
  const root = chooseRootDataset(selections);
  const { joins, aliases } = planJoins(context, root, requiredDatasets(selections));
  const modelDatasets = new Map(context.datasets.map(d => [d.name, d]));
  const compile = createCompiler(context, aliases);
  const select = selectColumns(compile, request, selections);
  const measures = measureColumns(compile, selections.metrics);
  const from = `${sourceSql(modelDatasets.get(root).source)} AS ${quoteIdentifier(root)}`;
  const sql = renderSql({ select, measures, joinSql: joins.map(join => joinSql(compile, join, modelDatasets)), from, hasMetrics: selections.metrics.length > 0 });
  return {
    mappingId: context.mappingId,
    dialect: 'ANSI_SQL',
    sql,
    dimensions: select,
    metrics: measures,
    joins,
    sources: [...aliases].map(name => ({ dataset: name, source: modelDatasets.get(name).source })),
    bindings: selections.selected.bindings,
    documents: context.documents,
    policy,
    warnings: ['Generated SQL is a preview. Verify physical uniqueness and dialect compatibility in your query engine. No query was executed.'],
  };
}
