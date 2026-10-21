/** Turns resolved concept mappings into lineage cards and binding edges without reparsing the
 * mapping. */
import { OSSIE_BUILTINS } from '../ossie-builtins';
import { badge, type BadgeInfo } from '../PropertyBadges';
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
    if (e?.documentId && !findingEvidence.has(message))
      findingEvidence.set(message, { documentId: e.documentId, path: e.path });
  };
  const concepts = new Map<string, any>(context.concepts.map(c => [c.concept, c]));
  const builtin = (n: string) =>
    OSSIE_BUILTINS.has(n) && !context.concepts.find(c => c.concept === n)?.relationships;
  const source = (path: (string | number)[]) => ({ file: context.mappingId, path });
  // Relationship lookup with inheritance (`extends`), for link targets and row order.
  const relationship = (concept: string, name: string): any => {
    const seen = new Set<string>();
    const queue = [concept];
    for (let i = 0; i < queue.length; i++) {
      const c = concepts.get(queue[i]);
      if (!c || seen.has(queue[i])) continue;
      seen.add(queue[i]);
      const r = (c.relationships ?? []).find((x: any) => x.name === name);
      if (r) return r;
      queue.push(...(c.extends ?? []));
    }
    return null;
  };
  // Cards: every ontology concept (built-in value types only when the mapping draws a line to
  // them), every dataset with its fields, metrics as lines reach them.
  const conceptCard = (name: string, missing = false): MappingCard => {
    let c = cards.get(conceptId(name));
    if (c) return c;
    const def = concepts.get(name);
    c = {
      id: conceptId(name),
      kind: 'concept' as any,
      label: name,
      file: context.mappingId,
      detail: def?.type ?? (missing ? 'not in the ontology' : undefined),
      columns: (def?.relationships ?? []).map((r: any): LineageColumn => ({
        id: `${conceptId(name)}/${r.name}`,
        path: r.name,
        type: r.roles?.map((x: any) => x.concept).join(', ') || undefined,
        badges: [],
      })),
      ...(missing ? { missing: true } : {}),
    };
    cards.set(c.id, c);
    return c;
  };
  for (const c of context.concepts) if (!builtin(c.concept)) conceptCard(c.concept);
  for (const d of context.datasets)
    cards.set(datasetId(d.name), {
      id: datasetId(d.name),
      kind: 'dataset',
      label: d.name,
      file: context.mappingId,
      detail: typeof d.source === 'string' ? d.source : undefined,
      columns: (d.fields ?? []).map((f: any): LineageColumn => ({
        id: fieldId(d.name, f.name),
        path: f.name,
        type: f.datatype ?? undefined,
        badges: [],
      })),
    });
  const metricCard = (name: string): MappingCard => {
    let c = cards.get(metricId(name));
    if (c) return c;
    const m = context.metrics.find(x => x.id === name);
    c = {
      id: metricId(name),
      kind: 'metric',
      label: name,
      file: context.mappingId,
      detail: m ? ansi(m.definition) : 'not in the semantic model',
      columns: [],
      governed: true,
      ...(m ? {} : { missing: true }),
    };
    cards.set(c.id, c);
    return c;
  };
  const row = (concept: string, path: string) => {
    const c = conceptCard(concept, !concepts.has(concept));
    const id = `${c.id}/${path}`;
    if (!c.columns.some(x => x.id === id)) c.columns.push({ id, path, badges: [] });
    return id;
  };
  const add = (e: MappingEdge) => {
    const same = edges.find(x => x.from === e.from && x.to === e.to && x.kind === e.kind);
    if (same) {
      for (const b of e.bindings) if (!same.bindings.includes(b)) same.bindings.push(b);
      for (const v of e.via ?? []) if (!same.via?.includes(v)) (same.via ??= []).push(v);
      return same;
    }
    edges.push(e);
    return e;
  };
  const targets = (b: Binding) => [
    ...b.fields.map(fieldOf),
    ...b.metrics.map(m => metricCard(m).id),
  ];
  const identifying = new Set<string>();
  const used = new Set<string>();
  const mapped = new Set<string>();
  // Group bindings by the mapping node they come from.
  const objectGroups = new Map<
    string,
    { concept: string; path: (string | number)[]; bindings: Binding[] }
  >();
  const linkChildren = new Map<
    string,
    { owner: string; child: any; path: (string | number)[]; bindings: Binding[] }
  >();
  const linkAnchors = new Map<string, Binding[]>();
  const tree = context.mapping.conceptMappings ?? [];
  const nodeAt = (path: (string | number)[]) => {
    const i = path.indexOf('concept_mappings');
    let n: any = tree;
    for (const k of path.slice(i + 1)) n = n?.[k];
    return n;
  };
  for (const b of context.bindings) {
    mapped.add(b.rootConcept);
    mapped.add(b.concept);
    for (const f of b.fields) used.add(fieldOf(f));
    const p = b.evidence.path.slice(0, -1);
    const cm = p.indexOf('concept_mappings');
    if (b.kind === 'link') {
      // The innermost link child holding this binding, or the link's anchor object mapping.
      const at = p.lastIndexOf('children');
      if (at < 0) {
        const key = JSON.stringify(p.slice(0, p.indexOf('link_mappings') + 2));
        (linkAnchors.get(key) ?? linkAnchors.set(key, []).get(key)!).push(b);
        continue;
      }
      const childPath = p.slice(0, at + 2);
      const key = JSON.stringify(childPath);
      let entry = linkChildren.get(key);
      if (!entry) {
        // The owner of a child's relationship: the root concept, or the parent child's object
        // concept.
        const parentAt = childPath.slice(0, -2).lastIndexOf('children');
        let owner = b.rootConcept;
        if (parentAt >= 0) {
          const parent = nodeAt(childPath.slice(0, parentAt + 2));
          const prevOwner = b.rootConcept;
          owner =
            parent?.object_mapping?.concept ??
            relationship(prevOwner, parent?.relationship)?.roles?.[0]?.concept ??
            prevOwner;
        }
        entry = { owner, child: nodeAt(childPath), path: childPath, bindings: [] };
        linkChildren.set(key, entry);
      }
      entry.bindings.push(b);
      continue;
    }
    // Object mapping node: concept_mappings,i,object_mappings,j (direct) — referents below it
    const om = p.slice(0, cm + 4);
    const key = JSON.stringify(om);
    let g = objectGroups.get(key);
    if (!g) {
      g = {
        concept: String(tree[Number(p[cm + 1])]?.concept ?? b.rootConcept),
        path: om,
        bindings: [],
      };
      objectGroups.set(key, g);
    }
    g.bindings.push(b);
  }
  for (const g of objectGroups.values()) {
    const concept = conceptCard(g.concept, !concepts.has(g.concept)).id;
    const ident = new Set<string>(concepts.get(g.concept)?.identify_by ?? []);
    const datasets = new Map<string, string[]>();
    for (const b of g.bindings) {
      if (b.kind === 'referent') {
        const from = row(b.rootConcept, b.relationships.join('.'));
        for (const t of targets(b))
          add({ from, to: t, kind: 'referent', bindings: [b.id], source: source(b.evidence.path) });
        if (ident.has(b.relationships[0])) for (const f of b.fields) identifying.add(fieldOf(f));
        for (const f of b.fields) {
          const d = datasetId(JSON.parse(f)[0]);
          (datasets.get(d) ?? datasets.set(d, []).get(d)!).push(b.id);
        }
      } else
        for (const t of targets(b))
          add({
            from: concept,
            to: t,
            kind: 'object',
            bindings: [b.id],
            source: source(b.evidence.path),
          });
    }
    for (const [d, ids] of datasets)
      add({
        from: concept,
        to: d,
        kind: 'object',
        bindings: [...new Set(ids)],
        source: source(g.path),
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
  for (const [key, c] of linkChildren) {
    const rel = c.child?.relationship;
    if (!rel) continue;
    const target =
      c.child?.object_mapping?.concept ?? relationship(c.owner, rel)?.roles?.[0]?.concept;
    if (!target) continue;
    mapped.add(target);
    const via: string[] = [];
    for (const b of c.bindings)
      for (const f of b.fields) {
        const id = fieldOf(f);
        if (!via.includes(id)) via.push(id);
        for (const p of joinPartners(id)) if (!via.includes(p)) via.push(p);
      }
    const anchors =
      linkAnchors.get(JSON.stringify(c.path.slice(0, c.path.indexOf('link_mappings') + 2))) ?? [];
    add({
      from: row(c.owner, rel),
      to: conceptCard(target, !concepts.has(target)).id,
      kind: 'link',
      label: rel,
      via,
      bindings: [...c.bindings.map(b => b.id), ...anchors.map(b => b.id)],
      source: source(c.path),
    });
    void key;
  }
  // A link mapping with only an anchor (no children) still shows its bindings, as referent-like
  // lines.
  for (const [key, list] of linkAnchors)
    if (
      ![...linkChildren.values()].some(
        c => JSON.stringify(c.path.slice(0, c.path.indexOf('link_mappings') + 2)) === key,
      )
    )
      for (const b of list)
        for (const t of targets(b))
          add({
            from: row(b.rootConcept, b.relationships.join('.') || '(object)'),
            to: t,
            kind: 'link',
            bindings: [b.id],
            source: source(b.evidence.path),
          });
  // Metric bindings.
  for (const m of context.metricBindings) {
    const metric = metricCard(m.metric);
    for (const [role, ref] of [
      ['measures', m.measures],
      ['of', m.of],
    ] as const) {
      if (!ref) continue;
      const name = ref.concept ?? ref.input;
      mapped.add(name);
      add({
        from: conceptCard(name, !ref.concept).id,
        to: metric.id,
        kind: role,
        bindings: [`kpi:${m.metric}`],
        source: source(m.evidence.path),
      });
    }
    if (m.findings.length) {
      (metric.findings ??= []).push(...m.findings.map(f => f.message));
      for (const f of m.findings) note(f.message, f.evidence);
    }
  }
  // Badges: identifying and unmapped fields; unmapped concepts.
  for (const c of cards.values()) {
    if (c.kind === 'dataset')
      for (const col of c.columns) {
        if (identifying.has(col.id)) col.badges.push(badge('identifying'));
        if (!used.has(col.id)) col.badges.push(badge('unmapped'));
      }
    if ((c.kind as string) === 'concept' && !mapped.has(c.label)) c.badges = [badge('unmapped')];
  }
  // Resolver findings: on the concept card of the concept mapping they come from; others on the
  // graph.
  for (const f of context.findings) {
    const i = f.evidence ? cmIndex(f.evidence.path) : -1;
    const name = i >= 0 ? tree[i]?.concept : undefined;
    note(f.message, f.evidence);
    const metric =
      f.code === 'metric'
        ? context.metrics.find(
            m => JSON.stringify(m.evidence.path) === JSON.stringify(f.evidence?.path),
          )
        : undefined;
    if (typeof name === 'string') {
      const c = conceptCard(name, !concepts.has(name));
      (c.findings ??= []).push(f.message);
    } else if (metric) {
      const c = metricCard(metric.id);
      (c.findings ??= []).push(f.message);
    } else findings.push(f.message);
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
export function defaultMappingCenter(g: MappingGraph) {
  const count = new Map<string, number>();
  const owner = (n: string) => (g.cards.has(n) ? n : n.slice(0, n.lastIndexOf('/')));
  for (const e of g.edges)
    for (const n of [e.from, e.to]) {
      const c = owner(n);
      if ((g.cards.get(c)?.kind as string) === 'concept') count.set(c, (count.get(c) ?? 0) + 1);
    }
  return (
    [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    [...g.cards.keys()][0] ??
    ''
  );
}
