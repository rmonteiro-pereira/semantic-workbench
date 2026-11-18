// Tests that with Traffic off a graph card renders exactly what it rendered before, and that
// Traffic only adds absolutely positioned marks to it.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Position, ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RelationshipEdge } from '../src/app/graph/RelationshipEdge';
import { EntityNode } from '../src/app/graph/FullGraphNodes';
import { TrafficStoreProvider } from '../src/app/usage/use-usage';
import { answerWith, itemOf, storeWith } from './helpers/traffic-store';

// A fixed card: the baseline was rendered from the code before Traffic existed.
const props: any = {
  id: 'a',
  data: { name: 'Customer', color: 'var(--c)', address: 'sw1:#model:Sales/metric:revenue', kpis: ['m'], nameCap: 3 },
  type: 'entity',
  selected: false,
  dragging: false,
  zIndex: 0,
  isConnectable: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};
// The ids of the flow handles depend on how many flows were drawn before this one.
const withoutHandleIds = (html: string) => html.replace(/data-id="[^"]*"/g, 'data-id=""').trim();
const baseline = withoutHandleIds(readFileSync('tests/fixtures/usage/entity-node-baseline.html', 'utf8').replace('sw1:#ontology:O/concept:Customer', 'sw1:#model:Sales/metric:revenue'));

function card(store: Parameters<typeof TrafficStoreProvider>[0]['store']) {
  return withoutHandleIds(
    renderToStaticMarkup(
      <TrafficStoreProvider store={store}>
        <ReactFlowProvider>
          <EntityNode {...props} />
        </ReactFlowProvider>
      </TrafficStoreProvider>,
    ),
  );
}

describe('a graph card', () => {
  test('renders as before while Traffic is off', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/metric:revenue', 9)]), { on: false });
    expect(card(store)).toBe(baseline);
  });

  test('renders as before while Traffic is on but the item was never asked about', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/metric:other', 9)]));
    expect(card(store)).toBe(baseline);
  });

  test('gains only a ring, a bar and screen-reader text when Traffic is on and the item was asked about', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/metric:revenue', 9)]));
    const shaded = card(store);
    expect(shaded).toContain('traffic-ring');
    expect(shaded).toContain('9 requests through this workbench in the last 30 days');
    const stripped = shaded.replace(/<i class="traffic-marks"><i class="traffic-ring"[^>]*><\/i><i class="traffic-bar"[^>]*><\/i><i class="traffic-sr">[^<]*<\/i><\/i>/, '');
    expect(stripped).toBe(baseline);
  });

  test('its marks sit over the card and add nothing to its size', () => {
    const css = readFileSync('src/app/usage/usage.css', 'utf8');
    for (const selector of ['.traffic-ring', '.traffic-bar', '.traffic-sr']) {
      const rule = css.slice(css.indexOf(selector + ' {'));
      expect(rule.slice(0, rule.indexOf('}'))).toContain('position: absolute');
    }
  });
});

test('a plain neighborhood edge renders without consulting the Traffic store', async () => {
  const { store } = await storeWith(async () => answerWith([]), { on: false });
  const rejectingStore = {
    ...store,
    getSnapshot: () => {
      throw new Error('plain edge read Traffic');
    },
  };
  const edge = renderToStaticMarkup(
    <TrafficStoreProvider store={rejectingStore}>
      <ReactFlowProvider>
        <RelationshipEdge id="relationship" source="a" target="b" sourceX={0} sourceY={0} targetX={100} targetY={50} sourcePosition={Position.Right} targetPosition={Position.Left} />
      </ReactFlowProvider>
    </TrafficStoreProvider>,
  );
  expect(edge).toContain('react-flow__edge-path');
});
