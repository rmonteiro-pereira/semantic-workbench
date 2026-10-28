/** Displays column-level lineage with path highlighting, paging and reversible graph expansion. */
import { useFarZoom } from '../graph/FarZoom';
import { useStageSize } from '../graph/stage-size';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActionHistory } from '../workspace/ActionHistoryContext';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import {
  ReactFlow,
  Background,
  BaseEdge,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type NodeChange,
  type ReactFlowInstance,
  useStoreApi,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, Scan, Search, X } from 'lucide-react';
import { LineageLegend, type LegendKind } from '../graph/LineageLegend';
import { edgeSvgStyle, type EdgeKind } from '../graph/edge-styles';
import {
  walkReducer,
  emptyWalk,
  currentStep,
  canvasAt,
  reconcileWalk,
  type WalkAction,
} from '../graph/walk';
import { canvasOf, registerSet, setsOf, type Direction } from '../graph/expansion';
import { placeBoxes, type Box } from '../graph/incremental-layout';
import { PIERCE_BUDGET, PIERCE_MAX } from '../graph/pierce';
import { PierceBanner, PierceControls } from '../graph/PierceControls';
import type { LineagePierceInput, LineagePierceResult } from './lineage-pierce';
import type { Fullscreen } from '../graph/fullscreen';
import { Modal } from '../projects/Modal';
import { SelectedPath } from './SelectedPath';
import { useNarrowScreen } from '../workspace/hooks/useNarrowScreen';
import { ZoomButtons } from '../graph/ZoomButtons';
import { GraphOptions, OptionGroup, ShowToggle } from '../graph/GraphOptions';
import { CompactControls } from '../graph/CompactControls';
import {
  around,
  aroundHops,
  closure,
  findAssets,
  foreignKeyPath,
  cardRows,
  COLLAPSED_MAX,
  selectionNodes,
  cardOfNode,
  type ColumnWhy,
  type LineageGraph,
  type LineageCard,
} from './lineage';
import { ForeignKeyHops } from './ForeignKeyHops';
import { LineageCardNode, type CardData } from './LineageCard';
import {
  elkGraph,
  positionsOf,
  cardHeight,
  CARD_W,
  HEADER_H,
  ROW_H,
  MORE_H,
  FILTER_H,
  FOOT_H,
  LIST_ROWS,
  type LayoutCard,
  type LayoutEdge,
  type LayoutResult,
} from './lineage-layout';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { buildLineLabels, labelSize, type LineLabel } from './edge-labels';
import { pointAtHalf, roundedPath, type Point } from './edge-route';
import { kindOrder, planFirstView } from './lineage-view';
import './odcs.css';
// The selected column’s path is emphasized while unrelated rows dim. Navigation records expansions
// and centers; ELK lays out row ports in a worker.
const nodeTypes = { card: LineageCardNode };
const LineageEdge = memo((p: EdgeProps) => {
  const d = p.data as {
    kind: EdgeKind;
    onPath: boolean;
    dim: boolean;
    count?: number;
    ambiguous?: boolean;
    from: string;
    to: string;
    label?: string;
    lineLabel?: LineLabel;
    route?: Point[];
    lane?: number;
  };
  // Parallel lines between the same two ports (an object mapping and a metric binding of one
  // metric) fan out.
  const shift = (d.lane ?? 0) * 7;
  const curve = getBezierPath({ ...p, sourceY: p.sourceY + shift, targetY: p.targetY + shift });
  // A line the layout routed around cards follows that route; any other line is a single curve.
  const routed = d.route && d.route.length > 0;
  const points = routed
    ? [{ x: p.sourceX, y: p.sourceY + shift }, ...d.route!, { x: p.targetX, y: p.targetY + shift }]
    : [];
  const path = routed ? roundedPath(points) : curve[0];
  const middle = routed ? pointAtHalf(points) : { x: curve[1], y: curve[2] };
  const lx = middle.x;
  const ly = middle.y;
  return (
    <g
      className={`lineage-edge${d.onPath ? ' on-path' : ''}${d.dim ? ' dim' : ''}`}
      data-edge-kind={d.kind}
      data-on-path={d.onPath ? 'true' : 'false'}
      data-from={d.from}
      data-to={d.to}
      data-count={d.count ?? 1}
    >
      <BaseEdge
        id={p.id}
        path={path}
        style={{
          ...edgeSvgStyle(d.kind, d.onPath),
          opacity: d.dim ? 0.14 : 1,
          ...(d.onPath ? { stroke: undefined } : {}),
        }}
        interactionWidth={12}
      />
      {d.lineLabel ? (
        <LineLabelPill label={d.lineLabel} bundle={(d.count ?? 1) > 1} at={{ x: lx, y: ly }} />
      ) : d.label ? (
        <text x={lx} y={ly - 4} className="lineage-bundle" textAnchor="middle">
          {d.label}
        </text>
      ) : null}
    </g>
  );
});
const edgeTypes = { lineage: LineageEdge };
// A label placed on its line is always drawn; one without room shows when the line is hovered.
function LineLabelPill({
  label,
  bundle,
  at,
}: {
  label: LineLabel;
  bundle: boolean;
  at: { x: number; y: number };
}) {
  const size = labelSize(label.lines);
  const place = label.place ?? { x: at.x - size.w / 2, y: at.y - size.h / 2, ...size };
  const centre = place.x + place.w / 2;
  const meaning = bundle ? `${label.lines[0]} lines` : label.lines.join(' ');
  return (
    <g
      className={`lineage-edge-label ${label.place ? 'shown' : 'hover'}`}
      data-shown={label.place ? 'true' : 'false'}
    >
      <title>{meaning}</title>
      <rect x={place.x} y={place.y} width={place.w} height={place.h} rx={8} />
      {label.lines.map((line, i) => (
        <text key={line} x={centre} y={place.y + 15 * (i + 1) - 1} textAnchor="middle">
          {line}
        </text>
      ))}
    </g>
  );
}
// Column names are 13 px, so this zoom keeps them at 12 px or more on screen.
const READABLE = 0.93;
const FIRST_VIEW_MARGIN = 24;
// A large pane keeps the cards at their natural size so the neighbours of the framed cards show
// at its edges.
const FIRST_VIEW_MAX_ZOOM = 1;
// Generous guesses of the space the layout leaves between columns and between stacked cards.
const FIRST_VIEW_COLUMN_GAP = 240;
const FIRST_VIEW_ROW_GAP = 60;
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
// Space kept between a card that was just resized and the edge of the canvas.
const CARD_EDGE_GAP = 16;
// Where a resized card's top edge goes on screen: the whole card shows when it fits the canvas,
// and a card taller than the canvas keeps its top visible.
function visibleCardTop(top: number, cardPixels: number, canvasPixels: number): number {
  if (!canvasPixels || !cardPixels) return top;
  const lowestTop = canvasPixels - CARD_EDGE_GAP - cardPixels;
  return Math.max(CARD_EDGE_GAP, Math.min(top, lowestTop));
}
const GROUP_AT = 6;
const KIND_PLURAL: Record<string, string> = {
  object: 'tables',
  dataset: 'datasets',
  metric: 'metrics',
  external: 'references',
  concept: 'concepts',
};
// The mapping canvas (src/app/mappings/MappingCanvas.tsx) reuses this canvas with mapping names and
// lines.
const MAPPING_KINDS = { concept: 'Concept', dataset: 'Dataset', metric: 'Metric' };
type Props = {
  mode?: 'lineage' | 'mapping';
  toolbarExtra?: React.ReactNode;
  cardFilter?: (card: LineageCard) => boolean;
  onFinding?: (card: LineageCard, message: string) => void;
  selectionExtra?: (
    selected: string,
    path: { nodes: Set<string>; edges: Set<number> } | null,
  ) => React.ReactNode;
  graph: LineageGraph;
  center: string;
  ariaLabel?: string;
  fullscreen?: Fullscreen;
  compact?: boolean;
  storageKey?: string;
  onCenterChange?: (id: string) => void;
  onOpenAsset?: (card: LineageCard) => void;
  onNeighborhood?: (card: LineageCard) => void;
  groupOf?: (card: LineageCard) => { name: string; color: string } | undefined;
};
const readSteps = (key?: string) => {
  try {
    const v = key ? Number(localStorage.getItem(key)) : NaN;
    return v >= 1 && v <= 5 ? v : 1;
  } catch {
    return 1;
  }
};
type NodeSize = { width: number; height: number };
// Preserve measurements while a card keeps its rows. Changed rows invalidate the size so React
// Flow measures their new handles before trying to connect edges to them.
function useMeasuredNodeSizes() {
  const sizes = useRef(new Map<string, NodeSize>());
  const shapes = useRef(new Map<string, string>());
  const sizeFor = useCallback((id: string, shape: string) => {
    if (shapes.current.get(id) !== shape) {
      shapes.current.set(id, shape);
      sizes.current.delete(id);
    }
    return sizes.current.get(id);
  }, []);
  const recordSizes = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        sizes.current.set(change.id, change.dimensions);
      }
    }
  }, []);
  return { sizeFor, recordSizes };
}
const MEASURE_CHECK_MS = 500;

