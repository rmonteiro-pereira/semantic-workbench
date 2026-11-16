import { LOCAL_READER } from '../src/server/projects/reader';
import { testWorkspace } from './helpers/temp-data-dir';
// Tests metric extension validation across shipped examples.
import { test, expect } from 'bun:test';
import { parseDocument, stringify } from 'yaml';
import { validateInput } from '../src/shared/validation/input';
import { ansiExpression } from '../src/shared/metrics/deps';
import { inferredAdditivity, inferredType, readMetricExtension, metricLayerIssues } from '../src/shared/metrics/extension';
// Metric extensions on copies of the 59 metrics shipped in the examples.
const shipped = [
  'billing/billing.semantic.yaml',
  'commerce/sales.ossie.yaml',
  'commerce/commerce.mapped-semantic.yaml',
  'mall/mall.semantic.yaml',
  'ubl/ubl.semantic.yaml',
  'ossie/flights.metrics.semantic.yaml',
];
// A copy with an extension on every metric: mall's own, inferred ones elsewhere.
async function annotated(file: string) {
  const source = await Bun.file('public/examples/' + file).text();
  const doc = parseDocument(source);
  const data = doc.toJS();
  const names = new Set<string>(data.metrics.map((m: any) => m.name));
  data.metrics.forEach((metric: any, i: number) => {
    if (metric.custom_extensions) return;
    const sql = ansiExpression(metric);
    const shape = inferredType(sql, names);
    const ext = {
      schema: 'semantic-workbench/metric/v1',
      type: shape.type,
      ...(shape.numerator ? { numerator: shape.numerator, denominator: shape.denominator } : {}),
      ...(shape.inputs ? { inputs: shape.inputs } : {}),
      ...(shape.type === 'ratio' ? { additivity: 'non_additive' } : {}),
    };
    doc.setIn(['metrics', i, 'custom_extensions'], doc.createNode([{ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify(ext, null, 2) + '\n' }]));
  });
  return { file, source: doc.toString({ lineWidth: 0 }), count: data.metrics.length };
}
test('the 59 shipped metrics carry valid extensions that parse back', async () => {
  const copies = await Promise.all(shipped.map(annotated));
  expect(copies.reduce((n, c) => n + c.count, 0)).toBe(59);
  let parsed = 0;
  for (const copy of copies) {
    const validation = validateInput(copy.source, copy.file.split('/')[1]);
    expect(validation.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(validation.valid).toBe(true);
    for (const metric of parseDocument(copy.source).toJS().metrics) {
      const { value, issues } = readMetricExtension(metric);
      expect(issues).toEqual([]);
      expect(value?.schema).toBe('semantic-workbench/metric/v1');
      parsed++;
    }
  }
  expect(parsed).toBe(59);
});
test('schema errors are located on the offending key inside the block, line and column', async () => {
  for (const annotatedCopy of await Promise.all(shipped.map(annotated))) {
    const doc = parseDocument(annotatedCopy.source);
    doc.toJS().metrics.forEach((metric: any, i: number) => {
      const data = JSON.parse(metric.custom_extensions[0].data);
      delete data.non_additive_over;
      delete data.period_aggregation;
      doc.setIn(['metrics', i, 'custom_extensions', 0, 'data'], JSON.stringify({ ...data, additivity: 'sometimes' }, null, 2) + '\n');
    });
    const broken = doc.toString({ lineWidth: 0 });
    const validation = validateInput(broken, annotatedCopy.file.split('/')[1]);
    expect(validation.valid).toBe(false);
    const errors = validation.issues.filter(i => i.code === 'extension' && !i.message.startsWith('A ratio'));
    expect(errors.length).toBe(annotatedCopy.count);
    const lines = broken.split('\n');
    for (const error of errors) {
      expect(error.line).toBeGreaterThan(0);
      expect(lines[error.line! - 1].slice(error.column! - 1)).toStartWith('"additivity"');
    }
  }
});
const model = (metrics: any[], extra: any = {}) =>
  stringify({
    version: '0.2.0.dev0',
    name: 'm',
    datasets: [
      {
        name: 'orders',
        source: 's.orders',
        primary_key: ['id'],
        fields: ['id', 'amount', 'order_date', 'region'].map(name => ({
          name,
          expression: { dialects: [{ dialect: 'ANSI_SQL', expression: name }] },
        })),
      },
    ],
    metrics: metrics.map(([name, expression, ext]) => ({
      name,
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression }] },
      ...(ext
        ? {
            custom_extensions: [
              {
                vendor_name: 'SEMANTIC_WORKBENCH',
                data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', ...ext }, null, 2) + '\n',
              },
            ],
          }
        : {}),
    })),
    ...extra,
  });
