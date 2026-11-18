// Tests the counts in the details panels: entity, relationship and field rows, in each state.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { inspect } from '../src/shared/core/model';
import { EntityDetails } from '../src/app/workspace/EntityDetails';
import { RelationshipDetails } from '../src/app/workspace/RelationshipDetails';
import { TrafficStoreProvider } from '../src/app/usage/use-usage';
import { createTrafficStore } from '../src/app/usage/traffic-store';
import { answerWith, fakeDeps, itemOf, storeWith } from './helpers/traffic-store';

// The project and file of the helper store are shop and sales.yaml; the model is named Sales.
const source = `
name: Sales
datasets:
  - name: orders
    source: db.orders
    fields:
      - { name: amount, expression: { dialects: [{ dialect: ANSI_SQL, expression: amount }] } }
metrics: []
`;
const ontology = `
name: Shop
ontology:
  - concept: Order
    relationships: [{ name: placedBy, roles: [{ concept: Customer }, { concept: Order }] }]
  - concept: Customer
`;
const noop = () => {};
const noTarget = () => null;

const semantic: any = inspect(source, 'sales.yaml');
const concepts: any = inspect(ontology, 'shop.yaml');

function entityMarkup(store: ReturnType<typeof createTrafficStore>, entity: any, model: any) {
  return renderToStaticMarkup(
    <TrafficStoreProvider store={store}>
      <EntityDetails
        entity={entity}
        showNeighborhood={noop}
        rdfTarget={noTarget}
        setRdfEditing={noop}
        setRdfDeleting={noop}
        entityTarget={noTarget}
        setEditing={noop}
        setAdding={noop}
        setDeleting={noop}
        setSource={noop}
        source=""
        current={null}
        relatedDocuments={[]}
        openDocument={() => true}
        model={model}
        setSelectedEdge={noop}
        setSelected={noop}
        setDefinition={noop}
      />
    </TrafficStoreProvider>,
  );
}

describe('an entity', () => {
  const dataset = semantic.entities.find((entity: any) => entity.kind === 'Dataset');

  test('shows its count with unit, period and split, and its field rows their own counts', async () => {
    const items = [itemOf('/dataset:orders', 12, { 'agent.context.read': 7, 'agent.plan': 5 }), itemOf('/dataset:orders/field:amount', 3)];
    const { store } = await storeWith(async () => answerWith(items));
    const html = entityMarkup(store, dataset, semantic);
    expect(html).toContain('12 requests through this workbench in the last 30 days');
    expect(html).toContain('7 context requests, 5 query plan requests');
    expect(html).toContain('3 requests through this workbench in the last 30 days');
  });

  test('shows no count of any kind while Traffic is off', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/dataset:orders', 12)]), { on: false });
    expect(entityMarkup(store, dataset, semantic)).not.toContain('requests through this workbench');
  });

  test('says no requests for an item nobody asked about', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/dataset:other', 1)]));
    expect(entityMarkup(store, dataset, semantic)).toContain('No requests through this workbench in the last 30 days');
  });

  test('shows nothing for a concept while loading or after a failure', async () => {
    const { deps } = fakeDeps(() => new Promise(() => {}));
    const loading = createTrafficStore(deps);
    await loading.attach({ project: 'shop', path: 'sales.yaml', modelName: 'Sales' });
    void loading.setOn(true);
    expect(entityMarkup(loading, dataset, semantic)).not.toContain('requests through this workbench');
    const { store: failed } = await storeWith(async () => {
      throw new Error('no');
    });
    expect(entityMarkup(failed, dataset, semantic)).not.toContain('requests through this workbench');
  });
});

describe('a relationship', () => {
  const relationship = concepts.edges.find((edge: any) => edge.data.kind === 'Ontology relationship');
  const markup = (store: ReturnType<typeof createTrafficStore>) =>
    renderToStaticMarkup(
      <TrafficStoreProvider store={store}>
        <RelationshipDetails
          activeGroup={undefined}
          selectedEdge=""
          setSelectedEdge={noop}
          relationship={relationship}
          relationshipTarget={noTarget}
          rdfEdgeTarget={noTarget}
          setRdfEditing={noop}
          source=""
          setEditing={noop}
          setDeleting={noop}
          model={concepts}
          setSource={noop}
          current={null}
          setDefinition={noop}
        />
      </TrafficStoreProvider>,
    );

  test('shows the count of the declared relationship', async () => {
    const { store } = await storeWith(async () => answerWith([{ ...itemOf('', 4), address: 'sw1:shop/sales.yaml#ontology:Shop/concept:Order/relationship:placedBy' }]));
    expect(markup(store)).toContain('4 requests through this workbench in the last 30 days');
  });

  test('shows nothing while Traffic is off', async () => {
    const { store } = await storeWith(async () => answerWith([]), { on: false });
    expect(markup(store)).not.toContain('requests through this workbench');
  });
});
