import { expect, test } from 'bun:test';
import { unpublishedEdge } from '../../src/app/graph/edge-styles';
import { groupRelationships } from '../../src/app/graph/graph-view';

test('changed relationships retain their labels even when ordinary labels are off', () => {
  const style = { strokeOpacity: 0.4 };
  for (const state of ['added', 'changed', 'removed'] as const) {
    expect(unpublishedEdge(undefined, 'Owns', style, state)).toEqual({
      label: `Owns · Not published: ${state}`,
      style: { strokeOpacity: 1, stroke: 'var(--color-text-muted)', strokeDasharray: '5 4' },
    });
  }
  expect(unpublishedEdge(undefined, 'Owns', style)).toEqual({ label: undefined, style });
});

test('parallel relationships with different marks stay distinguishable', () => {
  const ordinary = { id: 'one', label: 'Owns', source: 'a', target: 'b', data: { path: [], definition: null, kind: 'Relationship' } };
  const removed = { ...ordinary, id: 'two', data: { ...ordinary.data, change: 'removed' } };
  expect(groupRelationships([ordinary, removed]).map(edge => edge.id)).toEqual(['one', 'two']);
});