const messages = (source: string) => validateInput(source, 'm.yaml').issues.map(i => `${i.severity}:${i.code}:${i.message}`);
test('plain-language rules: ratio, semi-additive and deprecated', () => {
  const issueLines = messages(
    model([
      ['revenue', 'SUM(orders.amount)', { type: 'simple' }],
      ['count', 'COUNT(orders.id)', null],
      ['avg', 'revenue / NULLIF(count, 0)', { type: 'ratio', numerator: 'revenue' }],
      ['stock', 'SUM(orders.amount)', { type: 'simple', additivity: 'semi_additive' }],
      ['old', 'SUM(orders.amount)', { type: 'simple', status: 'deprecated' }],
      ['summed_ratio', 'revenue / NULLIF(count, 0)', { type: 'ratio', numerator: 'revenue', denominator: 'count', additivity: 'additive' }],
    ]),
  );
  expect(issueLines).toContain('error:extension:A ratio metric requires numerator and denominator.');
  expect(issueLines).toContain('error:extension:A semi_additive metric requires non_additive_over and period_aggregation.');
  expect(issueLines).toContain('error:extension:A deprecated metric requires replaced_by or deprecation_reason.');
  expect(issueLines).toContain('error:extension:A ratio metric is non_additive: summing ratios gives a wrong result.');
  // Unknown keys and malformed JSON are reported, not ignored.
  expect(messages(model([['a', 'SUM(orders.amount)', { type: 'simple', colour: 'red' }]])).some(x => x.includes('colour'))).toBe(true);
  const bad = model([['a', 'SUM(orders.amount)', { type: 'simple' }]]).replace('"type": "simple"', '"type": "simple",');
  expect(messages(bad).some(x => x.includes('not valid JSON'))).toBe(true);
});
test('workspace findings: inputs exist, cycles, grains, fields and declared type', () => {
  const issueLines = messages(
    model([
      [
        'revenue',
        'SUM(orders.amount)',
        {
          type: 'simple',
          time: {
            dimension: 'orders.order_date',
            min_grain: 'month',
            allowed_grains: ['day', 'month'],
          },
          dimensions: ['orders.region', 'orders.missing'],
          filters: [{ field: 'orders.nope', operator: 'equals', value: 1 }],
        },
      ],
      ['margin', 'revenue / NULLIF(cost, 0)', { type: 'ratio', numerator: 'revenue', denominator: 'cost' }],
      ['a', 'b + 1', { type: 'derived', inputs: ['b'] }],
      ['b', 'a + 1', { type: 'derived', inputs: ['a', 'ghost'] }],
      ['mislabelled', 'revenue * 2', { type: 'simple' }],
      ['not_ratio', 'revenue - revenue', { type: 'ratio', numerator: 'revenue', denominator: 'revenue' }],
    ]),
  );
  expect(issueLines).toContain('error:kpi-reference:denominator "cost" is not a metric of this semantic model.');
  expect(issueLines).toContain('error:kpi-reference:Input "ghost" is not a metric of this semantic model.');
  expect(issueLines.some(x => x.startsWith('warning:metric-cycle:Metric dependency cycle: a → b → a'))).toBe(true);
  expect(issueLines).toContain('error:kpi-grain:Grain day is finer than the minimum grain month.');
  expect(issueLines).toContain('error:kpi-reference:Field orders.missing does not exist in this semantic model.');
  expect(issueLines).toContain('error:kpi-reference:Field orders.nope does not exist in this semantic model.');
  expect(issueLines.some(x => x.startsWith('warning:kpi-type:Declared simple, but the expression uses other metrics (revenue)'))).toBe(true);
  expect(issueLines.some(x => x.startsWith('warning:kpi-type:Declared ratio revenue / revenue, but the expression is not a division'))).toBe(true);
  expect(issueLines.some(x => x.includes('orders.region'))).toBe(false);
});
test('type and additivity are inferred from the expression when not declared', () => {
  const names = new Set(['a', 'b']);
  expect(inferredType('a / NULLIF(b, 0)', names)).toEqual({
    type: 'ratio',
    numerator: 'a',
    denominator: 'b',
  });
  expect(inferredType('a - b', names)).toEqual({ type: 'derived', inputs: ['a', 'b'] });
  expect(inferredType('SUM(t.x)', names).type).toBe('simple');
  expect(inferredAdditivity('SUM(t.x)', 'simple', () => null)).toBe('additive');
  expect(inferredAdditivity('COUNT(DISTINCT t.x)', 'simple', () => null)).toBe('non_additive');
  expect(inferredAdditivity('AVG(t.x)', 'simple', () => null)).toBe('non_additive');
  expect(inferredAdditivity('a / NULLIF(b, 0)', 'ratio', () => 'additive')).toBe('non_additive');
  expect(inferredAdditivity('a - b', 'derived', () => 'additive', ['a', 'b'])).toBe('additive');
  expect(inferredAdditivity('a - b', 'derived', n => (n === 'a' ? 'semi_additive' : 'additive'), ['a', 'b'])).toBe('semi_additive');
  expect(inferredAdditivity('t.x', 'simple', () => null)).toBe(null);
});

