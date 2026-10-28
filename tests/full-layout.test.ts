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
function checkGeometry(result: any, count: number) {
  const byId = new Map<string, any>(result.nodes.map((n: any) => [n.id, n]));
  const children = result.nodes.filter((n: any) => !n.group);
  expect(children).toHaveLength(count);
  expect(new Set(children.map((n: any) => n.id)).size).toBe(count);
  for (const child of children) {
    const parent = byId.get(child.parentId);
    expect(parent).toBeDefined();
    expect(child.x).toBeGreaterThanOrEqual(0);
    expect(child.y).toBeGreaterThanOrEqual(136);
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 0.01);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 0.01);
  }
  const absolute = children.map((n: any) => ({
    ...n,
    x: n.x + byId.get(n.parentId).x,
    y: n.y + byId.get(n.parentId).y,
  }));
  for (let i = 0; i < absolute.length; i++)
    for (let j = i + 1; j < absolute.length; j++) {
      const a = absolute[i];
      const b = absolute[j];
      const overlap =
        a.x < b.x + b.width - 0.01 &&
        a.x + a.width > b.x + 0.01 &&
        a.y < b.y + b.height - 0.01 &&
        a.y + a.height > b.y + 0.01;
      expect(overlap).toBe(false);
    }
}
test('fCoSE + ELK overlap removal keeps all 45 entities and zero overlaps', async () => {
  const m = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const elk = engine();
  try {
    for (let i = 0; i < 2; i++) {
      const result = await packNetwork(layoutNetwork(m.entities, m.edges, m.name), elk);
      checkGeometry(result, 45);
      expect(result.relationshipCount).toBe(277);
    }
  } finally {
    elk.terminateWorker();
  }
}, 20000);
test('ELK compound layout retains groups and a route for every bundled connection', async () => {
  const m = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const elk = engine();
  try {
    const result = await layoutFullGraph(m.entities, m.edges, m.name, elk);
    checkGeometry(result, 45);
    expect(Object.keys(result.routes)).toHaveLength(183);
    expect(Object.values(result.routes).every(sections => sections.length > 0)).toBe(true);
    const nodes = new Map(result.nodes.map(node => [node.id, node]));
    for (const connection of groupRelationships(m.edges)) {
      const source = nodes.get(connection.source)!;
      const target = nodes.get(connection.target)!;
      const sourceArea = nodes.get(source.parentId!)!;
      const targetArea = nodes.get(target.parentId!)!;
      const points = result.routes[connection.id].flat();
      expect(points[0].x).toBeCloseTo(source.x + sourceArea.x + source.width, 2);
      expect(points[0].y).toBeCloseTo(source.y + sourceArea.y + source.height / 2, 2);
      expect(points.at(-1)!.x).toBeCloseTo(target.x + targetArea.x, 2);
      expect(points.at(-1)!.y).toBeCloseTo(target.y + targetArea.y + target.height / 2, 2);
    }
  } finally {
    elk.terminateWorker();
  }
}, 15000);
