/** Displays column-level lineage with path highlighting, paging and reversible graph expansion. */
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Scan,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { LineageLegend, type LegendKind } from '../graph/LineageLegend';
import { edgeSvgStyle, type EdgeKind } from '../graph/edge-styles';
import { walkReducer, emptyWalk, currentStep, canBack, canForward, canvasAt } from '../graph/walk';
import { canvasOf, registerSet, setsOf, type Direction } from '../graph/expansion';
import { placeBoxes, type Box } from '../graph/incremental-layout';
import { PIERCE_BUDGET, PIERCE_MAX } from '../graph/pierce';
import { PierceBanner, PierceControls } from '../graph/PierceControls';
import type { LineagePierceInput, LineagePierceResult } from './lineage-pierce';
import type { Fullscreen } from '../graph/fullscreen';
import { Modal } from '../projects/Modal';
import {
  around,
  aroundHops,
  closure,
  findAssets,
  pageColumns,
  selectionNodes,
  cardOfNode,
  type LineageGraph,
  type LineageCard,
} from './lineage';
import { LineageCardNode, type CardData } from './LineageCard';
import {
  elkGraph,
  positionsOf,
  cardHeight,
  CARD_W,
  HEADER_H,
  type LayoutCard,
  type LayoutEdge,
  type LayoutResult,
} from './lineage-layout';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
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
    lane?: number;
  };
  // Parallel lines between the same two ports (an object mapping and a metric binding of one
  // metric) fan out.
  const shift = (d.lane ?? 0) * 7;
  const [path, lx, ly] = getBezierPath({
    ...p,
    sourceY: p.sourceY + shift,
    targetY: p.targetY + shift,
  });
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
      {d.count && d.count > 1 ? (
        <text x={lx} y={ly - 4} className="lineage-bundle" textAnchor="middle">
          {d.count} lines
        </text>
      ) : d.label ? (
        <text x={lx} y={ly - 4} className="lineage-bundle" textAnchor="middle">
          {d.label}
        </text>
      ) : null}
    </g>
  );
});
const edgeTypes = { lineage: LineageEdge };
const BUNDLE_AT = 8;
const GROUP_AT = 6;
const KIND_PLURAL: Record<string, string> = {
  object: 'objects',
  dataset: 'datasets',
  metric: 'metrics',
  external: 'references',
  concept: 'concepts',
};
const KIND_SHORT: Record<string, string> = {
  object: 'Contract object',
  dataset: 'Field',
  metric: 'Metric',
  external: 'External',
  concept: 'Concept',
};
// The mapping canvas (src/mappings/MappingCanvas.tsx) reuses this canvas with mapping names and
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
// React Flow forgets a card's measured size whenever it receives a fresh node object, and a card
// that is never measured again stays hidden. This keeps the sizes React Flow reports so each new
// node object can carry its card's last size.
function useMeasuredNodeSizes() {
  const sizes = useRef(new Map<string, NodeSize>());
  const recordSizes = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        sizes.current.set(change.id, change.dimensions);
      }
    }
  }, []);
  return { sizes, recordSizes };
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
  const [walk, dispatch] = useReducer(walkReducer, emptyWalk);
  useEffect(() => {
    dispatch({
      type: 'reset',
      step: {
        doc: graph.contract,
        center: initial,
        name: graph.cards.get(initial)?.label ?? initial,
      },
    });
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
  const [steps, setStepsState] = useState(() => readSteps(storageKey));
  const setSteps = (n: number) => {
    setStepsState(n);
    try {
      if (storageKey) localStorage.setItem(storageKey, String(n));
    } catch {}
  };
  const [selected, setSelected] = useState('');
  const [pages, setPages] = useState<Record<string, number>>({});
  // Expansions and pierces are walk steps on this canvas: Back / Undo expansion restore it.
  const sets = useMemo(() => {
    const c = canvasAt(walk);
    return c.center && c.center.center === center ? setsOf(c.sets) : [];
  }, [walk, center]);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [options, setOptions] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showExternal, setShowExternal] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected('');
    setPages({});
    setOpenGroups(new Set());
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
    return { cards, hidden, groups, alias, expandedBy, incremental, active: canvas.active };
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
  // Rows per card: the current page plus pinned path rows.
  const paged = useMemo(() => {
    const out = new Map<string, ReturnType<typeof pageColumns>>();
    for (const id of reach.cards) {
      const c = cardFor(id);
      const pinned = new Set(
        path ? c.columns.filter(x => path.nodes.has(x.id)).map(x => x.id) : [],
      );
      out.set(id, pageColumns(c, pages[id] ?? 0, pinned));
    }
    return out;
  }, [graph, reach, pages, path]);
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
      const from = reach.groups.has(fc) ? fc : paged.get(fc)!.port(e.from);
      const to = reach.groups.has(tc) ? tc : paged.get(tc)!.port(e.to);
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
      if (ls.length >= BUNDLE_AT && !ls.some(l => l.onPath)) {
        const f = ls[0];
        result.push({
          id: 'bundle:' + k,
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
  }, [graph, reach, paged, path]);
  const allLayoutCards = useMemo<LayoutCard[]>(
    () =>
      [...reach.cards].map(id => {
        const p = paged.get(id)!;
        return { id, rows: p.rows.map(r => r.id), pager: p.pages > 1, more: p.hidden > 0 };
      }),
    [reach, paged],
  );
  const layoutCards = useMemo(
    () => allLayoutCards.filter(c => !reach.incremental.has(c.id)),
    [allLayoutCards, reach],
  );
  const layoutCardsRef = useRef(allLayoutCards);
  layoutCardsRef.current = allLayoutCards;
  const layoutEdges = useMemo<LayoutEdge[]>(
    () =>
      lines
        .filter(l => !reach.incremental.has(l.fromCard) && !reach.incremental.has(l.toCard))
        .map(l => ({ id: l.id, from: l.from, to: l.to, fromCard: l.fromCard, toCard: l.toCard })),
    [lines],
  );
  const layoutKey = useMemo(
    () => JSON.stringify([layoutCards, layoutEdges.map(e => e.id)]),
    [layoutCards, layoutEdges],
  );
  const { result: elk, busy } = useLayout(layoutCards, layoutEdges, layoutKey);
  const { sizes: measuredSizes, recordSizes } = useMeasuredNodeSizes();
  // ELK positions, then each expansion's new cards beside their origin, in order; nothing placed
  // moves.
  const result = useMemo(() => {
    if (!elk) return null;
    const size = new Map(allLayoutCards.map(c => [c.id, cardHeight(c)]));
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
      },
    };
  }, [elk, reach, allLayoutCards, graph]);
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
  const [direction, setDirection] = useState<Direction>('both');
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
      );
    };
    w.onerror = () => stopPierce();
    w.postMessage({ id: 1, input });
  };
  const lastSet = reach.active.at(-1);
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
        const p = paged.get(id)!;
        const g = groupOf?.(c);
        const isGroup = reach.groups.has(id);
        const data: CardData = {
          kindNames: mapping ? MAPPING_KINDS : undefined,
          onFinding,
          card: c,
          rows: p.rows,
          pinned: p.pinned,
          page: p.page,
          pages: p.pages,
          more: p.hidden,
          hiddenNeighbours: isGroup ? 1 : (reach.hidden.get(id) ?? 0),
          group: isGroup,
          selected,
          onPath: path?.nodes ?? null,
          center: id === center,
          tint: g?.color,
          expanded: reach.expandedBy.has(id),
          onSelect: select,
          onPage: (cid, n) => setPages(x => ({ ...x, [cid]: n })),
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
          measured: measuredSizes.current.get(id),
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
          style: { pointerEvents: 'all' as const },
        };
      });
  }, [
    result,
    reach,
    paged,
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
          lane: (() => {
            const k = l.from + '>' + l.to;
            const n = lanes.get(k) ?? 0;
            lanes.set(k, n + 1);
            return n;
          })(),
        },
      }));
  }, [lines, result, path, graph, mapping]);
  const flow = useRef<ReactFlowInstance<any, any> | null>(null);
  const fitted = useRef('');
  const firstViewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stage = useRef<HTMLDivElement | null>(null);
  // Keep column names at least 12 px on entry by fitting the nearest readable neighborhood. Fall
  // back to the center alone when needed; explicit Fit may zoom out further.
  const READABLE = 0.93;
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
  const neighbours = (id: string) =>
    lines.flatMap(l => (l.fromCard === id ? [l.toCard] : l.toCard === id ? [l.fromCard] : []));
  const firstView = useCallback(
    () => readableFit(center, neighbours(center)),
    [center, lines, readableFit],
  );
  useEffect(() => {
    if (!result || !nodes.length) return;
    const k = center + '|' + steps;
    if (fitted.current === k) return;
    fitted.current = k;
    // Wait until React Flow has measured the pane and the cards with its ResizeObserver.
    firstViewTimer.current = setTimeout(() => requestAnimationFrame(() => void firstView()), 80);
  }, [result, center, steps, nodes.length]);
  useEffect(() => () => clearTimeout(firstViewTimer.current), []);
  // An explicit Fit wins over a first view that is still waiting to run.
  function fitAll() {
    clearTimeout(firstViewTimer.current);
    void flow.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 200 });
  }
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
  const results = useMemo(() => findAssets(graph, query), [graph, query]);
  const choose = (h: { id: string; card: string }) => {
    setQuery('');
    setShowResults(false);
    if (h.card !== center) walkTo(h.card);
    if (h.id !== h.card) setTimeout(() => setSelected(h.id), 0);
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
  const centerCard = graph.cards.get(center);
  const selectedCard = selected ? graph.cards.get(cardOfNode(graph, selected)) : undefined;
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
                              ? 'Object'
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
        <label className="lineage-steps">
          <span>Steps</span>
          <select aria-label="Steps" value={steps} onChange={e => setSteps(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <PierceControls
          direction={direction}
          onDirection={setDirection}
          running={piercing}
          onPierce={() => fullPierce()}
          onStop={stopPierce}
          canUndo={currentIsExpansion}
          onUndo={() => dispatch({ type: 'back' })}
          title={`Open every card on the path of ${selected ? (selected.includes('/') && !graph.cards.has(selected) ? selected.slice(selected.lastIndexOf('/') + 1) : labelOf(selected)) : labelOf(center)}`}
        />
        {toolbarExtra}
        <span className="lineage-toolbar-spacer" />
        <button onClick={() => setOptions(true)} title="Lineage options">
          <SlidersHorizontal size={14} />
          <span className="tool-label">Lineage options…</span>
        </button>
        <button onClick={fitAll} aria-label="Fit" title="Fit the graph">
          <Scan size={14} />
        </button>
        {fullscreen && (
          <button
            onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
            title="Full screen (F)"
          >
            {fullscreen.active ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>
      <div className="lineage-trail" aria-label="Walk">
        <button
          aria-label="Back"
          disabled={!canBack(walk)}
          onClick={() => dispatch({ type: 'back' })}
        >
          <ArrowLeft size={13} />
        </button>
        <button
          aria-label="Forward"
          disabled={!canForward(walk)}
          onClick={() => dispatch({ type: 'forward' })}
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
            nodes={nodes}
            edges={edges}
            onNodesChange={recordSizes}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={i => {
              flow.current = i;
            }}
            onPaneClick={() => setSelected('')}
            minZoom={0.08}
            maxZoom={1.6}
            nodesConnectable={false}
            proOptions={{ hideAttribution: false }}
            onlyRenderVisibleElements
          >
            <Background gap={22} size={1} />
            <Controls showInteractive={false} showFitView={false} />
          </ReactFlow>
          {busy && !nodes.length && (
            <p className="lineage-busy" role="status">
              Laying out the lineage…
            </p>
          )}
        </div>
        {path && summary.length > 0 && (
          <aside className="lineage-path" role="region" aria-label="Selected path">
            <header>
              <strong>Selected path</strong>
              <button aria-label="Clear the selected path" onClick={() => setSelected('')}>
                <X size={13} />
              </button>
            </header>
            <ol>
              {summary.map(s => (
                <li key={s.id} className={`k-${s.kind}${s.id === selected ? ' current' : ''}`}>
                  <button onClick={() => setSelected(s.id)}>
                    <small>{KIND_SHORT[s.kind] ?? s.kind}</small>
                    <span>{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            {selectedCard &&
              (selectedCard.kind === 'dataset' || selectedCard.kind === 'metric') &&
              onNeighborhood && (
                <button
                  className="lineage-path-action"
                  onClick={() => onNeighborhood(selectedCard)}
                >
                  Continue in Neighborhood
                </button>
              )}
            {selectionExtra?.(selected, path)}
          </aside>
        )}
      </div>
      <div className="lineage-foot">
        <LineageLegend kinds={legendKinds} lines={legendLines} />
        {mapping ? (
          <small className="lineage-reading">
            The mapping's bindings as the resolver reads them (saved revision) · {reach.cards.size}{' '}
            of {graph.cards.size} cards
          </small>
        ) : (
          <small
            className="lineage-reading"
            title="Lines are matched by declared names: foreign keys as declared (drawn from the referenced column to the referencing one), semantic datasets whose source is an object's physical name or name, fields whose expressions read a column, and metrics over those fields. This is the workbench's reading, not part of ODCS or Ossie."
          >
            Workbench reading of declared names · {reach.cards.size} of {graph.cards.size} assets
            {graph.unmatchedDatasets > 0
              ? ` · ${graph.unmatchedDatasets} ${graph.unmatchedDatasets === 1 ? 'dataset reads' : 'datasets read'} none of this contract's objects`
              : ''}
          </small>
        )}
      </div>
      {options && (
        <Modal
          title="Lineage options"
          size="small"
          onCancel={() => setOptions(false)}
          footer={
            <button className="primary" onClick={() => setOptions(false)}>
              Done
            </button>
          }
        >
          {mapping ? (
            <p>
              The view shows {centerCard?.label ?? 'the centre'} and every card within the chosen
              number of mapping lines of it.
            </p>
          ) : (
            <p>
              The view shows {centerCard?.label ?? 'the centre'} with every field and metric that
              reads it, and contract objects up to the chosen number of foreign-key steps away.
            </p>
          )}
          <label>
            <span>{mapping ? 'Steps' : 'Foreign-key steps'}</span>
            <select
              aria-label={mapping ? 'Mapping steps' : 'Foreign-key steps'}
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
          <label className="option-check">
            <input
              type="checkbox"
              checked={showMetrics}
              onChange={e => setShowMetrics(e.target.checked)}
            />
            Show metrics
          </label>
          {!mapping && (
            <label className="option-check">
              <input
                type="checkbox"
                checked={showExternal}
                onChange={e => setShowExternal(e.target.checked)}
              />
              Show references to other contracts
            </label>
          )}
        </Modal>
      )}
    </section>
  );
}
