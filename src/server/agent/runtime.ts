// Public entry point of the agent runtime. Context assembly lives in context.ts and query planning in
// query-plan.ts (added by the next change); planning never executes SQL.
import { columnRefs, parseExpression, scalar, expressionSql, quoteIdentifier, sourceSql } from './sql';
import { BadRequestError } from '../projects/errors';
import { fieldKey, policy, selectContext, type Binding, type RuntimeContext } from './context';
export * from './context';
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
export function planQuery(context: RuntimeContext, request: PlanRequest) {
  if (context.findings.some(f => f.severity === 'error')) throw new BadRequestError('Resolve mapping context errors before planning.');
  const selected = request.scope === 'model' ? { ...context, bindings: [] as Binding[] } : selectContext(context, request.concepts ?? []);
  const metricMap = new Map(context.metrics.map(m => [m.id, m]));
  const fieldMap = new Map(context.fields.map(f => [f.id, f]));
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
  if (request.timeGrain && (!timeField || !['day', 'week', 'month', 'quarter', 'year'].includes(request.timeGrain.grain)))
    throw new BadRequestError('The time field or grain is not available in this model.');
  if (!metrics.length && !dimensions.length) throw new BadRequestError('Select at least one mapped field or governed metric.');
  if (new Set(request.metrics).size !== metrics.length || new Set(request.dimensions).size !== dimensions.length) throw new BadRequestError('Duplicate query selections.');
  const conditional = selected.bindings.filter(b => b.condition && (b.metrics.some(m => request.metrics.includes(m)) || b.fields.some(f => request.dimensions.includes(f))));
  if (conditional.length)
    throw new BadRequestError('Selected bindings have population conditions. Review their meaning before query generation; the planner will not silently turn them into query filters.');
  const required = new Set([...metrics.flatMap(m => m.datasets), ...dimensions.map(f => f.dataset), ...(timeField ? [timeField.dataset] : [])]);
  const metricDatasets = new Set(metrics.flatMap(m => m.datasets));
  if (metricDatasets.size > 1) throw new BadRequestError('Multi-fact metric composition needs an explicit grain/aggregation model. No unsafe join was generated.');
  const root = [...metricDatasets][0] ?? dimensions[0]?.dataset;
  if (!root) throw new BadRequestError('No physical dataset was resolved.');
  // Reject joins with alternative directed paths, even longer ones, to avoid choosing a business
  // role by distance. Visited sets terminate cycles without introducing reverse edges.
  const outgoing = new Map<string, any[]>();
  for (const join of context.joins) {
    const list = outgoing.get(join.from) ?? [];
    list.push(join);
    outgoing.set(join.from, list);
  }
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
  const reachableWithout = (removed: string, target: string) => {
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
  };
  const joins = new Map<string, any>();
  for (const target of required) {
    if (!distances.has(target)) throw new BadRequestError(`No fan-out-safe declared join from ${root} to ${target}.`);
    let current = target;
    while (current !== root) {
      const join = previous.get(current);
      if (reachableWithout(join.name, target)) throw new BadRequestError(`Ambiguous join paths from ${root} to ${target}. Model an explicit relationship before planning.`);
      joins.set(join.name, join);
      current = join.from;
    }
  }
  const aliases = new Set([root, ...[...joins.values()].flatMap(j => [j.from, j.to])]);
  const modelDatasets = new Map(context.datasets.map(d => [d.name, d]));
  const compile = (expression: string, currentDataset?: string, active = new Set<string>()): any => {
    const ast = parseExpression(expression).expression;
    for (const ref of columnRefs(ast)) {
      if (!ref.table && !currentDataset && metricMap.has(ref.column)) {
        if (active.has(ref.column)) throw new BadRequestError('Metric cycle.');
        const next = new Set(active);
        next.add(ref.column);
        const dep = metricMap.get(ref.column)!;
        const replacement = compile(dep.definition.expression.dialects.find((d: any) => d.dialect === 'ANSI_SQL').expression, undefined, next);
        if (['binary_expr', 'unary_expr', 'case'].includes(replacement.type)) replacement.parentheses = true;
        for (const key of Object.keys(ref.node)) delete ref.node[key];
        Object.assign(ref.node, replacement);
        continue;
      }
      const dataset = ref.table ?? currentDataset;
      const runtimeField = dataset ? fieldMap.get(fieldKey(dataset, ref.column)) : null;
      if (!runtimeField) throw new BadRequestError(`Unresolved query field ${dataset ?? ''}.${ref.column}.`);
      if (!aliases.has(runtimeField.dataset)) throw new BadRequestError(`Dataset ${runtimeField.dataset} is not in the declared join plan.`);
      const fieldExpr = runtimeField.definition.expression?.dialects?.find((d: any) => d.dialect === 'ANSI_SQL')?.expression;
      if (!fieldExpr) throw new BadRequestError(`Field ${runtimeField.dataset}.${runtimeField.name} has no ANSI_SQL expression.`);
      const physical = parseExpression(fieldExpr).expression;
      if (!scalar(physical)) throw new BadRequestError(`Field ${runtimeField.dataset}.${runtimeField.name} is not scalar.`);
      for (const column of columnRefs(physical)) {
        if (column.table && column.table !== runtimeField.dataset) throw new BadRequestError('Cross-dataset field expressions need an explicit physical binding.');
        column.node.table = runtimeField.dataset;
      }
      if (['binary_expr', 'unary_expr', 'case'].includes(physical.type)) physical.parentheses = true;
      for (const key of Object.keys(ref.node)) delete ref.node[key];
      Object.assign(ref.node, physical);
    }
    return ast;
  };
  const timeColumnSql = timeField ? expressionSql(compile(`${quoteIdentifier(timeField.dataset)}.${quoteIdentifier(timeField.name)}`)) : '';
  const select = [
    ...(timeField
      ? [
          {
            alias: 'period',
            sql: `DATE_TRUNC('${request.timeGrain!.grain}', ${timeColumnSql})`,
            fieldId: timeField.id,
            evidence: timeField.evidence,
          },
        ]
      : []),
    ...dimensions.map((dimension, i) => ({
      alias: `dimension_${i + 1}`,
      sql: expressionSql(compile(`${quoteIdentifier(dimension.dataset)}.${quoteIdentifier(dimension.name)}`)),
      fieldId: dimension.id,
      evidence: dimension.evidence,
    })),
  ];
  const measures = metrics.map((metric, i) => ({
    alias: `metric_${i + 1}`,
    sql: expressionSql(compile(metric.definition.expression.dialects.find((d: any) => d.dialect === 'ANSI_SQL').expression)),
    metricId: metric.id,
    governedExpression: metric.definition.expression,
    evidence: metric.evidence,
  }));
  const orderedJoins = [...joins.values()].sort((a, b) => distances.get(a.to)! - distances.get(b.to)! || a.name.localeCompare(b.name));
  const from = `${sourceSql(modelDatasets.get(root).source)} AS ${quoteIdentifier(root)}`;
  const joinSql = orderedJoins.map(j => {
    const target = modelDatasets.get(j.to);
    const uniqueKeys = [...(target.primary_key?.length ? [target.primary_key] : []), ...(target.unique_keys ?? [])];
    if (!uniqueKeys.some((keys: string[]) => keys.length === j.to_columns.length && keys.every(k => j.to_columns.includes(k))))
      throw new BadRequestError(`Join ${j.name} has no declared unique target key. Add primary_key or unique_keys to ${j.to} before aggregating through it.`);
    const conditions = j.from_columns.map((column: string, i: number) => {
      const fromColumn = `${quoteIdentifier(j.from)}.${quoteIdentifier(column)}`;
      const toColumn = `${quoteIdentifier(j.to)}.${quoteIdentifier(j.to_columns[i])}`;
      return `${expressionSql(compile(fromColumn))} = ${expressionSql(compile(toColumn))}`;
    });
    // LEFT JOIN retains facts with missing dimensions. Inner-join filtering must be explicit.
    return `LEFT JOIN ${sourceSql(modelDatasets.get(j.to).source)} AS ${quoteIdentifier(j.to)} ON ${conditions.join(' AND ')}`;
  });
  const columnList = [...select, ...measures].map(s => `${s.sql} AS ${quoteIdentifier(s.alias)}`).join(',\n  ');
  const joinClause = joinSql.length ? '\n' + joinSql.join('\n') : '';
  const groupByClause = metrics.length && select.length ? '\nGROUP BY ' + select.map(s => s.sql).join(', ') : '';
  const sql = `SELECT\n  ${columnList}\nFROM ${from}${joinClause}${groupByClause};`;
  return {
    mappingId: context.mappingId,
    dialect: 'ANSI_SQL',
    sql,
    dimensions: select,
    metrics: measures,
    joins: orderedJoins,
    sources: [...aliases].map(name => ({ dataset: name, source: modelDatasets.get(name).source })),
    bindings: selected.bindings,
    documents: context.documents,
    policy,
    warnings: ['Generated SQL is a preview. Verify physical uniqueness and dialect compatibility in your query engine. No query was executed.'],
  };
}