test('opening and saving governed metric definitions preserves source bytes and legacy references', async () => {
  using workspace = await testWorkspace();
  const { slug } = await workspace.ws.loadExample('mall');
  const original = workspace.ws.readFile(slug, 'mall.semantic.yaml');
  const opened = validateInput(original.source, 'mall.semantic.yaml');
  expect(opened.valid).toBe(true);
  await workspace.ws.saveFile(slug, 'mall.semantic.yaml', { baseHash: original.hash, patches: [] }, LOCAL_READER);
  const saved = workspace.ws.readFile(slug, 'mall.semantic.yaml');
  expect(saved.source).toBe(original.source);
  expect(saved.hash).toBe(original.hash);
  expect(saved.source).not.toContain('sw1:');
}, 30_000);

test('dotted metric references are refused when two real fields share the old spelling', () => {
  const model = {
    name: 'M',
    datasets: [
      { name: 'a', fields: [{ name: 'b' }] },
      { name: 'a', fields: [{ name: 'b' }] },
    ],
    metrics: [
      {
        name: 'count',
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(*)' }] },
        custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', type: 'simple', dimensions: ['a.b'] }) }],
      },
    ],
  };
  const findings = metricLayerIssues(model, '', new Map());
  expect(findings.some(finding => finding.message === 'Field a.b is ambiguous in this semantic model.')).toBe(true);
});

test('canonical field references take precedence over colliding legacy labels', () => {
  const reference = 'sw1:#model:M/dataset:D/field:x.y';
  const model = {
    name: 'M',
    datasets: [
      { name: 'D', fields: [{ name: 'x.y' }] },
      { name: 'sw1:#model:M/dataset:D/field:x', fields: [{ name: 'y' }] },
    ],
    metrics: [
      {
        name: 'count',
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(*)' }] },
        custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', type: 'simple', dimensions: [reference] }) }],
      },
    ],
  };
  expect(metricLayerIssues(model, '', new Map())).toEqual([]);
});