// React Flow keeps a card hidden until it has measured it. Under load a measurement can be lost
// for good, and then nothing retries it: the card stays hidden and the canvas looks empty. This
// watches the cards on screen and asks React Flow to measure again any that are still hidden.
function MeasurementWatchdog() {
  const store = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const timer = setInterval(() => {
      const canvas = store.getState().domNode;
      if (!canvas) return;
      const renderedCards = canvas.querySelectorAll<HTMLElement>('.react-flow__node');
      const unmeasured = [...renderedCards]
        .filter(card => card.style.visibility === 'hidden')
        .map(card => card.dataset.id ?? '');
      if (unmeasured.length) updateNodeInternals(unmeasured.filter(Boolean));
    }, MEASURE_CHECK_MS);
    return () => clearInterval(timer);
  }, [store, updateNodeInternals]);
  return null;
}

// Lays out in ELK's worker (elk-api + elk-worker, as the Graph view does); returns the latest
// positions (the previous ones stay while a new layout runs).
function useLayout(cards: LayoutCard[], edges: LayoutEdge[], key: string) {
  const elk = useRef<{ layout: (g: any) => Promise<any>; terminateWorker: () => void } | null>(
    null,
  );
  const seq = useRef(0);
  const [result, setResult] = useState<{ key: string; layout: LayoutResult } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    elk.current = new ELK({ workerFactory: () => new Worker(elkWorkerUrl) }) as any;
    return () => elk.current?.terminateWorker();
  }, []);
  useEffect(() => {
    const e = elk.current;
    if (!e) return;
    const id = ++seq.current;
    setBusy(true);
    e.layout(elkGraph(cards, edges))
      .then(r => {
        if (id !== seq.current) return;
        setBusy(false);
        setResult({ key, layout: positionsOf(r) });
      })
      .catch(() => {
        if (id === seq.current) setBusy(false);
      });
  }, [key]);
  return { result, busy };
}
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
  storageKey,
  onCenterChange,
  onOpenAsset,
  onNeighborhood,
  groupOf,
}: Props) {
  const actionHistory = useActionHistory();
  const [walk, setWalk, setWalkSilently] = useRecordedState(
    'lineage.walk',
    emptyWalk,
    reconcileWalk,
  );
  const dispatch = useCallback(
    (action: WalkAction) => setWalk(previous => walkReducer(previous, action)),
    [setWalk],
  );
  // Starting a walk on a new centre is not a step the person took, so it is not recorded. A walk
  // that Back or Forward brought back is kept when the canvas appears.
  const walkStarted = useRef(false);
  useEffect(() => {
    const keepRestored = !walkStarted.current;
    walkStarted.current = true;
    setWalkSilently(previous =>
      keepRestored && previous.steps.length > 0
        ? previous
        : walkReducer(previous, {
            type: 'reset',
            step: {
              doc: graph.contract,
              center: initial,
              name: graph.cards.get(initial)?.label ?? initial,
            },
          }),
    );
  }, [initial, graph.contract]);
  const mapping = mode === 'mapping';
  const reachOf = mapping ? aroundHops : around;
  // A centre that is gone from the graph (the file changed under the walk) falls back to the
  // initial one.
  const walked = currentStep(walk)?.center;
  const center =
    walked && graph.cards.has(walked)
      ? walked
      : graph.cards.has(initial)
        ? initial
        : (graph.cards.keys().next().value ?? '');
  useEffect(() => {
    if (center) onCenterChange?.(center);
  }, [center]);
  const [steps, setSteps] = useRecordedState('lineage.hops', () => readSteps(storageKey));
  useEffect(() => {
    try {
      if (storageKey) localStorage.setItem(storageKey, String(steps));
    } catch {}
  }, [steps]);
  const farZoom = useFarZoom();
  const [selected, setSelected] = useRecordedState('lineage.selected', '');
  const stage = useRef<HTMLDivElement | null>(null);
  const stageSize = useStageSize(stage, !!selected);
  const [openColumns, setOpenColumns] = useRecordedState<Set<string>>(
    'lineage.openColumns',
    () => new Set(),
  );
  // Expansions and pierces are walk steps on this canvas: Back / Undo expansion restore it.
  const sets = useMemo(() => {
    const c = canvasAt(walk);
    return c.center && c.center.center === center ? setsOf(c.sets) : [];
  }, [walk, center]);
  const [showResults, setShowResults] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  // On a narrow window, and in the embedded canvas, the path opens in a dialog so the canvas keeps its room.
  const pathInDialog = useNarrowScreen() || compact;
  const [showMetrics, setShowMetrics] = useRecordedState('lineage.showMetrics', true);
  const [showExternal, setShowExternal] = useRecordedState('lineage.showExternal', true);
  const [openGroups, setOpenGroups] = useRecordedState<Set<string>>(
    'lineage.openGroups',
    () => new Set(),
  );
  // Card pairs whose bundled line was clicked, so their lines show one by one.
  const [splitPairs, setSplitPairs] = useRecordedState<Set<string>>(
    'lineage.splitPairs',
    () => new Set(),
  );
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
  // Which cards: the centre's reach, plus the neighbours of expanded cards.
  const reach = useMemo(() => {
    const base = reachOf(graph, center, steps);
    const canvas = canvasOf([...base.cards], sets);
    const cards = new Set(canvas.nodes);
    const expandedBy = canvas.expandedBy;
    const hidden = new Map<string, number>();
    for (const [id, n] of base.hidden) if (!expandedBy.has(id)) hidden.set(id, n);
    // Cards that only expansions brought in are placed incrementally beside their origin;
    // everything else (the centre's reach, a pierce) is laid out by ELK.
    const incremental = new Set<string>();
    const laid = new Set([
      ...base.cards,
      ...canvas.active.filter(x => x.kind === 'pierce').flatMap(x => [x.from, ...x.nodes]),
    ]);
    for (const c of cards) if (!laid.has(c)) incremental.add(c);
    // Iterate over a copy: the loop removes cards from the set.
    // oxlint-disable-next-line no-useless-spread
    for (const c of [...cards]) {
      const k = graph.cards.get(c)?.kind;
      if ((!showMetrics && k === 'metric' && c !== center) || (!showExternal && k === 'external'))
        cards.delete(c);
      else if (cardFilter && c !== center && !cardFilter(graph.cards.get(c)!)) cards.delete(c);
    }
    // Large groups of same-kind leaf cards collapse into a count card to keep the view readable.
    // Selected paths bypass this grouping so every path card stays visible.
    const groups = new Map<string, LineageCard>();
    const alias = new Map<string, string>();
    if (!selected) {
      const near = new Map<string, Set<string>>();
      for (const e of graph.edges) {
        const a = cardOfNode(graph, e.from);
        const b = cardOfNode(graph, e.to);
        if (a === b || !cards.has(a) || !cards.has(b) || incremental.has(a) || incremental.has(b))
          continue;
        (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b);
        (near.get(b) ?? near.set(b, new Set()).get(b)!).add(a);
      }
      const leaves = new Map<string, string[]>();
      for (const c of cards) {
        const n = near.get(c);
        if (c === center || expandedBy.has(c) || incremental.has(c) || !n || n.size !== 1) continue;
        const parent = [...n][0];
        const key = `group:${parent}|${graph.cards.get(c)!.kind}`;
        (leaves.get(key) ?? leaves.set(key, []).get(key)!).push(c);
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
        for (const m of members) {
          cards.delete(m);
          alias.set(m, id);
        }
        cards.add(id);
      }
    }
    const hops = (base as { hops?: Map<string, number> }).hops;
    return { cards, hidden, groups, alias, expandedBy, incremental, hops, active: canvas.active };
  }, [
    graph,
    center,
    steps,
    sets,
    showMetrics,
    showExternal,
    cardFilter,
    mapping,
    selected,
    openGroups,
  ]);
  const cardFor = (id: string) => graph.cards.get(id) ?? reach.groups.get(id)!;
  const shownCard = (id: string) => reach.alias.get(id) ?? id;
  // A mapping link lights up the join rows it passes through.
  const path = useMemo(() => {
    if (!selected) return null;
    const p = closure(graph, selectionNodes(graph, selected));
    for (const i of p.edges) for (const v of graph.edges[i].via ?? []) p.nodes.add(v);
    return p;
  }, [graph, selected]);
  const [query, setQuery] = useState('');
  const results = useMemo(() => findAssets(graph, query), [graph, query]);
  // Columns that earn a row on a collapsed card: those with a line in the view, and those on the
  // selected path or matching the search.
  const why = useMemo<ColumnWhy>(() => {
    const connected = new Set<string>();
    for (const e of graph.edges) {
      const from = shownCard(cardOfNode(graph, e.from));
      const to = shownCard(cardOfNode(graph, e.to));
      if (!reach.cards.has(from) || !reach.cards.has(to)) continue;
      connected.add(e.from);
      connected.add(e.to);
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
    graph.edges.forEach((e, i) => {
      const fc = shownCard(cardOfNode(graph, e.from));
      const tc = shownCard(cardOfNode(graph, e.to));
      if (!reach.cards.has(fc) || !reach.cards.has(tc) || (fc === tc && e.from === e.to)) return;
      const from = reach.groups.has(fc) ? fc : rowsByCard.get(fc)!.port(e.from);
      const to = reach.groups.has(tc) ? tc : rowsByCard.get(tc)!.port(e.to);
      const key = `${from}>${to}>${e.kind}`;
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
          kind: e.kind,
          onPath: on,
          count: 1,
          edges: [i],
        });
    });
    // Bundle per card pair when nothing on it is selected (edge case "a column read by many
    // fields").
    const pairs = new Map<string, typeof out extends Map<any, infer V> ? V[] : never>();
    for (const l of out.values()) {
      const k = `${l.fromCard}>${l.toCard}>${l.kind}`;
      (pairs.get(k) ?? pairs.set(k, []).get(k)!).push(l);
    }
    const result: typeof out extends Map<any, infer V> ? V[] : never = [];
    for (const [k, ls] of pairs) {
      if (ls.length >= BUNDLE_AT && !ls.some(l => l.onPath) && !splitPairs.has(k)) {
        const f = ls[0];
        result.push({
          id: BUNDLE_PREFIX + k,
          from: f.fromCard,
          to: f.toCard,
          fromCard: f.fromCard,
          toCard: f.toCard,
          kind: f.kind,
          onPath: false,
          count: ls.reduce((a, l) => a + l.count, 0),
          edges: ls.flatMap(l => l.edges),
        });
      } else result.push(...ls);
    }
    return result;
  }, [graph, reach, rowsByCard, path, splitPairs]);
  const allLayoutCards = useMemo<LayoutCard[]>(
    () =>
      [...reach.cards].map(id => {
        const rows = rowsByCard.get(id)!;
        if (openColumns.has(id)) {
          const columns = cardFor(id).columns.map(c => c.id);
          return {
            id,
            rows: columns,
            portRows: columns.filter(c => why.connected.has(c)),
            more: false,
            open: { filter: rows.filterable, visibleRows: listRows },
          };
        }
        const shown = rows.rows.map(r => r.id);
        return { id, rows: shown, portRows: shown, more: rows.hidden > 0 };
      }),
    [reach, rowsByCard, openColumns, why, listRows],
  );
  const cardHeights = useMemo(
    () => new Map(allLayoutCards.map(c => [c.id, cardHeight(c)])),
    [allLayoutCards],
  );
  // The first view frames the centre and the nearest cards that fit whole at a readable size.
  // Every card of the reach is still laid out, so the rest are a pan away and Fit shows them all.
  const firstViewCards = useMemo(
    () => [...reach.cards].filter(id => !reach.incremental.has(id)),
    [reach],
  );
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
  const layoutCards = useMemo(
    () => allLayoutCards.filter(c => !reach.incremental.has(c.id)),
    [allLayoutCards, reach],
  );
  const layoutCardsRef = useRef(allLayoutCards);
  layoutCardsRef.current = allLayoutCards;
  const layoutEdges = useMemo<LayoutEdge[]>(
    () =>
      lines
        .filter(l => ![l.fromCard, l.toCard].some(c => reach.incremental.has(c)))
        .map(l => ({ id: l.id, from: l.from, to: l.to, fromCard: l.fromCard, toCard: l.toCard })),
    [lines, reach],
  );
  const layoutKey = useMemo(
    () => JSON.stringify([layoutCards, layoutEdges.map(e => e.id)]),
    [layoutCards, layoutEdges],
  );
  const { result: elk, busy } = useLayout(layoutCards, layoutEdges, layoutKey);
  const { sizeFor, recordSizes } = useMeasuredNodeSizes();
  // ELK positions, then each expansion's new cards beside their origin, in order; nothing placed
  // moves.
  const result = useMemo(() => {
    if (!elk) return null;
    const size = cardHeights;
    let boxes = new Map<string, Box>(
      Object.entries(elk.layout.positions).map(([id, p]) => [
        id,
        { x: p.x, y: p.y, w: CARD_W, h: size.get(id) ?? HEADER_H },
      ]),
    );
    for (const x of reach.active)
      if (x.kind === 'expand' && boxes.has(x.from)) {
        const fromCols = new Set(selectionNodes(graph, x.from));
        const items = x.nodes
          .filter(n => reach.incremental.has(n) && !boxes.has(n))
          .map(n => ({
            id: n,
            side: (graph.edges.some(e => fromCols.has(e.from) && cardOfNode(graph, e.to) === n)
              ? 1
              : -1) as -1 | 1,
            w: CARD_W,
            h: size.get(n) ?? HEADER_H,
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
    const r = reachOf(graph, cid, 1);
    const nodes = [...r.cards].filter(
      c =>
        c !== cid &&
        (mapping ||
          graph.cards.get(c)?.kind === 'object' ||
          graph.cards.get(c)?.kind === 'external'),
    );
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
  const [direction, setDirection] = useRecordedState<Direction>('lineage.direction', 'both');
  const [piercing, setPiercing] = useState(false);
  const pierceWorker = useRef<Worker | null>(null);
  const stopPierce = () => {
    pierceWorker.current?.terminate();
    pierceWorker.current = null;
    setPiercing(false);
  };
  useEffect(() => stopPierce, [center]);
  const fullPierce = (budget = PIERCE_BUDGET) => {
    const start = selected || center;
    const from = cardOfNode(graph, start);
    if (!from) return;
    stopPierce();
    const w = new Worker(new URL('./lineage-pierce.worker.ts', import.meta.url), {
      type: 'module',
    });
    pierceWorker.current = w;
    setPiercing(true);
    const owners: Record<string, string> = {};
    for (const c of graph.cards.values()) for (const x of c.columns) owners[x.id] = c.id;
    const input: LineagePierceInput = {
      edges: graph.edges.map(e => [e.from, e.to]),
      owners,
      start: selectionNodes(graph, start),
      direction,
      budget,
    };
    w.onmessage = (e: MessageEvent<{ id: number; result: LineagePierceResult }>) => {
      w.terminate();
      if (pierceWorker.current !== w) return;
      pierceWorker.current = null;
      setPiercing(false);
      const r = e.data.result;
      // The result arrives after the click that asked for it, so it opens its own history step.
      actionHistory.act('pierce', () =>
        record(
          registerSet({
            kind: 'pierce',
            from,
            direction,
            nodes: r.cards.filter(c => c !== from),
            edges: [],
            frontier: {},
            total: r.total,
            budget,
            steps: r.steps,
          }),
          `pierced ${start === from ? labelOf(from) : start.slice(start.lastIndexOf('/') + 1)}`,
        ),
      );
    };
    w.onerror = () => stopPierce();
    w.postMessage({ id: 1, input });
  };
  const lastSet = reach.active.at(-1);
  // A selected column is named by its last path segment; a selected card by its label.
  const selectedColumnOnly = !!selected && selected.includes('/') && !graph.cards.has(selected);
  const selectedLabel = selectedColumnOnly
    ? selected.slice(selected.lastIndexOf('/') + 1)
    : labelOf(selected);
  const pierceOriginLabel = selected ? selectedLabel : labelOf(center);
  const currentIsExpansion = currentStep(walk)?.kind === 'expand';
  const walkTo = useCallback(
    (id: string, via?: string) => {
      const c = graph.cards.get(id);
      if (!c) return;
      dispatch({
        type: 'push',
        step: {
          doc: graph.contract,
          center: id,
          name: c.label,
          ...(via ? { via: { id: via, label: via.slice(via.lastIndexOf('/') + 1) } } : {}),
        },
      });
    },
    [graph],
  );
  const nodes = useMemo(() => {
    if (!result) return [];
    return [...reach.cards]
      .filter(id => result.layout.positions[id])
      .map(id => {
        const c = cardFor(id);
        const p = rowsByCard.get(id)!;
        const g = groupOf?.(c);
        const isGroup = reach.groups.has(id);
        const data: CardData = {
          kindNames: mapping ? MAPPING_KINDS : undefined,
          onFinding,
          card: c,
          rows: p.rows,
          more: p.hidden,
          columnsOpen: openColumns.has(id),
          filterable: p.filterable,
          listRows,
          connected: why.connected,
          hiddenNeighbours: isGroup ? 1 : (reach.hidden.get(id) ?? 0),
          group: isGroup,
          selected,
          onPath: path?.nodes ?? null,
          center: id === center,
          tint: g?.color,
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
          onExpand: cid =>
            reach.groups.has(cid) ? setOpenGroups(s => new Set([...s, cid])) : expand(cid),
          onCollapse: collapse,
          onOpenAsset,
        };
        return {
          id,
          type: 'card',
          position: result.layout.positions[id],
          measured: sizeFor(
            id,
            JSON.stringify([
              p.rows.map(row => row.id),
              p.hidden,
              data.columnsOpen,
              data.columnsOpen ? listRows : 0,
              data.columnsOpen
                ? c.columns.filter(row => why.connected.has(row.id)).map(row => row.id)
                : [],
            ]),
          ),
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
          style: { pointerEvents: 'all' as const },
        };
      });
  }, [
    result,
    reach,
    rowsByCard,
    openColumns,
    why,
    listRows,
    selected,
    path,
    center,
    select,
    walkTo,
    onOpenAsset,
    groupOf,
    mapping,
    onFinding,
    sets,
  ]);
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
      .map(l => ({
        id: l.id,
        source: l.fromCard,
        target: l.toCard,
        sourceHandle: l.from + ':out',
        targetHandle: l.to + ':in',
        type: 'lineage',
        data: {
          kind: l.kind,
          onPath: l.onPath,
          dim: !!path && !l.onPath,
          count: l.count,
          from: l.from,
          to: l.to,
          label: mapping && l.count === 1 ? graph.edges[l.edges[0]].label : undefined,
          lineLabel: lineLabels.get(l.id),
          route: result?.layout.routes[l.id],
          lane: (() => {
            const k = l.from + '>' + l.to;
            const n = lanes.get(k) ?? 0;
            lanes.set(k, n + 1);
            return n;
          })(),
        },
      }));
  }, [lines, result, path, graph, mapping, lineLabels]);
  const flow = useRef<ReactFlowInstance<any, any> | null>(null);
  const fitted = useRef('');
  const anchoredCard = useRef<{
    id: string;
    layout: string | undefined;
    screen: { x: number; y: number };
  } | null>(null);
  const firstViewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Keep column names at least 12 px on entry by fitting the nearest readable neighborhood. Fall
  // back to the center alone when needed; explicit Fit may zoom out further.
  const readableFit = useCallback(async (focus: string, group: string[]) => {
    const f = flow.current;
    if (!f) return;
    await f.fitView({ padding: 0.12, maxZoom: 1, duration: 0 });
    if (f.getZoom() >= READABLE) return;
    const ids = [...new Set([focus, ...group])].filter(id => f.getNode(id));
    if (ids.length > 1) {
      await f.fitView({ nodes: ids.map(id => ({ id })), padding: 0.1, maxZoom: 1, duration: 0 });
      if (f.getZoom() >= READABLE) return;
    }
    const n = f.getNode(focus);
    const lc = layoutCardsRef.current.find(c => c.id === focus);
    if (n) {
      const w = CARD_W;
      const h = lc ? cardHeight(lc) : (n.measured?.height ?? 200); // A card taller than the canvas shows its
      // top (header and first rows), not its
      // middle.
      const visible = (stage.current?.clientHeight ?? 600) / READABLE - 48;
      f.setCenter(
        n.position.x + w / 2,
        n.position.y + Math.min(h, visible) / 2 + (h > visible ? -8 : 0),
        { zoom: READABLE, duration: 0 },
      );
    }
  }, []);
  const viewKey = [center, steps].join('|');
  // Frames the nearest cards at a readable zoom. When the real layout is wider than the estimate,
  // the farthest framed card is dropped from the frame, never from the canvas, until it fits.
  const firstView = useCallback(async () => {
    const f = flow.current;
    if (!f) return;
    const framed = [...(framedCards ?? reach.cards)].filter(id => f.getNode(id));
    while (framed.length > 1) {
      await f.fitView({
        nodes: framed.map(id => ({ id })),
        padding: 0.06,
        maxZoom: FIRST_VIEW_MAX_ZOOM,
        duration: 0,
      });
      if (f.getZoom() >= READABLE - 0.005) return;
      framed.pop();
    }
    await readableFit(center, []);
  }, [center, reach, framedCards, readableFit]);
  useEffect(() => {
    if (!result || !nodes.length) return;
    if (fitted.current === viewKey) return;
    fitted.current = viewKey;
    // A card that opened or closed its columns keeps its place; the view does not start over.
    if (anchoredCard.current) return;
    // Wait until React Flow has measured the pane and the cards with its ResizeObserver.
    firstViewTimer.current = setTimeout(() => requestAnimationFrame(() => void firstView()), 80);
  }, [result, viewKey, nodes.length]);
  useEffect(() => () => clearTimeout(firstViewTimer.current), []);
  // An explicit Fit wins over a first view that is still waiting to run, and shows every card.
  function fitAll() {
    clearTimeout(firstViewTimer.current);
    void flow.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 200 });
  }
  // Opening or closing a card's columns changes its height, and the new layout can move that card
  // far away, so it seemed to vanish. The view follows the card: it stays where it was on screen.
  function keepOnScreen(cardId: string) {
    const f = flow.current;
    const node = f?.getNode(cardId);
    if (!f || !node) return;
    const { x, y, zoom } = f.getViewport();
    anchoredCard.current = {
      id: cardId,
      layout: result?.key,
      screen: { x: node.position.x * zoom + x, y: node.position.y * zoom + y },
    };
  }
  useEffect(() => {
    const anchor = anchoredCard.current;
    // Only the layout made for the new card height moves it; earlier results still hold the old
    // positions.
    if (!anchor || !result || result.key === anchor.layout) return;
    const moved = result.layout.positions[anchor.id];
    if (!moved || !flow.current) return;
    anchoredCard.current = null;
    const zoom = flow.current.getZoom();
    const layoutCard = layoutCardsRef.current.find(candidate => candidate.id === anchor.id);
    const cardPixels = layoutCard ? cardHeight(layoutCard) * zoom : 0;
    const top = visibleCardTop(anchor.screen.y, cardPixels, stage.current?.clientHeight ?? 0);
    void flow.current.setViewport({
      x: anchor.screen.x - moved.x * zoom,
      y: top - moved.y * zoom,
      zoom,
    });
  }, [result]);
  // After an expansion or pierce, bring its cards into a readable view around its origin.
  const focused = useRef('');
  useEffect(() => {
    if (!result || !lastSet || focused.current === lastSet.id) return;
    focused.current = lastSet.id;
    const t = setTimeout(() => void readableFit(lastSet.from, lastSet.nodes), 120);
    return () => clearTimeout(t);
  }, [result, lastSet]);
  // The path panel takes room beside the canvas: when a path opens, bring its cards into a
  // readable view (React Flow learns the new width from a ResizeObserver, so this waits for it).
  const panelOpen = !!path;
  useEffect(() => {
    if (!result || !path) return;
    const t = setTimeout(() => {
      const cards = [...new Set([...path.nodes].map(n => cardOfNode(graph, n)))].filter(c =>
        reach.cards.has(c),
      );
      void readableFit(cardOfNode(graph, selected), cards);
    }, 120);
    return () => clearTimeout(t);
  }, [panelOpen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected && !(e.target as HTMLElement).closest('dialog,input'))
        setSelected('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected]);
  const choose = (h: { id: string; card: string }) => {
    setQuery('');
    setShowResults(false);
    if (h.card !== center) walkTo(h.card);
    if (h.id !== h.card) setTimeout(() => actionHistory.act('select', () => setSelected(h.id)), 0);
  };
  // The selected path in lineage order: upstream cards first (by layout x), then rows in order.
  const summary = useMemo(() => {
    if (!path) return [];
    const items: { id: string; label: string; x: number; y: number; kind: string }[] = [];
    for (const n of path.nodes) {
      const cid = cardOfNode(graph, n);
      const c = graph.cards.get(cid);
      if (!c || !reach.cards.has(cid)) continue;
      const col = c.columns.find(x => x.id === n);
      if (!col && n !== cid) continue;
      if (!col && c.columns.length && path.nodes.size > 1 && n === cid && selected !== cid)
        continue;
      const pos = result?.layout.positions[cid] ?? { x: 0, y: 0 };
      items.push({
        id: n,
        label: col ? `${c.label}.${col.path}` : c.label,
        x: pos.x,
        y: pos.y + (col ? c.columns.indexOf(col) : 0),
        kind: c.kind,
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
    const k = new Set<LegendKind>();
    for (const id of reach.cards) {
      const c = cardFor(id);
      k.add(c.kind === 'external' ? 'external' : (c.kind as LegendKind));
      if (c.kind === 'dataset') k.add('field');
    }
    return (['object', 'dataset', 'field', 'metric', 'external'] as LegendKind[]).filter(x =>
      k.has(x),
    );
  }, [reach, graph, mapping]);
  const legendLines = useMemo(() => {
    if (!mapping) return undefined;
    const kinds = new Set(lines.map(l => l.kind));
    return (['object', 'referent', 'link', 'measures', 'of'] as const).filter(k => kinds.has(k));
  }, [lines, mapping]);
  const foreignKeys = useMemo(
    () => (reach.hops ? foreignKeyPath(graph, reach.hops) : null),
    [graph, reach.hops],
  );
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
  const lineageOptions = (
    <GraphOptions
      title="View options"
      intro={
        mapping
          ? `The view shows ${centreName} and every card within the chosen number of mapping lines of it.`
          : `The view shows ${centreName} with every field and metric that reads it, ` +
            'and tables up to the chosen number of foreign-key hops away.'
      }
    >
      {mapping && (
        <OptionGroup title="Steps">
          <label>
            Steps
            <select
              aria-label="Mapping steps"
              value={steps}
              onChange={e => setSteps(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </OptionGroup>
      )}
      <OptionGroup title="Show">
        <ShowToggle
          on={showMetrics}
          onToggle={() => setShowMetrics(shown => !shown)}
          title="Metrics that read the shown columns"
        >
          Metrics
        </ShowToggle>
        {!mapping && (
          <ShowToggle
            on={showExternal}
            onToggle={() => setShowExternal(shown => !shown)}
            title="Tables in other contracts that these columns refer to"
          >
            Other contracts
          </ShowToggle>
        )}
      </OptionGroup>
    </GraphOptions>
  );
  const selectedPathList =
    path && summary.length > 0 ? (
      <SelectedPath
        items={summary}
        selected={selected}
        onSelect={setSelected}
        selectedCard={selectedCard}
        onNeighborhood={onNeighborhood}
        extra={selectionExtra?.(selected, path)}
      />
    ) : null;
  return (
    <section
      className={`lineage-view${compact ? ' compact' : ''}`}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="lineage-toolbar">
        <div
          className="lineage-search"
          role="combobox"
          aria-expanded={showResults && results.length > 0}
          aria-haspopup="listbox"
          aria-owns="lineage-asset-results"
        >
          <Search size={14} />
          <input
            aria-label="Find assets"
            placeholder="Find assets…"
            value={query}
            aria-autocomplete="list"
            aria-controls="lineage-asset-results"
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            onChange={e => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                choose(results[0]);
              }
              if (e.key === 'Escape') {
                setQuery('');
                setShowResults(false);
              }
            }}
          />
          {showResults && query && (
            <ul id="lineage-asset-results" role="listbox" aria-label="Asset results">
              {results.length ? (
                results.map(h => (
                  <li
                    key={h.id}
                    role="option"
                    aria-selected={false}
                    onMouseDown={e => {
                      e.preventDefault();
                      choose(h);
                    }}
                  >
                    <span className={`asset-kind k-${h.kind}`}>
                      {h.kind === 'field'
                        ? 'Field'
                        : h.kind === 'column'
                          ? 'Column'
                          : h.kind === 'relationship'
                            ? 'Relationship'
                            : h.kind === 'object'
                              ? 'Table'
                              : h.kind === 'dataset'
                                ? 'Dataset'
                                : h.kind === 'metric'
                                  ? 'Metric'
                                  : h.kind === 'concept'
                                    ? 'Concept'
                                    : 'External'}
                    </span>
                    <span className="asset-name">{h.label}</span>
                  </li>
                ))
              ) : (
                <li role="option" aria-disabled="true" aria-selected={false} className="none">
                  No asset matches “{query}”
                </li>
              )}
            </ul>
          )}
        </div>
        <button onClick={fitAll} aria-label="Fit" title="Fit the graph">
          <Scan size={14} />
          <span className="tool-label">Fit</span>
        </button>
        <CompactControls>
          <PierceControls
            direction={direction}
            onDirection={setDirection}
            running={piercing}
            onPierce={() => fullPierce()}
            onStop={stopPierce}
            canUndo={currentIsExpansion}
            onUndo={actionHistory.back}
            title={`Open every card on the path of ${pierceOriginLabel}`}
          />
          {toolbarExtra}
          <span className="lineage-toolbar-spacer" />
          {lineageOptions}
          <ZoomButtons
            onZoomIn={() => void flow.current?.zoomIn({ duration: 150 })}
            onZoomOut={() => void flow.current?.zoomOut({ duration: 150 })}
          />
          {fullscreen && (
            <button
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
              title="Full screen (F)"
            >
              {fullscreen.active ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
        </CompactControls>
      </div>
      <div className="lineage-subbar">
        {foreignKeys && <ForeignKeyHops path={foreignKeys} hops={steps} onHops={setSteps} />}
        <div className="lineage-trail" aria-label="Walk">
          <button aria-label="Back" disabled={!actionHistory.canBack} onClick={actionHistory.back}>
            <ArrowLeft size={13} />
          </button>
          <button
            aria-label="Forward"
            disabled={!actionHistory.canForward}
            onClick={actionHistory.forward}
          >
            <ArrowRight size={13} />
          </button>
          <ol>
            {walk.steps.map((s, i) => (
              <li key={i}>
                <button
                  aria-current={i === walk.index ? 'step' : undefined}
                  onClick={() => dispatch({ type: 'jump', index: i })}
                  title={s.via ? `via ${s.via.label}` : undefined}
                >
                  {s.via && <small>via {s.via.label} →</small>}
                  {s.name}
                </button>
              </li>
            ))}
          </ol>
          {pathInDialog && selectedPathList && (
            <button className="lineage-path-toggle" onClick={() => setPathOpen(true)}>
              Selected path <span>{summary.length}</span>
            </button>
          )}
        </div>
      </div>
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
            minZoom={0.08}
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
        <LineageLegend
          kinds={legendKinds}
          lines={legendLines}
          keys={!mapping}
          bundles={lines.some(line => line.count > 1)}
        />
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
            {graph.unmatchedDatasets > 0
              ? ` · ${graph.unmatchedDatasets} ${unmatchedVerb} none of this contract's tables`
              : ''}
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
