/** Records reversible graph expansions so navigation history can restore the exact canvas. */
// Each immutable expansion records all nodes it reaches, including shared nodes. Collapsing it
// removes only nodes no remaining expansion reaches. History stores expansion and collapse IDs so
// Back and Forward restore the exact canvas.
/** Selects incoming, outgoing or bidirectional graph traversal. */
export type Direction = 'out' | 'in' | 'both';
/** Records a reversible expansion, traversal or collapse and its reached nodes. */
export type ExpansionSet = {
  id: string;
  kind: 'expand' | 'pierce' | 'collapse';
  from: string;
  direction: Direction;
  relationship?: string;
  nodes: string[];
  edges: string[];
  frontier: Record<string, number>;
  total: number;
  budget: number;
  // Collapse: the set it removes; pierce: the step distance of each node from `from`
  target?: string;
  steps?: Record<string, number>;
};
const registry = new Map<string, ExpansionSet>();
let counter = 0;
/** Stores an expansion set under its supplied or generated identifier. */
export function registerSet(set: Omit<ExpansionSet, 'id'> & { id?: string }): ExpansionSet {
  const expansionSet = { ...set, id: set.id ?? `x${++counter}` } as ExpansionSet;
  registry.set(expansionSet.id, expansionSet);
  return expansionSet;
}
/** Looks up a recorded expansion by identifier. */
export const getSet = (id: string) => registry.get(id);
/** Resolves expansion identifiers in order, ignoring missing entries. */
export const setsOf = (ids: string[]) => ids.map(getSet).filter((s): s is ExpansionSet => !!s);
// The canvas: base nodes (the centre's view, never removed) and every node of the sets still in
// force. A set whose origin is no longer on the canvas (its expansion was collapsed) goes with it.
/** Replays expansions and collapses while retaining base and shared reachable nodes. */
export function canvasOf(base: string[], sets: ExpansionSet[]): { nodes: string[]; active: ExpansionSet[]; expandedBy: Map<string, string> } {
  let active: ExpansionSet[] = [];
  for (const expansionSet of sets) {
    if (expansionSet.kind === 'collapse') active = active.filter(a => a.id !== expansionSet.target);
    else active.push(expansionSet);
  }
  const baseSet = new Set(base);
  for (let changed = true; changed;) {
    changed = false;
    for (const expansionSet of active) {
      const reachable = baseSet.has(expansionSet.from) || active.some(o => o !== expansionSet && o.nodes.includes(expansionSet.from));
      if (!reachable) {
        active = active.filter(a => a !== expansionSet);
        changed = true;
        break;
      }
    }
  }
  const nodes = [...base];
  const seen = new Set(base);
  for (const expansionSet of active)
    for (const node of [expansionSet.from, ...expansionSet.nodes])
      if (!seen.has(node)) {
        seen.add(node);
        nodes.push(node);
      }
  const expandedBy = new Map<string, string>();
  for (const expansionSet of active) if (expansionSet.kind === 'expand') expandedBy.set(expansionSet.from, expansionSet.id);
  return { nodes, active, expandedBy };
}

/** Returns nodes an expansion introduces beyond the current canvas. */
export const addedBy = (current: Iterable<string>, set: ExpansionSet) => {
  const have = new Set(current);
  return set.nodes.filter(n => !have.has(n));
};
// One-hop neighbours of a node along the chosen direction, optionally one relationship label;
// deterministic: by relationship label, then name, then id.
/** Identifies the source and target nodes of an edge. */
export type Link = { id: string; source: string; target: string; label: string };
/** Returns one-hop neighbors ordered by relationship label, name and identifier. */
export function neighbours(edges: Link[], node: string, direction: Direction, name: (id: string) => string = id => id, relationship?: string) {
  const found = new Map<string, { label: string; edges: string[] }>();
  for (const edge of edges) {
    if (relationship && edge.label !== relationship) continue;
    let other: string | null;
    if (direction !== 'in' && edge.source === node) {
      other = edge.target;
    } else if (direction !== 'out' && edge.target === node) {
      other = edge.source;
    } else {
      other = null;
    }
    if (other === null || other === node) continue;
    const existing = found.get(other);
    if (existing) {
      existing.edges.push(edge.id);
      if (edge.label < existing.label) existing.label = edge.label;
    } else found.set(other, { label: edge.label, edges: [edge.id] });
  }
  const nodes = [...found].sort((a, b) => a[1].label.localeCompare(b[1].label) || name(a[0]).localeCompare(name(b[0])) || a[0].localeCompare(b[0]));
  return { nodes: nodes.map(([id]) => id), edges: nodes.flatMap(([, f]) => f.edges) };
}
