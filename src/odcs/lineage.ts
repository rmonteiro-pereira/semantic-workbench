/** Builds column-level lineage from declared names and parsed expressions without fetching or
 * running data. */
import { odcsForeignKeys } from './foreign-keys';
import { ansiExpression, expressionRefs, metricDependencies } from '../metrics/deps';
import { readMetricExtension } from '../metrics/extension';
// Shared readers for the column-level lineage below: semantic models in a project file, physical
// names of objects and columns. Matching is by declared names and parsed expressions only.
/** Pairs a project path with its parsed definition for lineage construction. */
export type ProjectFile = { path: string; data: any };
const list = (v: unknown): any[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** Builds an identifier for a contract object within a project file. */
export const objectId = (file: string, name: string) => `object:${file}#${name}`;
// Semantic models in a file: flat, legacy `semantic_model` lists, and models embedded in a
// consolidated ontology's `ontology_mappings`.
function models(f: ProjectFile): { file: string; key: string; model: any }[] {
  const d = f.data;
  if (!isObject(d) || d.kind === 'DataContract') return [];
  if (Array.isArray(d.ontology))
    return list(d.ontology_mappings).flatMap((om: any, i: number) =>
      isObject(om?.semantic_model)
        ? [{ file: f.path, key: `ontology_mappings/${i}`, model: om.semantic_model }]
        : [],
    );
  if (Array.isArray(d.datasets)) return [{ file: f.path, key: '', model: d }];
  return list(d.semantic_model).flatMap((m: any, i: number) =>
    isObject(m) && Array.isArray(m.datasets)
      ? [{ file: f.path, key: `semantic_model/${i}`, model: m }]
      : [],
  );
}
const physical = (o: any) =>
  typeof o?.physicalName === 'string' ? o.physicalName : String(o?.name);
const columnOf = (p: any) =>
  typeof p?.physicalName === 'string' ? p.physicalName : String(p?.name);

// Edges follow referenced key → foreign key → semantic field → metric → dependent metric. Cards
// include contract objects, semantic datasets, metrics and external stubs. Matching uses declared
// names and parsed expressions; nothing is fetched or executed.
import { odcsExternalForeignKeys } from './foreign-keys';
import { flattenProperties } from './odcs-diff';
import { propertyBadges, badge, type BadgeInfo } from '../shared/PropertyBadges';
import type { LineageEdgeKind, MappingEdgeKind } from '../graph/edge-styles';
/** Names an asset category rendered as a lineage card. */
export type CardKind = 'object' | 'dataset' | 'metric' | 'external' | 'concept';
/** Describes a lineage row with identity, labels and property badges. */
export type LineageColumn = {
  id: string;
  path: string;
  type?: string;
  badges: BadgeInfo[];
  fk?: string[];
};
// Mapping cards (src/mappings/mapping-graph.ts) also carry card badges (Unmapped) and resolver
// findings.
/** Describes an asset and its visible lineage columns and findings. */
export type LineageCard = {
  id: string;
  kind: CardKind;
  label: string;
  file: string;
  detail?: string;
  columns: LineageColumn[];
  group?: string;
  governed?: boolean;
  badges?: BadgeInfo[];
  findings?: string[];
  missing?: boolean;
};
// `via`: rows a mapping link passes through (highlighted with it); `bindings`: resolver binding
// ids.
/** Connects lineage nodes with optional intermediate rows and resolver binding identifiers. */
export type ColumnEdge = {
  from: string;
  to: string;
  kind: LineageEdgeKind | MappingEdgeKind;
  source: { file: string; path: (string | number)[] };
  ambiguous?: boolean;
  label?: string;
  via?: string[];
  bindings?: string[];
};
/** Collects asset cards, column edges and adjacency indexes for traversal. */
export type LineageGraph = {
  contract: string;
  cards: Map<string, LineageCard>;
  edges: ColumnEdge[];
  revision: string;
  unmatchedDatasets: number;
};
const datasetCardId = (file: string, key: string, name: string) => `dataset:${file}#${key}/${name}`;
const metricCardId = (file: string, key: string, name: string) => `metric:${file}#${key}/${name}`;
/** Builds a column identifier under its owning card. */
export const columnId = (card: string, path: string) => `${card}/${path}`;
// The card a node (column or card) belongs to. Ids contain file paths, so this is a lookup, not a
// parse.
/** Looks up a node's owning card without parsing identifiers that contain file paths. */
export function cardOfNode(graph: LineageGraph, node: string) {
  if (graph.cards.has(node)) return node;
  let owners = columnOwner.get(graph);
  if (!owners) {
    owners = new Map();
    for (const c of graph.cards.values()) for (const x of c.columns) owners.set(x.id, c.id);
    columnOwner.set(graph, owners);
  }
  return owners.get(node) ?? node;
}
const columnOwner = new WeakMap<LineageGraph, Map<string, string>>();
// A foreign key reads child to parent: the column that holds the key, then the column it points
// at. The lines on the canvas run the other way (parent to child, the workbench's reading of
// lineage), so the sentence, not the line, tells which table references which.
/** Names a column as `table.column`, or a card by its label. */
export function nodeName(graph: LineageGraph, node: string) {
  const owner = graph.cards.get(cardOfNode(graph, node));
  if (!owner) return node;
  const column = owner.columns.find(c => c.id === node);
  return column ? `${owner.label}.${column.path}` : owner.label;
}
/** The two ends of a foreign key as `table.column` names. */
export type ForeignKeyHop = { child: string; parent: string };
/** Reads a foreign-key line as child to parent; returns null for any other kind of line. */
export function foreignKeyHop(graph: LineageGraph, edge: ColumnEdge): ForeignKeyHop | null {
  if (edge.kind !== 'foreign-key') return null;
  return { child: nodeName(graph, edge.to), parent: nodeName(graph, edge.from) };
}
/** Writes a hop as one plain sentence, such as `orders.customer_id → customers.id`. */
export const hopSentence = (hop: ForeignKeyHop) => `${hop.child} → ${hop.parent}`;
/** Builds column dependencies from declared contract references and parsed model expressions. */
export function buildLineage(
  files: ProjectFile[],
  contractPath: string,
  revision = '',
): LineageGraph {
  const contract = files.find(f => f.path === contractPath)?.data;
  const schema = list(contract?.schema);
  const cards = new Map<string, LineageCard>();
  const edges: ColumnEdge[] = [];
  const seen = new Set<string>();
  const edge = (e: ColumnEdge) => {
    const k = `${e.from}>${e.to}>${e.kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push(e);
  };
  const keys = odcsForeignKeys(contract);
  // Foreign-key targets per object column, for FK badges.
  const fkTargets = new Map<string, string[]>();
  for (const k of keys)
    k.fromColumns.forEach((c, i) => {
      const id = columnId(objectId(contractPath, String(schema[k.from]?.name)), c);
      const t = `${schema[k.to]?.name}.${k.toColumns[i]}`;
      fkTargets.set(id, [...(fkTargets.get(id) ?? []), t]);
    });
  schema.forEach((o: any) => {
    if (!isObject(o)) return;
    const id = objectId(contractPath, String(o.name));
    const columns = flattenProperties(o.properties).map(p => {
      const cid = columnId(id, p.path);
      const fk = fkTargets.get(cid);
      return {
        id: cid,
        path: p.path,
        type:
          typeof p.property.logicalType === 'string'
            ? p.property.logicalType
            : typeof p.property.physicalType === 'string'
              ? p.property.physicalType
              : undefined,
        badges: propertyBadges(p.property, fk),
        ...(fk ? { fk } : {}),
      };
    });
    cards.set(id, {
      id,
      kind: 'object',
      label: String(o.name),
      file: contractPath,
      detail: physical(o),
      columns,
    });
  });
  // Referenced (parent) column → referencing (child) column , pairwise by position.
  for (const k of keys) {
    const parent = objectId(contractPath, String(schema[k.to]?.name));
    const child = objectId(contractPath, String(schema[k.from]?.name));
    k.fromColumns.forEach((c, i) =>
      edge({
        from: columnId(parent, k.toColumns[i]),
        to: columnId(child, c),
        kind: 'foreign-key',
        source: { file: contractPath, path: k.path },
        label: k.label,
      }),
    );
  }
  for (const x of odcsExternalForeignKeys(contract)) {
    const id = `external:${x.reference}`;
    if (!cards.has(id))
      cards.set(id, {
        id,
        kind: 'external',
        label: x.reference,
        file: x.reference.split('#')[0],
        detail: 'Reference to another contract; not resolved',
        columns: [],
      });
    const child = objectId(contractPath, String(schema[x.from]?.name));
    for (const c of x.fromColumns)
      edge({
        from: id,
        to: columnId(child, c),
        kind: 'foreign-key',
        source: { file: contractPath, path: x.path },
      });
  }
  // Declared transforms: source objects → the property (card to column).
  schema.forEach((o: any, i: number) => {
    if (!isObject(o)) return;
    const id = objectId(contractPath, String(o.name));
    const walk = (props: unknown, prefix: string, path: (string | number)[]) =>
      list(props).forEach((p: any, j: number) => {
        if (!isObject(p)) return;
        const at = prefix + String(p.name);
        const pp = [...path, 'properties', j];
        for (const src of list(p.transformSourceObjects).filter(
          (s: unknown): s is string => typeof s === 'string',
        )) {
          const match = schema.find(
            (x: any) => isObject(x) && (x.name === src || physical(x) === src),
          );
          let from: string;
          if (match) from = objectId(contractPath, String(match.name));
          else {
            from = `external:${src}`;
            if (!cards.has(from))
              cards.set(from, {
                id: from,
                kind: 'external',
                label: src,
                file: '',
                detail: 'Declared transform source; not in this contract',
                columns: [],
              });
          }
          edge({
            from,
            to: columnId(id, at),
            kind: 'transform',
            source: { file: contractPath, path: [...pp, 'transformSourceObjects'] },
            label: 'declared transform',
          });
        }
        walk(p.properties, at + '.', pp);
      });
    walk(o.properties, '', ['schema', i]);
  });
  // Semantic models: datasets whose `source` is an object's physical name or name.
  let unmatched = 0;
  const metricEdges: {
    from: string;
    to: string;
    source: { file: string; path: (string | number)[] };
  }[] = [];
  for (const f of files)
    for (const { file, key, model } of models(f)) {
      const datasets = list(model.datasets).filter(isObject);
      const metrics = list(model.metrics).filter(isObject);
      const names = new Set<string>(
        metrics.map((m: any) => m.name).filter((n: unknown) => typeof n === 'string'),
      );
      const base = key ? key.split('/').map(s => (/^\d+$/.test(s) ? Number(s) : s)) : [];
      const metricCard = (m: any) => {
        const id = metricCardId(file, key, String(m.name));
        if (!cards.has(id)) {
          const ext = readMetricExtension(m).value;
          cards.set(id, {
            id,
            kind: 'metric',
            label: String(ext?.label ?? m.name),
            file,
            detail: ansiExpression(m),
            columns: [],
            governed: !!ext,
          });
        }
        return id;
      };
      const fieldColumns = new Map<string, string>();
      datasets.forEach((d: any, di: number) => {
        const source = list(d.source)[0];
        const readers = schema.filter(
          (o: any) => isObject(o) && (physical(o) === source || o.name === source),
        );
        if (!readers.length) {
          unmatched++;
          return;
        }
        const id = datasetCardId(file, key, String(d.name));
        const pk = new Set(list(d.primary_key).map(String));
        const fields = list(d.fields).filter(isObject);
        cards.set(id, {
          id,
          kind: 'dataset',
          label: String(d.name),
          file,
          detail: String(source),
          columns: fields.map((fd: any) => ({
            id: columnId(id, String(fd.name)),
            path: String(fd.name),
            type: typeof fd.datatype === 'string' ? fd.datatype : undefined,
            badges: pk.has(String(fd.name)) ? [badge('pk')] : [],
          })),
        });
        const ambiguous = readers.length > 1;
        for (const o of readers) {
          const objId = objectId(contractPath, String(o.name));
          const props = new Map(
            list(o.properties)
              .filter(isObject)
              .map((p: any) => [columnOf(p), String(p.name)]),
          );
          fields.forEach((fd: any, fi: number) => {
            const sql = ansiExpression(fd);
            const cols = sql
              ? [...new Set(expressionRefs(sql).map(r => r.column))]
              : [String(fd.name)];
            for (const c of cols) {
              const p = props.get(c);
              if (p)
                edge({
                  from: columnId(objId, p),
                  to: columnId(id, String(fd.name)),
                  kind: 'reads',
                  source: { file, path: [...base, 'datasets', di, 'fields', fi] },
                  ...(ambiguous ? { ambiguous: true } : {}),
                });
            }
          });
        }
        fields.forEach((fd: any) =>
          fieldColumns.set(`${d.name}.${fd.name}`, columnId(id, String(fd.name))),
        );
      });
      // Field → metric (aggregates); metric → metric (uses).
      metrics.forEach((m: any, mi: number) => {
        const sql = ansiExpression(m) ?? '';
        const refs = expressionRefs(sql);
        for (const r of refs) {
          const col =
            r.table !== null
              ? fieldColumns.get(`${r.table}.${r.column}`)
              : datasets.length === 1 && !names.has(r.column)
                ? fieldColumns.get(`${datasets[0].name}.${r.column}`)
                : undefined;
          if (col)
            edge({
              from: col,
              to: metricCard(m),
              kind: 'aggregates',
              source: { file, path: [...base, 'metrics', mi] },
            });
        }
        for (const dep of metricDependencies(sql, names))
          metricEdges.push({
            from: metricCardId(file, key, dep),
            to: metricCardId(file, key, String(m.name)),
            source: { file, path: [...base, 'metrics', mi] },
          });
      });
      // Metrics on metrics: only those whose dependency is already part of the lineage, to any
      // depth.
      let added = true;
      while (added) {
        added = false;
        for (const e of metricEdges)
          if (cards.has(e.from) && !seen.has(`${e.from}>${e.to}>uses`)) {
            const m = metrics.find((x: any) => metricCardId(file, key, String(x.name)) === e.to);
            if (!m) continue;
            metricCard(m);
            edge({ ...e, kind: 'uses' });
            added = true;
          }
      }
    }
  const g: LineageGraph = {
    contract: contractPath,
    cards,
    edges,
    revision,
    unmatchedDatasets: unmatched,
  };
  const owners = new Map<string, string>();
  for (const c of cards.values()) for (const col of c.columns) owners.set(col.id, c.id);
  columnOwner.set(g, owners);
  return g;
}
// Adjacency over node ids (columns and column-less cards).
const adjacency = new WeakMap<
  LineageGraph,
  { out: Map<string, number[]>; in: Map<string, number[]> }
>();
function adj(g: LineageGraph) {
  let a = adjacency.get(g);
  if (!a) {
    a = { out: new Map(), in: new Map() };
    g.edges.forEach((e, i) => {
      (a!.out.get(e.from) ?? a!.out.set(e.from, []).get(e.from)!).push(i);
      (a!.in.get(e.to) ?? a!.in.set(e.to, []).get(e.to)!).push(i);
    });
    adjacency.set(g, a);
  }
  return a;
}

/** Expands a selection to its column or the card and all of its columns. */
export function selectionNodes(g: LineageGraph, id: string) {
  const c = g.cards.get(id);
  return c ? [id, ...c.columns.map(x => x.id)] : [id];
}
// Path highlight: every node and edge upstream ('up'), downstream ('down') or both of the given
// nodes. 'both' is ancestors plus descendants, never siblings. Cycles terminate.
/** Finds ancestors, descendants or both without including siblings; cycles terminate. */
export function closure(
  g: LineageGraph,
  ids: string[],
  direction: 'up' | 'down' | 'both' = 'both',
) {
  const a = adj(g);
  const nodes = new Set<string>(ids);
  const edgeSet = new Set<number>();
  const walk = (dir: 'up' | 'down') => {
    const seenHere = new Set<string>(ids);
    const queue = [...ids];
    while (queue.length) {
      const n = queue.shift()!;
      for (const i of (dir === 'down' ? a.out : a.in).get(n) ?? []) {
        edgeSet.add(i);
        const e = g.edges[i];
        const next = dir === 'down' ? e.to : e.from;
        if (!seenHere.has(next)) {
          seenHere.add(next);
          nodes.add(next);
          queue.push(next);
        }
      }
    }
  };
  if (direction !== 'up') walk('down');
  if (direction !== 'down') walk('up');
  return { nodes, edges: edgeSet };
}
// The center reaches contract objects within the requested foreign-key hops in either direction.
// Other edge kinds include the full upstream and downstream chain. Objects one extra foreign-key
// hop away are counted as hidden on their visible neighbor.
/** Builds a neighborhood with bounded foreign-key hops and full non-key dependency chains. */
export function around(g: LineageGraph, center: string, steps = 1) {
  const card = (n: string) => cardOfNode(g, n);
  const shown = new Set<string>([center]);
  const nodes = selectionNodes(g, center);
  // Upstream and downstream along every line kind except foreign keys.
  const flowOnly = (start: string[]) => {
    const a = adj(g);
    const seenN = new Set(start);
    const q = [...start];
    const cardsOut = new Set<string>();
    while (q.length) {
      const n = q.shift()!;
      for (const [map, dir] of [
        [a.out, 'down'],
        [a.in, 'up'],
      ] as const)
        for (const i of map.get(n) ?? []) {
          const e = g.edges[i];
          if (e.kind === 'foreign-key') continue;
          const next = dir === 'down' ? e.to : e.from;
          cardsOut.add(card(next));
          if (!seenN.has(next)) {
            seenN.add(next);
            q.push(next);
          }
        }
    }
    return cardsOut;
  };
  for (const c of flowOnly(nodes)) shown.add(c);
  // Foreign-key reach from the objects among the shown cards that the centre itself reads from.
  const objects = [...shown].filter(
    c => g.cards.get(c)?.kind === 'object' || g.cards.get(c)?.kind === 'external',
  );
  const fkNeighbours = (c: string) => {
    const out = new Set<string>();
    for (const col of selectionNodes(g, c)) {
      for (const i of adj(g).out.get(col) ?? []) {
        const e = g.edges[i];
        if (e.kind === 'foreign-key') out.add(card(e.to));
      }
      for (const i of adj(g).in.get(col) ?? []) {
        const e = g.edges[i];
        if (e.kind === 'foreign-key') out.add(card(e.from));
      }
    }
    out.delete(c);
    return out;
  };
  // The foreign-key hop at which each table joined the view; the tables the centre reads are hop 0.
  const hops = new Map<string, number>(objects.map(c => [c, 0]));
  let frontier = objects;
  for (let s = 0; s < steps; s++) {
    const next: string[] = [];
    for (const c of frontier)
      for (const n of fkNeighbours(c))
        if (!shown.has(n)) {
          shown.add(n);
          hops.set(n, s + 1);
          next.push(n);
        }
    frontier = next;
  }
  const hidden = new Map<string, number>();
  for (const c of shown) {
    let n = 0;
    if (g.cards.get(c)?.kind === 'object' || g.cards.get(c)?.kind === 'external')
      for (const x of fkNeighbours(c)) if (!shown.has(x)) n++;
    if (n) hidden.set(c, n);
  }
  return { cards: shown, hidden, hops };
}
// The mapping canvas' reach: cards within `steps` lines of the centre in any direction, plus the
// cards holding rows a shown link passes through; neighbours one line further are counted as
// hidden on the card they connect to.
/** Builds a mapping neighborhood by edge distance, including intermediate join rows. */
export function aroundHops(g: LineageGraph, center: string, steps = 1) {
  const card = (n: string) => cardOfNode(g, n);
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    (links.get(a) ?? links.set(a, new Set()).get(a)!).add(b);
    (links.get(b) ?? links.set(b, new Set()).get(b)!).add(a);
  };
  for (const e of g.edges) link(card(e.from), card(e.to));
  const shown = new Set([center]);
  let frontier = [center];
  for (let s = 0; s < steps; s++) {
    const next: string[] = [];
    for (const c of frontier)
      for (const n of links.get(c) ?? [])
        if (!shown.has(n)) {
          shown.add(n);
          next.push(n);
        }
    frontier = next;
  }
  // A metric binds to concepts and the datasets sit one link further. Its view also shows the
  // datasets of those concepts so that concept, dataset and metric read as one chain.
  if (g.cards.get(center)?.kind === 'metric') {
    const datasets = new Set<string>();
    for (const c of shown) {
      for (const n of links.get(c) ?? []) {
        if (g.cards.get(n)?.kind === 'dataset') datasets.add(n);
      }
    }
    for (const d of datasets) shown.add(d);
  }
  for (const e of g.edges)
    if (e.via && shown.has(card(e.from)) && shown.has(card(e.to)))
      for (const v of e.via) shown.add(card(v));
  const hidden = new Map<string, number>();
  for (const c of shown) {
    let n = 0;
    for (const x of links.get(c) ?? []) if (!shown.has(x)) n++;
    if (n) hidden.set(c, n);
  }
  return { cards: shown, hidden };
}
// Rows of a card. A collapsed card shows the columns that matter: those on the selected path or
// matching the search, those with a line in the current view, and the keys. Small cards show every
// column. The rest sit behind one "+ N more columns" row, and an edge to a hidden column attaches
// to that row. An opened card lists every column in a scrolling list instead.
/** Cards with this many columns or fewer always show every column. */
export const SMALL_CARD = 8;
/** The most rows a collapsed card shows, unless a full pierce asks for every connected column. */
export const COLLAPSED_MAX = 14;
/** Cards with more columns than this get a filter box when they are opened. */
export const FILTER_AT = 30;
/** Returns the synthetic row identifier for hidden columns on a card. */
export const moreRowId = (card: string) => `${card}/#more`;
/** Says why a column is worth a row; lower ranks win a place first. */
export type ColumnWhy = { focus: ReadonlySet<string>; connected: ReadonlySet<string> };
const isKey = (column: LineageColumn) =>
  column.badges.some(b => b.kind === 'pk' || b.kind === 'fk') || !!column.fk?.length;
function columnRank(column: LineageColumn, why: ColumnWhy) {
  if (why.focus.has(column.id)) return 0;
  if (why.connected.has(column.id)) return 1;
  return isKey(column) ? 2 : 3;
}
/** Chooses the rows of a card and the row an edge to each column attaches to. */
export function cardRows(
  card: LineageCard,
  why: ColumnWhy,
  options: { open?: boolean; uncapped?: boolean; maxRows?: number } = {},
) {
  const all = card.columns;
  let rows = all;
  if (!options.open && all.length > SMALL_CARD) {
    const ranked = all.map((column, index) => ({ column, index, rank: columnRank(column, why) }));
    const wanted = ranked.filter(x => x.rank < 3);
    const chosen = options.uncapped
      ? wanted
      : [...wanted]
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .slice(0, options.maxRows ?? COLLAPSED_MAX);
    rows = chosen.sort((a, b) => a.index - b.index).map(x => x.column);
  }
  const shown = new Set(rows.map(r => r.id));
  return {
    rows,
    hidden: all.length - rows.length,
    filterable: all.length > FILTER_AT,
    port: (id: string) => (shown.has(id) || !all.some(c => c.id === id) ? id : moreRowId(card.id)),
  };
}
// The asset search: objects (name, physical name) and their columns, datasets and their fields,
// metrics (and, on the mapping canvas, concepts and their relationships); exact names first, then
// prefixes, then substrings; separators are ignored ("invoice line").
/** Searches asset and column names, ranking exact matches before prefixes and substrings. */
export function findAssets(g: LineageGraph, query: string, limit = 20) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_.-]+/g, '');
  const q = norm(query);
  if (!q) return [];
  const hits: { id: string; card: string; label: string; kind: string; rank: number }[] = [];
  const rank = (s: string) => {
    const n = norm(s);
    return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : -1;
  };
  for (const c of g.cards.values()) {
    const best = [c.label, c.detail ?? ''].map(rank).filter(x => x >= 0);
    if (best.length)
      hits.push({ id: c.id, card: c.id, label: c.label, kind: c.kind, rank: Math.min(...best) });
    for (const col of c.columns) {
      const x = rank(col.path);
      if (x >= 0)
        hits.push({
          id: col.id,
          card: c.id,
          label: `${c.label}.${col.path}`,
          kind: c.kind === 'dataset' ? 'field' : c.kind === 'concept' ? 'relationship' : 'column',
          rank: x + 0.5,
        });
    }
  }
  return hits
    .sort(
      (a, b) =>
        a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}

/** Chooses the contract object with the most lineage connections. */
export function defaultCenter(g: LineageGraph) {
  const count = new Map<string, number>();
  for (const e of g.edges)
    for (const n of [e.from, e.to]) {
      const c = cardOfNode(g, n);
      if (g.cards.get(c)?.kind === 'object') count.set(c, (count.get(c) ?? 0) + 1);
    }
  const objects = [...g.cards.values()].filter(c => c.kind === 'object');
  return (
    objects.reduce(
      (best, c) => ((count.get(c.id) ?? 0) > (count.get(best?.id ?? '') ?? -1) ? c : best),
      objects[0] as LineageCard | undefined,
    )?.id ?? ''
  );
}

/** One foreign key the view follows: the hop it belongs to and the sentence that names it. */
export type ForeignKeyStep = { hop: number; sentence: string; child: string; parent: string };
/** The tables the view reaches, by hop, and the foreign keys that connect them. */
export type ForeignKeyPath = { levels: string[][]; steps: ForeignKeyStep[] };
/** Lists the foreign keys between the tables of a view as plain sentences, grouped by the hop at
 * which the farther table joined, and the table names of each hop in order. */
export function foreignKeyPath(g: LineageGraph, hops: ReadonlyMap<string, number>): ForeignKeyPath {
  const levels: string[][] = [];
  for (const [card, hop] of hops) {
    const label = g.cards.get(card)?.label;
    if (label) (levels[hop] ??= []).push(label);
  }
  const steps: ForeignKeyStep[] = [];
  for (const edge of g.edges) {
    const hop = foreignKeyHop(g, edge);
    const from = cardOfNode(g, edge.from);
    const to = cardOfNode(g, edge.to);
    if (!hop || !hops.has(from) || !hops.has(to)) continue;
    const reached = Math.max(1, hops.get(from)!, hops.get(to)!);
    steps.push({
      hop: reached,
      sentence: hopSentence(hop),
      child: g.cards.get(to)?.label ?? hop.child,
      parent: g.cards.get(from)?.label ?? hop.parent,
    });
  }
  steps.sort((a, b) => a.hop - b.hop || a.sentence.localeCompare(b.sentence));
  return { levels: levels.map(names => names ?? []), steps };
}
