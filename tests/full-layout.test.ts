// Tests full graph placement and routing.
import { test, expect } from 'bun:test';
import ELK from 'elkjs/lib/elk-api.js';
import { layoutNetwork } from '../src/app/graph/network-layout';
import { cardNameFontSize } from '../src/app/graph/text-fit';
import { GROUP_HEADER_HEIGHT } from '../src/app/graph/overview-capacity';
import { layoutFullGraph, packNetwork, NETWORK_HEADER_HEIGHT, type FullLayoutResult } from '../src/app/graph/full-layout';
import { inspect, type Entity, type Relationship } from '../src/shared/core/model';
import { groupRelationships } from '../src/app/graph/graph-view';

function engine() {
  return new ELK({
    algorithms: ['layered', 'box', 'sporeOverlap'],
    workerFactory: () => new Worker(import.meta.resolve('elkjs/lib/elk-worker.min.js')),
  });
}

async function network(entities: Entity[], edges: Relationship[], name: string) {
  const elk = engine();
  try {
    return await packNetwork(layoutNetwork(entities, edges, name), elk);
  } finally {
    elk.terminateWorker();
  }
}

function checkGeometry(layout: FullLayoutResult, expectedNodeCount: number, headerHeight = GROUP_HEADER_HEIGHT) {
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const children = layout.nodes.filter(node => !node.group);
  expect(children).toHaveLength(expectedNodeCount);
  expect(new Set(children.map(node => node.id)).size).toBe(expectedNodeCount);
  for (const child of children) {
    const parent = byId.get(child.parentId!);
    if (!parent) throw new Error(`Missing parent for ${child.id}`);
    expect(child.x).toBeGreaterThanOrEqual(0);
    expect(child.y).toBeGreaterThanOrEqual(headerHeight);
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 0.01);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 0.01);
  }
  const absolute = children.map(node => ({
    ...node,
    x: node.x + byId.get(node.parentId!)!.x,
    y: node.y + byId.get(node.parentId!)!.y,
  }));
  const areas = layout.nodes.filter(node => node.group);
  for (let first = 0; first < areas.length; first++)
    for (let second = first + 1; second < areas.length; second++) {
      const a = areas[first];
      const b = areas[second];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  for (let first = 0; first < absolute.length; first++)
    for (let second = first + 1; second < absolute.length; second++) {
      const a = absolute[first];
      const b = absolute[second];
      expect(a.x < b.x + b.width - 0.01 && a.x + a.width > b.x + 0.01 && a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01).toBe(false);
    }
}

test('network retains every entity, whole names and nonoverlapping areas without replacing the relationships by a grid', async () => {
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const layout = await network(model.entities, model.edges, model.name);
  checkGeometry(layout, model.entities.length, NETWORK_HEADER_HEIGHT);
  expect(layout.relationshipCount).toBe(model.edges.length);
  for (const card of layout.nodes.filter(node => !node.group)) {
    const name = model.entities.find(entity => entity.id === card.id)!.name;
    expect(cardNameFontSize(name, card, 16), name).toBeGreaterThanOrEqual(15);
  }
  const organic = layout.nodes
    .filter(node => node.group)
    .some(group => {
      const members = layout.nodes.filter(node => node.parentId === group.id);
      return members.length >= 4 && new Set(members.map(node => Math.round(node.y))).size > Math.ceil(Math.sqrt(members.length));
    });
  expect(organic, 'entities should follow their connections, not uniform tile rows').toBe(true);
});

test('ELK compound layout retains groups and a route for every bundled connection', async () => {
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const elk = engine();
  try {
    const layout = await layoutFullGraph(model.entities, model.edges, { name: model.name, elk });
    checkGeometry(layout, model.entities.length);
    const connections = groupRelationships(model.edges);
    expect(Object.keys(layout.routes)).toHaveLength(connections.length);
    expect(Object.values(layout.routes).every(sections => sections.length > 0)).toBe(true);
    const nodes = new Map(layout.nodes.map(node => [node.id, node]));
    for (const connection of connections) {
      const source = nodes.get(connection.source)!;
      const target = nodes.get(connection.target)!;
      const sourceArea = nodes.get(source.parentId!)!;
      const targetArea = nodes.get(target.parentId!)!;
      const points = layout.routes[connection.id].flat();
      expect(points[0].x).toBeCloseTo(source.x + sourceArea.x + source.width, 2);
      expect(points[0].y).toBeCloseTo(source.y + sourceArea.y + source.height / 2, 2);
      expect(points.at(-1)!.x).toBeCloseTo(target.x + targetArea.x, 2);
      expect(points.at(-1)!.y).toBeCloseTo(target.y + targetArea.y + target.height / 2, 2);
    }
  } finally {
    elk.terminateWorker();
  }
}, 15000);

test('collapsed area cards keep the height needed for their name and expansion guidance', async () => {
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const entities = model.entities.slice(0, 2).map((entity, index) => ({ ...entity, definition: { collapsedArea: `group-${index}` } }));
  const layout = await network(entities, [], model.name);
  checkGeometry(layout, entities.length, NETWORK_HEADER_HEIGHT);
  for (const card of layout.nodes.filter(node => !node.group)) expect(card.height).toBeGreaterThanOrEqual(96);
});

test('an isolated entity has a finite packed layout', async () => {
  const model = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const layout = await network(model.entities.slice(0, 1), [], model.name);
  checkGeometry(layout, 1, NETWORK_HEADER_HEIGHT);
  expect(Number.isFinite(layout.width) && Number.isFinite(layout.height)).toBe(true);
});

test('an empty network remains valid without invoking the packing engine', async () => {
  const layout = await packNetwork(layoutNetwork([], [], 'Empty'), {
    layout: async () => {
      throw new Error('Empty models must not invoke ELK.');
    },
  });
  expect(layout.nodes).toEqual([]);
  expect(Number.isFinite(layout.width) && Number.isFinite(layout.height)).toBe(true);
});
