import { expect, test } from 'bun:test';
import type { RuntimeContext } from '../src/server/agent/runtime';
import { agentContextLines, boundFields, boundMetrics, conceptRows, conceptSummary, datasetRows, firstConceptToShow, layerCells, withDeclaredPrefix } from '../src/app/mappings/mapping-view';

const evidence = { documentId: 'a', filename: 'a.yaml', revision: 1, path: [] };

/** A small mapping: Order is bound to two fields and one metric, Customer to one field, Region to nothing. */
function context(): RuntimeContext {
  return {
    mappingId: 'shop.mapping.yaml',
    name: 'Shop mapping',
    documents: [
      { ...evidence, filename: 'shop.mapping.yaml' },
      { ...evidence, filename: 'shop.ontology.yaml' },
      { ...evidence, filename: 'shop.semantic.yaml' },
    ],
    ontology: { name: 'Shop ontology', description: 'Orders and customers.', prefixes: { shop: 'https://example.org/shop#' } },
    semanticModel: { name: 'Shop model' },
    concepts: [
      { concept: 'Order', iri: 'https://example.org/shop#Order', description: 'A purchase.', ai_context: { synonyms: ['Purchase'] } },
      { concept: 'Customer', description: 'Someone who buys.' },
      { concept: 'Region' },
      { concept: 'String', builtin: true },
    ],
    bindings: [
      { id: 'b1', concept: 'Order', rootConcept: 'Order', relationships: [], fields: ['o.id', 'o.total'], metrics: [], evidence },
      { id: 'b2', concept: 'Order', rootConcept: 'Order', relationships: [], fields: [], metrics: ['revenue'], evidence },
      { id: 'b3', concept: 'Customer', rootConcept: 'Customer', relationships: [], fields: ['c.id'], metrics: [], evidence },
    ],
    fields: [
      { id: 'o.id', dataset: 'orders', name: 'id' },
      { id: 'o.total', dataset: 'orders', name: 'total' },
      { id: 'c.id', dataset: 'customers', name: 'id' },
    ],
    metrics: [{ id: 'revenue', name: 'revenue', fields: ['o.total'], datasets: ['orders'], dependsOn: [] }],
    datasets: [{ name: 'orders' }, { name: 'customers' }],
    aiContext: [{ scope: 'concept:Order', value: 'Orders are net of refunds.', evidence }],
    findings: [],
    metricBindings: [],
    joins: [],
    mapping: {},
    policy: {},
  } as unknown as RuntimeContext;
}

test('the concept list counts bindings, hides unbound built-ins and follows the search text', () => {
  expect(conceptRows(context(), '')).toEqual([
    { concept: 'Order', bindings: 2 },
    { concept: 'Customer', bindings: 1 },
    { concept: 'Region', bindings: 0 },
  ]);
  expect(conceptRows(context(), 'purchase').map(row => row.concept)).toEqual(['Order']);
  expect(conceptRows(context(), 'buys').map(row => row.concept)).toEqual(['Customer']);
});

test('the tab opens on the first bound concept, or on All concepts when nothing is bound', () => {
  expect(firstConceptToShow(conceptRows(context(), ''))).toBe('Order');
  expect(firstConceptToShow([{ concept: 'Region', bindings: 0 }])).toBe('');
});

test('the layer strip names each layer with its count and file', () => {
  const cells = layerCells(context(), ['shop.odcs.yaml']);
  expect(cells.map(cell => cell.layer)).toEqual(['Ontology', 'Mapping', 'Semantic model', 'Physical sources']);
  expect(cells[0]).toMatchObject({ name: 'Shop ontology', count: '3 concepts', file: 'shop.ontology.yaml' });
  expect(cells[1]).toMatchObject({ name: '3 bindings', file: 'shop.mapping.yaml' });
  expect(cells[2]).toMatchObject({ name: 'Shop model', file: 'shop.semantic.yaml' });
  expect(cells[3]).toMatchObject({ name: '2 datasets', file: 'shop.odcs.yaml' });
});

test('a concept shows its definition and its IRI with the ontology prefix', () => {
  expect(conceptSummary(context(), 'Order')).toEqual({ name: 'Order', subtitle: 'Concept · shop:Order', definition: 'A purchase.' });
  expect(conceptSummary(context(), 'Region').definition).toBe('The ontology gives this concept no definition.');
  expect(conceptSummary(context(), '').name).toBe('All concepts');
  expect(withDeclaredPrefix('https://other.org/x', { shop: 'https://example.org/shop#' })).toBe('https://other.org/x');
});

test('where a concept lives lists the datasets of its fields and of its bound metrics', () => {
  expect(datasetRows(context(), '')).toEqual([
    { dataset: 'orders', fields: ['id', 'total'] },
    { dataset: 'customers', fields: ['id'] },
  ]);
});

test('a metric counts as bound when a binding names it or a metric binding points at the concept', () => {
  expect(boundMetrics(context(), 'Order').map(metric => metric.name)).toEqual(['revenue']);
  const direct = { ...context(), bindings: [], metricBindings: [{ metric: 'revenue', measures: { concept: 'Order' }, findings: [], evidence }] } as unknown as RuntimeContext;
  expect(boundMetrics(direct, 'Order').map(metric => metric.name)).toEqual(['revenue']);
  expect(boundMetrics(direct, 'Customer')).toEqual([]);
  const unbound = { ...context(), bindings: [], metricBindings: [] } as unknown as RuntimeContext;
  expect(boundMetrics(unbound, '')).toEqual([]);
  expect(datasetRows(unbound, '')).toEqual([]);
});

test('the AI context lines describe what the agent API returned', () => {
  const lines = agentContextLines(context(), 'Order');
  expect(lines.map(line => line.label)).toEqual(['Concept', 'Datasets', 'Metrics', 'Notes']);
  expect(lines[0]!.text).toBe('Order, with its definition and synonyms');
  expect(lines[1]!.text).toBe('2 datasets, each with its fields and keys');
  expect(lines[2]!.text).toBe('1 governed metric with its formula');
  expect(lines[3]!.text).toBe('1 ai_context note written in the files');
  const bare = { ...context(), metrics: [], bindings: [], aiContext: [] } as unknown as RuntimeContext;
  expect(
    agentContextLines(bare, 'Order')
      .map(line => line.text)
      .slice(1),
  ).toEqual(['No datasets are bound', 'No governed metrics', 'No ai_context written in the files']);
});

test('a query can use the fields of the bindings and of the bound metrics, and nothing else', () => {
  expect(boundFields(context(), 'Order').map(field => field.id)).toEqual(['o.id', 'o.total', 'c.id']);
  const unbound = { ...context(), bindings: [], metricBindings: [] } as unknown as RuntimeContext;
  expect(boundFields(unbound, '')).toEqual([]);
});
