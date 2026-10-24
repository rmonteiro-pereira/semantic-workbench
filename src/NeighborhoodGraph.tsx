/** Displays a centered relationship graph with expansion and navigation history. */
import { DETAIL_ZOOM, LOWEST_FIT_ZOOM, useFarZoom } from './graph/FarZoom';
import { ScrollStrip } from './ScrollStrip';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Position,
  MarkerType,
  useNodesState,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  FileSymlink,
  Gauge,
  LocateFixed,
  Minus,
  Plus,
} from 'lucide-react';
import { canvasAt } from './graph/walk';
import {
  canvasOf,
  neighbours,
  registerSet,
  setsOf,
  type Direction,
  type ExpansionSet,
} from './graph/expansion';
import { placeLayers, placeNew } from './graph/incremental-layout';
import { PIERCE_BUDGET, PIERCE_MAX } from './graph/pierce';
import { PierceBanner, PierceControls, usePierce } from './graph/PierceControls';
import { GraphOptions, OptionGroup } from './graph/GraphOptions';
import { ZoomButtons } from './graph/ZoomButtons';
import { CompactControls, useCompactToolbar } from './graph/CompactControls';
import type { Entity, Relationship } from './model';
import {
  groupRelationships,
  neighborhood,
  searchEntities,
  projectModel,
  NEIGHBOR_PAGE,
} from './graph-view';
// A phone shows half as many neighbors at first, so the cards stay big enough to read.
const PHONE_NEIGHBOR_PAGE = 6;
import { neighborhoodLayout, NEIGHBOR_COLUMN, NEIGHBOR_ROW } from './layout';
import {
  assignRoutes,
  placeLabels,
  routePoints,
  relationshipEdgeTypes,
  type Box,
} from './RelationshipEdge';
import type { Walk, WalkStep } from './graph/walk';
import { useViewRestore, type Fullscreen } from './graph/fullscreen';
import { FullscreenButton } from './FullGraph';
// Incoming neighbors appear left of the center and outgoing neighbors right. Navigation history
// also records steps into other project files.
/** Identifies a navigation target in another project document. */
export type CrossFileTarget = {
  doc: string;
  file: string;
  entity: string;
  name: string;
  reason: string;
};
/** Supplies the model, selection and callbacks for neighborhood navigation. */
export type NeighborhoodGraphProps = {
  docId: string;
  docLabel: (doc: string) => string;
  entities: Entity[];
  edges: Relationship[];
  search: string;
  walk: Walk;
  selected: string;
  selectedEdge: string;
  onWalk: (steps: WalkStep[]) => void;
  onWalkTo: (index: number) => void;
  onClearSearch: () => void;
  onSelectEntity: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onOverview: () => void;
  onFullGraph: () => void;
  modelName?: string;
  kpiBadges?: Map<string, string[]>;
  /** The colour of an entity's group under the current Group by choice. */
  groupColorOf?: (entityId: string) => string | undefined;
  fullscreen?: Fullscreen;
  onOpenKpis?: (concept: string) => void;
  crossFile?: (entity: Entity) => CrossFileTarget[];
  onCrossFile?: (target: CrossFileTarget) => void;
};
/** Displays the current graph center and its expandable neighborhood. */
export function NeighborhoodGraph(props: NeighborhoodGraphProps) {
  return (
    <ReactFlowProvider>
      <NeighborhoodCanvas {...props} />
    </ReactFlowProvider>
  );
}
// Large canvases (a pierce) render only what is on screen, so the main thread stays responsive.
const NODE = { width: 250, height: 96 };
const LATERAL_DEFAULT_MAX = 10;
const LARGE_CANVAS = 60;
const REVEAL_CHUNK = 15;
const COLORS = {
  out: 'var(--color-edge-out)',
  in: 'var(--color-edge-in)',
  lateral: 'var(--color-edge-lateral)',
};
// Value types share the Graph view's per-model setting.
const VALUE_KINDS = new Set(['ValueType', 'Built-in concept']);
const valuesKey = (name: string) => 'workbench:hide-value-types:' + name;
const readHideValues = (name?: string) => {
  try {
    return !!name && localStorage.getItem(valuesKey(name)) === '1';
  } catch {
    return false;
  }
};
const writeHideValues = (name: string | undefined, hide: boolean) => {
  try {
    if (!name) return;
    if (hide) localStorage.setItem(valuesKey(name), '1');
    else localStorage.removeItem(valuesKey(name));
  } catch {}
};
function NeighborhoodCanvas(props: NeighborhoodGraphProps) {
  const {
    docId,
    entities: all,
    edges: allEdges,
    search,
    walk,
    selected,
    selectedEdge,
    kpiBadges,
    groupColorOf,
  } = props;
  const [hideKpis, setHideKpis] = useState(false);
  const [lateralChoice, setLateral] = useState<boolean | null>(null);
  const [technical, setTechnical] = useState(false);
  const [labels, setLabels] = useState(false);
  const [hovered, setHovered] = useState('');
  const compact = useCompactToolbar();
  const pageSize = compact ? PHONE_NEIGHBOR_PAGE : NEIGHBOR_PAGE;
  const [limit, setLimit] = useState(pageSize);
  const [relationship, setRelationship] = useState('');
  const kpiCount = useMemo(() => all.filter(e => e.kind === 'Metric').length, [all]);
  const [hideValues, setHideValues] = useState(() => readHideValues(props.modelName));
  const valueCount = useMemo(() => all.filter(e => VALUE_KINDS.has(e.kind)).length, [all]);
  const entities = useMemo(
    () =>
      all.filter(
        e => !(hideKpis && e.kind === 'Metric') && !(hideValues && VALUE_KINDS.has(e.kind)),
      ),
    [all, hideKpis, hideValues],
  );
  const edges = useMemo(() => {
    if (!hideKpis && !hideValues) return allEdges;
    const ids = new Set(entities.map(e => e.id));
    return allEdges.filter(e => ids.has(e.source) && ids.has(e.target));
  }, [allEdges, entities, hideKpis, hideValues]);
  // The canvas at this point of the walk: its re-centring step and the expansions after it.
  const walkCanvas = useMemo(() => canvasAt(walk), [walk]);
  const step = walkCanvas.center;
  const requested = step?.doc === docId ? step.center : undefined;
  const stepIndex = step ? walk.steps.lastIndexOf(step) : -1;
  const before = stepIndex > 0 ? walk.steps[stepIndex - 1] : undefined;
  const previous = before && before.doc === docId ? before.center : undefined;
  // Links among neighbors are shown by default unless there are so many that they bury the
  // center's own relationships; the toggle states how many there are either way.
  const base = useMemo(
    () =>
      neighborhood(entities, edges, {
        center: requested,
        limit,
        lateral: false,
        technical,
        relationship: relationship || undefined,
        keep: previous ? [previous] : [],
      }),
    [entities, edges, requested, limit, technical, relationship, previous],
  );
  const lateralCount = base.lateral;
  const lateral = lateralChoice ?? lateralCount <= LATERAL_DEFAULT_MAX;
  const view = useMemo(
    () =>
      lateral
        ? neighborhood(entities, edges, {
            center: requested,
            limit,
            lateral,
            technical,
            relationship: relationship || undefined,
            keep: previous ? [previous] : [],
          })
        : base,
    [base, lateral],
  );
  const center = view.center;
  const byId = useMemo(() => new Map(all.map(e => [e.id, e])), [all]);
  // Expansions in place on top of the centre's view; a walk to another centre starts afresh.
  const projection = useMemo(
    () => projectModel(entities, edges, technical),
    [entities, edges, technical],
  );
  const sets = useMemo(
    () => (step && step.doc === docId && step.center === center ? setsOf(walkCanvas.sets) : []),
    [walkCanvas, step, docId, center],
  );
  const canvasState = useMemo(
    () =>
      canvasOf(
        view.entities.map(e => e.id),
        sets,
      ),
    [view, sets],
  );
  const shownEntities = useMemo(() => {
    const ids = new Set(canvasState.nodes);
    const extra = canvasState.nodes
      .filter(id => !view.entities.some(e => e.id === id))
      .map(id => byId.get(id))
      .filter((e): e is Entity => !!e);
    return [...view.entities, ...extra].filter(e => ids.has(e.id));
  }, [canvasState, view, byId]);
  const shownEdges = useMemo(() => {
    if (!sets.length) return view.edges;
    const ids = new Set(canvasState.nodes);
    const own = new Set(canvasState.active.flatMap(s => s.edges));
    const base = new Set(view.edges.map(e => e.id));
    return [
      ...view.edges,
      ...projection.edges.filter(
        e =>
          !base.has(e.id) &&
          ids.has(e.source) &&
          ids.has(e.target) &&
          (own.has(e.id) ||
            (lateral && canvasState.active.some(s => s.from === e.source || s.from === e.target))),
      ),
    ];
  }, [sets, view, canvasState, projection, lateral]);
  const pierceSet = canvasState.active.filter(s => s.kind === 'pierce').at(-1);
  // Paging and the relationship filter belong to one center.
  useEffect(() => {
    setLimit(pageSize);
    setRelationship('');
  }, [center, pageSize]);
  const groups = useMemo(() => groupRelationships(shownEdges), [shownEdges]);
  const membership = JSON.stringify([center, shownEntities.map(e => e.id)]);
  // Base positions from the column layout; each expansion places only its new nodes beside its
  // origin (incoming left, outgoing right; pierce by step distance), never moving placed ones.
  const positions = useMemo(() => {
    if (!center) return new Map<string, { x: number; y: number }>();
    let out = neighborhoodLayout(center, view.incoming, view.outgoing, view.both);
    for (const s of canvasState.active) {
      const grid = { column: NEIGHBOR_COLUMN, row: NEIGHBOR_ROW };
      if (s.kind === 'pierce')
        out = placeLayers(
          out,
          s.from,
          s.nodes.map(n => ({
            id: n,
            side: (s.direction === 'in' ? -1 : 1) as -1 | 1,
            step: Math.max(1, s.steps?.[n] ?? 1),
          })),
          grid,
        );
      else
        out = placeNew(
          out,
          s.from,
          s.nodes
            .filter(n => !out.has(n))
            .map(n => ({
              id: n,
              side: (projection.edges.some(e => e.source === s.from && e.target === n) ? 1 : -1) as
                | -1
                | 1,
            })),
          grid,
        );
    }
    return out;
  }, [membership]);
  // Nodes are derived from the view synchronously; selection and center styling never rebuild
  // them. A large addition (a pierce) is revealed in chunks, one per frame, so no frame blocks
  // input.
  const [reveal, setReveal] = useState(Infinity);
  const build = (limit = reveal) =>
    shownEntities.slice(0, limit).map((e): Node => ({
      id: e.id,
      position: positions.get(e.id) ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: { width: NODE.width },
      data: { entity: e },
    }));
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(build());
  const built = useRef(membership);
  useEffect(() => {
    if (built.current === membership) return;
    built.current = membership;
    const have = nodes.length;
    if (shownEntities.length - have <= REVEAL_CHUNK) {
      setReveal(Infinity);
      setNodes(build(Infinity));
      return;
    }
    let n = have;
    let frame = 0;
    const tick = () => {
      n += REVEAL_CHUNK;
      const done = n >= shownEntities.length;
      setReveal(done ? Infinity : n);
      setNodes(build(done ? Infinity : n));
      if (!done) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [membership]);
  const boxes = useMemo(
    () =>
      new Map<string, Box>(
        nodes.map(n => [
          n.id,
          {
            x: n.position.x,
            y: n.position.y,
            width: n.measured?.width ?? NODE.width,
            height: n.measured?.height ?? NODE.height,
          },
        ]),
      ),
    [nodes],
  );
  const routes = useMemo(
    () =>
      assignRoutes(
        groups.map(g => ({ id: g.id, source: g.source, target: g.target })),
        boxes,
      ),
    [groups, boxes],
  );
  const walkTo = (target: string, via?: { id: string; label: string }, select = true) => {
    if (!center || target === center) return;
    const e = byId.get(target);
    if (!e) return;
    const steps: WalkStep[] = [];
    if (!step || step.doc !== docId || step.center !== center)
      steps.push({ doc: docId, center, name: byId.get(center)?.name ?? center });
    steps.push({ doc: docId, center: target, name: e.name, ...(via ? { via } : {}) });
    props.onWalk(steps);
    if (select) props.onSelectEntity(target);
  };
  // Expand / Collapse / Full pierce record steps on the walk ("expanded X"), so Back and Undo
  // expansion restore the earlier canvas exactly.
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const record = (set: ExpansionSet, label: string) => {
    if (!center) return;
    const steps: WalkStep[] = [];
    if (!step || step.doc !== docId || step.center !== center)
      steps.push({ doc: docId, center, name: nameOf(center) });
    steps.push({ doc: docId, center, name: label, kind: 'expand', set: set.id });
    props.onWalk(steps);
  };
  const expand = (id: string) => {
    const n = neighbours(projection.edges, id, 'both', nameOf);
    record(
      registerSet({
        kind: 'expand',
        from: id,
        direction: 'both',
        nodes: n.nodes,
        edges: n.edges,
        frontier: {},
        total: n.nodes.length,
        budget: n.nodes.length,
      }),
      `expanded ${nameOf(id)}`,
    );
  };
  const collapse = (id: string) => {
    const target = canvasState.expandedBy.get(id);
    if (target)
      record(
        registerSet({
          kind: 'collapse',
          from: id,
          target,
          direction: 'both',
          nodes: [],
          edges: [],
          frontier: {},
          total: 0,
          budget: 0,
        }),
        `collapsed ${nameOf(id)}`,
      );
  };
  const [direction, setDirection] = useState<Direction>('out');
  const pierce = usePierce();
  const fullPierce = async (budget = PIERCE_BUDGET) => {
    const from = selected && canvasState.nodes.includes(selected) ? selected : center;
    if (!from) return;
    const r = await pierce.run(
      projection.entities.map(e => ({ id: e.id, name: e.name, kind: e.kind })),
      projection.edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
      [from],
      { direction, valueTypes: !hideValues, technical, metrics: !hideKpis, budget },
    );
    if (!r) return;
    record(
      registerSet({
        kind: 'pierce',
        from,
        direction,
        nodes: r.nodes.filter(n => n !== from),
        edges: r.edges,
        frontier: r.frontier,
        total: r.total,
        budget,
        steps: r.steps,
      }),
      `pierced ${nameOf(from)}`,
    );
  };
  const undoable = walk.steps[walk.index]?.kind === 'expand';
  const pierceOrigin =
    selected && canvasState.nodes.includes(selected) ? nameOf(selected) : 'the center';
  // A new centre or document stops a running pierce .
  useEffect(() => () => pierce.stop(), [center, docId]);
  const viaFor = (target: string) => {
    const g = view.edges.find(
      x =>
        (x.source === center && x.target === target) ||
        (x.target === center && x.source === target),
    );
    return g ? { id: g.id, label: g.label } : undefined;
  };
  const rendered = useMemo(
    () =>
      nodes.map(n => {
        const e = n.data.entity as Entity;
        const kpis = kpiBadges?.get(e.name) ?? [];
        const isCenter = n.id === center;
        const groupColor = groupColorOf?.(e.id);
        return {
          ...n,
          style: groupColor
            ? ({ ...n.style, '--group-color': groupColor } as React.CSSProperties)
            : n.style,
          className: `neighborhood-node${isCenter ? ' center' : ''}${n.id === previous ? ' origin' : ''}${n.id === selected ? ' selected-entity' : ''}`,
          data: {
            ...n.data,
            label: (
              <div className={`node${e.kind === 'Metric' ? ' kpi-node' : ''}`}>
                <small>
                  {isCenter ? (
                    <span className="center-tag">
                      <Crosshair size={10} />
                      Center
                    </span>
                  ) : n.id === previous ? (
                    <span className="origin-tag">Previous center</span>
                  ) : null}
                  {e.kind === 'Metric' ? (
                    <>
                      <Gauge size={10} /> Metric
                    </>
                  ) : (
                    e.kind
                  )}
                </small>
                <strong title={e.name}>{e.name}</strong>
                <span>
                  {e.fields.length
                    ? `${e.fields.length} ${e.fields.length === 1 ? 'field' : 'fields'}`
                    : e.description || 'Select to inspect'}
                </span>
                <div className="node-actions">
                  {!isCenter &&
                    (canvasState.expandedBy.has(e.id) ? (
                      <button
                        className="expand-button nodrag"
                        aria-label={`Collapse ${e.name}`}
                        title="Remove what expanding this added"
                        onClick={ev => {
                          ev.stopPropagation();
                          collapse(e.id);
                        }}
                      >
                        <Minus size={12} />
                      </button>
                    ) : (
                      <button
                        className="expand-button nodrag"
                        aria-label={`Expand ${e.name}`}
                        title="Add its neighbours here"
                        onClick={ev => {
                          ev.stopPropagation();
                          expand(e.id);
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    ))}
                  {pierceSet?.frontier[e.id] ? (
                    <span className="frontier-marker" title="Reachable but not shown">
                      +{pierceSet.frontier[e.id]} hidden
                    </span>
                  ) : null}
                  {!isCenter && (
                    <button
                      className="walk-button nodrag"
                      aria-label={`Walk to ${e.name}`}
                      onClick={ev => {
                        ev.stopPropagation();
                        walkTo(e.id, viaFor(e.id));
                      }}
                    >
                      <ArrowRight size={12} />
                      Walk here
                    </button>
                  )}
                  {kpis.length > 0 && (
                    <button
                      className="kpi-badge nodrag"
                      title={`Metrics: ${kpis.join(', ')}`}
                      aria-label={`Open ${kpis.length} metric${kpis.length === 1 ? '' : 's'} for ${e.name}`}
                      onClick={ev => {
                        ev.stopPropagation();
                        props.onOpenKpis?.(e.name);
                      }}
                    >
                      <Gauge size={10} />
                      {kpis.length === 1 ? 'Metric' : `${kpis.length} metrics`}
                    </button>
                  )}
                </div>
              </div>
            ),
          },
        };
      }),
    [nodes, center, previous, selected, kpiBadges, groupColorOf, view, canvasState, pierceSet],
  );
  const farZoom = useFarZoom();
  const labelScale = farZoom.labelScale;
  const showAllLabels = labels && !farZoom.className;
  const labelText = (g: (typeof groups)[number]) =>
    g.data.relationships.length > 1 ? `${g.data.relationships.length} relationships` : g.label;
  const shownLabels = groups.filter(
    g => showAllLabels || hovered === g.id || g.data.relationships.some(r => r.id === selectedEdge),
  );
  const labelAt = useMemo(
    () =>
      placeLabels(
        shownLabels.flatMap(g => {
          const s = boxes.get(g.source);
          const t = boxes.get(g.target);
          const r = routes.get(g.id);
          if (!s || !t || !r) return [];
          return [
            {
              id: g.id,
              text: String(labelText(g)),
              points: routePoints(s.x + s.width, s.y + s.height / 2, t.x, t.y + t.height / 2, r)
                .points,
            },
          ];
        }),
        [...boxes.values()],
        labelScale,
      ),
    [shownLabels.map(g => g.id).join('|'), routes, boxes, labelScale],
  );
  const renderedIds = new Set(nodes.map(n => n.id));
  const visibleEdges = groups
    .filter(g => renderedIds.has(g.source) && renderedIds.has(g.target))
    .map(g => {
      const active = g.data.relationships.some(r => r.id === selectedEdge);
      const kind =
        g.source === center && g.target !== center
          ? 'out'
          : g.target === center && g.source !== center
            ? 'in'
            : g.source === center
              ? 'out'
              : 'lateral';
      const color = COLORS[kind as keyof typeof COLORS];
      return {
        ...g,
        type: 'relationship',
        data: {
          ...g.data,
          route: routes.get(g.id),
          direction: kind,
          labelAt: labelAt.get(g.id),
          labelScale,
        },
        label: showAllLabels || active || hovered === g.id ? labelText(g) : undefined,
        selected: active,
        interactionWidth: 24,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        className: `edge-${kind}`,
        style: {
          stroke: color,
          strokeOpacity: kind === 'lateral' ? 0.55 : 0.85,
          strokeWidth: active ? 2.6 : kind === 'lateral' ? 1.1 : 1.5,
          strokeDasharray: kind === 'lateral' ? '5 4' : undefined,
        },
      };
    });
  // Fit once the nodes of a new membership are measured; refit when the canvas is resized.
  const canvas = useRef<HTMLDivElement>(null);
  const { fitBounds, getViewport, setViewport, setCenter, zoomIn, zoomOut } = useReactFlow();
  const [fitted, setFitted] = useState('');
  const held = useViewRestore(
    !!props.fullscreen?.active,
    () => getViewport(),
    v => {
      void setViewport(v);
    },
  );
  const measured =
    nodes.length > 0 &&
    nodes.every(n => n.measured?.width) &&
    JSON.stringify([center, nodes.map(n => n.id)]) === membership;
  // The fitted area is symmetric around the center node, so the center sits in the middle of the
  // canvas even when one side has more columns; it leaves room for the lanes above and below.
  const fitRef = useRef(() => {});
  fitRef.current = () => {
    const c = boxes.get(center ?? '');
    if (!c || !boxes.size) return;
    const all = [...boxes.values()];
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const halfW = Math.max(...all.map(b => Math.max(cx - b.x, b.x + b.width - cx)));
    const lanes = [...routes.values()].filter(r => r.route === 'lane' || r.route === 'loop').length;
    const halfH =
      Math.max(...all.map(b => Math.max(cy - b.y, b.y + b.height - cy))) +
      Math.min(160, 30 + lanes * 16);
    void fitBounds(
      { x: cx - halfW, y: cy - halfH, width: 2 * halfW, height: 2 * halfH },
      { padding: 0.06, duration: 0 },
    ).then(() => {
      // A canvas too wide for the pane opens on the centre at a zoom where names still read.
      if (getViewport().zoom < LOWEST_FIT_ZOOM) {
        void setCenter(cx, cy, { zoom: LOWEST_FIT_ZOOM, duration: 0 });
      }
    });
  };
  // After an expansion or pierce, show what it added around its origin at a zoom where cards keep
  // their detail lines; the zoom-out controls and Re-center show the whole canvas.
  const READABLE = DETAIL_ZOOM;
  const focusLatest = () => {
    const s = canvasState.active.at(-1);
    if (!s) {
      fitRef.current();
      return false;
    }
    const ids = [s.from, ...s.nodes].filter(id => boxes.has(id));
    const bs = ids.map(id => boxes.get(id)!);
    if (!bs.length) {
      fitRef.current();
      return false;
    }
    const x0 = Math.min(...bs.map(b => b.x));
    const y0 = Math.min(...bs.map(b => b.y));
    const x1 = Math.max(...bs.map(b => b.x + b.width));
    const y1 = Math.max(...bs.map(b => b.y + b.height));
    void fitBounds(
      { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
      { padding: 0.08, duration: 0 },
    ).then(() => {
      if (getViewport().zoom < READABLE) {
        const o = boxes.get(s.from)!;
        void setCenter(
          o.x +
            o.width / 2 +
            (s.kind === 'pierce' && s.direction !== 'in' ? NEIGHBOR_COLUMN * 0.9 : 0),
          o.y + o.height / 2,
          { zoom: READABLE, duration: 0 },
        );
      }
    });
    return true;
  };
  useEffect(() => {
    if (!measured || fitted === membership) return;
    const frame = requestAnimationFrame(() => {
      if (sets.length) focusLatest();
      else fitRef.current();
      setFitted(membership);
    });
    return () => cancelAnimationFrame(frame);
  }, [measured, membership, fitted]);
  // A resize (the pierce banner appearing, the window) keeps the same rule.
  const resizeFit = useRef(() => {});
  resizeFit.current = () => {
    if (sets.length) focusLatest();
    else fitRef.current();
  };
  useEffect(() => {
    if (!canvas.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!held()) resizeFit.current();
      });
    });
    observer.observe(canvas.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  // Center picker (searchable; exact matches first) and toolbar search results.
  const projected = useMemo(
    () => projectModel(entities, edges, technical).entities,
    [entities, edges, technical],
  );
  const [pick, setPick] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pickResults = useMemo(
    () => (pick.trim() ? searchEntities(projected, pick, 30) : []),
    [projected, pick],
  );
  const searchResults = useMemo(
    () => (search.trim() ? searchEntities(projected, search, 30) : []),
    [projected, search],
  );
  const choose = (id: string) => {
    const e = byId.get(id);
    if (!e) return;
    props.onWalk([{ doc: docId, center: id, name: e.name }]);
    props.onSelectEntity(id);
    setPick('');
    setPickOpen(false);
    props.onClearSearch();
  };
  const centerEntity = center ? byId.get(center) : undefined;
  // The current center is on the trail unless it was reached without a step (default center, new
  // file).
  const offTrail = !step || step.doc !== docId || step.center !== center;
  const cross = centerEntity && props.crossFile ? props.crossFile(centerEntity) : [];
  const kpiFor = centerEntity ? (kpiBadges?.get(centerEntity.name) ?? []) : [];
  // The counts and paging sit in the toolbar, or in the row below it on a phone, where the
  // toolbar keeps only the centre picker and the Controls button.
  const neighborCounts = (
    <>
      <span className="neighborhood-counts" role="status" aria-label="Neighbor counts">
        {centerEntity ? (
          <>
            {view.shown} of {view.total} neighbors
            {view.hidden > 0 && (
              <>
                {' '}
                · <strong>{view.hidden} hidden</strong>
              </>
            )}
          </>
        ) : (
          'No center'
        )}
      </span>
      {view.hidden > 0 && (
        <button onClick={() => setLimit(l => l + pageSize)}>
          {Math.min(pageSize, view.hidden)} more{' '}
          {Math.min(pageSize, view.hidden) === 1 ? 'neighbor' : 'neighbors'}
        </button>
      )}
      {limit > pageSize && <button onClick={() => setLimit(pageSize)}>Fewer</button>}
    </>
  );
  return (
    <div className="neighborhood-graph">
      <ScrollStrip className="neighborhood-tools">
        <div
          className="center-picker"
          role="combobox"
          aria-expanded={pickOpen && pickResults.length > 0}
          aria-haspopup="listbox"
          aria-owns="center-picker-results"
        >
          <LocateFixed size={14} />
          <input
            aria-label="Find a center"
            aria-controls="center-picker-results"
            aria-autocomplete="list"
            placeholder={centerEntity ? `Center: ${centerEntity.name}` : 'Find a center'}
            value={pick}
            onChange={e => {
              setPick(e.target.value);
              setPickOpen(true);
              setActive(0);
            }}
            onFocus={() => setPickOpen(true)}
            onBlur={() => setTimeout(() => setPickOpen(false), 150)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(i => Math.min(i + 1, pickResults.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(i => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && pickResults[active]) {
                e.preventDefault();
                choose(pickResults[active].id);
              } else if (e.key === 'Escape') {
                setPick('');
                setPickOpen(false);
              }
            }}
          />
          {pickOpen && pickResults.length > 0 && (
            <ul id="center-picker-results" role="listbox" aria-label="Center candidates">
              {pickResults.map((e, i) => (
                <li
                  key={e.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={ev => {
                    ev.preventDefault();
                    choose(e.id);
                  }}
                >
                  <strong title={e.name}>{e.name}</strong>
                  <small>{e.kind}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!compact && neighborCounts}
        <CompactControls>
          <PierceControls
            direction={direction}
            onDirection={setDirection}
            running={pierce.running}
            onPierce={() => void fullPierce()}
            onStop={pierce.stop}
            canUndo={undoable}
            onUndo={() => props.onWalkTo(walk.index - 1)}
            title={`Expand everything reachable from ${pierceOrigin}`}
          />
          <ZoomButtons
            onZoomIn={() => void zoomIn({ duration: 150 })}
            onZoomOut={() => void zoomOut({ duration: 150 })}
          />
          <GraphOptions>
            <OptionGroup title="Neighbors">
              {view.relationships.length > 1 && (
                <label>
                  Relationship
                  <select
                    aria-label="Filter neighbors by relationship"
                    value={relationship}
                    onChange={e => setRelationship(e.target.value)}
                  >
                    <option value="">
                      All ({view.relationships.reduce((n, r) => n + r.count, 0)})
                    </option>
                    {view.relationships.map(r => (
                      <option key={r.label} value={r.label}>
                        {r.label} ({r.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={() => setLateral(!lateral)}
                aria-pressed={lateral}
                title="Relationships among the visible neighbors"
              >
                Links between neighbors ({lateralCount}) {lateral ? 'on' : 'off'}
              </button>
              {view.technicalHidden > 0 || technical ? (
                <button
                  onClick={() => setTechnical(v => !v)}
                  aria-pressed={technical}
                  title="OWL properties, restrictions and other RDF resources"
                >
                  Technical resources {technical ? 'shown' : `hidden (${view.technicalHidden})`}
                </button>
              ) : null}
            </OptionGroup>
            <OptionGroup title="Show">
              <button onClick={() => setLabels(v => !v)} aria-pressed={labels}>
                Labels {labels ? 'on' : 'off'}
              </button>
              {farZoom.className && (
                <p>Hover or select a relationship for its label. Zoom in to show all labels.</p>
              )}
              {valueCount > 0 && (
                <button
                  onClick={() =>
                    setHideValues(v => {
                      writeHideValues(props.modelName, !v);
                      return !v;
                    })
                  }
                  aria-pressed={hideValues}
                  title={`${valueCount} value types and built-in concepts`}
                >
                  Value types {hideValues ? 'hidden' : 'shown'}
                </button>
              )}
              {kpiCount > 0 && (
                <button
                  onClick={() => setHideKpis(v => !v)}
                  aria-pressed={hideKpis}
                  title={`${kpiCount} metric nodes`}
                >
                  <Gauge size={14} />
                  Metrics {hideKpis ? 'hidden' : 'shown'}
                </button>
              )}
            </OptionGroup>
            <OptionGroup title="Layout">
              <button
                onClick={() => {
                  setNodes(build());
                  setFitted('');
                }}
                title="Put every node back in its column"
              >
                Re-center
              </button>
            </OptionGroup>
            <OptionGroup title="Go to">
              <button onClick={props.onOverview}>Model overview</button>
              <button onClick={props.onFullGraph}>Full graph</button>
            </OptionGroup>
          </GraphOptions>
          {props.fullscreen && <FullscreenButton fullscreen={props.fullscreen} />}
          <span className="neighborhood-legend" aria-hidden="true">
            <span className="in">Incoming</span>
            <span className="out">Outgoing</span>
            {lateral && <span className="lateral">Between neighbors</span>}
          </span>
        </CompactControls>
      </ScrollStrip>
      <div className="neighborhood-links">
        {compact && neighborCounts}
        <nav className="walk-trail" aria-label="Walk">
          <button
            aria-label="Back"
            title="Back"
            disabled={walk.index <= 0}
            onClick={() => props.onWalkTo(walk.index - 1)}
          >
            <ArrowLeft size={14} />
          </button>
          <button
            aria-label="Forward"
            title="Forward"
            disabled={walk.index >= walk.steps.length - 1}
            onClick={() => props.onWalkTo(walk.index + 1)}
          >
            <ArrowRight size={14} />
          </button>
          <ol>
            {walk.steps.map((s, i) => (
              <li key={i}>
                {s.via && (
                  <span className="via" title={`through ${s.via.label}`}>
                    {s.via.label} →
                  </span>
                )}
                <button
                  aria-current={i === walk.index && !offTrail ? 'step' : undefined}
                  onClick={() => props.onWalkTo(i)}
                  title={s.doc === docId ? s.name : `${s.name} in ${props.docLabel(s.doc)}`}
                >
                  {s.name}
                  {s.doc !== docId && <small> · {props.docLabel(s.doc)}</small>}
                </button>
              </li>
            ))}
            {offTrail && centerEntity && (
              <li>
                <button aria-current="step" title="Current center">
                  {centerEntity.name}
                </button>
              </li>
            )}
          </ol>
        </nav>
        {cross.length > 0 && (
          <CompactControls label="Other files">
            {cross.map(t => (
              <button
                key={t.doc + t.entity}
                onClick={() => props.onCrossFile?.(t)}
                title={t.reason}
              >
                <FileSymlink size={13} />
                Continue in <strong>{t.file}</strong> · {t.name}
              </button>
            ))}
          </CompactControls>
        )}
        {kpiFor.length > 0 && centerEntity && (
          <button onClick={() => props.onOpenKpis?.(centerEntity.name)}>
            <Gauge size={13} />
            {kpiFor.length} metric{kpiFor.length === 1 ? '' : 's'} for {centerEntity.name}
          </button>
        )}
      </div>
      {pierceSet && walk.steps[walk.index]?.set === pierceSet.id && (
        <PierceBanner
          result={{
            shown: pierceSet.nodes.length + 1,
            total: pierceSet.total,
            maxStep: Math.max(0, ...Object.values(pierceSet.steps ?? {})),
          }}
          budget={pierceSet.budget}
          max={PIERCE_MAX}
          running={pierce.running}
          onStop={pierce.stop}
          onFurther={() => void fullPierce(Math.min(PIERCE_MAX, pierceSet.budget + PIERCE_BUDGET))}
        />
      )}
      <div
        className="neighborhood-canvas"
        ref={canvas}
        data-canvas-nodes={canvasState.nodes.length}
        data-canvas-ids={canvasState.nodes.join(' ')}
      >
        {search.trim() && (
          <div className="neighborhood-search" role="region" aria-label="Search results">
            {searchResults.length ? (
              <>
                <small>Choose a center</small>
                <ul role="listbox" aria-label="Matching entities">
                  {searchResults.map(e => (
                    <li key={e.id} role="option" aria-selected={false}>
                      <button onClick={() => choose(e.id)}>
                        <strong title={e.name}>{e.name}</strong>
                        <small>{e.kind}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No entity matches “{search}”.</p>
            )}
          </div>
        )}
        {!view.entities.length ? (
          <div className="graph-empty" role="status">
            This model has no entities to display.
          </div>
        ) : (
          <ReactFlow
            className={farZoom.className}
            style={farZoom.style}
            nodes={rendered}
            edges={visibleEdges}
            edgeTypes={relationshipEdgeTypes}
            minZoom={0.05}
            maxZoom={2}
            nodesConnectable={false}
            onNodesChange={onNodesChange}
            onlyRenderVisibleElements={rendered.length > LARGE_CANVAS}
            onNodeClick={(_, node) => {
              if (node.id === center) props.onSelectEntity(node.id);
              else walkTo(node.id, viaFor(node.id));
            }}
            onEdgeClick={(_, edge) => {
              // A relationship line expands its far end in place; Walk here re-centres.
              const ends =
                edge.source === center
                  ? [edge.target]
                  : edge.target === center
                    ? [edge.source]
                    : [edge.target, edge.source];
              const far = ends.find(id => !canvasState.expandedBy.has(id));
              if (far) expand(far);
              props.onSelectEdge(edge.id);
            }}
            onEdgeMouseEnter={(_, edge) => setHovered(edge.id)}
            onEdgeMouseLeave={() => setHovered('')}
          >
            <Background gap={22} size={1} />
            {farZoom.watcher}
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
