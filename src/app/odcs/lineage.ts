/** Builds column-level lineage from declared names and parsed expressions without fetching or
 * running data. */
import { odcsForeignKeys } from '../../shared/odcs/foreign-keys';
import { ansiExpression, expressionRefs, metricDependencies } from '../../shared/metrics/deps';
import { readMetricExtension } from '../../shared/metrics/extension';
// Shared readers for the column-level lineage below: semantic models in a project file, physical
// names of objects and columns. Matching is by declared names and parsed expressions only.
/** Pairs a project path with its parsed definition for lineage construction. */
export type ProjectFile = { path: string; data: any };
const list = (value: unknown): any[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
};
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Builds an identifier for a contract object within a project file. */
export const objectId = (file: string, name: string) => `object:${file}#${name}`;
// Semantic models in a file: flat, legacy `semantic_model` lists, and models embedded in a
// consolidated ontology's `ontology_mappings`.
function models(projectFile: ProjectFile): { file: string; key: string; model: any }[] {
  const data = projectFile.data;
  if (!isObject(data) || data.kind === 'DataContract') return [];
  if (Array.isArray(data.ontology))
    return list(data.ontology_mappings).flatMap((om: any, i: number) => (isObject(om?.semantic_model) ? [{ file: projectFile.path, key: `ontology_mappings/${i}`, model: om.semantic_model }] : []));
  if (Array.isArray(data.datasets)) return [{ file: projectFile.path, key: '', model: data }];
  return list(data.semantic_model).flatMap((m: any, i: number) => (isObject(m) && Array.isArray(m.datasets) ? [{ file: projectFile.path, key: `semantic_model/${i}`, model: m }] : []));
}
const physical = (o: any) => (typeof o?.physicalName === 'string' ? o.physicalName : String(o?.name));
const columnOf = (p: any) => (typeof p?.physicalName === 'string' ? p.physicalName : String(p?.name));

