// Validates example models and executes their governed metrics against synthetic fixtures.
import { LOCAL_READER } from '../src/server/projects/reader';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { parse } from 'yaml';
import { testWorkspace } from '../tests/helpers/temp-data-dir';
import { validateInput } from '../src/shared/validation/input';
import { exportDocument } from '../src/app/core/export';
import { agentCatalog, buildContext, planQuery, type StoredDocument } from '../src/server/agent/runtime';
import manifest from '../tests/fixtures/ossie-mapping/manifest.json';
import { checkMall } from './mall-checks';
/** Validates example models and checks governed query results against fixture expectations. */
export async function checkExamples() {
  const upstream: StoredDocument[] = [];
  const imports: any[] = [];
  const sqlExecutions: any[] = [];
  const plans: any[] = [];
  const workspace = await testWorkspace();
  try {
    const handler = workspace.handler;
    for (const file of manifest.files) {
      const source = await Bun.file('tests/fixtures/ossie-mapping/' + file.filename).text();
      assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256, 'Upstream fixture was edited: ' + file.filename);
      const validation = validateInput(source, file.filename);
      assert(validation.valid, JSON.stringify(validation.issues));
      const response = await handler(
        new Request('http://localhost/api/documents', {
          method: 'POST',
          body: JSON.stringify({ filename: file.filename, source }),
        }),
      );
      assert.equal(response.status, 200);
      const doc = await response.json();
      upstream.push(doc);
      assert.equal(doc.source, source);
      assert.equal(await exportDocument(doc.source, file.filename).blob.text(), source);
      imports.push({
        file: file.filename,
        kind: validation.model.kind,
        entities: validation.model.entities.length,
        relationships: validation.model.edges.length,
        warnings: validation.issues.filter(i => i.severity === 'warning'),
      });
    }
    const tpcds = imports.find(i => i.file === 'tpcds_semantic_model.yaml');
    assert.equal(tpcds.entities, 13);
    assert.equal(tpcds.relationships, 17);
    assert.equal(tpcds.warnings.length, 1);
    assert(tpcds.warnings[0].message.includes('ss_ticket_number'));
    const catalog = agentCatalog(upstream);
    assert.equal(catalog.mappings.length, 2);
    const flightDb = new Database(':memory:');
    try {
      flightDb.exec("ATTACH ':memory:' AS flights; CREATE TABLE flights.AIRPORTS(name TEXT); INSERT INTO flights.AIRPORTS VALUES('Seattle'),('Denver'),('Boston');");
      for (const mapping of catalog.mappings) {
        const context = buildContext(upstream, mapping.id);
        assert.deepEqual(context.findings, []);
        assert.equal(context.bindings.length, 60);
        assert.equal(context.bindings.filter(b => b.condition).length, 2);
        const query = planQuery(context, {
          mappingId: mapping.id,
          concepts: ['AirportName'],
          metrics: [],
          dimensions: ['["AIRPORT","name"]'],
        });
        // Only the test execution adapter changes the warehouse catalog prefix. Source files,
        // exported context and original SQL preview remain untouched.
        const testSql = query.sql.replaceAll('"DATABASE"."SCHEMA".', '"flights".');
        const actual = (flightDb.query(testSql).all() as any[]).map(r => r.dimension_1).sort();
        assert.deepEqual(actual, ['Boston', 'Denver', 'Seattle']);
        sqlExecutions.push({
          example: mapping.embedded ? 'upstream Flights embedded' : 'upstream Flights standalone',
          sql: query.sql,
          testAdapter: 'DATABASE.SCHEMA → flights (synthetic SQLite fixture only)',
          result: actual,
        });
        assert.throws(
          () =>
            planQuery(context, {
              mappingId: mapping.id,
              concepts: ['Flight'],
              metrics: [],
              dimensions: ['["FLIGHT","id"]'],
            }),
          /population conditions/,
        );
      }
    } finally {
      flightDb.close();
    }
    const billing: StoredDocument[] = await Promise.all(
      ['billing.mapping.yaml', 'billing.ontology.yaml', 'billing.semantic.yaml'].map(async (filename, i) => ({
        id: 'billing-' + i,
        filename,
        revision: 1,
        source: await Bun.file('public/examples/billing/' + filename).text(),
      })),
    );
    for (const storedDocument of billing) {
      assert(validateInput(storedDocument.source, storedDocument.filename).valid);
      const saved = await workspace.ws.saveDocument(storedDocument.filename, storedDocument.source, LOCAL_READER);
      assert.equal(saved.source, storedDocument.source);
      assert.equal(await exportDocument(saved.source, storedDocument.filename).blob.text(), storedDocument.source);
    }
    const context = buildContext(billing, 'billing-0');
    assert.deepEqual(context.findings, []);
    assert.equal(context.datasets.length, 36);
    assert.equal(context.joins.length, 46);
    assert.equal(context.bindings.length, 119);
    for (const join of context.joins)
      assert(
        context.bindings.some(b => b.expression === `${join.from}.${join.from_columns[0]}` && b.relationships.length >= 2),
        `Business relationship ${join.name} lacks a link mapping`,
      );
    const ontology = parse(billing[1].source);
    assert.equal(ontology.ontology.filter((c: any) => c.type === 'EntityType').length, 36);
    const db = new Database(':memory:');
    try {
      db.exec(await Bun.file('public/examples/billing/fixture.sql').text());
      const amounts: Record<string, Record<string, number>> = {
        plans: { Growth: 560, Enterprise: 1350, Usage: 100, unmatched: 80 },
        product_families: { Platform: 1910, Usage: 100, unmatched: 80 },
        currencies: { USD: 2090 },
      };
      const recurring: Record<string, Record<string, number>> = {
        plans: { Growth: 560, Enterprise: 1350, Usage: 0, unmatched: 80 },
        product_families: { Platform: 1910, Usage: 0, unmatched: 80 },
        currencies: { USD: 1990 },
      };
      const counts: Record<string, Record<string, number>> = {
        plans: { Growth: 3, Enterprise: 2, Usage: 2, unmatched: 1 },
        product_families: { Platform: 5, Usage: 2, unmatched: 1 },
        currencies: { USD: 6 },
      };
      for (const metric of ['net_revenue', 'recurring_revenue', 'invoice_count', 'revenue_per_invoice'])
        for (const dimension of [null, ['plans', 'tier'], ['product_families', 'name'], ['currencies', 'code']] as const) {
          const query = planQuery(context, {
            mappingId: context.mappingId,
            metrics: [metric],
            dimensions: dimension ? [JSON.stringify(dimension)] : [],
          });
          const rows = db.query(query.sql).all() as any[];
          const actual = Object.fromEntries(rows.map(r => [dimension ? (r.dimension_1 ?? 'unmatched') : 'total', r.metric_1]));
          let expected: Record<string, any>;
          if (dimension) {
            if (metric === 'net_revenue') {
              expected = amounts[dimension[0]];
            } else if (metric === 'recurring_revenue') {
              expected = recurring[dimension[0]];
            } else if (metric === 'invoice_count') {
              expected = counts[dimension[0]];
            } else {
              expected = Object.fromEntries(Object.entries(amounts[dimension[0]]).map(([k, n]) => [k, n / counts[dimension[0]][k]]));
            }
          } else {
            let total: number;
            if (metric === 'net_revenue') {
              total = 2090;
            } else if (metric === 'recurring_revenue') {
              total = 1990;
            } else if (metric === 'invoice_count') {
              total = 6;
            } else {
              total = 2090 / 6;
            }
            expected = { total };
          }
          assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
          for (const key of Object.keys(expected)) assert(Math.abs(actual[key] - expected[key]) < 1e-8, `${metric}/${dimension}: ${actual[key]} != ${expected[key]}`);
          plans.push(query);
          sqlExecutions.push({
            example: 'generated subscription billing',
            metric,
            dimension,
            result: actual,
          });
        }
      // Metrics added to the example are checked against totals worked out by hand from the eight
      // fixture invoice lines: discounts 190, tax 209, net revenue 2,090 plus discounts 2,280.
      const addedTotals: Record<string, number> = {
        discounts_given: 190,
        tax_billed: 209,
        gross_billings: 2280,
        recurring_share: 1990 / 2090,
      };
      for (const [metric, total] of Object.entries(addedTotals)) {
        // The mapping has no concept_mappings entry for these metrics, so the plan is made over
        // the whole semantic model.
        const query = planQuery(context, {
          mappingId: context.mappingId,
          scope: 'model',
          metrics: [metric],
          dimensions: [],
        });
        const [row] = db.query(query.sql).all() as any[];
        assert(Math.abs(row.metric_1 - total) < 1e-8, `${metric}: ${row.metric_1} != ${total}`);
        plans.push(query);
        sqlExecutions.push({
          example: 'generated subscription billing',
          metric,
          dimension: null,
          result: { total: row.metric_1 },
        });
      }
      const mixed = planQuery(context, {
        mappingId: context.mappingId,
        metrics: ['net_revenue', 'invoice_count', 'revenue_per_invoice'],
        dimensions: ['["plans","tier"]'],
      });
      const mixedRows = db.query(mixed.sql).all() as any[];
      assert.equal(mixedRows.find(r => r.dimension_1 === 'Growth').metric_1, 560);
      assert.equal(mixedRows.find(r => r.dimension_1 === 'Growth').metric_2, 3);
      assert.equal(
        mixedRows.reduce((sum, r) => sum + r.metric_2, 0),
        8,
      ); // Distinct counts are not additive across plans.
      sqlExecutions.push({
        example: 'generated subscription billing',
        metric: 'mixed revenue/count/ratio',
        dimension: ['plans', 'tier'],
        result: mixedRows,
      });
      plans.push(mixed);
      const twoDimensions = planQuery(context, {
        mappingId: context.mappingId,
        metrics: ['net_revenue'],
        dimensions: ['["plans","tier"]', '["product_families","name"]'],
      });
      const twoRows = db.query(twoDimensions.sql).all() as any[];
      assert.equal(
        twoRows.reduce((sum, r) => sum + r.metric_1, 0),
        2090,
      );
      sqlExecutions.push({
        example: 'generated subscription billing',
        metric: 'net_revenue',
        dimension: ['plan tier', 'product family'],
        result: twoRows,
      });
      plans.push(twoDimensions);
      // Billed-account/billing-cycle and subscribed-account/billing-cycle routes represent
      // different roles. A shortest path must not choose their meaning.
      assert.throws(
        () =>
          planQuery(context, {
            mappingId: context.mappingId,
            metrics: ['net_revenue'],
            dimensions: ['["billing_cycles","name"]'],
          }),
        /Ambiguous join paths/,
      );
    } finally {
      db.close();
    }
    const mall = await checkMall();
    return {
      upstreamCommit: manifest.commit,
      imports,
      generated: {
        businessEntities: 36,
        datasets: 36,
        joins: 46,
        bindings: 119,
        governedMetrics: 8,
      },
      shoppingCenter: {
        counts: mall.counts,
        imports: mall.imports,
        sqlExecutions: mall.executions,
        blockedCases: mall.blockedCases,
      },
      sqlExecutions,
      blockedCases: ['Flights conditional population mapping needs explicit interpretation', 'BillingCycle has billed-cycle and subscribed-cycle paths; no role was guessed'],
      governedDefinitionsUnchanged: true,
      plans: plans.map(plan => ({
        sql: plan.sql,
        metrics: plan.metrics,
        dimensions: plan.dimensions,
        joins: plan.joins.map((j: any) => j.name),
        documents: plan.documents,
      })),
    };
  } finally {
    workspace.dispose();
  }
}
