// Checks that every shipped example presents its governed metrics: the count, one metric of each
// kind, owners and statuses, resolved concept bindings, contract lineage, a SQL preview that is
// never executed, clean validation and untouched upstream files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { explainMetric, projectMetrics, type KpiSummary } from '../server/agent/explain';
import type { StoredDocument } from '../server/agent/runtime';
import { validateInput } from '../src/input';
import { EXAMPLE_SETS, type ExampleSet } from '../src/projects/examples';
import manifest from '../tests/fixtures/ossie-mapping/manifest.json';

/** Names the metrics a browser or test opens to see each kind of presentation. */
export type ExpectedExampleMetrics = {
  // The semantic model file that holds the metrics.
  file: string;
  count: number;
  simple: string;
  composed: { name: string; type: 'ratio' | 'derived' };
  // A metric broken down by a dimension that sits in another table, with the fewest joins the
  // preview must show.
  path: { name: string; dimension: string; joins: number };
};

/** The metrics each example set must show, written down independently of the example files. */
export const EXPECTED_EXAMPLE_METRICS: Record<string, ExpectedExampleMetrics> = {
  ubl: {
    file: 'ubl.semantic.yaml',
    count: 9,
    simple: 'invoiced_amount',
    composed: { name: 'average_invoiced_price', type: 'ratio' },
    path: { name: 'invoiced_amount', dimension: 'document_reference.id', joins: 2 },
  },
  commerce: {
    file: 'sales.ossie.yaml',
    count: 6,
    simple: 'gross_revenue',
    composed: { name: 'average_order_value', type: 'ratio' },
    path: { name: 'units_sold', dimension: 'customers.name', joins: 2 },
  },
  'mapped-commerce': {
    file: 'commerce.mapped-semantic.yaml',
    count: 4,
    simple: 'gross_revenue',
    composed: { name: 'average_order_value', type: 'ratio' },
    path: { name: 'gross_revenue', dimension: 'customers.region', joins: 1 },
  },
  flights: {
    file: 'flights.metrics.semantic.yaml',
    count: 7,
    simple: 'flight_count',
    composed: { name: 'delay_recovered', type: 'derived' },
    path: { name: 'total_distance', dimension: 'AIRPORT.name', joins: 2 },
  },
  billing: {
    file: 'billing.semantic.yaml',
    count: 8,
    simple: 'net_revenue',
    composed: { name: 'gross_billings', type: 'derived' },
    path: { name: 'net_revenue', dimension: 'product_families.name', joins: 4 },
  },
  mall: {
    file: 'mall.semantic.yaml',
    count: 25,
    simple: 'billed_amount',
    composed: { name: 'net_operating_income', type: 'derived' },
    path: { name: 'operating_revenue', dimension: 'properties.name', joins: 4 },
  },
};

/** Files added by the workbench to an example, each of which says so in its first line. */
export const WORKBENCH_ADDITIONS = [
  'billing/billing.odcs.yaml',
  'commerce/sales.mapping.yaml',
  'ubl/ubl.semantic-mapping.yaml',
  'ossie/flights.metrics.semantic.yaml',
  'ossie/flights.metrics.mapping.yaml',
  'ossie/flights.odcs.yaml',
];

const EXAMPLES_DIR = 'public/examples/';
const PROJECT = 'example';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

type ProjectDocument = StoredDocument & { path: string };

async function readSet(set: ExampleSet): Promise<ProjectDocument[]> {
  return Promise.all(
    set.files.map(async (filename, index) => ({
      id: `${set.id}/${filename}`,
      filename,
      path: filename,
      project: PROJECT,
      revision: index + 1,
      source: await Bun.file(`${EXAMPLES_DIR}${set.folder}/${filename}`).text(),
    })),
  );
}

// A file may only carry the coverage notes the validator prints for ontology and RDF formats;
// no error and no other warning is allowed.
function assertValidation(set: ExampleSet, documents: ProjectDocument[]) {
  for (const document of documents) {
    const result = validateInput(document.source, document.filename);
    const unexpected = result.issues.filter(issue => issue.code !== 'coverage');
    assert.deepEqual(unexpected, [], `${set.id}/${document.filename} has findings`);
  }
}

