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
  const s = { ...set, id: set.id ?? `x${++counter}` } as ExpansionSet;
  registry.set(s.id, s);
  return s;
}
/** Looks up a recorded expansion by identifier. */
export const getSet = (id: string) => registry.get(id);
/** Resolves expansion identifiers in order, ignoring missing entries. */
export const setsOf = (ids: string[]) => ids.map(getSet).filter((s): s is ExpansionSet => !!s);
// The canvas: base nodes (the centre's view, never removed) and every node of the sets still in
// force. A set whose origin is no longer on the canvas (its expansion was collapsed) goes with it.
/** Replays expansions and collapses while retaining base and shared reachable nodes. */
export function canvasOf(
  base: string[],
  sets: ExpansionSet[],
): { nodes: string[]; active: ExpansionSet[]; expandedBy: Map<string, string> } {
  let active: ExpansionSet[] = [];
  for (const s of sets) {
    if (s.kind === 'collapse') active = active.filter(a => a.id !== s.target);
    else active.push(s);
  }
  const baseSet = new Set(base);
  for (let changed = true; changed;) {
    changed = false;
    for (const s of active) {
      const reachable =
        baseSet.has(s.from) || active.some(o => o !== s && o.nodes.includes(s.from));
      if (!reachable) {
        active = active.filter(a => a !== s);
        changed = true;
        break;
      }
    }
  }
  const nodes = [...base];
  const seen = new Set(base);
  for (const s of active)
    for (const n of [s.from, ...s.nodes])
      if (!seen.has(n)) {
        seen.add(n);
        nodes.push(n);
      }
  const expandedBy = new Map<string, string>();
  for (const s of active) if (s.kind === 'expand') expandedBy.set(s.from, s.id);
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
export function neighbours(
  edges: Link[],
  node: string,
  direction: Direction,
  name: (id: string) => string = id => id,
  relationship?: string,
) {
  const found = new Map<string, { label: string; edges: string[] }>();
  for (const e of edges) {
    if (relationship && e.label !== relationship) continue;
    const other =
      direction !== 'in' && e.source === node
        ? e.target
        : direction !== 'out' && e.target === node
          ? e.source
          : null;
    if (other === null || other === node) continue;
    const f = found.get(other);
    if (f) {
      f.edges.push(e.id);
      if (e.label < f.label) f.label = e.label;
    } else found.set(other, { label: e.label, edges: [e.id] });
  }
  const nodes = [...found].sort(
    (a, b) =>
      a[1].label.localeCompare(b[1].label) ||
      name(a[0]).localeCompare(name(b[0])) ||
      a[0].localeCompare(b[0]),
  );
  return { nodes: nodes.map(([id]) => id), edges: nodes.flatMap(([, f]) => f.edges) };
}
