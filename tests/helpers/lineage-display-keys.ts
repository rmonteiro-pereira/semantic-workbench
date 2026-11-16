/** Keeps existing lineage behavior assertions independent of the identifier spelling. */
import { parseAddress } from '../../src/shared/core/item-address';
import type { LineageGraph } from '../../src/app/odcs/lineage';

/** Translates unambiguous fixture keys to their former spelling without changing graph content. */
export function lineageDisplayKeys(graph: LineageGraph): LineageGraph {
  const keys = new Map<string, string>();
  for (const card of graph.cards.values()) {
    const parsed = parseAddress(card.id);
    const segment = parsed.ok ? parsed.address.chain.at(-1) : undefined;
    const name = segment && 'name' in segment ? segment.name : card.label;
    const cardKey = card.kind === 'external' ? card.id : `${card.kind}:${card.file}#${card.kind === 'object' ? '' : '/'}${name}`;
    keys.set(card.id, cardKey);
    for (const column of card.columns) keys.set(column.id, `${cardKey}/${column.path}`);
  }
  if (new Set(keys.values()).size !== keys.size) throw new Error('Display keys are ambiguous; assert canonical addresses directly.');
  const key = (value: string) => keys.get(value) ?? value;
  return {
    ...graph,
    cards: new Map(
      [...graph.cards.values()].map(card => {
        const translated = { ...card, id: key(card.id), columns: card.columns.map(column => ({ ...column, id: key(column.id) })) };
        return [translated.id, translated];
      }),
    ),
    edges: graph.edges.map(edge => ({ ...edge, from: key(edge.from), to: key(edge.to), ...(edge.via ? { via: edge.via.map(key) } : {}) })),
  };
}
