// Tests atomic saves of metrics and their concept bindings.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { projectMetrics } from '../src/server/agent/explain';
import { testWorkspace, example } from './helpers/temp-data-dir';
import { applyStatusRules, allowedStatuses, writeExtension, extensionOf } from '../src/shared/edit/item-model';
import { findReferences } from '../src/app/edit/references';
import { readMetricExtension, VENDOR } from '../src/shared/metrics/extension';
import { itemValue } from '../src/shared/edit/yaml-patch';
// A metric save updates the semantic model and inserts one sorted mapping binding in a single
// journaled operation.
const api = (t: { handler: (r: Request) => Promise<Response> }, method: string, path: string, body?: unknown) =>
  t.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const diff = (a: string, b: string) => {
  const x = a.split('\n');
  const y = b.split('\n');
  let p = 0;
  while (x[p] === y[p]) p++;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return { removed: x.slice(p, x.length - s), added: y.slice(p, y.length - s) };
};
const ratio = {
  type: 'ratio',
  numerator: 'vacant_gla',
  denominator: 'total_gla',
  additivity: 'non_additive',
  unit: 'ratio',
  format: '0.0%',
  owner: 'Leasing',
  status: 'proposed',
  time: { dimension: 'calendar_months.first_day', min_grain: 'month' },
  targets: [{ grain: 'month', direction: 'lower_is_better', value: 0.05 }],
};
const request = (hashes: Record<string, string>) => ({
  semanticPath: 'mall.semantic.yaml',
  metric: {
    name: 'vacancy_rate',
    expression: 'vacant_gla / NULLIF(total_gla, 0)',
    description: 'Vacant over total gross leasable area.',
  },
  extension: ratio,
  binding: { measures: 'Property', of: 'Property' },
  baseHashes: hashes,
});
async function mall() {
  const t = await testWorkspace();
  const { slug } = await t.ws.loadExample('mall');
  const read = (p: string) => readFileSync(join(t.root, 'projects', slug, p), 'utf8');
  return {
    t,
    slug,
    read,
    hashes: () => Object.fromEntries(['mall.semantic.yaml', 'mall.mapping.yaml'].map(p => [p, sha256(read(p))])),
  };
}
test('a ratio KPI writes the metric with its extension and one sorted binding line, journaled', async () => {
  const { t, slug, read, hashes } = await mall();
  try {
    const semantic = read('mall.semantic.yaml');
    const mapping = read('mall.mapping.yaml');
    const r = await api(t, 'POST', `/api/projects/${slug}/kpis`, request(hashes()));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.written.map((w: any) => w.path)).toEqual(['mall.semantic.yaml', 'mall.mapping.yaml']);
    // Semantic model: only added lines, at the end of the metrics list.
    const s = diff(semantic, read('mall.semantic.yaml'));
    expect(s.removed).toEqual([]);
    expect(s.added[0]).toBe('  - name: vacancy_rate');
    expect(s.added).toContain('          expression: vacant_gla / NULLIF(total_gla, 0)');
    // The formula is in the expression only; the extension names its inputs.
    const metrics = itemValue(read('mall.semantic.yaml'), ['metrics']) as any[];
    const metric = metrics.find(m => m.name === 'vacancy_rate');
    const ext = readMetricExtension(metric);
    expect(ext.issues).toEqual([]);
    expect(ext.value).toMatchObject({
      numerator: 'vacant_gla',
      denominator: 'total_gla',
      status: 'proposed',
    });
    expect(metric.custom_extensions[0].data).not.toContain('NULLIF');
    // Mapping: exactly one added line, in sorted position.
    expect(diff(mapping, read('mall.mapping.yaml'))).toEqual({
      removed: [],
      added: ['        {"metric":"vacancy_rate","measures":"Property","of":"Property"},'],
    });
    const kpi = projectMetrics(t.ws.documents(), slug).find(k => k.name === 'vacancy_rate')!;
    expect(kpi.concepts.map(c => [c.role, c.concept])).toEqual([
      ['measures', 'Property'],
      ['of', 'Property'],
    ]);
    expect(readdirSync(t.ws.layout.journal).filter(f => f.endsWith('.json'))).toEqual([]);
    expect(readdirSync(join(t.root, 'projects')).some(f => f.startsWith('.staging-'))).toBe(false);
    // The same name again is refused.
    expect((await api(t, 'POST', `/api/projects/${slug}/kpis`, request(hashes()))).status).toBe(400);
  } finally {
    t.dispose();
  }
});
test('any stale base hash is a 409 and nothing is written', async () => {
  const { t, slug, read, hashes } = await mall();
  try {
    const before = ['mall.semantic.yaml', 'mall.mapping.yaml'].map(read);
    const r = await api(t, 'POST', `/api/projects/${slug}/kpis`, request({ ...hashes(), 'mall.mapping.yaml': '0'.repeat(64) }));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('stale');
    expect(['mall.semantic.yaml', 'mall.mapping.yaml'].map(read)).toEqual(before);
  } finally {
    t.dispose();
  }
});
test('the preview explains the KPI and lists the changes without writing', async () => {
  const { t, slug, read, hashes } = await mall();
  try {
    const before = read('mall.semantic.yaml');
    const r = await api(t, 'POST', `/api/projects/${slug}/kpis/preview`, request(hashes()));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.explanation.tree.children.map((c: any) => c.name)).toEqual(['vacant_gla', 'total_gla']);
    expect(body.explanation.sqlPreview.notExecuted).toBe(true);
    expect(body.changes.map((c: any) => [c.path, c.added.length > 0])).toEqual([
      ['mall.semantic.yaml', true],
      ['mall.mapping.yaml', true],
    ]);
    expect(read('mall.semantic.yaml')).toBe(before);
  } finally {
    t.dispose();
  }
});
test('without a mapping document a minimal one is created with concept_mappings: []', async () => {
  const t = await testWorkspace();
  try {
    const { slug } = await t.seed([
      {
        path: 'business.ossie.yaml',
        source: await example('commerce', 'commerce-business.ossie.yaml'),
      },
      { path: 'sales.ossie.yaml', source: await example('commerce', 'sales.ossie.yaml') },
    ]);
    const hash = sha256(readFileSync(join(t.root, 'projects', slug, 'sales.ossie.yaml')));
    const r = await api(t, 'POST', `/api/projects/${slug}/kpis`, {
      semanticPath: 'sales.ossie.yaml',
      metric: { name: 'revenue_per_order', expression: 'gross_revenue / NULLIF(order_count, 0)' },
      extension: {
        type: 'ratio',
        numerator: 'gross_revenue',
        denominator: 'order_count',
        status: 'draft',
      },
      binding: { measures: 'Order' },
      baseHashes: { 'sales.ossie.yaml': hash },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).written.map((w: any) => [w.path, w.created])).toEqual([
      ['sales.ossie.yaml', false],
      ['sales.mapping.yaml', true],
    ]);
    const created = readFileSync(join(t.root, 'projects', slug, 'sales.mapping.yaml'), 'utf8');
    expect(created).toContain('concept_mappings: []\n');
    expect(created).toContain('{"metric":"revenue_per_order","measures":"Order"}');
    expect(t.ws.readFile(slug, 'sales.mapping.yaml').valid).toBe(true);
    const kpi = projectMetrics(t.ws.documents(), slug).find(k => k.name === 'revenue_per_order')!;
    expect(kpi.concepts[0]).toMatchObject({ role: 'measures', concept: 'Order' });
  } finally {
    t.dispose();
  }
});
test('a consolidated file keeps the binding in its embedded semantic model root', async () => {
  const t = await testWorkspace();
  try {
    const source = await example('ossie', 'flights.yaml');
    const { slug } = await t.seed([{ path: 'flights.yaml', source }]);
    const r = await api(t, 'POST', `/api/projects/${slug}/kpis`, {
      semanticPath: 'flights.yaml',
      metric: { name: 'runway_count', expression: 'COUNT(RUNWAY.airport_code)' },
      extension: { type: 'simple', additivity: 'additive' },
      binding: { measures: 'Airport' },
      baseHashes: { 'flights.yaml': sha256(source) },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).written.map((w: any) => w.path)).toEqual(['flights.yaml']);
    const after = readFileSync(join(t.root, 'projects', slug, 'flights.yaml'), 'utf8');
    const d = diff(source, after);
    expect(d.removed).toEqual([]);
    expect(after).toContain('"kpi_bindings"');
    expect(projectMetrics(t.ws.documents(), slug).find(k => k.name === 'runway_count')!.concepts[0]).toMatchObject({ concept: 'Airport', role: 'measures' });
  } finally {
    t.dispose();
  }
});
test('status rules: an edited approved KPI returns to proposed; deprecation needs a replacement or reason', () => {
  const approved = writeExtension(
    {
      name: 'k',
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'a / NULLIF(b, 0)' }] },
    },
    {
      schema: 'semantic-workbench/metric/v1',
      type: 'ratio',
      numerator: 'a',
      denominator: 'b',
      status: 'approved',
      owner: 'Finance',
    },
  );
  const changed = {
    ...approved,
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'a / NULLIF(c, 0)' }] },
  };
  expect(extensionOf(applyStatusRules(approved, changed).item)!.value.status).toBe('proposed');
  expect(applyStatusRules(approved, changed).reopened).toBe(true);
  const owner = writeExtension(approved, { ...extensionOf(approved)!.value, owner: 'Leasing' });
  expect(applyStatusRules(approved, owner)).toEqual({ item: owner, reopened: false });
  expect(allowedStatuses('draft')).toEqual(['draft', 'proposed']);
  expect(allowedStatuses('approved')).not.toContain('draft');
  const deprecated = writeExtension(approved, {
    ...extensionOf(approved)!.value,
    status: 'deprecated',
  });
  expect(readMetricExtension(deprecated).issues.map(i => i.message)).toEqual(['A deprecated metric requires replaced_by or deprecation_reason.']);
  expect(
    readMetricExtension(
      writeExtension(approved, {
        ...extensionOf(approved)!.value,
        status: 'deprecated',
        deprecation_reason: 'Replaced by the board report.',
      }),
    ).issues,
  ).toEqual([]);
  expect(approved.custom_extensions[0].vendor_name).toBe(VENDOR);
});
test('dependents of a KPI are listed: metrics that use it and its binding', () => {
  const docs = ['mall.semantic.yaml', 'mall.mapping.yaml'].map(p => ({
    id: 'm/' + p,
    path: p,
    filename: p,
    source: readFileSync('public/examples/mall/' + p, 'utf8'),
  }));
  const metrics = itemValue(docs[0].source, ['metrics']) as any[];
  const i = metrics.findIndex(m => m.name === 'total_gla');
  const refs = findReferences({ kind: 'metric', name: 'total_gla', docId: docs[0].id, path: ['metrics', i] }, docs);
  const labels = [...new Set(refs.map(r => r.dependent?.label))];
  expect(labels).toContain('metric occupancy_rate');
  expect(labels).toContain('metric binding of total_gla');
  expect(existsSync('data')).toBeDefined();
});
import { expressionFor, extensionFor, type Draft } from '../src/app/metrics/metric-draft';
test('the wizard writes the formula once, as the expression; the extension names inputs and rules', () => {
  const d: Draft = {
    measures: 'Property',
    of: '',
    file: 'm.yaml',
    name: 'vacancy_rate',
    label: 'Vacancy rate',
    description: '',
    type: 'ratio',
    aggregation: 'SUM',
    field: '',
    numerator: 'vacant_gla',
    denominator: 'total_gla',
    inputs: '',
    expression: '',
    window: 'to_date',
    windowLength: '',
    windowGrain: '',
    filterField: '',
    filterOperator: 'equals',
    filterValue: '',
    additivity: '',
    timeDimension: 'calendar_months.first_day',
    minGrain: 'month',
    grains: ['month', 'year'],
    dimensions: ['properties.name'],
    direction: 'lower_is_better',
    target: '0.05',
    targetGrain: 'month',
    warning: '0.08',
    critical: '',
    owner: 'Leasing',
    steward: '',
    status: 'proposed',
    unit: 'ratio',
    format: '0.0%',
  };
  expect(expressionFor(d)).toBe('vacant_gla / NULLIF(total_gla, 0)');
  const e = extensionFor(d);
  expect(e).toEqual({
    label: 'Vacancy rate',
    type: 'ratio',
    numerator: 'vacant_gla',
    denominator: 'total_gla',
    additivity: 'non_additive',
    time: {
      dimension: 'calendar_months.first_day',
      min_grain: 'month',
      allowed_grains: ['month', 'year'],
    },
    dimensions: ['properties.name'],
    unit: 'ratio',
    format: '0.0%',
    targets: [
      {
        grain: 'month',
        direction: 'lower_is_better',
        value: 0.05,
        thresholds: { warning: { mustBeGreaterThan: 0.08 } },
      },
    ],
    owner: 'Leasing',
    status: 'proposed',
  });
  expect(JSON.stringify(e)).not.toContain('NULLIF');
  expect(
    readMetricExtension({
      custom_extensions: [
        {
          vendor_name: VENDOR,
          data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', ...e }),
        },
      ],
    }).issues,
  ).toEqual([]);
  expect(expressionFor({ ...d, type: 'simple', aggregation: 'COUNT DISTINCT', field: 'leases.id' })).toBe('COUNT(DISTINCT leases.id)');
});
