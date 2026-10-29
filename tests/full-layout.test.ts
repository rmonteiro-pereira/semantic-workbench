// Tests full graph placement and routing.
import { test, expect } from 'bun:test';
import ELK from 'elkjs/lib/elk-api.js';
import { layoutNetwork } from '../src/app/graph/network-layout';
import { layoutFullGraph, packNetwork } from '../src/app/graph/full-layout';
import { inspect } from '../src/shared/core/model';
import { groupRelationships } from '../src/app/graph/graph-view';
function engine() {
  return new ELK({
    algorithms: ['layered', 'sporeOverlap', 'box'],
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
    expect(child.y).toBeGreaterThanOrEqual(136);
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 0.01);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 0.01);
  }
  const absolute = children.map((node: any) => ({
    ...node,
    x: node.x + byId.get(node.parentId).x,
    y: node.y + byId.get(node.parentId).y,
  }));
  for (let i = 0; i < absolute.length; i++)
    for (let j = i + 1; j < absolute.length; j++) {
      const nodeA = absolute[i];
      const nodeB = absolute[j];
      const overlap = nodeA.x < nodeB.x + nodeB.width - 0.01 && nodeA.x + nodeA.width > nodeB.x + 0.01 && nodeA.y < nodeB.y + nodeB.height - 0.01 && nodeA.y + nodeA.height > nodeB.y + 0.01;
      expect(overlap).toBe(false);
    }
}
test('fCoSE + ELK overlap removal keeps all 45 entities and zero overlaps', async () => {
  const inspection = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const elk = engine();
  try {
    for (let i = 0; i < 2; i++) {
      const layout = await packNetwork(layoutNetwork(inspection.entities, inspection.edges, inspection.name), elk);
      checkGeometry(layout, 45);
      expect(layout.relationshipCount).toBe(277);
    }
  } finally {
    elk.terminateWorker();
  }
}, 20000);
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
