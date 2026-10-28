import { expect, test } from 'bun:test';
import { Position } from '@xyflow/react';
import { edgeAppearance } from '../src/app/graph/edge-styles';

test('SVG appearance keeps markers and labels but excludes graph internals', () => {
  const props = {
    id: 'orders-customers',
    source: 'orders',
    target: 'customers',
    sourceX: 10,
    sourceY: 20,
    targetX: 100,
    targetY: 200,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    sourceHandleId: 'customer-id:out',
    targetHandleId: 'id:in',
    selected: true,
    selectable: true,
    deletable: true,
    label: 'Customer',
    markerEnd: 'url(#arrow)',
    style: { strokeWidth: 2 },
    data: { routeDetailed: true },
  };
  const appearance = edgeAppearance(props);
  expect(appearance.id).toBe(props.id);
  expect(appearance.label).toBe(props.label);
  expect(appearance.markerEnd).toBe(props.markerEnd);
  expect(appearance.style).toEqual(props.style);
  for (const name of [
    'source',
    'target',
    'sourceX',
    'sourceY',
    'targetX',
    'targetY',
    'sourcePosition',
    'targetPosition',
    'sourceHandleId',
    'targetHandleId',
    'selectable',
    'deletable',
    'selected',
    'data',
  ]) {
    expect(appearance).not.toHaveProperty(name);
  }
});
