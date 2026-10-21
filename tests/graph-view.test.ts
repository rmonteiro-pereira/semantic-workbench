import { test, expect } from 'bun:test';
import {
  graphView,
  groupRelationships,
  neighborhood,
  projectModel,
  searchEntities,
  defaultCenter,
  NEIGHBOR_PAGE,
} from '../src/graph-view';
import { layoutGraph } from '../src/layout';
// Neighborhood projection (FR-034–FR-039; baseline defects 1–4).
const nodes = Array.from({ length: 30 }, (_, i) => ({
  id: String(i),
  name: `Entity ${i}`,
  kind: 'Entity',
  description: '',
  fields: [],
  path: [],
}));
const edge = (
  source: string,
  target: string,
  id = source + '-' + target,
  label = id,
  kind = 'relationship',
) => ({ id, source, target, label, data: { path: [], kind, definition: {} } });
test('relationships among visible neighbors are kept around a center, and can be hidden (defect 1)', () => {
  const edges = [edge('0', '1'), edge('0', '2'), edge('1', '2'), edge('3', '4')];
  const on = neighborhood(nodes, edges, { center: '0' });
  expect(on.edges.map(e => e.id).sort()).toEqual(['0-1', '0-2', '1-2']);
  expect(on.lateral).toBe(1);
  const off = neighborhood(nodes, edges, { center: '0', lateral: false });
  expect(off.edges.map(e => e.id).sort()).toEqual(['0-1', '0-2']);
  expect(off.lateral).toBe(1);
  // A small model with a center keeps the same links as without one.
  expect(
    neighborhood(nodes.slice(0, 3), edges, { center: '1' })
      .edges.map(e => e.id)
      .sort(),
  ).toEqual(['0-1', '0-2', '1-2']);
});
test('shown and hidden neighbor counts; deterministic ranking by relationship kind then name; paging and keep (defect 2)', () => {
  const edges = nodes
    .slice(1)
    .map(n => edge('0', n.id, '0-' + n.id, 'has', Number(n.id) % 2 ? 'b-kind' : 'a-kind'));
  const n = neighborhood(nodes, edges, { center: '0' });
  expect(n.total).toBe(29);
  expect(n.shown).toBe(NEIGHBOR_PAGE);
  expect(n.hidden).toBe(29 - NEIGHBOR_PAGE);
  expect(n.entities.slice(1).map(e => e.id)).toEqual([
    '10',
    '12',
    '14',
    '16',
    '18',
    '2',
    '20',
    '22',
    '24',
    '26',
    '28',
    '4',
  ]);
  expect(
    neighborhood(nodes, [...edges].reverse(), { center: '0' }).entities.map(e => e.id),
  ).toEqual(n.entities.map(e => e.id));
  expect(neighborhood(nodes, edges, { center: '0', limit: 24 }).hidden).toBe(5);
  expect(
    neighborhood(nodes, edges, { center: '0', keep: ['29'] }).entities.map(e => e.id),
  ).toContain('29');
  const filtered = neighborhood(nodes, [...edges, edge('0', '1', 'x', 'owns')], {
    center: '0',
    relationship: 'owns',
  });
  expect(filtered.total).toBe(1);
  expect(filtered.relationships[0]).toEqual({ label: 'has', count: 29 });
});
test('incoming, outgoing and two-way neighbors are told apart', () => {
  const n = neighborhood(
    nodes,
    [edge('1', '0'), edge('0', '2'), edge('0', '3'), edge('3', '0'), edge('0', '0')],
    { center: '0' },
  );
  expect(n.incoming).toEqual(['1']);
  expect(n.outgoing).toEqual(['2']);
  expect(n.both).toEqual(['3']);
  expect(n.edges.some(e => e.id === '0-0')).toBe(true);
});
test('the OWL projection is the same with or without a center; technical resources only on request (defect 3)', () => {
  const rdf = [
    { ...nodes[0], kind: 'OWL class' },
    { ...nodes[1], kind: 'OWL property' },
    { ...nodes[2], kind: 'RDF resource' },
    { ...nodes[3], kind: 'OWL class' },
  ];
  const edges = [edge('1', '0'), edge('1', '2'), edge('0', '3')];
  expect(projectModel(rdf, edges).entities.map(n => n.id)).toEqual(['0', '3']);
  expect(projectModel(rdf, edges).technicalHidden).toBe(2);
  expect(neighborhood(rdf, edges, { center: '0' }).entities.map(n => n.id)).toEqual(['0', '3']);
  expect(neighborhood(rdf, edges, { center: '1' }).center).not.toBe('1');
  expect(
    neighborhood(rdf, edges, { center: '1', technical: true }).entities.map(n => n.id),
  ).toEqual(['1', '0', '2']);
  expect(graphView(rdf, edges, '').entities.map(n => n.id)).toEqual(
    graphView(rdf, edges, '', false, 8, '0').entities.map(n => n.id),
  );
});
test('search ranks exact name matches first, then prefixes, words and substrings (defect 4)', () => {
  const named = ['OrderLine', 'Order', 'PurchaseOrder', 'Reorder', 'Orders', 'Customer'].map(
    (name, i) => ({ ...nodes[i], id: 'n' + i, name }),
  );
  expect(searchEntities(named, 'order').map(e => e.name)).toEqual([
    'Order',
    'Orders',
    'OrderLine',
    'PurchaseOrder',
    'Reorder',
  ]);
  expect(searchEntities(named, 'ORDER')[0].name).toBe('Order');
  expect(searchEntities(named, 'missing')).toEqual([]);
  expect(graphView(named, [], 'order').focus).toBe('n1');
});
test('default center is the most connected entity, passing over value-type hubs', () => {
  const typed = [
    { ...nodes[0], kind: 'ValueType' },
    { ...nodes[1], kind: 'EntityType' },
    { ...nodes[2], kind: 'EntityType' },
    { ...nodes[3], kind: 'EntityType' },
  ];
  expect(
    defaultCenter(typed, [
      edge('1', '0'),
      edge('2', '0'),
      edge('3', '0'),
      edge('2', '3'),
      edge('1', '2'),
    ]),
  ).toBe('2');
});
test('parallel links group without losing definitions or direction', () => {
  const g = groupRelationships([
    edge('a', 'b', 'first'),
    edge('a', 'b', 'second'),
    edge('b', 'a', 'reverse'),
  ]);
  expect(g).toHaveLength(2);
  expect(g[0].data.relationships.map(e => e.id)).toEqual(['first', 'second']);
  expect(g[1].source).toBe('b');
});
test('wrapped layout positions never overlap and broad layers stay short', () => {
  const ids = nodes.map(e => e.id);
  const layout = layoutGraph(
    ids,
    ids.slice(1).map(id => edge('0', id)),
  );
  expect(new Set(layout.map(n => `${n.position.x}/${n.position.y}`)).size).toBe(30);
  expect(Math.max(...layout.map(n => n.position.y))).toBeLessThanOrEqual(450);
});
test('isolated center stays visible; empty search shows nothing unrelated', () => {
  expect(neighborhood(nodes, [], { center: '29' }).entities.map(n => n.id)).toEqual(['29']);
  expect(graphView(nodes, [], 'not present').entities).toHaveLength(0);
});
