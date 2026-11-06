/** Displays column-level lineage with path highlighting, paging and reversible graph expansion. */
import { useFarZoom } from '../graph/FarZoom';
import { useStageSize } from '../graph/stage-size';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActionHistory } from '../workspace/ActionHistoryContext';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { ReactFlow, Background, type Edge, type ReactFlowInstance } from '@xyflow/react';
import { X } from 'lucide-react';
import { LineageLegend, type LegendKind } from '../graph/LineageLegend';
import { type EdgeKind } from '../graph/edge-styles';
import { currentStep } from '../graph/walk';
import { aroundHops, around } from './lineage';
import { registerSet, type Direction } from '../graph/expansion';
import { placeBoxes, type Box } from '../graph/incremental-layout';
import { PIERCE_BUDGET, PIERCE_MAX } from '../graph/pierce';
import { PierceBanner } from '../graph/PierceControls';
import { type Fullscreen } from '../graph/fullscreen';
import { Modal } from '../projects/Modal';
import { SelectedPath } from './SelectedPath';
import { useNarrowScreen } from '../workspace/hooks/useNarrowScreen';
import { closure, findAssets, foreignKeyPath, cardRows, COLLAPSED_MAX, selectionNodes, cardOfNode, type ColumnWhy, type LineageGraph, type LineageCard } from './lineage';
import { LineageCardNode, type CardData } from './LineageCard';
import { cardHeight, cardGeometry, CARD_W, HEADER_H, ROW_H, MORE_H, FILTER_H, FOOT_H, LIST_ROWS, type LayoutCard, type LayoutEdge } from './lineage-layout';
import { buildLineLabels, type LineLabel } from './edge-labels';
import { kindOrder, planFirstView } from './lineage-view';
import { edgeTypes } from './LineageEdge';
import { LineageSubbar, LineageToolbar } from './LineageToolbar';
import { MeasurementWatchdog, useLayout, useMeasuredNodeSizes } from './useLineageLayout';
import { useLineagePierce } from './useLineagePierce';
import { useLineageReach } from './useLineageReach';
import { FIRST_VIEW_COLUMN_GAP, FIRST_VIEW_MARGIN, FIRST_VIEW_ROW_GAP, MIN_ZOOM, READABLE, useCardAnchor, useLineageViewport } from './useLineageViewport';
import { useLineageWalk } from './useLineageWalk';
import './odcs.css';
// The selected column’s path is emphasized while unrelated rows dim. Navigation records expansions
// and centers; ELK lays out row ports in a worker.
const nodeTypes = { card: LineageCardNode };
// A card must fit the pane whole, so a short pane (a phone) shows fewer rows per card.
function rowBudget(paneHeight: number) {
  if (paneHeight === 0) return { maxRows: COLLAPSED_MAX, listRows: LIST_ROWS };
  const room = paneHeight / READABLE - 2 * FIRST_VIEW_MARGIN - HEADER_H;
  return {
    maxRows: Math.min(COLLAPSED_MAX, Math.max(3, Math.floor((room - MORE_H) / ROW_H))),
    listRows: Math.min(LIST_ROWS, Math.max(3, Math.floor((room - FILTER_H - FOOT_H) / ROW_H))),
  };
}
const BUNDLE_AT = 8;
const BUNDLE_PREFIX = 'bundle:';
// The mapping canvas (src/app/mappings/MappingCanvas.tsx) reuses this canvas with mapping names and
// lines.
const MAPPING_KINDS = { concept: 'Concept', dataset: 'Dataset', metric: 'Metric' };
type Props = {
  mode?: 'lineage' | 'mapping';
  toolbarExtra?: React.ReactNode;
  cardFilter?: (card: LineageCard) => boolean;
  onFinding?: (card: LineageCard, message: string) => void;
  selectionExtra?: (selected: string, path: { nodes: Set<string>; edges: Set<number> } | null) => React.ReactNode;
  graph: LineageGraph;
  center: string;
  ariaLabel?: string;
  fullscreen?: Fullscreen;
  compact?: boolean;
  initialFit?: 'readable' | 'all';
  storageKey?: string;
  historyKey?: string;
  pierceFromCenter?: boolean;
  onCenterChange?: (id: string) => void;
  onOpenAsset?: (card: LineageCard) => void;
  onNeighborhood?: (card: LineageCard) => void;
  groupOf?: (card: LineageCard) => { name: string; color: string } | undefined;
};
/** Displays lineage cards with navigation, path highlighting and graph expansion. */
export function LineageCanvas({
  mode = 'lineage',
  toolbarExtra,
  cardFilter,
  onFinding,
  selectionExtra,
  graph,
  center: initial,
  ariaLabel = 'Lineage graph',
  fullscreen,
  compact = false,
  initialFit = 'readable',
  storageKey,
  historyKey = 'lineage',
  pierceFromCenter = false,
  onCenterChange,
  onOpenAsset,
  onNeighborhood,
  groupOf,
}: Props) {
  const actionHistory = useActionHistory();
  const mapping = mode === 'mapping';
  const reachOf = mapping ? aroundHops : around;
  const { walk, dispatch, center, steps, setSteps, sets, walkTo } = useLineageWalk({ graph, initial, historyKey, storageKey, onCenterChange });
  const farZoom = useFarZoom();
  const [selected, setSelected] = useRecordedState(`${historyKey}.selected`, '');
  const stage = useRef<HTMLDivElement | null>(null);
  const stageSize = useStageSize(stage, !!selected);
  const [openColumns, setOpenColumns] = useRecordedState<Set<string>>(`${historyKey}.openColumns`, () => new Set());
  const [showResults, setShowResults] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  // On a narrow window, and in the embedded canvas, the path opens in a dialog so the canvas keeps its room.
  const pathInDialog = useNarrowScreen() || compact;
  const [showMetrics, setShowMetrics] = useRecordedState(`${historyKey}.showMetrics`, true);
  const [showExternal, setShowExternal] = useRecordedState(`${historyKey}.showExternal`, true);
  const [openGroups, setOpenGroups] = useRecordedState<Set<string>>(`${historyKey}.openGroups`, () => new Set());
  // Card pairs whose bundled line was clicked, so their lines show one by one.
  const [splitPairs, setSplitPairs] = useRecordedState<Set<string>>(`${historyKey}.splitPairs`, () => new Set());
  // The extras of one centre do not carry over to the next. A canvas that appears already holds
  // what Back or Forward gave it, so only a change of centre clears them.
  const shownCenter = useRef(center);
  useEffect(() => {
    if (shownCenter.current === center) return;
    shownCenter.current = center;
    setSelected('');
    setOpenColumns(new Set());
    setOpenGroups(new Set());
    setSplitPairs(new Set());
  }, [center]);
  const reach = useLineageReach({ graph, center, steps, sets, mapping, showMetrics, showExternal, cardFilter, selected, openGroups });
  const cardFor = (id: string) => graph.cards.get(id) ?? reach.groups.get(id)!;
  const shownCard = (id: string) => reach.alias.get(id) ?? id;
  // A mapping link lights up the join rows it passes through.
  const path = useMemo(() => {
    if (!selected) return null;
    const pathClosure = closure(graph, selectionNodes(graph, selected));
    for (const i of pathClosure.edges) for (const viaNode of graph.edges[i].via ?? []) pathClosure.nodes.add(viaNode);
    return pathClosure;
  }, [graph, selected]);
  const [query, setQuery] = useState('');
  const results = useMemo(() => findAssets(graph, query), [graph, query]);
  // Columns that earn a row on a collapsed card: those with a line in the view, and those on the
  // selected path or matching the search.
  const why = useMemo<ColumnWhy>(() => {
    const connected = new Set<string>();
    for (const edge of graph.edges) {
      const from = shownCard(cardOfNode(graph, edge.from));
      const to = shownCard(cardOfNode(graph, edge.to));
      if (!reach.cards.has(from) || !reach.cards.has(to)) continue;
      connected.add(edge.from);
      connected.add(edge.to);
    }
    const focus = new Set<string>(path?.nodes);
    for (const hit of results) focus.add(hit.id);
    return { focus, connected };
  }, [graph, reach, path, results]);
  const pierced = reach.active.some(x => x.kind === 'pierce');
  const { maxRows, listRows } = rowBudget(stageSize.height);
  const rowsByCard = useMemo(() => {
    const out = new Map<string, ReturnType<typeof cardRows>>();
    for (const id of reach.cards) {
      const open = openColumns.has(id);
      out.set(id, cardRows(cardFor(id), why, { open, uncapped: pierced, maxRows }));
    }
    return out;
  }, [graph, reach, why, openColumns, pierced, maxRows]);
  // Lines between shown cards, attached to visible rows; many lines between two cards bundle.
  const lines = useMemo(() => {
    const out = new Map<
      string,
      {
        id: string;
        from: string;
        to: string;
        fromCard: string;
        toCard: string;
        kind: EdgeKind;
        onPath: boolean;
        count: number;
        edges: number[];
      }
    >();
    graph.edges.forEach((edge, i) => {
      const fc = shownCard(cardOfNode(graph, edge.from));
      const tc = shownCard(cardOfNode(graph, edge.to));
      if (!reach.cards.has(fc) || !reach.cards.has(tc) || (fc === tc && edge.from === edge.to)) return;
      const from = reach.groups.has(fc) ? fc : rowsByCard.get(fc)!.port(edge.from);
      const to = reach.groups.has(tc) ? tc : rowsByCard.get(tc)!.port(edge.to);
      const key = `${from}>${to}>${edge.kind}`;
      const on = !!path?.edges.has(i);
      const x = out.get(key);
      if (x) {
        x.count++;
        x.edges.push(i);
        x.onPath ||= on;
      } else
        out.set(key, {
          id: key,
          from,
          to,
          fromCard: fc,
          toCard: tc,
          kind: edge.kind,
          onPath: on,
          count: 1,
          edges: [i],
        });
    });
    // Bundle per card pair when nothing on it is selected (edge case "a column read by many
    // fields").
    const pairs = new Map<string, typeof out extends Map<any, infer V> ? V[] : never>();
    for (const line of out.values()) {
      const key = `${line.fromCard}>${line.toCard}>${line.kind}`;
      (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(line);
    }
    const bundled: typeof out extends Map<any, infer V> ? V[] : never = [];
    for (const [key, ls] of pairs) {
      if (ls.length >= BUNDLE_AT && !ls.some(l => l.onPath) && !splitPairs.has(key)) {
        const first = ls[0];
        bundled.push({
          id: BUNDLE_PREFIX + key,
          from: first.fromCard,
          to: first.toCard,
          fromCard: first.fromCard,
          toCard: first.toCard,
          kind: first.kind,
          onPath: false,
          count: ls.reduce((a, l) => a + l.count, 0),
          edges: ls.flatMap(l => l.edges),
        });
      } else bundled.push(...ls);
    }
    return bundled;
  }, [graph, reach, rowsByCard, path, splitPairs]);
  const allLayoutCards = useMemo<LayoutCard[]>(
    () =>
      [...reach.cards].map(id => {
        const rows = rowsByCard.get(id)!;
        if (openColumns.has(id)) {
          const columns = cardFor(id).columns.map(c => c.id);
          return {
            id,
            ...cardGeometry(cardFor(id), cardFor(id).columns),
            rows: columns,
            portRows: columns.filter(c => why.connected.has(c)),
            more: false,
            open: { filter: rows.filterable, visibleRows: listRows },
          };
        }
        const shown = rows.rows.map(r => r.id);
        return { id, ...cardGeometry(cardFor(id), rows.rows), rows: shown, portRows: shown, more: rows.hidden > 0 };
      }),
    [reach, rowsByCard, openColumns, why, listRows],
  );
  const cardHeights = useMemo(() => new Map(allLayoutCards.map(c => [c.id, cardHeight(c)])), [allLayoutCards]);
  // The first view frames the centre and the nearest cards that fit whole at a readable size.
  // Every card of the reach is still laid out, so the rest are a pan away and Fit shows them all.
  const firstViewCards = useMemo(() => [...reach.cards].filter(id => !reach.incremental.has(id)), [reach]);
  const framedCards = useMemo(() => {
    if (stageSize.width === 0 || reach.active.some(x => x.kind === 'pierce')) return null;
    const heights = new Map(firstViewCards.map(id => [id, cardHeights.get(id) ?? HEADER_H]));
    const cardLines = lines.map(l => ({ from: l.fromCard, to: l.toCard }));
    return planFirstView({
      centre: center,
      heights,
      lines: cardLines,
      rank: id => kindOrder(cardFor(id).kind),
      view: stageSize,
      zoom: READABLE,
      margin: FIRST_VIEW_MARGIN,
      cardWidth: CARD_W,
      columnGap: FIRST_VIEW_COLUMN_GAP,
      rowGap: FIRST_VIEW_ROW_GAP,
    });
  }, [stageSize, center, lines, reach, firstViewCards, cardHeights]);
  const layoutCards = useMemo(() => allLayoutCards.filter(c => !reach.incremental.has(c.id)), [allLayoutCards, reach]);
  const layoutCardsRef = useRef(allLayoutCards);
  layoutCardsRef.current = allLayoutCards;
  const layoutEdges = useMemo<LayoutEdge[]>(
    () => lines.filter(l => ![l.fromCard, l.toCard].some(c => reach.incremental.has(c))).map(l => ({ id: l.id, from: l.from, to: l.to, fromCard: l.fromCard, toCard: l.toCard })),
    [lines, reach],
  );
  const layoutKey = useMemo(() => JSON.stringify([layoutCards, layoutEdges.map(e => e.id)]), [layoutCards, layoutEdges]);
  const { result: elk, busy } = useLayout(layoutCards, layoutEdges, layoutKey);
  const { sizeFor, recordSizes } = useMeasuredNodeSizes();
  // ELK positions, then each expansion's new cards beside their origin, in order; nothing placed
  // moves.
  const result = useMemo(() => {
    if (!elk) return null;
    const size = cardHeights;
    let boxes = new Map<string, Box>(Object.entries(elk.layout.positions).map(([id, p]) => [id, { x: p.x, y: p.y, w: CARD_W, h: size.get(id) ?? HEADER_H }]));
    for (const x of reach.active)
      if (x.kind === 'expand' && boxes.has(x.from)) {
        const fromCols = new Set(selectionNodes(graph, x.from));
        const items = x.nodes
          .filter(n => reach.incremental.has(n) && !boxes.has(n))
          .map(node => ({
            id: node,
            side: (graph.edges.some(e => fromCols.has(e.from) && cardOfNode(graph, e.to) === node) ? 1 : -1) as -1 | 1,
            w: CARD_W,
            h: size.get(node) ?? HEADER_H,
          }));
        boxes = placeBoxes(boxes, x.from, items);
      }
    return {
      key: elk.key,
      layout: {
        positions: Object.fromEntries([...boxes].map(([id, b]) => [id, { x: b.x, y: b.y }])),
        routes: elk.layout.routes,
      },
    };
  }, [elk, reach, cardHeights, graph]);
  const select = useCallback((id: string) => setSelected(s => (s === id ? '' : id)), []);
  // Expand / Collapse / Full pierce, recorded on the trail.
  const record = (set: ReturnType<typeof registerSet>, name: string) =>
    dispatch({
      type: 'push',
      step: { doc: graph.contract, center, name, kind: 'expand', set: set.id },
    });
  const labelOf = (id: string) => graph.cards.get(id)?.label ?? id;
  const expand = (cid: string) => {
    const neighbourhood = reachOf(graph, cid, 1);
    const nodes = [...neighbourhood.cards].filter(card => card !== cid && (mapping || graph.cards.get(card)?.kind === 'object' || graph.cards.get(card)?.kind === 'external'));
    record(
      registerSet({
        kind: 'expand',
        from: cid,
        direction: 'both',
        nodes,
        edges: [],
        frontier: {},
        total: nodes.length,
        budget: nodes.length,
      }),
      `expanded ${labelOf(cid)}`,
    );
  };
  const collapse = (cid: string) => {
    const target = reach.expandedBy.get(cid);
    if (target)
      record(
        registerSet({
          kind: 'collapse',
          from: cid,
          target,
          direction: 'both',
          nodes: [],
          edges: [],
          frontier: {},
          total: 0,
          budget: 0,
        }),
        `collapsed ${labelOf(cid)}`,
      );
  };
  const [direction, setDirection] = useRecordedState<Direction>(`${historyKey}.direction`, 'both');
  const { piercing, stopPierce, fullPierce } = useLineagePierce({ graph, center, selected, pierceFromCenter, direction, actionHistory, record, labelOf });
  const lastSet = reach.active.at(-1);
  // A selected column is named by its last path segment; a selected card by its label.
  const selectedColumnOnly = !!selected && selected.includes('/') && !graph.cards.has(selected);
  const selectedLabel = selectedColumnOnly ? selected.slice(selected.lastIndexOf('/') + 1) : labelOf(selected);
  const pierceOriginLabel = selected && !pierceFromCenter ? selectedLabel : labelOf(center);
  const changeHops = (count: number) => {
    stopPierce();
    setSteps(count);
    if (sets.length) dispatch({ type: 'reset', step: { doc: graph.contract, center, name: labelOf(center) } });
  };
  const currentIsExpansion = currentStep(walk)?.kind === 'expand';
  const flow = useRef<ReactFlowInstance<any, any> | null>(null);
  const { anchoredCard, keepOnScreen } = useCardAnchor(flow, result?.key);
  const nodes = useMemo(() => {
    if (!result) return [];
    return [...reach.cards]
      .filter(id => result.layout.positions[id])
      .map(id => {
        const lineageCard = cardFor(id);
        const cardRowSet = rowsByCard.get(id)!;
        const group = groupOf?.(lineageCard);
        const isGroup = reach.groups.has(id);
        const data: CardData = {
          kindNames: mapping ? MAPPING_KINDS : undefined,
          onFinding,
          card: lineageCard,
          rows: cardRowSet.rows,
          more: cardRowSet.hidden,
          columnsOpen: openColumns.has(id),
          filterable: cardRowSet.filterable,
          listRows,
          connected: why.connected,
          hiddenNeighbours: isGroup ? 1 : (reach.hidden.get(id) ?? 0),
          group: isGroup,
          selected,
          onPath: path?.nodes ?? null,
          center: id === center,
          tint: group?.color,
          expanded: reach.expandedBy.has(id),
          onSelect: select,
          onOpenColumns: cid => {
            keepOnScreen(cid);
            setOpenColumns(x => new Set([...x, cid]));
          },
          onCloseColumns: cid => {
            keepOnScreen(cid);
            setOpenColumns(x => new Set([...x].filter(other => other !== cid)));
          },
          onWalk: cid => walkTo(cid, selected || undefined),
          onExpand: cid => (reach.groups.has(cid) ? setOpenGroups(s => new Set([...s, cid])) : expand(cid)),
          onCollapse: collapse,
          onOpenAsset,
        };
        return {
          id,
          type: 'card',
          position: result.layout.positions[id],
          ...(initialFit === 'all' ? { initialWidth: CARD_W, initialHeight: cardHeights.get(id) } : {}),
          measured: sizeFor(
            id,
            JSON.stringify([
              cardRowSet.rows.map(row => row.id),
              cardGeometry(lineageCard, cardRowSet.rows),
              cardRowSet.hidden,
              data.columnsOpen,
              data.columnsOpen ? listRows : 0,
              data.columnsOpen ? lineageCard.columns.filter(row => why.connected.has(row.id)).map(row => row.id) : [],
            ]),
          ),
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
          style: { pointerEvents: 'all' as const },
        };
      });
  }, [result, reach, rowsByCard, openColumns, why, listRows, selected, path, center, select, walkTo, onOpenAsset, groupOf, mapping, onFinding, sets, initialFit, cardHeights]);
  const lineLabels = useMemo(() => {
    if (!result || mapping) return new Map<string, LineLabel>();
    const layoutCards = new Map(allLayoutCards.map(c => [c.id, c]));
    return buildLineLabels(
      {
        graph,
        positions: result.layout.positions,
        routes: result.layout.routes,
        layoutCards,
        heights: cardHeights,
        scrolling: openColumns,
      },
      lines,
    );
  }, [result, mapping, allLayoutCards, cardHeights, openColumns, lines, graph]);
  const edges = useMemo(() => {
    const lanes = new Map<string, number>();
    return lines
      .filter(l => result?.layout.positions[l.fromCard] && result.layout.positions[l.toCard])
      .map(line => ({
        id: line.id,
        source: line.fromCard,
        target: line.toCard,
        sourceHandle: line.from + ':out',
        targetHandle: line.to + ':in',
        type: 'lineage',
        data: {
          kind: line.kind,
          onPath: line.onPath,
          dim: !!path && !line.onPath,
          count: line.count,
          from: line.from,
          to: line.to,
          label: mapping && line.count === 1 ? graph.edges[line.edges[0]].label : undefined,
          lineLabel: lineLabels.get(line.id),
          route: result?.layout.routes[line.id],
          lane: (() => {
            const key = line.from + '>' + line.to;
            const lane = lanes.get(key) ?? 0;
            lanes.set(key, lane + 1);
            return lane;
          })(),
        },
      }));
  }, [lines, result, path, graph, mapping, lineLabels]);
  const { fitAll } = useLineageViewport({
    flow,
    anchoredCard,
    stage,
    layoutCardsRef,
    fullscreen,
    result,
    layoutKey,
    nodes,
    stageSize,
    center,
    steps,
    initialFit,
    framedCards,
    reach,
    lastSet,
    path,
    graph,
    selected,
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected && !(e.target as HTMLElement).closest('dialog,input')) setSelected('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected]);
  const choose = (hit: { id: string; card: string }) => {
    setQuery('');
    setShowResults(false);
    if (hit.card !== center) walkTo(hit.card);
    if (hit.id !== hit.card) setTimeout(() => actionHistory.act('select', () => setSelected(hit.id)), 0);
  };
  // The selected path in lineage order: upstream cards first (by layout x), then rows in order.
  const summary = useMemo(() => {
    if (!path) return [];
    const items: { id: string; label: string; x: number; y: number; kind: string }[] = [];
    for (const node of path.nodes) {
      const cid = cardOfNode(graph, node);
      const lineageCard = graph.cards.get(cid);
      if (!lineageCard || !reach.cards.has(cid)) continue;
      const col = lineageCard.columns.find(x => x.id === node);
      if (!col && node !== cid) continue;
      if (!col && lineageCard.columns.length && path.nodes.size > 1 && node === cid && selected !== cid) continue;
      const pos = result?.layout.positions[cid] ?? { x: 0, y: 0 };
      items.push({
        id: node,
        label: col ? `${lineageCard.label}.${col.path}` : lineageCard.label,
        x: pos.x,
        y: pos.y + (col ? lineageCard.columns.indexOf(col) : 0),
        kind: lineageCard.kind,
      });
    }
    return items.sort((a, b) => a.x - b.x || a.y - b.y);
  }, [path, graph, reach, result, selected]);
  const legendKinds = useMemo(() => {
    if (mapping)
      return (['concept', 'dataset', 'field', 'metric'] as LegendKind[]).filter(x =>
        [...reach.cards].some(id => {
          const k = cardFor(id).kind;
          return k === x || (x === 'field' && k === 'dataset');
        }),
      );
    const kinds = new Set<LegendKind>();
    for (const id of reach.cards) {
      const lineageCard = cardFor(id);
      kinds.add(lineageCard.kind === 'external' ? 'external' : (lineageCard.kind as LegendKind));
      if (lineageCard.kind === 'dataset') kinds.add('field');
    }
    return (['object', 'dataset', 'field', 'metric', 'external'] as LegendKind[]).filter(x => kinds.has(x));
  }, [reach, graph, mapping]);
  const legendLines = useMemo(() => {
    if (!mapping) return undefined;
    const kinds = new Set(lines.map(l => l.kind));
    return (['object', 'referent', 'link', 'measures', 'of'] as const).filter(k => kinds.has(k));
  }, [lines, mapping]);
  const foreignKeys = useMemo(() => (reach.hops ? foreignKeyPath(graph, reach.hops) : null), [graph, reach.hops]);
  const centerCard = graph.cards.get(center);
  const selectedCard = selected ? graph.cards.get(cardOfNode(graph, selected)) : undefined;
  const unmatchedVerb = graph.unmatchedDatasets === 1 ? 'dataset reads' : 'datasets read';
  const centreName = centerCard?.label ?? 'the centre';
  // A line stands for declared relationships, so clicking it shows them: a line to a count card
  // opens that card, a bundled line splits into its separate lines, and a single line selects
  // its relationship, which highlights both columns and lists them under Selected path.
  const openLine = (_event: React.MouseEvent, edge: Edge) => {
    const groupEnd = [edge.source, edge.target].find(id => reach.groups.has(id));
    if (groupEnd) {
      // The group's members are laid out again, so the card at the other end holds its place.
      keepOnScreen(edge.source === groupEnd ? edge.target : edge.source);
      setOpenGroups(current => new Set([...current, groupEnd]));
      return;
    }
    if (edge.id.startsWith(BUNDLE_PREFIX)) {
      const pair = edge.id.slice(BUNDLE_PREFIX.length);
      setSplitPairs(current => new Set([...current, pair]));
      return;
    }
    setSelected((edge.data as { from: string }).from);
  };
  const selectedPathList =
    path && summary.length > 0 ? (
      <SelectedPath items={summary} selected={selected} onSelect={setSelected} selectedCard={selectedCard} onNeighborhood={onNeighborhood} extra={selectionExtra?.(selected, path)} />
    ) : null;
  return (
    <section className={`lineage-view${compact ? ' compact' : ''}`} role="region" aria-label={ariaLabel}>
      <LineageToolbar
        mapping={mapping}
        centreName={centreName}
        steps={steps}
        onSteps={setSteps}
        showMetrics={showMetrics}
        onToggleMetrics={() => setShowMetrics(shown => !shown)}
        showExternal={showExternal}
        onToggleExternal={() => setShowExternal(shown => !shown)}
        query={query}
        onQuery={setQuery}
        showResults={showResults}
        onShowResults={setShowResults}
        results={results}
        onChoose={choose}
        onFit={fitAll}
        direction={direction}
        onDirection={setDirection}
        piercing={piercing}
        onPierce={() => fullPierce()}
        onStopPierce={stopPierce}
        canUndo={currentIsExpansion}
        onUndo={actionHistory.back}
        pierceTitle={`Open every card on the path of ${pierceOriginLabel}`}
        toolbarExtra={toolbarExtra}
        fullscreen={fullscreen}
        onZoomIn={() => void flow.current?.zoomIn({ duration: 150 })}
        onZoomOut={() => void flow.current?.zoomOut({ duration: 150 })}
      />
      <LineageSubbar
        foreignKeys={foreignKeys}
        steps={steps}
        onHops={changeHops}
        actionHistory={actionHistory}
        walk={walk}
        dispatch={dispatch}
        showPathToggle={pathInDialog && !!selectedPathList}
        pathCount={summary.length}
        onOpenPath={() => setPathOpen(true)}
      />
      {lastSet?.kind === 'pierce' && currentStep(walk)?.set === lastSet.id && (
        <PierceBanner
          noun={['card', 'cards']}
          result={{
            shown: lastSet.nodes.length + 1,
            total: lastSet.total,
            maxStep: Math.max(0, ...Object.values(lastSet.steps ?? {})),
          }}
          budget={lastSet.budget}
          max={PIERCE_MAX}
          running={piercing}
          onStop={stopPierce}
          onFurther={() => fullPierce(Math.min(PIERCE_MAX, lastSet.budget + PIERCE_BUDGET))}
        />
      )}
      <div className="lineage-stage">
        <div className="lineage-flow" ref={stage}>
          <ReactFlow
            className={farZoom.className}
            style={farZoom.style}
            nodes={nodes}
            edges={edges}
            onNodesChange={recordSizes}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={i => {
              flow.current = i;
            }}
            onPaneClick={() => setSelected('')}
            onEdgeClick={openLine}
            minZoom={MIN_ZOOM}
            maxZoom={1.6}
            nodesConnectable={false}
            proOptions={{ hideAttribution: false }}
            onlyRenderVisibleElements
          >
            <Background gap={22} size={1} />
            <MeasurementWatchdog />
            {farZoom.watcher}
          </ReactFlow>
          {busy && !nodes.length && (
            <p className="lineage-busy" role="status">
              Laying out the lineage…
            </p>
          )}
        </div>
        {!pathInDialog && selectedPathList && (
          <aside className="lineage-path" role="region" aria-label="Selected path">
            <header>
              <strong>Selected path</strong>
              <button aria-label="Clear the selected path" onClick={() => setSelected('')}>
                <X size={13} />
              </button>
            </header>
            {selectedPathList}
          </aside>
        )}
      </div>
      <div className="lineage-foot">
        <LineageLegend kinds={legendKinds} lines={legendLines} keys={!mapping} bundles={lines.some(line => line.count > 1)} />
        {mapping ? (
          <small className="lineage-reading">
            Saved mapping · {reach.cards.size} reachable assets · {graph.cards.size} total assets
          </small>
        ) : (
          <small
            className="lineage-reading"
            title="Lines are matched by declared names: foreign keys as declared (drawn from the referenced column to the referencing one), semantic datasets whose source is a table's physical name or name, fields whose expressions read a column, and metrics over those fields. This is the workbench's reading, not part of ODCS or Ossie."
          >
            Links follow the names declared in this contract.
            {graph.unmatchedDatasets > 0 ? ` · ${graph.unmatchedDatasets} ${unmatchedVerb} none of this contract's tables` : ''}
          </small>
        )}
      </div>
      {pathInDialog && pathOpen && selectedPathList && (
        <Modal
          title="Selected path"
          size="narrow"
          onCancel={() => setPathOpen(false)}
          footer={
            <>
              <button onClick={() => setSelected('')}>Clear path</button>
              <button className="primary" onClick={() => setPathOpen(false)}>
                Done
              </button>
            </>
          }
        >
          <div role="region" aria-label="Selected path">
            {selectedPathList}
          </div>
        </Modal>
      )}
    </section>
  );
}
