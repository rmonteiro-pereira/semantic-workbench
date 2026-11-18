// Tests which items a counted answer concerns and how each is named.
import { describe, expect, test } from 'bun:test';
import { MAX_ITEMS_PER_REQUEST, answerProject, itemAddresses } from '../../src/server/usage/usage-items';
import { MAPPING_ID, PROJECT, SEMANTIC_PATH, commerceDocuments, contextAnswer, explainAnswer, modelsOf, planAnswer } from './commerce-answers';

const ontology = `sw1:${PROJECT}/commerce.mapped-ontology.yaml#ontology:Mapped%20commerce%20ontology`;
const model = `sw1:${PROJECT}/${SEMANTIC_PATH}#model:Mapped%20commerce%20semantic%20model`;
const documents = await commerceDocuments();
const models = modelsOf(documents);

describe('context items', () => {
  const addresses = itemAddresses('context-items', { answer: contextAnswer(documents), models, target: {} });

  test('names the mapping, ontology, semantic model, bound concepts and relationships, datasets, fields and metrics', () => {
    expect(addresses).toEqual(
      [
        `sw1:${PROJECT}/commerce.mapping.yaml#mapping:Commerce%20ontology%20mapping`,
        ontology,
        `${ontology}/concept:Customer`,
        `${ontology}/concept:Customer/relationship:id`,
        `${ontology}/concept:Customer/relationship:region`,
        `${ontology}/concept:Identifier`,
        `${ontology}/concept:Money`,
        `${ontology}/concept:Order`,
        `${ontology}/concept:Order/relationship:amount`,
        `${ontology}/concept:Order/relationship:customer`,
        `${ontology}/concept:Order/relationship:id`,
        `${ontology}/concept:OrderCount`,
        `${ontology}/concept:Region`,
        `${ontology}/concept:Revenue`,
        model,
        `${model}/dataset:customers`,
        `${model}/dataset:customers/field:customer_id`,
        `${model}/dataset:customers/field:region`,
        `${model}/dataset:orders`,
        `${model}/dataset:orders/field:amount`,
        `${model}/dataset:orders/field:customer_id`,
        `${model}/dataset:orders/field:order_id`,
        `${model}/metric:active_customers`,
        `${model}/metric:average_order_value`,
        `${model}/metric:gross_revenue`,
        `${model}/metric:order_count`,
      ].sort(),
    );
  });

  test('is sorted and holds no duplicate even when the answer names an item twice', () => {
    const answer = contextAnswer(documents);
    answer.fields.push(answer.fields[0]);
    answer.metrics.push(answer.metrics[0]);
    answer.bindings.push(answer.bindings[0]);
    const again = itemAddresses('context-items', { answer, models, target: {} });
    expect(again).toEqual(addresses);
    expect(again).toEqual([...again].sort());
  });

  test('skips a concept the ontology does not declare', () => {
    const answer = contextAnswer(documents);
    answer.bindings = [{ concept: 'BuiltIn', rootConcept: 'BuiltIn', relationships: [] }];
    const found = itemAddresses('context-items', { answer, models, target: {} });
    expect(found.some(address => address.includes('concept:BuiltIn'))).toBe(false);
    expect(found.some(address => address.includes('concept:Customer'))).toBe(false);
  });
});

describe('plan items', () => {
  test('names the resolved metric, the dimension field and the datasets of the plan', () => {
    const found = itemAddresses('plan-items', { answer: planAnswer(documents), models, target: {} });
    expect(found).toContain(`${model}/metric:gross_revenue`);
    expect(found).toContain(`${model}/dataset:customers/field:region`);
    expect(found).toContain(`${model}/dataset:customers`);
    expect(found).toContain(`${model}/dataset:orders`);
    expect(found).not.toContain(`${model}/metric:order_count`);
  });
});

describe('metric items', () => {
  test('names the metric and the fields and dataset its explanation uses, from the route target', () => {
    const found = itemAddresses('metric', { answer: explainAnswer(documents), models, target: { project: PROJECT, path: SEMANTIC_PATH } });
    expect(found).toEqual([`${model}/dataset:orders`, `${model}/dataset:orders/field:amount`, `${model}/metric:gross_revenue`]);
  });

  test('names nothing without a route target or for a metric the file does not hold', () => {
    const answer = explainAnswer(documents);
    expect(itemAddresses('metric', { answer, models, target: {} })).toEqual([]);
    expect(itemAddresses('metric', { answer: { ...answer, kpi: { name: 'absent' } }, models, target: { project: PROJECT, path: SEMANTIC_PATH } })).toEqual([]);
  });
});

describe('bounds', () => {
  test('keeps the first items in address order when an answer names more than the cap', () => {
    const count = MAX_ITEMS_PER_REQUEST + 100;
    const metrics = Array.from({ length: count }, (_, index) => ({ name: `metric_${String(index).padStart(4, '0')}` }));
    const bulk = new Map([[`${PROJECT}/bulk.yaml`, { semantic_model: [{ name: 'bulk', datasets: [], metrics }] }]]);
    const answer = {
      mappingId: MAPPING_ID,
      documents: [],
      metrics: metrics.map((_, index) => ({ evidence: { documentId: `${PROJECT}/bulk.yaml`, path: ['semantic_model', 0, 'metrics', index] } })),
    };
    const found = itemAddresses('plan-items', { answer, models: bulk, target: {} });
    expect(found).toHaveLength(MAX_ITEMS_PER_REQUEST);
    expect(found).toEqual([...found].sort());
    expect(found[0]).toContain('metric:metric_0000');
    expect(found.at(-1)).toContain('metric:metric_0499');
  });

  test('skips an item with no stable name', () => {
    const unnamed = new Map([[`${PROJECT}/loose.yaml`, { semantic_model: [{ datasets: [], metrics: [{ expression: {} }] }] }]]);
    const answer = { mappingId: MAPPING_ID, documents: [], metrics: [{ evidence: { documentId: `${PROJECT}/loose.yaml`, path: ['semantic_model', 0, 'metrics', 0] } }] };
    expect(itemAddresses('plan-items', { answer, models: unnamed, target: {} })).toEqual([]);
  });

  test('names nothing for an answer without a project or for another project than the answer names', () => {
    expect(itemAddresses('context-items', { answer: {}, models, target: {} })).toEqual([]);
    expect(answerProject('plan-items', { mappingId: 'no-slash' }, {})).toBeUndefined();
    expect(answerProject('plan-items', { mappingId: 'a/b.yaml#x' }, {})).toBe('a');
    expect(answerProject('metric', {}, { project: 'p' })).toBe('p');
  });
});
