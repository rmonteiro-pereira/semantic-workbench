/** Suggests model groups from relationships between business entities. */
import type { Entity, Relationship } from '../../shared/core/model';
// The main definitions of each document kind: ontology concepts and classes, contract objects,
// semantic datasets and metrics, and concept mappings. Value types and primitives stay out, so
// they cannot turn into hubs that pull every community together.
const BUSINESS_KINDS = new Set([
  'EntityType',
  'OWL class',
  'Object',
  'Dataset',
  'Metric',
  'Concept mapping',
]);

/** Checks whether an entity belongs in the business graph used for grouping. */
export const isBusinessEntity = (entity: Entity) => BUSINESS_KINDS.has(entity.kind);
/** Checks whether a relationship expresses inheritance. */
export const isInheritance = (edge: Relationship) =>
  /inheritance|subclass/i.test(edge.data.kind) ||
  /^(extends|subClassOf|rdfs:subClassOf)$/i.test(edge.label);
// Each node's links to other nodes with their weights. A self link holds the links inside a node
// once it stands for a whole community, counted from both ends.
type WeightedGraph = Map<string, Map<string, number>>;

const MAX_PASSES = 20;
const MAX_LEVELS = 10;

function addWeight(graph: WeightedGraph, from: string, to: string, weight: number) {
  const row = graph.get(from)!;
  row.set(to, (row.get(to) ?? 0) + weight);
}

function weightedDegree(graph: WeightedGraph, node: string) {
  let total = 0;
  for (const weight of graph.get(node)!.values()) total += weight;
  return total;
}

// One level of modularity local moving: each node joins the neighbouring community that raises
// modularity most, until no node moves. Nodes are visited in sorted order so the result does not
// depend on input order.
function moveNodes(graph: WeightedGraph, twiceWeight: number) {
  const nodes = [...graph.keys()].sort();
  const membership = new Map(nodes.map(node => [node, node]));
  const degree = new Map(nodes.map(node => [node, weightedDegree(graph, node)]));
  const totals = new Map(degree);
  let moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const node of nodes) {
      const nodeDegree = degree.get(node)!;
      if (!nodeDegree) continue;
      const current = membership.get(node)!;
      const linkWeights = new Map<string, number>();
      for (const [neighbor, weight] of [...graph.get(node)!].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        if (neighbor === node) continue;
        const community = membership.get(neighbor)!;
        linkWeights.set(community, (linkWeights.get(community) ?? 0) + weight);
      }
      totals.set(current, totals.get(current)! - nodeDegree);
      const gain = (community: string) =>
        (linkWeights.get(community) ?? 0) -
        (nodeDegree * (totals.get(community) ?? 0)) / twiceWeight;
      let best = current;
      let bestGain = gain(current);
      for (const candidate of [...linkWeights.keys()].sort()) {
        const candidateGain = gain(candidate);
        if (candidateGain > bestGain + 1e-10) {
          best = candidate;
          bestGain = candidateGain;
        }
      }
      membership.set(node, best);
      totals.set(best, (totals.get(best) ?? 0) + nodeDegree);
      if (best !== current) changed = true;
    }
    if (!changed) break;
    moved = true;
  }
  return { membership, moved };
}

// Turns each community into one node whose links add up the links of its members.
function aggregate(graph: WeightedGraph, membership: Map<string, string>): WeightedGraph {
  const next: WeightedGraph = new Map();
  for (const community of new Set(membership.values())) next.set(community, new Map());
  for (const [node, row] of graph) {
    const from = membership.get(node)!;
    for (const [neighbor, weight] of row) addWeight(next, from, membership.get(neighbor)!, weight);
  }
  return next;
}

/** Suggests deterministic communities from an undirected business graph. Direction, duplicate
 * edges, inheritance and primitive hubs do not affect weights. These groups are suggestions, not
 * domain classifications. */
export function suggestCommunities(entities: Entity[], edges: Relationship[]) {
  const business = entities.filter(isBusinessEntity).sort((a, b) => a.id.localeCompare(b.id));
  const adjacent = new Map(business.map(e => [e.id, new Set<string>()]));
  for (const edge of edges)
    if (
      !isInheritance(edge) &&
      edge.source !== edge.target &&
      adjacent.has(edge.source) &&
      adjacent.has(edge.target)
    ) {
      adjacent.get(edge.source)!.add(edge.target);
      adjacent.get(edge.target)!.add(edge.source);
    }
  const degree = new Map([...adjacent].map(([id, next]) => [id, next.size]));
  const twiceEdges = [...degree.values()].reduce((a, b) => a + b, 0);

  // Local moving alone stops at pairs and triples on sparse models, so the communities found at
  // one level become the nodes of the next, as in the Louvain method, until nothing moves.
  let graph: WeightedGraph = new Map(
    [...adjacent].map(([id, next]) => [id, new Map([...next].map(other => [other, 1]))]),
  );
  const membership = new Map(business.map(e => [e.id, e.id]));
  let levels = 0;
  if (twiceEdges)
    for (; levels < MAX_LEVELS; levels++) {
      const level = moveNodes(graph, twiceEdges);
      if (!level.moved) break;
      for (const [id, node] of membership) membership.set(id, level.membership.get(node)!);
      graph = aggregate(graph, level.membership);
    }

  // An entity with no links has no community to suggest, so it keeps no anchor and the overview
  // groups it with others of its type instead of giving it an area of its own.
  const clusters = new Map<string, string[]>();
  for (const [id, group] of membership) {
    if (!degree.get(id)) continue;
    const ids = clusters.get(group) ?? [];
    ids.push(id);
    clusters.set(group, ids);
  }
  const anchors = new Map<string, string>();
  for (const ids of clusters.values()) {
    const anchor = ids
      .slice()
      .sort((a, b) => degree.get(b)! - degree.get(a)! || a.localeCompare(b))[0];
    for (const id of ids) anchors.set(id, anchor);
  }
  return { membership: anchors, degree, levels, backboneEdges: twiceEdges / 2 };
}

// Concepts named anywhere inside a mapping (link targets, nested object mappings), except the
// mapping's own concept.
function mappedConcepts(value: unknown, found: Set<string>, root = true) {
  if (Array.isArray(value)) {
    for (const item of value) mappedConcepts(item, found, false);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'concept' && !root && typeof item === 'string') found.add(item);
    else mappedConcepts(item, found, false);
  }
  return found;
}

/** Links concept mappings whose mapped links point at another mapped concept. A mapping
 * document has no relationships of its own, so these links are its community backbone. */
export function conceptMappingLinks(entities: Entity[]): Relationship[] {
  const mappings = entities.filter(e => e.kind === 'Concept mapping');
  const byConcept = new Map(mappings.map(e => [e.name, e.id]));
  const links: Relationship[] = [];
  for (const mapping of mappings)
    for (const concept of mappedConcepts(mapping.definition, new Set())) {
      const target = byConcept.get(concept);
      if (!target || target === mapping.id) continue;
      links.push({
        id: `concept-link:${mapping.id}>${target}`,
        source: mapping.id,
        target,
        label: concept,
        data: { path: mapping.path, definition: {}, kind: 'Concept relationship' },
      });
    }
  return links;
}
