/** Decides which cards the lineage canvas shows: the centre's reach, expansions, pierces, filters and collapsed groups. */
import { useMemo } from 'react';
import { around, aroundHops, cardOfNode, type LineageCard, type LineageGraph } from './lineage';
import { canvasOf, type ExpansionSet } from '../graph/expansion';

const GROUP_AT = 6;
const KIND_PLURAL: Record<string, string> = {
  object: 'tables',
  dataset: 'datasets',
  metric: 'metrics',
  external: 'references',
  concept: 'concepts',
};

type ReachInputs = {
  graph: LineageGraph;
  center: string;
  steps: number;
  sets: ExpansionSet[];
  mapping: boolean;
  showMetrics: boolean;
  showExternal: boolean;
  cardFilter?: (card: LineageCard) => boolean;
  selected: string;
  openGroups: Set<string>;
};

type GroupingContext = {
  graph: LineageGraph;
  cards: Set<string>;
  center: string;
  expandedBy: Map<string, string>;
  incremental: Set<string>;
  openGroups: Set<string>;
};

// Large groups of same-kind leaf cards collapse into a count card to keep the view readable.
// The group card replaces its members in `cards`; `alias` maps each member to its group.
function collapseLeafGroups({ graph, cards, center, expandedBy, incremental, openGroups }: GroupingContext) {
  const groups = new Map<string, LineageCard>();
  const alias = new Map<string, string>();
  const near = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const fromCard = cardOfNode(graph, edge.from);
    const toCard = cardOfNode(graph, edge.to);
    if (fromCard === toCard || !cards.has(fromCard) || !cards.has(toCard) || incremental.has(fromCard) || incremental.has(toCard)) continue;
    (near.get(fromCard) ?? near.set(fromCard, new Set()).get(fromCard)!).add(toCard);
    (near.get(toCard) ?? near.set(toCard, new Set()).get(toCard)!).add(fromCard);
  }
  const leaves = new Map<string, string[]>();
  for (const card of cards) {
    const neighbours = near.get(card);
    if (card === center || expandedBy.has(card) || incremental.has(card) || !neighbours || neighbours.size !== 1) continue;
    const parent = [...neighbours][0];
    const key = `group:${parent}|${graph.cards.get(card)!.kind}`;
    (leaves.get(key) ?? leaves.set(key, []).get(key)!).push(card);
  }
  for (const [id, members] of leaves) {
    if (members.length <= GROUP_AT || openGroups.has(id)) continue;
    const kind = graph.cards.get(members[0])!.kind;
    groups.set(id, {
      id,
      kind,
      label: `${members.length} more ${KIND_PLURAL[kind] ?? 'cards'}`,
      file: '',
      detail: members.map(m => graph.cards.get(m)!.label).join(', '),
      columns: [],
    });
    for (const member of members) {
      cards.delete(member);
      alias.set(member, id);
    }
    cards.add(id);
  }
  return { groups, alias };
}

// Which cards: the centre's reach, plus the neighbours of expanded cards.
export function useLineageReach({ graph, center, steps, sets, mapping, showMetrics, showExternal, cardFilter, selected, openGroups }: ReachInputs) {
  const reachOf = mapping ? aroundHops : around;
  return useMemo(() => {
    const base = reachOf(graph, center, steps);
    // A directed pierce replaces the hop neighborhood rather than retaining unrelated neighbors.
    const lastPierce = sets.findLastIndex(set => set.kind === 'pierce');
    const appliedSets = lastPierce < 0 ? sets : sets.slice(lastPierce);
    const canvas = canvasOf(lastPierce < 0 ? [...base.cards] : [center, sets[lastPierce].from], appliedSets);
    const cards = new Set(canvas.nodes);
    const expandedBy = canvas.expandedBy;
    const hidden = new Map<string, number>();
    for (const [id, count] of base.hidden) if (!expandedBy.has(id)) hidden.set(id, count);
    // Cards that only expansions brought in are placed incrementally beside their origin;
    // everything else (the centre's reach, a pierce) is laid out by ELK.
    const incremental = new Set<string>();
    const laid = new Set([...base.cards, ...canvas.active.filter(x => x.kind === 'pierce').flatMap(x => [x.from, ...x.nodes])]);
    for (const card of cards) if (!laid.has(card)) incremental.add(card);
    // Iterate over a copy: the loop removes cards from the set.
    // oxlint-disable-next-line no-useless-spread
    for (const card of [...cards]) {
      const cardKind = graph.cards.get(card)?.kind;
      if ((!showMetrics && cardKind === 'metric' && card !== center) || (!showExternal && cardKind === 'external')) cards.delete(card);
      else if (cardFilter && card !== center && !cardFilter(graph.cards.get(card)!)) cards.delete(card);
    }
    // Selected paths bypass grouping so every path card stays visible.
    const grouping = selected ? { groups: new Map<string, LineageCard>(), alias: new Map<string, string>() } : collapseLeafGroups({ graph, cards, center, expandedBy, incremental, openGroups });
    const hops = (base as { hops?: Map<string, number> }).hops;
    return { cards, hidden, groups: grouping.groups, alias: grouping.alias, expandedBy, incremental, hops, active: canvas.active };
  }, [graph, center, steps, sets, showMetrics, showExternal, cardFilter, mapping, selected, openGroups]);
}
