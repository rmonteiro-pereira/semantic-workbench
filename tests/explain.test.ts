// Tests metric explanations and SQL previews without query execution.
import { test, expect } from 'bun:test';
import { stringify } from 'yaml';
import { testWorkspace } from './helpers/temp-data-dir';
// KPI explanation: composition, lineage to ODCS, additivity refusals, division by zero; the
// workbench explains and previews SQL but never executes it.
const mallFiles = [
  'mall.ontology.yaml',
  'mall.semantic.yaml',
  'mall.mapping.yaml',
  'mall.odcs.yaml',
];
async function mall() {
  const t = await testWorkspace();
  const files = await Promise.all(
    mallFiles.map(async path => ({
      path,
      source: await Bun.file('public/examples/mall/' + path).text(),
    })),
  );
  const { slug } = await t.seed(files, 'Mall');
  return { ...t, slug };
}
const get = async (t: { handler: (r: Request) => Promise<Response> }, path: string) => {
  const r = await t.handler(new Request('http://localhost' + path));
  return { status: r.status, body: await r.json() };
};
const explain = (t: any, metric: string, query = '') =>
  get(t, `/api/projects/${t.slug}/files/mall.semantic.yaml/explain/${metric}${query}`);
test('metrics list: label, type, unit, status, owner and concepts of every KPI', async () => {
  const t = await mall();
  try {
    const { status, body } = await get(t, `/api/projects/${t.slug}/metrics`);
    expect(status).toBe(200);
    expect(body).toHaveLength(25);
    expect(body.find((k: any) => k.name === 'occupancy_rate')).toMatchObject({
      label: 'Occupancy rate',
      type: 'ratio',
      unit: 'ratio',
      status: 'approved',
      owner: 'Leasing',
      additivity: 'non_additive',
      file: 'mall.semantic.yaml',
      layout: 'split',
    });
    expect(
      body
        .find((k: any) => k.name === 'occupancy_rate')
        .concepts.map((c: any) => `${c.role}:${c.concept}`),
    ).toEqual(['measures:OccupancyRate', 'of:Property']);
    expect(body.every((k: any) => k.findings.length === 0)).toBe(true);
    expect((await get(t, '/api/projects/missing/metrics')).status).toBe(404);
  } finally {
    t.dispose();
  }
});
test('composition trees for simple, ratio and derived KPIs, down to ODCS properties with trust indicators', async () => {
  const t = await mall();
  try {
    const simple = (await explain(t, 'billed_amount')).body;
    expect(simple.tree).toMatchObject({
      kind: 'metric',
      name: 'billed_amount',
      type: 'simple',
      children: [{ kind: 'field', dataset: 'charges', name: 'amount' }],
    });
    const field = simple.inputs[0].fields[0];
    expect(field.odcs[0]).toMatchObject({
      file: 'mall.odcs.yaml',
      object: 'charges',
      physicalName: 'mall.charges',
      property: 'amount',
      logicalType: 'number',
    });
    expect(field.odcs[0].quality[0]).toMatchObject({
      kind: 'quality',
      dimension: 'completeness',
      name: 'amount_not_null',
    });
    expect(simple.inputs[0].sla.map((s: any) => s.property)).toEqual([
      'latency',
      'frequency',
      'retention',
    ]);
    const ratio = (await explain(t, 'occupancy_rate')).body;
    expect(ratio.tree.children.map((c: any) => `${c.role}:${c.name}`)).toEqual([
      'numerator:occupied_gla',
      'denominator:total_gla',
    ]);
    expect(ratio.inputs.map((i: any) => i.metric)).toEqual(['occupied_gla', 'total_gla']);
    expect(ratio.inputs[0].fields[0].odcs[0].quality.map((q: any) => q.name)).toEqual([
      'one_snapshot_per_unit_month',
      'occupied_within_gla',
    ]);
    const derived = (await explain(t, 'noi_margin')).body;
    expect(derived.tree.children[0]).toMatchObject({
      role: 'numerator',
      name: 'net_operating_income',
      type: 'derived',
    });
    expect(derived.tree.children[0].children.map((c: any) => c.name)).toEqual([
      'operating_revenue',
      'operating_expense_total',
    ]);
    expect(derived.inputs.map((i: any) => i.metric)).toEqual([
      'operating_revenue',
      'operating_expense_total',
    ]);
    // A computed field resolves to every physical column it reads.
    const vacant = (await explain(t, 'vacant_gla')).body.inputs[0].fields[0];
    expect(vacant.columns).toEqual(['gla_m2', 'occupied_gla_m2']);
    expect(vacant.odcs.map((o: any) => o.property)).toEqual(['gla_m2', 'occupied_gla_m2']);
    expect(derived.concepts.map((c: any) => c.concept)).toEqual(['NoiMargin', 'Property']);
    expect(derived.time).toEqual({
      dimension: 'calendar_months.first_day',
      minGrain: 'month',
      allowedGrains: ['month', 'quarter', 'year'],
    });
  } finally {
    t.dispose();
  }
});
test('additivity refusals: sum of a ratio, a stock summed over time, unknown grains', async () => {
  const t = await mall();
  try {
    const ratio = (await explain(t, 'occupancy_rate', '?rollup=sum')).body.sqlPreview;
    expect(ratio.refused).toContain('Summing ratios gives a wrong result');
    expect(ratio.sql).toBeUndefined();
    const stock = (await explain(t, 'total_gla', '?grain=quarter')).body.sqlPreview;
    expect(stock.refused).toContain('take the last month of each quarter');
    expect((await explain(t, 'occupancy_rate', '?grain=year')).body.sqlPreview.refused).toContain(
      'Occupied GLA, Total GLA are stocks',
    );
    expect(
      (await explain(t, 'total_gla', '?grain=month&dimension=properties.name')).body.sqlPreview.sql,
    ).toContain('GROUP BY');
    expect(
      (await explain(t, 'billed_amount', '?grain=quarter&rollup=sum')).body.sqlPreview.sql,
    ).toContain("DATE_TRUNC('quarter'");
    expect((await explain(t, 'headcount', '?rollup=sum')).body.sqlPreview.refused).toContain(
      'non-additive',
    );
    expect((await explain(t, 'visitors', '?grain=day')).body.sqlPreview.refused).toContain(
      'finer than the minimum grain month',
    );
    expect((await explain(t, 'visitors', '?grain=hour')).body.sqlPreview.refused).toContain(
      'not one of',
    );
    expect((await explain(t, 'visitors', '?dimension=bad')).status).toBe(400);
    expect((await explain(t, 'nothing')).status).toBe(400);
  } finally {
    t.dispose();
  }
});
test('division by zero and unknown additivity are explained; no SQL is ever executed', async () => {
  const t = await testWorkspace();
  try {
    const field = (name: string) => ({
      name,
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression: name }] },
    });
    const metric = (name: string, expression: string) => ({
      name,
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression }] },
    });
    const source = stringify({
      version: '0.2.0.dev0',
      name: 'm',
      datasets: [
        {
          name: 'orders',
          source: 's.orders',
          primary_key: ['id'],
          fields: ['id', 'amount', 'qty'].map(field),
        },
      ],
      metrics: [
        metric('revenue', 'SUM(orders.amount)'),
        metric('units', 'SUM(orders.qty)'),
        metric('price', 'revenue / units'),
        metric('safe_price', 'revenue / NULLIF(units, 0)'),
        metric('raw', 'MAX(orders.amount) + 0'),
        metric('opaque', 'orders.amount'),
      ],
    });
    const { slug } = await t.seed([{ path: 'm.yaml', source }]);
    const x = (m: string, q = '') => get(t, `/api/projects/${slug}/files/m.yaml/explain/${m}${q}`);
    expect((await x('price')).body).toMatchObject({
      divisionByZero: 'unhandled',
      kpi: { type: 'ratio', additivity: 'non_additive', additivityDeclared: false },
    });
    expect((await x('safe_price')).body.divisionByZero).toBe('handled');
    expect((await x('revenue')).body.divisionByZero).toBe('n/a');
    expect((await x('opaque', '?rollup=sum')).body.sqlPreview.refused).toContain(
      'no declared additivity',
    );
    const preview = (await x('safe_price')).body.sqlPreview;
    expect(preview.notExecuted).toBe(true);
    expect(preview.sql).toContain('NULLIF');
    expect(preview.warnings.join(' ')).toContain('No query was executed');
  } finally {
    t.dispose();
  }
  // The explanation's import graph has no database, process or network access.
  const seen = new Set<string>();
  const pending = ['src/server/agent/explain.ts'];
  for (let i = 0; i < pending.length; i++) {
    const file = pending[i];
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await Bun.file(file).text();
    for (const [, spec] of text.matchAll(/from\s+'([^']+)'/g)) {
      expect(['bun:sqlite', 'node:child_process', 'child_process', 'bun:ffi']).not.toContain(spec);
      // Process execution needs a child_process import (rejected above) or Bun's own APIs;
      // `.exec(` alone is RegExp#exec, which these modules use to read text.
      expect(text).not.toMatch(/\bfetch\(|Bun\.spawn|Bun\.\$|\bexecSync\(|\bspawnSync\(/);
      if (spec.startsWith('.')) {
        const base = new URL(spec, 'file:///' + file).pathname.slice(1);
        for (const ext of ['.ts', '.tsx'])
          if (await Bun.file(base + ext).exists()) pending.push(base + ext);
      }
    }
  }
  expect(seen.size).toBeGreaterThan(5);
});
