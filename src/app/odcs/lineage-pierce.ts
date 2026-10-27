/** Traverses upstream or downstream lineage in breadth-first order within a card budget. */
// Traversals start at a column or all columns of a card and stop at a card budget. Both directions
// means ancestors plus descendants, never siblings. The worker runs the same pure traversal used
// by the canvases.
/** Supplies lineage, starting nodes, direction and a traversal card budget. */
export type LineagePierceInput = {
  edges: [string, string][];
  owners: Record<string, string>;
  start: string[];
  direction: 'out' | 'in' | 'both';
  budget: number;
};
/** Reports reached cards and nodes with traversal coverage and distances. */
export type LineagePierceResult = {
  cards: string[];
  total: number;
  hidden: number;
  steps: Record<string, number>;
};
/** Traverses lineage ancestors or descendants within the card budget, excluding siblings. */
export function lineagePierce(i: LineagePierceInput): LineagePierceResult {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const [a, b] of i.edges) {
    (out.get(a) ?? out.set(a, []).get(a)!).push(b);
    (inn.get(b) ?? inn.set(b, []).get(b)!).push(a);
  }
  const owner = (n: string) => i.owners[n] ?? n;
  const cardStep = new Map<string, number>();
  const walk = (adj: Map<string, string[]>) => {
    const seen = new Map<string, number>(i.start.map(s => [s, 0]));
    const q = [...i.start];
    while (q.length) {
      const n = q.shift()!;
      const d = seen.get(n)!;
      for (const m of adj.get(n) ?? [])
        if (!seen.has(m)) {
          seen.set(m, d + 1);
          q.push(m);
        }
    }
    for (const [n, d] of seen) {
      const c = owner(n);
      cardStep.set(c, Math.min(cardStep.get(c) ?? Infinity, d));
    }
  };
  if (i.direction !== 'in') walk(out);
  if (i.direction !== 'out') walk(inn);
  const ordered = [...cardStep].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const cards = ordered.slice(0, Math.max(1, i.budget)).map(([c]) => c);
  return {
    cards,
    total: ordered.length,
    hidden: ordered.length - cards.length,
    steps: Object.fromEntries(ordered.slice(0, cards.length)),
  };
}