// Edges follow referenced key → foreign key → semantic field → metric → dependent metric. Cards
// include contract objects, semantic datasets, metrics and external stubs. Matching uses declared
// names and parsed expressions; nothing is fetched or executed.
import { odcsExternalForeignKeys } from '../../shared/odcs/foreign-keys';
import { flattenProperties } from './odcs-diff';
import { propertyBadges, badge, type BadgeInfo } from '../components/PropertyBadges';
import type { LineageEdgeKind, MappingEdgeKind } from '../graph/edge-styles';
/** Names an asset category rendered as a lineage card. */
export type CardKind = 'object' | 'dataset' | 'metric' | 'external' | 'concept';
/** What a search hit is: a card, or one of the rows inside a card. */
export type AssetHitKind = CardKind | 'field' | 'column' | 'relationship';
/** Describes a lineage row with identity, labels and property badges. */
export type LineageColumn = {
  id: string;
  path: string;
  type?: string;
  badges: BadgeInfo[];
  fk?: string[];
};
// Mapping cards (src/app/mappings/mapping-graph.ts) also carry card badges (Unmapped) and resolver
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
  /** Semantic datasets that copy this table, with the columns each one copies. */
  copies?: { dataset: string; columns: string[] }[];
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
// A semantic dataset with the table's own name whose every field is one of the table's columns,
// unchanged, is a copy of that table. Drawing it as a second card joined 1:1 doubles every table
// and every line, so the table card stands for both. Returns field → property name, or null when
// the dataset renames, computes or adds anything.
function copiedColumns(dataset: any, table: any): Map<string, string> | null {
  const sameName = String(dataset.name).toLowerCase();
  if (sameName !== String(table.name).toLowerCase() && sameName !== physical(table).toLowerCase()) return null;
  const properties = new Map(
    list(table.properties)
      .filter(isObject)
      .map((property: any) => [columnOf(property), String(property.name)]),
  );
  const fields = list(dataset.fields).filter(isObject);
  if (!fields.length) return null;
  const copied = new Map<string, string>();
  for (const field of fields) {
    const name = String(field.name);
    const expression = ansiExpression(field)?.trim();
    const property = properties.get(name);
    if (!property || (expression && expression !== name)) return null;
    copied.set(name, property);
  }
  return copied;
}
// The table card stands for the copying dataset: one badge, and the copied columns so the
// property lineage can still name the dataset's fields.
function markCopy(table: LineageCard, dataset: string, columns: string[]) {
  if (!table.badges?.some(existing => existing.kind === 'semantic')) table.badges = [...(table.badges ?? []), badge('semantic')];
  table.copies = [...(table.copies ?? []), { dataset, columns }];
}
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
    for (const card of graph.cards.values()) for (const x of card.columns) owners.set(x.id, card.id);
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
export function buildLineage(files: ProjectFile[], contractPath: string, revision = ''): LineageGraph {
  const contract = files.find(f => f.path === contractPath)?.data;
  const schema = list(contract?.schema);
  const cards = new Map<string, LineageCard>();
  const edges: ColumnEdge[] = [];
  const seen = new Set<string>();
  const edge = (columnEdge: ColumnEdge) => {
    const key = `${columnEdge.from}>${columnEdge.to}>${columnEdge.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(columnEdge);
  };
  const keys = odcsForeignKeys(contract);
  // Foreign-key targets per object column, for FK badges.
  const fkTargets = new Map<string, string[]>();
  for (const foreignKey of keys)
    foreignKey.fromColumns.forEach((fromColumn, i) => {
      const id = columnId(objectId(contractPath, String(schema[foreignKey.from]?.name)), fromColumn);
      const target = `${schema[foreignKey.to]?.name}.${foreignKey.toColumns[i]}`;
      fkTargets.set(id, [...(fkTargets.get(id) ?? []), target]);
    });
  schema.forEach((schemaObject: any) => {
    if (!isObject(schemaObject)) return;
    const id = objectId(contractPath, String(schemaObject.name));
    const columns = flattenProperties(schemaObject.properties).map(flat => {
      const cid = columnId(id, flat.path);
      const fk = fkTargets.get(cid);
      let type: string | undefined;
      if (typeof flat.property.logicalType === 'string') {
        type = flat.property.logicalType;
      } else if (typeof flat.property.physicalType === 'string') {
        type = flat.property.physicalType;
      }
      return {
        id: cid,
        path: flat.path,
        type,
        badges: propertyBadges(flat.property, fk),
        ...(fk ? { fk } : {}),
      };
    });
    cards.set(id, {
      id,
      kind: 'object',
      label: String(schemaObject.name),
      file: contractPath,
      detail: physical(schemaObject),
      columns,
    });
  });
  // Referenced (parent) column → referencing (child) column , pairwise by position.
  for (const foreignKey of keys) {
    const parent = objectId(contractPath, String(schema[foreignKey.to]?.name));
    const child = objectId(contractPath, String(schema[foreignKey.from]?.name));
    foreignKey.fromColumns.forEach((fromColumn, i) =>
      edge({
        from: columnId(parent, foreignKey.toColumns[i]),
        to: columnId(child, fromColumn),
        kind: 'foreign-key',
        source: { file: contractPath, path: foreignKey.path },
        label: foreignKey.label,
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
    for (const fromColumn of x.fromColumns)
      edge({
        from: id,
        to: columnId(child, fromColumn),
        kind: 'foreign-key',
        source: { file: contractPath, path: x.path },
      });
  }
  // Declared transforms: source objects → the property (card to column).
  schema.forEach((schemaObject: any, i: number) => {
    if (!isObject(schemaObject)) return;
    const id = objectId(contractPath, String(schemaObject.name));
    const walk = (props: unknown, prefix: string, path: (string | number)[]) =>
      list(props).forEach((property: any, j: number) => {
        if (!isObject(property)) return;
        const at = prefix + String(property.name);
        const pp = [...path, 'properties', j];
        for (const src of list(property.transformSourceObjects).filter((s: unknown): s is string => typeof s === 'string')) {
          const match = schema.find((x: any) => isObject(x) && (x.name === src || physical(x) === src));
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
        walk(property.properties, at + '.', pp);
      });
    walk(schemaObject.properties, '', ['schema', i]);
  });
  // Semantic models: datasets whose `source` is an object's physical name or name.
  let unmatched = 0;
  const metricEdges: {
    from: string;
    to: string;
    source: { file: string; path: (string | number)[] };
  }[] = [];
  for (const projectFile of files)
    for (const { file, key, model } of models(projectFile)) {
      const datasets = list(model.datasets).filter(isObject);
      const metrics = list(model.metrics).filter(isObject);
      const names = new Set<string>(metrics.map((m: any) => m.name).filter((n: unknown) => typeof n === 'string'));
      const base = key ? key.split('/').map(s => (/^\d+$/.test(s) ? Number(s) : s)) : [];
      const metricCard = (metric: any) => {
        const id = metricCardId(file, key, String(metric.name));
        if (!cards.has(id)) {
          const ext = readMetricExtension(metric).value;
          cards.set(id, {
            id,
            kind: 'metric',
            label: String(ext?.label ?? metric.name),
            file,
            detail: ansiExpression(metric),
            columns: [],
            governed: !!ext,
          });
        }
        return id;
      };
      const fieldColumns = new Map<string, string>();
      datasets.forEach((dataset: any, di: number) => {
        const source = list(dataset.source)[0];
        const readers = schema.filter((o: any) => isObject(o) && (physical(o) === source || o.name === source));
        if (!readers.length) {
          unmatched++;
          return;
        }
        const copied = readers.length === 1 ? copiedColumns(dataset, readers[0]) : null;
        if (copied) {
          const objId = objectId(contractPath, String(readers[0].name));
          const table = cards.get(objId);
          if (table) markCopy(table, String(dataset.name), [...copied.values()]);
          for (const [field, property] of copied) fieldColumns.set(`${dataset.name}.${field}`, columnId(objId, property));
          return;
        }
        const id = datasetCardId(file, key, String(dataset.name));
        const pk = new Set(list(dataset.primary_key).map(String));
        const fields = list(dataset.fields).filter(isObject);
        cards.set(id, {
          id,
          kind: 'dataset',
          label: String(dataset.name),
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
        for (const reader of readers) {
          const objId = objectId(contractPath, String(reader.name));
          const props = new Map(
            list(reader.properties)
              .filter(isObject)
              .map((p: any) => [columnOf(p), String(p.name)]),
          );
          fields.forEach((fd: any, fi: number) => {
            const sql = ansiExpression(fd);
            const cols = sql ? [...new Set(expressionRefs(sql).map(r => r.column))] : [String(fd.name)];
            for (const col of cols) {
              const propertyName = props.get(col);
              if (propertyName)
                edge({
                  from: columnId(objId, propertyName),
                  to: columnId(id, String(fd.name)),
                  kind: 'reads',
                  source: { file, path: [...base, 'datasets', di, 'fields', fi] },
                  ...(ambiguous ? { ambiguous: true } : {}),
                });
            }
          });
        }
        fields.forEach((fd: any) => fieldColumns.set(`${dataset.name}.${fd.name}`, columnId(id, String(fd.name))));
      });
      // Field → metric (aggregates); metric → metric (uses).
      metrics.forEach((metric: any, mi: number) => {
        const sql = ansiExpression(metric) ?? '';
        const refs = expressionRefs(sql);
        for (const ref of refs) {
          let fieldColumn: string | undefined;
          if (ref.table !== null) {
            fieldColumn = fieldColumns.get(`${ref.table}.${ref.column}`);
          } else if (datasets.length === 1 && !names.has(ref.column)) {
            fieldColumn = fieldColumns.get(`${datasets[0].name}.${ref.column}`);
          } else {
            fieldColumn = undefined;
          }
          if (fieldColumn)
            edge({
              from: fieldColumn,
              to: metricCard(metric),
              kind: 'aggregates',
              source: { file, path: [...base, 'metrics', mi] },
            });
        }
        for (const dep of metricDependencies(sql, names))
          metricEdges.push({
            from: metricCardId(file, key, dep),
            to: metricCardId(file, key, String(metric.name)),
            source: { file, path: [...base, 'metrics', mi] },
          });
      });
      // Metrics on metrics: only those whose dependency is already part of the lineage, to any
      // depth.
      let added = true;
      while (added) {
        added = false;
        for (const metricEdge of metricEdges)
          if (cards.has(metricEdge.from) && !seen.has(`${metricEdge.from}>${metricEdge.to}>uses`)) {
            const metric = metrics.find((x: any) => metricCardId(file, key, String(x.name)) === metricEdge.to);
            if (!metric) continue;
            metricCard(metric);
            edge({ ...metricEdge, kind: 'uses' });
            added = true;
          }
      }
    }
  const lineageGraph: LineageGraph = {
    contract: contractPath,
    cards,
    edges,
    revision,
    unmatchedDatasets: unmatched,
  };
  const owners = new Map<string, string>();
  for (const card of cards.values()) for (const col of card.columns) owners.set(col.id, card.id);
  columnOwner.set(lineageGraph, owners);
  return lineageGraph;
}
// Adjacency over node ids (columns and column-less cards).
const adjacency = new WeakMap<LineageGraph, { out: Map<string, number[]>; in: Map<string, number[]> }>();
function adj(lineageGraph: LineageGraph) {
  let lists = adjacency.get(lineageGraph);
  if (!lists) {
    lists = { out: new Map(), in: new Map() };
    lineageGraph.edges.forEach((e, i) => {
      (lists!.out.get(e.from) ?? lists!.out.set(e.from, []).get(e.from)!).push(i);
      (lists!.in.get(e.to) ?? lists!.in.set(e.to, []).get(e.to)!).push(i);
    });
    adjacency.set(lineageGraph, lists);
  }
  return lists;
}

/** Expands a selection to its column or the card and all of its columns. */
export function selectionNodes(lineageGraph: LineageGraph, id: string) {
  const lineageCard = lineageGraph.cards.get(id);
  return lineageCard ? [id, ...lineageCard.columns.map(x => x.id)] : [id];
}
// Path highlight: every node and edge upstream ('up'), downstream ('down') or both of the given
// nodes. 'both' is ancestors plus descendants, never siblings. Cycles terminate.
/** Finds ancestors, descendants or both without including siblings; cycles terminate. */
export function closure(lineageGraph: LineageGraph, ids: string[], direction: 'up' | 'down' | 'both' = 'both') {
  const lists = adj(lineageGraph);
  const nodes = new Set<string>(ids);
  const edgeSet = new Set<number>();
  const walk = (dir: 'up' | 'down') => {
    const seenHere = new Set<string>(ids);
    const queue = [...ids];
    while (queue.length) {
      const nodeId = queue.shift()!;
      for (const i of (dir === 'down' ? lists.out : lists.in).get(nodeId) ?? []) {
        edgeSet.add(i);
        const columnEdge = lineageGraph.edges[i];
        const next = dir === 'down' ? columnEdge.to : columnEdge.from;
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
export function around(lineageGraph: LineageGraph, center: string, steps = 1) {
  const card = (n: string) => cardOfNode(lineageGraph, n);
  const shown = new Set<string>([center]);
  const nodes = selectionNodes(lineageGraph, center);
  // Upstream and downstream along every line kind except foreign keys.
  const flowOnly = (start: string[]) => {
    const adjacencyLists = adj(lineageGraph);
    const seenN = new Set(start);
    const queue = [...start];
    const cardsOut = new Set<string>();
    while (queue.length) {
      const nodeId = queue.shift()!;
      for (const [map, dir] of [
        [adjacencyLists.out, 'down'],
        [adjacencyLists.in, 'up'],
      ] as const)
        for (const i of map.get(nodeId) ?? []) {
          const columnEdge = lineageGraph.edges[i];
          if (columnEdge.kind === 'foreign-key') continue;
          const next = dir === 'down' ? columnEdge.to : columnEdge.from;
          cardsOut.add(card(next));
          if (!seenN.has(next)) {
            seenN.add(next);
            queue.push(next);
          }
        }
    }
    return cardsOut;
  };
  for (const cardId of flowOnly(nodes)) shown.add(cardId);
  // Foreign-key reach from the objects among the shown cards that the centre itself reads from.
  const objects = [...shown].filter(c => lineageGraph.cards.get(c)?.kind === 'object' || lineageGraph.cards.get(c)?.kind === 'external');
  const fkNeighbours = (cardId: string) => {
    const out = new Set<string>();
    for (const col of selectionNodes(lineageGraph, cardId)) {
      for (const i of adj(lineageGraph).out.get(col) ?? []) {
        const columnEdge = lineageGraph.edges[i];
        if (columnEdge.kind === 'foreign-key') out.add(card(columnEdge.to));
      }
      for (const i of adj(lineageGraph).in.get(col) ?? []) {
        const columnEdge = lineageGraph.edges[i];
        if (columnEdge.kind === 'foreign-key') out.add(card(columnEdge.from));
      }
    }
    out.delete(cardId);
    return out;
  };
  // The foreign-key hop at which each table joined the view; the tables the centre reads are hop 0.
  const hops = new Map<string, number>(objects.map(c => [c, 0]));
  let frontier = objects;
  for (let s = 0; s < steps; s++) {
    const next: string[] = [];
    for (const cardId of frontier)
      for (const neighbour of fkNeighbours(cardId))
        if (!shown.has(neighbour)) {
          shown.add(neighbour);
          hops.set(neighbour, s + 1);
          next.push(neighbour);
        }
    frontier = next;
  }
  const hidden = new Map<string, number>();
  for (const cardId of shown) {
    let hiddenCount = 0;
    if (lineageGraph.cards.get(cardId)?.kind === 'object' || lineageGraph.cards.get(cardId)?.kind === 'external') for (const x of fkNeighbours(cardId)) if (!shown.has(x)) hiddenCount++;
    if (hiddenCount) hidden.set(cardId, hiddenCount);
  }
  return { cards: shown, hidden, hops };
}
// The mapping canvas' reach: cards within `steps` lines of the centre in any direction, plus the
// cards holding rows a shown link passes through; neighbours one line further are counted as
// hidden on the card they connect to.
/** Builds a mapping neighborhood by edge distance, including intermediate join rows. */
export function aroundHops(lineageGraph: LineageGraph, center: string, steps = 1) {
  const card = (n: string) => cardOfNode(lineageGraph, n);
  const links = new Map<string, Set<string>>();
  const link = (cardId: string, otherCardId: string) => {
    if (cardId === otherCardId) return;
    (links.get(cardId) ?? links.set(cardId, new Set()).get(cardId)!).add(otherCardId);
    (links.get(otherCardId) ?? links.set(otherCardId, new Set()).get(otherCardId)!).add(cardId);
  };
  for (const edge of lineageGraph.edges) link(card(edge.from), card(edge.to));
  const shown = new Set([center]);
  let frontier = [center];
  for (let s = 0; s < steps; s++) {
    const next: string[] = [];
    for (const cardId of frontier)
      for (const neighbour of links.get(cardId) ?? [])
        if (!shown.has(neighbour)) {
          shown.add(neighbour);
          next.push(neighbour);
        }
    frontier = next;
  }
  // A metric binds to concepts and the datasets sit one link further. Its view also shows the
  // datasets of those concepts so that concept, dataset and metric read as one chain.
  if (lineageGraph.cards.get(center)?.kind === 'metric') {
    const datasets = new Set<string>();
    for (const cardId of shown) {
      for (const neighbour of links.get(cardId) ?? []) {
        if (lineageGraph.cards.get(neighbour)?.kind === 'dataset') datasets.add(neighbour);
      }
    }
    for (const dataset of datasets) shown.add(dataset);
  }
  for (const edge of lineageGraph.edges) if (edge.via && shown.has(card(edge.from)) && shown.has(card(edge.to))) for (const value of edge.via) shown.add(card(value));
  const hidden = new Map<string, number>();
  for (const cardId of shown) {
    let hiddenCount = 0;
    for (const x of links.get(cardId) ?? []) if (!shown.has(x)) hiddenCount++;
    if (hiddenCount) hidden.set(cardId, hiddenCount);
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
const isKey = (column: LineageColumn) => column.badges.some(b => b.kind === 'pk' || b.kind === 'fk') || !!column.fk?.length;
function columnRank(column: LineageColumn, why: ColumnWhy) {
  if (why.focus.has(column.id)) return 0;
  if (why.connected.has(column.id)) return 1;
  return isKey(column) ? 2 : 3;
}
/** Chooses the rows of a card and the row an edge to each column attaches to. */
export function cardRows(card: LineageCard, why: ColumnWhy, options: { open?: boolean; uncapped?: boolean; maxRows?: number } = {}) {
  const all = card.columns;
  let rows = all;
  if (!options.open && all.length > SMALL_CARD) {
    const ranked = all.map((column, index) => ({ column, index, rank: columnRank(column, why) }));
    const wanted = ranked.filter(x => x.rank < 3);
    const chosen = options.uncapped ? wanted : [...wanted].sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, options.maxRows ?? COLLAPSED_MAX);
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
/** What a column of a card is called in search results: datasets have fields, concepts relationships. */
function columnHitKind(cardKind: CardKind): AssetHitKind {
  if (cardKind === 'dataset') return 'field';
  if (cardKind === 'concept') return 'relationship';
  return 'column';
}
/** Searches asset and column names, ranking exact matches before prefixes and substrings. */
export function findAssets(lineageGraph: LineageGraph, query: string, limit = 20) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_.-]+/g, '');
  const needle = norm(query);
  if (!needle) return [];
  const hits: { id: string; card: string; label: string; kind: AssetHitKind; rank: number }[] = [];
  const rank = (label: string) => {
    const name = norm(label);
    if (name === needle) {
      return 0;
    }
    if (name.startsWith(needle)) {
      return 1;
    }
    if (name.includes(needle)) {
      return 2;
    }
    return -1;
  };
  for (const card of lineageGraph.cards.values()) {
    const best = [card.label, card.detail ?? ''].map(rank).filter(x => x >= 0);
    if (best.length)
      hits.push({
        id: card.id,
        card: card.id,
        label: card.label,
        kind: card.kind,
        rank: Math.min(...best),
      });
    for (const col of card.columns) {
      const x = rank(col.path);
      if (x >= 0)
        hits.push({
          id: col.id,
          card: card.id,
          label: `${card.label}.${col.path}`,
          kind: columnHitKind(card.kind),
          rank: x + 0.5,
        });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Chooses the contract object with the most lineage connections. */
export function defaultCenter(lineageGraph: LineageGraph) {
  const count = new Map<string, number>();
  for (const edge of lineageGraph.edges)
    for (const nodeId of [edge.from, edge.to]) {
      const cardId = cardOfNode(lineageGraph, nodeId);
      if (lineageGraph.cards.get(cardId)?.kind === 'object') count.set(cardId, (count.get(cardId) ?? 0) + 1);
    }
  const objects = [...lineageGraph.cards.values()].filter(c => c.kind === 'object');
  return objects.reduce((best, c) => ((count.get(c.id) ?? 0) > (count.get(best?.id ?? '') ?? -1) ? c : best), objects[0] as LineageCard | undefined)?.id ?? '';
}

/** One foreign key the view follows: the hop it belongs to and the sentence that names it. */
export type ForeignKeyStep = { hop: number; sentence: string; child: string; parent: string };
/** The tables the view reaches, by hop, and the foreign keys that connect them. */
export type ForeignKeyPath = { levels: string[][]; steps: ForeignKeyStep[] };
/** Lists the foreign keys between the tables of a view as plain sentences, grouped by the hop at
 * which the farther table joined, and the table names of each hop in order. */
export function foreignKeyPath(lineageGraph: LineageGraph, hops: ReadonlyMap<string, number>): ForeignKeyPath {
  const levels: string[][] = [];
  for (const [card, hop] of hops) {
    const label = lineageGraph.cards.get(card)?.label;
    if (label) (levels[hop] ??= []).push(label);
  }
  const steps: ForeignKeyStep[] = [];
  for (const edge of lineageGraph.edges) {
    const hop = foreignKeyHop(lineageGraph, edge);
    const from = cardOfNode(lineageGraph, edge.from);
    const to = cardOfNode(lineageGraph, edge.to);
    if (!hop || !hops.has(from) || !hops.has(to)) continue;
    const reached = Math.max(1, hops.get(from)!, hops.get(to)!);
    steps.push({
      hop: reached,
      sentence: hopSentence(hop),
      child: lineageGraph.cards.get(to)?.label ?? hop.child,
      parent: lineageGraph.cards.get(from)?.label ?? hop.parent,
    });
  }
  steps.sort((a, b) => a.hop - b.hop || a.sentence.localeCompare(b.sentence));
  return { levels: levels.map(names => names ?? []), steps };
}
