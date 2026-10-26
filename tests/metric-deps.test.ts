// Tests metric reference scanning shared by graphs and query execution.
import { test, expect } from 'bun:test';
import { Glob } from 'bun';
import { parse } from 'yaml';
import { datasetReferences, expressionRefs, metricDependencies } from '../src/metrics/deps';
import { inspect } from '../src/core/model';
import { columnRefs, parseExpression } from '../src/server/agent/sql';

function expressions(value: any, out: string[] = []) {
  if (Array.isArray(value)) value.forEach(v => expressions(v, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (k === 'expression' && typeof v === 'string') out.push(v);
      else expressions(v, out);
    }
  return out;
}
test('agrees with the SQL syntax tree on every expression of the shipped examples', async () => {
  const all: string[] = [];
  for await (const f of new Glob('public/examples/**/*.yaml').scan('.'))
    expressions(parse(await Bun.file(f).text(), { maxAliasCount: -1 }), all);
  let compared = 0;
  const differences: string[] = [];
  for (const sql of new Set(all)) {
    let ast;
    try {
      ast = parseExpression(sql, { conditional: /\bWHERE\b/i.test(sql) });
    } catch {
      continue;
    }
    const tree = [
      ...new Set(
        columnRefs([ast.expression, ast.condition]).map(r => `${r.table ?? ''}.${r.column}`),
      ),
    ].sort();
    const scan = [...new Set(expressionRefs(sql).map(r => `${r.table ?? ''}.${r.column}`))].sort();
    compared++;
    if (JSON.stringify(tree) !== JSON.stringify(scan))
      differences.push(`${sql}: ${tree} vs ${scan}`);
  }
  expect(compared).toBeGreaterThan(1900);
  expect(differences).toEqual([]);
});
test('order. never matches suborder.x; strings, comments, functions and keywords are not references', () => {
  expect(datasetReferences('SUM(suborder.amount)', new Set(['order', 'suborder']))).toEqual([
    'suborder',
  ]);
  expect(datasetReferences('SUM(suborder.amount)', new Set(['order']))).toEqual([]);
  expect(datasetReferences('COUNT("order".id)', new Set(['order']))).toEqual(['order']);
  expect(
    metricDependencies(
      'revenue_total / NULLIF(revenue, 0) -- revenue_old\n',
      new Set(['revenue', 'revenue_old', 'revenue_total']),
    ),
  ).toEqual(['revenue_total', 'revenue']);
  expect(
    metricDependencies("CASE WHEN status = 'revenue' THEN 1 END", new Set(['revenue', 'status'])),
  ).toEqual(['status']);
  expect(
    expressionRefs(
      "EXTRACT(YEAR FROM t.created) + CAST(t.x AS DATE) + DATE '2024-01-01' + t.y::INTEGER",
    ).map(r => `${r.table}.${r.column}`),
  ).toEqual(['t.created', 't.x', 't.y']);
  expect(expressionRefs('COALESCE(a.year, a.quarter, a.date)').map(r => r.column)).toEqual([
    'year',
    'quarter',
    'date',
  ]);
});
test('graph metric edges come from the syntax scan', () => {
  const source = `version: '0.2.0.dev0'\nname: m\ndatasets:\n  - name: order\n    source: s.order\n    fields: [{name: amount, expression: {dialects: [{dialect: ANSI_SQL, expression: amount}]}}]\n  - name: suborder\n    source: s.suborder\n    fields: [{name: amount, expression: {dialects: [{dialect: ANSI_SQL, expression: amount}]}}]\nmetrics:\n  - name: sub_total\n    expression: {dialects: [{dialect: ANSI_SQL, expression: "SUM(suborder.amount) -- order.amount"}]}\n`;
  const model = inspect(source, 'm.yaml') as any;
  const edges = model.edges
    .filter((e: any) => e.data.kind === 'Metric expression reference')
    .map((e: any) => e.source);
  expect(edges).toEqual(['datasets/1']);
  expect(model.entities.find((e: any) => e.id === 'datasets/1').name).toBe('suborder');
});
