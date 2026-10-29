/** Traverses reachable graph nodes deterministically within a node budget. */
import type { Direction, Link } from './expansion';
// Traversal honors direction, relationship and visibility filters within a node budget.
// Breadth-first ties use relationship, name and ID order; each node appears once. Only discovery
// edges are drawn so dense relationships do not bury the result.
/** Supplies node identity, name and kind for filtered traversal. */
export type PierceNode = { id: string; name: string; kind: string };
/** Controls traversal direction, visibility filters and the node budget. */
export type PierceOptions = {
  direction: Direction;
  relationship?: string;
  valueTypes: boolean;
  technical: boolean;
  metrics: boolean;
  budget: number;
};
/** Reports reached nodes, discovery edges, distances and hidden frontier counts. */
export type PierceResult = {
  nodes: string[];
  edges: string[];
  steps: Record<string, number>;
  frontier: Record<string, number>;
  total: number;
  shown: number;
  hidden: number;
  maxStep: number;
};
export const PIERCE_BUDGET = 150;
export const PIERCE_MAX = 500;
const VALUE_KINDS = new Set(['ValueType', 'Built-in concept']);
// Technical resources as the Neighborhood projection reads them: in a model with OWL classes,
// everything that is not a class.
/** Identifies non-class resources when the model contains OWL classes. */
export function technicalIds(nodes: PierceNode[]) {
  return nodes.some(n => n.kind === 'OWL class') ? new Set(nodes.filter(n => n.kind !== 'OWL class').map(n => n.id)) : new Set<string>();
}
/** Traverses filtered relationships deterministically and limits visible nodes to the budget. */
export function boundedClosure(nodes: PierceNode[], edges: Link[], start: string[], pierceOptions: PierceOptions): PierceResult {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const technical = pierceOptions.technical ? new Set<string>() : technicalIds(nodes);
  const allowed = (id: string) => {
    const pierceNode = byId.get(id);
    if (!pierceNode) return false;
    if (!pierceOptions.valueTypes && VALUE_KINDS.has(pierceNode.kind)) return false;
    if (!pierceOptions.metrics && pierceNode.kind === 'Metric') return false;
    return !technical.has(id);
  };
  const adj = new Map<string, { to: string; label: string; edge: string }[]>();
  const add = (a: string, b: string, label: string, edge: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, label, edge });
  };
  for (const edge of edges) {
    if (pierceOptions.relationship && edge.label !== pierceOptions.relationship) continue;
    if (edge.source === edge.target) continue;
    if (pierceOptions.direction !== 'in') add(edge.source, edge.target, edge.label, edge.id);
    if (pierceOptions.direction !== 'out') add(edge.target, edge.source, edge.label, edge.id);
  }
  const name = (id: string) => byId.get(id)?.name ?? id;
  for (const list of adj.values()) list.sort((a, b) => a.label.localeCompare(b.label) || name(a.to).localeCompare(name(b.to)) || a.to.localeCompare(b.to));
  // Full closure, in order.
  const steps: Record<string, number> = {};
  const order: string[] = [];
  const via: Record<string, string> = {};
  let layer = [...new Set(start)].filter(id => byId.has(id)).sort((a, b) => name(a).localeCompare(name(b)) || a.localeCompare(b));
  for (const id of layer) {
    steps[id] = 0;
    order.push(id);
  }
  let step = 0;
  while (layer.length) {
    step++;
    const next: { id: string; label: string }[] = [];
    for (const id of layer)
      for (const link of adj.get(id) ?? [])
        if (steps[link.to] === undefined && allowed(link.to)) {
          steps[link.to] = step;
          via[link.to] = link.edge;
          next.push({ id: link.to, label: link.label });
        }
    next.sort((a, b) => a.label.localeCompare(b.label) || name(a.id).localeCompare(name(b.id)) || a.id.localeCompare(b.id));
    layer = next.map(n => n.id);
    order.push(...layer);
  }
  const budget = Math.max(1, Math.min(pierceOptions.budget, PIERCE_MAX));
  const shownList = order.slice(0, budget);
  const shown = new Set(shownList);
  const frontier: Record<string, number> = {};
  for (const id of shownList) {
    let count = 0;
    const seen = new Set<string>();
    for (const x of adj.get(id) ?? [])
      if (!shown.has(x.to) && steps[x.to] !== undefined && !seen.has(x.to)) {
        seen.add(x.to);
        count++;
      }
    if (count) frontier[id] = count;
  }
  // The lines drawn are the ones that reached each node (a tree): every shown node is connected to
  // the start, and the canvas is not buried under every relationship among 150 nodes.
  const edgeIds = shownList.filter(id => via[id]).map(id => via[id]);
  const shownSteps: Record<string, number> = {};
  for (const id of shownList) shownSteps[id] = steps[id];
  return {
    nodes: shownList,
    edges: edgeIds,
    steps: shownSteps,
    frontier,
    total: order.length,
    shown: shownList.length,
    hidden: order.length - shownList.length,
    maxStep: Math.max(0, ...shownList.map(id => steps[id])),
  };
}
