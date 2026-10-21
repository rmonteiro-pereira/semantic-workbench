import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { validateInput } from '../src/input';
import { buildContext, planQuery, type StoredDocument } from '../server/agent/runtime';
// Executes governed shopping-center KPIs on the synthetic fixture and compares
// them with expected.json, which the generator computes from rows, not from SQL.
const dir = 'public/examples/mall/';
export const mallFiles = [
  'mall.mapping.yaml',
  'mall.ontology.yaml',
  'mall.semantic.yaml',
  'mall.odcs.yaml',
  'mall.owl.ttl',
  'mall.shacl.ttl',
  'mall-data.ttl',
];
export async function checkMall() {
  const docs: StoredDocument[] = await Promise.all(
    mallFiles.map(async (filename, i) => ({
      id: 'mall-' + i,
      filename,
      revision: 1,
      source: await Bun.file(dir + filename).text(),
    })),
  );
  const imports = docs.map(d => {
    const r = validateInput(d.source, d.filename);
    assert(r.valid, `${d.filename}: ${JSON.stringify(r.issues.slice(0, 3))}`);
    assert.deepEqual(
      r.issues.filter(i => i.severity === 'error'),
      [],
    );
    return {
      file: d.filename,
      kind: r.model.kind,
      entities: r.model.entities.length,
      relationships: r.model.edges.length,
    };
  });
  const expected = await Bun.file(dir + 'expected.json').json();
  const context = buildContext(docs.slice(0, 3), 'mall-0');
  assert.deepEqual(context.findings, []);
  assert.equal(context.datasets.length, expected.counts.datasets);
  assert.equal(context.joins.length, expected.counts.joins);
  assert.equal(context.bindings.length, expected.counts.bindings);
  assert.equal(context.metrics.length, expected.counts.metrics);
  for (const join of context.joins)
    assert(
      context.bindings.some(b => b.expression === `${join.from}.${join.from_columns[0]}`),
      `Join ${join.name} lacks a link mapping`,
    );
  const db = new Database(':memory:');
  const executions: any[] = [];
  try {
    db.exec(await Bun.file(dir + 'fixture.sql').text());
    const run = (metric: string, dimensions: [string, string][]) => {
      const p = planQuery(context, {
        mappingId: context.mappingId,
        metrics: [metric],
        dimensions: dimensions.map(d => JSON.stringify(d)),
      });
      const rows = db.query(p.sql).all() as any[];
      const result = Object.fromEntries(
        rows.map(r => [
          dimensions.map((_, i) => r[`dimension_${i + 1}`]).join('|') || 'total',
          r.metric_1,
        ]),
      );
      executions.push({ metric, dimensions, joins: p.joins.map((j: any) => j.name), result });
      return result;
    };
    const same = (
      actual: Record<string, number>,
      wanted: Record<string, number>,
      label: string,
    ) => {
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(wanted).sort(), label);
      for (const k of Object.keys(wanted))
        assert(
          Math.abs(actual[k] - wanted[k]) < 1e-9,
          `${label} ${k}: ${actual[k]} != ${wanted[k]}`,
        );
    };
    const month: [string, string] = ['calendar_months', 'year_month'],
      property: [string, string] = ['properties', 'name'];
    same(
      run('occupancy_rate', [month, property]),
      expected.occupancyRateByMonthProperty,
      'occupancy rate',
    );
    same(run('vacant_gla', [month]), expected.vacantGlaByMonth, 'vacant GLA');
    same(
      run('minimum_rent_per_m2', [month]),
      expected.minimumRentPerM2ByMonth,
      'minimum rent per m²',
    );
    same(
      run('billed_amount', [['charge_types', 'name']]),
      expected.billedByChargeType,
      'billed by charge type',
    );
    same(run('delinquency_rate', [month]), expected.delinquencyRateByMonth, 'delinquency rate');
    same(run('open_amount', [month]), expected.openAmountByMonth, 'open amount');
    same(
      run('sales_per_m2', [month, ['merchandise_categories', 'name']]),
      expected.salesPerM2ByMonthCategory,
      'sales per m²',
    );
    same(
      run('occupancy_cost_ratio', [property]),
      expected.occupancyCostRatioByProperty,
      'occupancy cost ratio',
    );
    same(run('visitors', [month, property]), expected.visitorsByMonthProperty, 'visitors');
    same(
      run('net_operating_income', [month, property]),
      expected.netOperatingIncomeByMonthProperty,
      'NOI',
    );
    same(run('noi_margin', [property]), expected.noiMarginByProperty, 'NOI margin');
    same(
      run('payroll_cost', [month, ['departments', 'name']]),
      expected.payrollCostByMonthDepartment,
      'payroll cost',
    );
    same(run('headcount', [month]), expected.headcountByMonth, 'headcount');
    same(
      run('purchase_spend', [['expense_categories', 'name']]),
      expected.purchaseSpendByCategory,
      'purchase spend',
    );
    same(
      run('payables_outstanding', [month]),
      expected.payablesOutstandingByMonth,
      'payables outstanding',
    );
    // Contracted tenant (charge → lease → tenant) and billed tenant (charge → invoice → tenant) are distinct roles.
    assert.throws(
      () =>
        planQuery(context, {
          mappingId: context.mappingId,
          metrics: ['billed_amount'],
          dimensions: ['["tenants","trade_name"]'],
        }),
      /Ambiguous join paths/,
    );
    // Occupancy, sales and charges are different grains; combining them in one query is refused.
    assert.throws(() =>
      planQuery(context, {
        mappingId: context.mappingId,
        metrics: ['occupancy_rate', 'tenant_sales'],
        dimensions: [JSON.stringify(month)],
      }),
    );
  } finally {
    db.close();
  }
  return {
    imports,
    counts: expected.counts,
    executions,
    blockedCases: [
      'Tenant by charge: contracted and billed tenant roles are both declared; no role was guessed',
      'Occupancy and sales metrics have different grains and are not combined in one query',
    ],
  };
}
if (import.meta.main) console.log(JSON.stringify(await checkMall(), null, 1).slice(0, 4000));
