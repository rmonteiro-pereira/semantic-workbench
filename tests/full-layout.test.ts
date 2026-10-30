// Tests full graph placement and routing.
import { test, expect } from 'bun:test';
import ELK from 'elkjs/lib/elk-api.js';
import { layoutNetwork, packTiles } from '../src/app/graph/network-layout';
import { cardNameFontSize } from '../src/app/graph/text-fit';
import { GROUP_HEADER_HEIGHT } from '../src/app/graph/overview-capacity';
import { layoutFullGraph } from '../src/app/graph/full-layout';
import { inspect } from '../src/shared/core/model';
import { groupRelationships } from '../src/app/graph/graph-view';
function engine() {
  return new ELK({
    algorithms: ['layered', 'box'],
    workerFactory: () => new Worker(import.meta.resolve('elkjs/lib/elk-worker.min.js')),
  });
}
function checkGeometry(layout: any, expectedNodeCount: number) {
  const byId = new Map<string, any>(layout.nodes.map((n: any) => [n.id, n]));
  const children = layout.nodes.filter((n: any) => !n.group);
  expect(children).toHaveLength(expectedNodeCount);
  expect(new Set(children.map((n: any) => n.id)).size).toBe(expectedNodeCount);
  for (const child of children) {
    const parent = byId.get(child.parentId);
    expect(parent).toBeDefined();
    expect(child.x).toBeGreaterThanOrEqual(0);
    expect(child.y).toBeGreaterThanOrEqual(GROUP_HEADER_HEIGHT);
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 0.01);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 0.01);
  }
  const absolute = children.map((node: any) => ({
    ...node,
    x: node.x + byId.get(node.parentId).x,
    y: node.y + byId.get(node.parentId).y,
  }));
  const areas = layout.nodes.filter((n: any) => n.group);
  for (let i = 0; i < areas.length; i++)
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i];
      const b = areas[j];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  for (let i = 0; i < absolute.length; i++)
    for (let j = i + 1; j < absolute.length; j++) {
      const nodeA = absolute[i];
      const nodeB = absolute[j];
      const overlap = nodeA.x < nodeB.x + nodeB.width - 0.01 && nodeA.x + nodeA.width > nodeB.x + 0.01 && nodeA.y < nodeB.y + nodeB.height - 0.01 && nodeA.y + nodeA.height > nodeB.y + 0.01;
      expect(overlap).toBe(false);
    }
}
test('area tiles keep all 45 entities, fit whole names and never overlap', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const layout = layoutNetwork(inspection.entities, inspection.edges, inspection.name);
  checkGeometry(layout, 45);
  expect(layout.relationshipCount).toBe(277);
  expect(layout.width / layout.height).toBeGreaterThan(1.2);
  for (const card of layout.nodes.filter(node => !node.group)) {
    const name = inspection.entities.find(entity => entity.id === card.id)!.name;
    const fontPx = cardNameFontSize(name, card, 16);
    expect(fontPx, name).toBeGreaterThanOrEqual(15);
  }
});
test('packTiles puts every tile in its own place', () => {
  const sizes = [
    { width: 640, height: 320 },
    { width: 844, height: 396 },
    { width: 300, height: 244 },
    { width: 640, height: 320 },
    { width: 300, height: 244 },
  ];
  const { corners } = packTiles(sizes);
  for (let first = 0; first < sizes.length; first++)
    for (let second = first + 1; second < sizes.length; second++) {
      const apart =
        corners[first].x + sizes[first].width <= corners[second].x ||
        corners[second].x + sizes[second].width <= corners[first].x ||
        corners[first].y + sizes[first].height <= corners[second].y ||
        corners[second].y + sizes[second].height <= corners[first].y;
      expect(apart).toBe(true);
    }
});
test('ELK compound layout retains groups and a route for every bundled connection', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const elk = engine();
  try {
    const layout = await layoutFullGraph(inspection.entities, inspection.edges, { name: inspection.name, elk });
    checkGeometry(layout, 45);
    expect(Object.keys(layout.routes)).toHaveLength(183);
    expect(Object.values(layout.routes).every(sections => sections.length > 0)).toBe(true);
    const nodes = new Map(layout.nodes.map(node => [node.id, node]));
    for (const connection of groupRelationships(inspection.edges)) {
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