function assertGoverned(set: ExampleSet, metrics: KpiSummary[]) {
  for (const metric of metrics) {
    const label = `${set.id}/${metric.name}`;
    assert(metric.governed, `${label} has no workbench attributes`);
    assert(metric.owner, `${label} has no owner`);
    assert(metric.status, `${label} has no status`);
    assert.deepEqual(metric.findings, [], `${label} has metric findings`);
    assert(metric.concepts.length > 0, `${label} is bound to no concept`);
    for (const concept of metric.concepts) {
      assert.deepEqual(concept.problems, [], `${label} has an unresolved binding`);
      assert(concept.concept, `${label} binds ${concept.input}, which is not in the ontology`);
    }
  }
}

// Every metric explains itself with a SQL preview, and every input it reads is in a contract.
function assertExplained(documents: ProjectDocument[], metrics: KpiSummary[]) {
  const contractLinks: Record<string, number> = {};
  for (const metric of metrics) {
    const explanation = explainMetric(documents, PROJECT, metric.file, metric.name, {});
    const preview = explanation.sqlPreview;
    assert(!('refused' in preview), `${metric.name}: ${JSON.stringify(preview)}`);
    assert(preview.notExecuted, `${metric.name}: the preview must not execute`);
    for (const input of explanation.inputs)
      assert(
        input.fields.some(field => field.odcs.length > 0),
        `${metric.name}: input ${input.metric} reaches no contract column`,
      );
    contractLinks[metric.name] = explanation.inputs.flatMap(i =>
      i.fields.flatMap(f => f.odcs),
    ).length;
  }
  return contractLinks;
}

function assertPathMetric(documents: ProjectDocument[], expected: ExpectedExampleMetrics) {
  const { name, dimension, joins } = expected.path;
  const metric = projectMetrics(documents, PROJECT).find(m => m.name === name)!;
  assert(
    metric.extension?.dimensions?.includes(dimension),
    `${name} does not declare ${dimension}`,
  );
  const preview = explainMetric(documents, PROJECT, metric.file, name, {
    dimensions: [dimension],
  }).sqlPreview;
  assert(!('refused' in preview), `${name} by ${dimension}: ${JSON.stringify(preview)}`);
  assert(preview.joins.length >= joins, `${name} by ${dimension} joins ${preview.joins.length}`);
  return preview.joins;
}

function assertKinds(set: ExampleSet, metrics: KpiSummary[], expected: ExpectedExampleMetrics) {
  const byName = new Map(metrics.map(metric => [metric.name, metric]));
  assert.equal(byName.get(expected.simple)?.type, 'simple', `${set.id} simple metric`);
  assert.equal(
    byName.get(expected.composed.name)?.type,
    expected.composed.type,
    `${set.id} composed metric`,
  );
  const composed = byName.get(expected.composed.name)!;
  assert(composed.inputs.length > 0, `${composed.name} builds on no other metric`);
}

/** Checks one example set and returns what it shows, for the verification report. */
export async function checkExampleSetMetrics(setId: string, sets: ExampleSet[] = EXAMPLE_SETS) {
  const set = sets.find(candidate => candidate.id === setId)!;
  const expected = EXPECTED_EXAMPLE_METRICS[setId];
  const documents = await readSet(set);
  assertValidation(set, documents);
  const metrics = projectMetrics(documents, PROJECT);
  assert.equal(metrics.length, expected.count, `${setId} metric count`);
  assertGoverned(set, metrics);
  assertKinds(set, metrics, expected);
  const contractLinks = assertExplained(documents, metrics);
  const joins = assertPathMetric(documents, expected);
  return { set: setId, metrics: metrics.length, joins, contractLinks };
}

// The upstream Ossie files must still match the pinned hashes; the workbench's files must say
// they were added by the workbench.
async function assertUpstreamUntouched() {
  for (const file of manifest.files) {
    const source = await Bun.file(`${EXAMPLES_DIR}ossie/${file.filename}`).text();
    assert.equal(sha256(source), file.sha256, `Upstream example was edited: ${file.filename}`);
  }
  const upstreamNames = new Set(manifest.files.map(file => file.filename));
  for (const path of WORKBENCH_ADDITIONS) {
    assert(!upstreamNames.has(path.split('/')[1]), `${path} shadows an upstream file`);
    const firstLine = (await Bun.file(EXAMPLES_DIR + path).text()).split('\n')[0];
    assert(firstLine.startsWith('# Workbench addition'), `${path} does not label itself`);
  }
}

/** Checks every example set that ships metrics, and that upstream files stay unmodified. */
export async function checkExampleMetrics() {
  await assertUpstreamUntouched();
  const sets = [];
  for (const setId of Object.keys(EXPECTED_EXAMPLE_METRICS))
    sets.push(await checkExampleSetMetrics(setId));
  return sets;
}
