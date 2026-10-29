/** Turns resolved concept mappings into lineage cards and binding edges without reparsing the
 * mapping. */
import { OSSIE_BUILTINS } from '../../shared/mappings/ossie-builtins';
import { badge, type BadgeInfo } from '../components/PropertyBadges';
import type { LineageCard, LineageColumn, ColumnEdge, LineageGraph } from '../odcs/lineage';
import type { MappingEdgeKind } from '../graph/edge-styles';
// Cards represent concepts, datasets and metrics; rows hold relationships and fields. Object,
// referent and link bindings connect their resolved endpoints. Metric bindings connect concepts to
// metrics, and link paths retain intermediate join rows.
type Evidence = { path: (string | number)[]; documentId?: string };
type Binding = {
  id: string;
  kind: 'object' | 'referent' | 'link';
  concept: string;
  rootConcept: string;
  relationships: string[];
  expression: string;
  fields: string[];
  metrics: string[];
  evidence: Evidence;
};
type Finding = {
  severity: string;
  code: string;
  message: string;
  evidence?: Evidence & { filename?: string };
};
type ConceptRef = { input: string; concept: string | null };
/** Supplies resolved ontology, model and bindings for mapping graph construction. */
export type MappingContext = {
  mappingId: string;
  name: string;
  mapping: { conceptMappings?: any[] };
  concepts: any[];
  bindings: Binding[];
  datasets: any[];
  joins: any[];
  metrics: { id: string; name: string; definition: any; evidence: Evidence }[];
  findings: Finding[];
  metricBindings: {
    metric: string;
    measures: ConceptRef;
    of?: ConceptRef;
    findings: Finding[];
    evidence: Evidence;
  }[];
};
/** Describes a mapping binding edge with resolver evidence. */
export type MappingEdge = Omit<ColumnEdge, 'kind'> & {
  kind: MappingEdgeKind;
  bindings: string[];
  via?: string[];
  findings?: string[];
};
/** Extends an asset card with mapping-specific findings and evidence. */
export type MappingCard = LineageCard & {
  badges?: BadgeInfo[];
  findings?: string[];
  missing?: boolean;
};
/** Collects mapping cards, binding edges and graph-level findings. */
export type MappingGraph = Omit<LineageGraph, 'cards' | 'edges'> & {
  cards: Map<string, MappingCard>;
  edges: MappingEdge[];
  findings: string[];
  bindings: Map<string, Binding>;
  // Where each finding message points (for Edit item).
  findingEvidence: Map<string, { documentId: string; path: (string | number)[] }>;
};
/** Builds a graph identifier for an ontology concept. */
export const conceptId = (name: string) => `concept:${name}`;
/** Builds a graph identifier for a semantic dataset. */
export const datasetId = (name: string) => `dataset:${name}`;
/** Builds a graph identifier for a semantic metric. */
export const metricId = (name: string) => `metric:${name}`;
/** Builds a graph identifier for a dataset field. */
export const fieldId = (dataset: string, field: string) => `${datasetId(dataset)}/${field}`;
const fieldOf = (key: string) => {
  const [d, f] = JSON.parse(key) as [string, string];
  return fieldId(d, f);
};
const ansi = (x: any) => {
  const ds = x?.expression?.dialects ?? [];
  return (ds.find((d: any) => d.dialect === 'ANSI_SQL') ?? ds[0])?.expression;
};
// Index of the first `concept_mappings` segment: evidence paths of embedded mappings are prefixed.
const cmIndex = (path: (string | number)[]) => {
  const i = path.indexOf('concept_mappings');
  return i < 0 ? -1 : Number(path[i + 1]);
};
/** Builds mapping cards and binding edges from the resolver's context. */
export function buildMappingGraph(context: MappingContext, revision = ''): MappingGraph {
  const cards = new Map<string, MappingCard>();
  const edges: MappingEdge[] = [];
  const findings: string[] = [];
  const findingEvidence = new Map<string, { documentId: string; path: (string | number)[] }>();
  const note = (message: string, e?: Evidence) => {
    if (e?.documentId && !findingEvidence.has(message)) findingEvidence.set(message, { documentId: e.documentId, path: e.path });
  };
  const concepts = new Map<string, any>(context.concepts.map(c => [c.concept, c]));
  const builtin = (n: string) => OSSIE_BUILTINS.has(n) && !context.concepts.find(c => c.concept === n)?.relationships;
  const source = (path: (string | number)[]) => ({ file: context.mappingId, path });
  // Relationship lookup with inheritance (`extends`), for link targets and row order.
  const relationship = (concept: string, name: string): any => {
    const seen = new Set<string>();
    const queue = [concept];
    for (let i = 0; i < queue.length; i++) {
      const definition = concepts.get(queue[i]);
      if (!definition || seen.has(queue[i])) continue;
      seen.add(queue[i]);
      const relationship = (definition.relationships ?? []).find((x: any) => x.name === name);
      if (relationship) return relationship;
      queue.push(...(definition.extends ?? []));
    }
    return null;
  };
  // Cards: every ontology concept (built-in value types only when the mapping draws a line to
  // them), every dataset with its fields, metrics as lines reach them.
  const conceptCard = (name: string, missing = false): MappingCard => {
    let card = cards.get(conceptId(name));
    if (card) return card;
    const def = concepts.get(name);
    card = {
      id: conceptId(name),
      kind: 'concept' as any,
      label: name,
      file: context.mappingId,
      detail: def?.type ?? (missing ? 'not in the ontology' : undefined),
      columns: (def?.relationships ?? []).map((relationship: any): LineageColumn => ({
        id: `${conceptId(name)}/${relationship.name}`,
        path: relationship.name,
        type: relationship.roles?.map((x: any) => x.concept).join(', ') || undefined,
        badges: [],
      })),
      ...(missing ? { missing: true } : {}),
    };
    cards.set(card.id, card);
    return card;
  };
  for (const concept of context.concepts) if (!builtin(concept.concept)) conceptCard(concept.concept);
  for (const dataset of context.datasets)
    cards.set(datasetId(dataset.name), {
      id: datasetId(dataset.name),
      kind: 'dataset',
      label: dataset.name,
      file: context.mappingId,
      detail: typeof dataset.source === 'string' ? dataset.source : undefined,
      columns: (dataset.fields ?? []).map((field: any): LineageColumn => ({
        id: fieldId(dataset.name, field.name),
        path: field.name,
        type: field.datatype ?? undefined,
        badges: [],
      })),
    });
  const metricCard = (name: string): MappingCard => {
    let card = cards.get(metricId(name));
    if (card) return card;
    const metric = context.metrics.find(x => x.id === name);
    card = {
      id: metricId(name),
      kind: 'metric',
      label: name,
      file: context.mappingId,
      detail: metric ? ansi(metric.definition) : 'not in the semantic model',
      columns: [],
      governed: true,
      ...(metric ? {} : { missing: true }),
    };
    cards.set(card.id, card);
    return card;
  };
  const row = (concept: string, path: string) => {
    const card = conceptCard(concept, !concepts.has(concept));
    const id = `${card.id}/${path}`;
    if (!card.columns.some(x => x.id === id)) card.columns.push({ id, path, badges: [] });
    return id;
  };
  const add = (mappingEdge: MappingEdge) => {
    const same = edges.find(x => x.from === mappingEdge.from && x.to === mappingEdge.to && x.kind === mappingEdge.kind);
    if (same) {
      for (const binding of mappingEdge.bindings) if (!same.bindings.includes(binding)) same.bindings.push(binding);
      for (const value of mappingEdge.via ?? []) if (!same.via?.includes(value)) (same.via ??= []).push(value);
      return same;
    }
    edges.push(mappingEdge);
    return mappingEdge;
  };
  const targets = (b: Binding) => [...b.fields.map(fieldOf), ...b.metrics.map(m => metricCard(m).id)];
  const identifying = new Set<string>();
  const used = new Set<string>();
  const mapped = new Set<string>();
  // Group bindings by the mapping node they come from.
  const objectGroups = new Map<string, { concept: string; path: (string | number)[]; bindings: Binding[] }>();
  const linkChildren = new Map<string, { owner: string; child: any; path: (string | number)[]; bindings: Binding[] }>();
  const linkAnchors = new Map<string, Binding[]>();
  const tree = context.mapping.conceptMappings ?? [];
  const nodeAt = (path: (string | number)[]) => {
    const i = path.indexOf('concept_mappings');
    let node: any = tree;
    for (const key of path.slice(i + 1)) node = node?.[key];
    return node;
  };
  for (const binding of context.bindings) {
    mapped.add(binding.rootConcept);
    mapped.add(binding.concept);
    for (const field of binding.fields) used.add(fieldOf(field));
    const bindingPath = binding.evidence.path.slice(0, -1);
    const cm = bindingPath.indexOf('concept_mappings');
    if (binding.kind === 'link') {
      // The innermost link child holding this binding, or the link's anchor object mapping.
      const at = bindingPath.lastIndexOf('children');
      if (at < 0) {
        const key = JSON.stringify(bindingPath.slice(0, bindingPath.indexOf('link_mappings') + 2));
        (linkAnchors.get(key) ?? linkAnchors.set(key, []).get(key)!).push(binding);
        continue;
      }
      const childPath = bindingPath.slice(0, at + 2);
      const key = JSON.stringify(childPath);
      let entry = linkChildren.get(key);
      if (!entry) {
        // The owner of a child's relationship: the root concept, or the parent child's object
        // concept.
        const parentAt = childPath.slice(0, -2).lastIndexOf('children');
        let owner = binding.rootConcept;
        if (parentAt >= 0) {
          const parent = nodeAt(childPath.slice(0, parentAt + 2));
          const prevOwner = binding.rootConcept;
          owner = parent?.object_mapping?.concept ?? relationship(prevOwner, parent?.relationship)?.roles?.[0]?.concept ?? prevOwner;
        }
        entry = { owner, child: nodeAt(childPath), path: childPath, bindings: [] };
        linkChildren.set(key, entry);
      }
      entry.bindings.push(binding);
      continue;
    }
    // Object mapping node: concept_mappings,i,object_mappings,j (direct) — referents below it
    const om = bindingPath.slice(0, cm + 4);
    const key = JSON.stringify(om);
    let objectGroup = objectGroups.get(key);
    if (!objectGroup) {
      objectGroup = {
        concept: String(tree[Number(bindingPath[cm + 1])]?.concept ?? binding.rootConcept),
        path: om,
        bindings: [],
      };
      objectGroups.set(key, objectGroup);
    }
    objectGroup.bindings.push(binding);
  }
  for (const objectGroup of objectGroups.values()) {
    const concept = conceptCard(objectGroup.concept, !concepts.has(objectGroup.concept)).id;
    const ident = new Set<string>(concepts.get(objectGroup.concept)?.identify_by ?? []);
    const datasets = new Map<string, string[]>();
    for (const binding of objectGroup.bindings) {
      if (binding.kind === 'referent') {
        const from = row(binding.rootConcept, binding.relationships.join('.'));
        for (const targetId of targets(binding))
          add({
            from,
            to: targetId,
            kind: 'referent',
            bindings: [binding.id],
            source: source(binding.evidence.path),
          });
        if (ident.has(binding.relationships[0])) for (const field of binding.fields) identifying.add(fieldOf(field));
        for (const field of binding.fields) {
          const datasetCardId = datasetId(JSON.parse(field)[0]);
          (datasets.get(datasetCardId) ?? datasets.set(datasetCardId, []).get(datasetCardId)!).push(binding.id);
        }
      } else
        for (const targetId of targets(binding))
          add({
            from: concept,
            to: targetId,
            kind: 'object',
            bindings: [binding.id],
            source: source(binding.evidence.path),
          });
    }
    for (const [datasetCardId, ids] of datasets)
      add({
        from: concept,
        to: datasetCardId,
        kind: 'object',
        bindings: [...new Set(ids)],
        source: source(objectGroup.path),
      });
  }
  // Joins declared between datasets: a field on one side pairs with the field on the other.
  const joinPartners = (field: string) => {
    const out: string[] = [];
    for (const j of context.joins ?? []) {
      const fc = j.from_columns ?? [];
      const tc = j.to_columns ?? [];
      fc.forEach((c: string, i: number) => {
        if (fieldId(j.from, c) === field && tc[i]) out.push(fieldId(j.to, tc[i]));
      });
      tc.forEach((c: string, i: number) => {
        if (fieldId(j.to, c) === field && fc[i]) out.push(fieldId(j.from, fc[i]));
      });
    }
    return out;
  };
  for (const [key, linkChild] of linkChildren) {
    const rel = linkChild.child?.relationship;
    if (!rel) continue;
    const target = linkChild.child?.object_mapping?.concept ?? relationship(linkChild.owner, rel)?.roles?.[0]?.concept;
    if (!target) continue;
    mapped.add(target);
    const via: string[] = [];
    for (const binding of linkChild.bindings)
      for (const field of binding.fields) {
        const id = fieldOf(field);
        if (!via.includes(id)) via.push(id);
        for (const partner of joinPartners(id)) if (!via.includes(partner)) via.push(partner);
      }
    const anchors = linkAnchors.get(JSON.stringify(linkChild.path.slice(0, linkChild.path.indexOf('link_mappings') + 2))) ?? [];
    add({
      from: row(linkChild.owner, rel),
      to: conceptCard(target, !concepts.has(target)).id,
      kind: 'link',
      label: rel,
      via,
      bindings: [...linkChild.bindings.map(b => b.id), ...anchors.map(b => b.id)],
      source: source(linkChild.path),
    });
    void key;
  }
  // A link mapping with only an anchor (no children) still shows its bindings, as referent-like
  // lines.
  for (const [key, list] of linkAnchors)
    if (![...linkChildren.values()].some(c => JSON.stringify(c.path.slice(0, c.path.indexOf('link_mappings') + 2)) === key))
      for (const binding of list)
        for (const targetId of targets(binding))
          add({
            from: row(binding.rootConcept, binding.relationships.join('.') || '(object)'),
            to: targetId,
            kind: 'link',
            bindings: [binding.id],
            source: source(binding.evidence.path),
          });
  // Metric bindings.
  for (const metricBinding of context.metricBindings) {
    const metric = metricCard(metricBinding.metric);
    for (const [role, ref] of [
      ['measures', metricBinding.measures],
      ['of', metricBinding.of],
    ] as const) {
      if (!ref) continue;
      const name = ref.concept ?? ref.input;
      mapped.add(name);
      add({
        from: conceptCard(name, !ref.concept).id,
        to: metric.id,
        kind: role,
        bindings: [`kpi:${metricBinding.metric}`],
        source: source(metricBinding.evidence.path),
      });
    }
    if (metricBinding.findings.length) {
      (metric.findings ??= []).push(...metricBinding.findings.map(f => f.message));
      for (const finding of metricBinding.findings) note(finding.message, finding.evidence);
    }
  }
  // Badges: identifying and unmapped fields; unmapped concepts.
  for (const card of cards.values()) {
    if (card.kind === 'dataset')
      for (const col of card.columns) {
        if (identifying.has(col.id)) col.badges.push(badge('identifying'));
        if (!used.has(col.id)) col.badges.push(badge('unmapped'));
      }
    if ((card.kind as string) === 'concept' && !mapped.has(card.label)) card.badges = [badge('unmapped')];
  }
  // Resolver findings: on the concept card of the concept mapping they come from; others on the
  // graph.
  for (const finding of context.findings) {
    const i = finding.evidence ? cmIndex(finding.evidence.path) : -1;
    const name = i >= 0 ? tree[i]?.concept : undefined;
    note(finding.message, finding.evidence);
    const metric = finding.code === 'metric' ? context.metrics.find(m => JSON.stringify(m.evidence.path) === JSON.stringify(finding.evidence?.path)) : undefined;
    if (typeof name === 'string') {
      const card = conceptCard(name, !concepts.has(name));
      (card.findings ??= []).push(finding.message);
    } else if (metric) {
      const card = metricCard(metric.id);
      (card.findings ??= []).push(finding.message);
    } else findings.push(finding.message);
  }
  // Edges as ColumnEdge for the canvas' generic code (kind is a mapping kind).
  return {
    contract: context.mappingId,
    cards,
    edges,
    revision,
    unmatchedDatasets: 0,
    findings,
    findingEvidence,
    bindings: new Map(context.bindings.map(b => [b.id, b])),
  };
}

/** Chooses the concept card with the most mapping connections. */
export function defaultMappingCenter(mappingGraph: MappingGraph) {
  const count = new Map<string, number>();
  const owner = (n: string) => (mappingGraph.cards.has(n) ? n : n.slice(0, n.lastIndexOf('/')));
  for (const edge of mappingGraph.edges)
    for (const name of [edge.from, edge.to]) {
      const ownerCard = owner(name);
      if ((mappingGraph.cards.get(ownerCard)?.kind as string) === 'concept') count.set(ownerCard, (count.get(ownerCard) ?? 0) + 1);
    }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? [...mappingGraph.cards.keys()][0] ?? '';
}
