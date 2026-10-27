/** Displays the complete model graph with grouping, filtering and a detail inspector. */
import { flushSync } from 'react-dom';
import { ScrollStrip } from '../shared/ScrollStrip';
import type { GroupingOptions } from './overview';
import { RoutedEdge } from './RoutedEdge';
import { roundedPath, pointAtHalf, type Point } from '../odcs/edge-route';
import { pathMatchesEndpoints } from './edge-path';
import { edgeAppearance } from './edge-styles';
import { useRecordedState } from '../app/useRecordedState';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  getViewportForBounds,
  Background,
  MiniMap,
  Handle,
  Position,
  NodeToolbar,
  BaseEdge,
  BezierEdge,
  useNodesState,
  MarkerType,
  type NodeProps,
  type EdgeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import { SmartEdgeProvider, type SmartEdgeMetrics } from '@tisoap/react-flow-smart-edge';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { Crosshair, Maximize, Maximize2, Minimize2, RefreshCw, Gauge } from 'lucide-react';
import { useViewRestore, type Fullscreen } from './fullscreen';
import { GraphOptions, OptionGroup, Segmented, ShowToggle } from './GraphOptions';
import { ZoomButtons } from './ZoomButtons';
import { startsCollapsed, textSizesAt } from './overview-capacity';
import { CompactControls } from './CompactControls';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import { collapseAreas } from './collapse';
import { FALLBACK_GROUP_COLOR } from '../theme/theme-palette';
import { layoutFullGraph, packNetwork } from './full-layout';
import type { Entity, Relationship } from '../core/model';
import { timeOperation } from '../observability/page-reporting';
function relationshipOpacity(emphasized: boolean, hasFocus: boolean, zoom: number) {
  if (emphasized) return 0.95;
  if (hasFocus) return 0.07;
  return zoom < 0.6 ? 0.22 : 0.48;
}

const sides = [
  ['n', Position.Top],
  ['e', Position.Right],
  ['s', Position.Bottom],
  ['w', Position.Left],
] as const;
const EntityNode = memo(({ data }: NodeProps) => (
  <div
    className={`full-entity ${data.focused ? 'focused' : ''} ${data.collapsedArea ? 'collapsed' : ''} ${data.kind === 'Metric' ? 'kpi-node' : ''}`}
    style={{ '--entity-color': data.color } as any}
  >
    <NodeToolbar isVisible={!!data.tooltip} position={Position.Top}>
      <div className="entity-tooltip">{String(data.name)}</div>
    </NodeToolbar>
    {sides.flatMap(([id, position]) => [
      <Handle key={'s' + id} id={'source-' + id} type="source" position={position} />,
      <Handle key={'t' + id} id={'target-' + id} type="target" position={position} />,
    ])}
    <span className="entity-color" />
    {data.kind === 'Metric' && (
      <small className="kpi-kind">
        <Gauge size={11} />
        Metric
      </small>
    )}
    <strong>
      {String(data.name)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')}
    </strong>
    {!!data.collapsedArea && (
      <small>
        {String(data.internalCount ?? 0)} internal relationship
        {Number(data.internalCount ?? 0) === 1 ? '' : 's'} · click to expand
      </small>
    )}
    {Array.isArray(data.kpis) && data.kpis.length > 0 && (
      <span className="kpi-badge node-kpi-badge" title={`Metrics: ${data.kpis.join(', ')}`}>
        <Gauge size={10} />
        {data.kpis.length === 1 ? 'Metric' : `${data.kpis.length} metrics`}
      </span>
    )}
  </div>
));
const AreaNode = memo(({ data }: NodeProps) => (
  <div className="full-area-title" title={String(data.name)}>
    <span style={{ background: String(data.color) }} />
    <strong>{String(data.name)}</strong>
    <small>{String(data.count)} entities</small>
  </div>
));
const GraphEdge = memo((props: EdgeProps) => {
  const appearance = edgeAppearance(props);
  const points = props.data?.layoutRoute as Point[] | undefined;
  const path = points && roundedPath(points, 8);
  if (
    path &&
    pathMatchesEndpoints(path, props.sourceX, props.sourceY, props.targetX, props.targetY, 1.1)
  ) {
    const anchored = [...points!];
    anchored[0] = { x: props.sourceX, y: props.sourceY };
    anchored[anchored.length - 1] = { x: props.targetX, y: props.targetY };
    const label = pointAtHalf(anchored);
    return (
      <BaseEdge
        {...appearance}
        path={roundedPath(anchored, 8)}
        labelX={label.x}
        labelY={label.y}
        interactionWidth={24}
      />
    );
  }
  if (props.source === props.target) {
    const { sourceX: x, sourceY: y, targetX: tx, targetY: ty } = props;
    return (
      <BaseEdge
        id={props.id}
        path={`M ${x},${y} C ${x + 70},${y - 75} ${tx + 70},${ty + 75} ${tx},${ty}`}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={24}
        label={props.label}
        labelX={x + 55}
        labelY={y - 35}
      />
    );
  }
  if (!props.data?.routeDetailed) return <BezierEdge {...props} />;
  return <RoutedEdge {...props} />;
});
const nodeTypes = { entity: EntityNode, businessArea: AreaNode };
const edgeTypes = { routed: GraphEdge };
const routingOptions = { nodePadding: 10, gridRatio: 10 };
type LayoutResult = Awaited<ReturnType<typeof layoutFullGraph>>;
const cache = new Map<string, LayoutResult>();
type Props = {
  toolbarExtra?: React.ReactNode;
  grouping?: GroupingOptions;
  onGroupingChange?: (value: GroupingOptions) => void;
  groupingError?: string;
  name: string;
  entities: Entity[];
  edges: Relationship[];
  selected: string;
  selectedEdge: string;
  search: string;
  onSelectEntity: (id: string) => void;
  onSelectEdge: (id: string) => void;
  kpiBadges?: Map<string, string[]>;
  fullscreen?: Fullscreen;
};
const VALUE_KINDS = new Set(['ValueType', 'Built-in concept']);
const valuesKey = (name: string) => 'workbench:hide-value-types:' + name;
const kpisKey = (name: string) => 'workbench:hide-kpis:' + name;
// The mini-map is off until a person asks for it; the choice is remembered in this browser.
const MINI_MAP_KEY = 'workbench:graph-mini-map';
function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, hide: boolean) {
  try {
    if (hide) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {}
}
const readHideValues = (name: string) => readFlag(valuesKey(name));
const writeHideValues = (name: string, hide: boolean) => writeFlag(valuesKey(name), hide);
/** Displays the model graph with grouping, filtering and entity details. */
export function FullGraph(props: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  // The zoom rounded down in steps of 0.05. Text sizes follow it while the canvas moves, never
  // read smaller than planned, and do not redraw every edge on each frame.
  const [zoomStep, setZoomStep] = useState(1);
  const followZoom = (zoom: number) => setZoomStep(Math.floor(zoom * 20) / 20);
  const [size, setSize] = useState({ width: 1200, height: 650 });
  const flow = useRef<ReactFlowInstance<any, any> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [algorithm, setAlgorithm] = useRecordedState<'network' | 'layered'>(
    'graph.algorithm',
    'network',
  );
  const [layoutRoutes, setLayoutRoutes] = useState<LayoutResult['routes']>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [hover, setHover] = useState('');
  const [hoverEdge, setHoverEdge] = useState('');
  const [labels, setLabels] = useRecordedState('graph.labels', false);
  const [version, setVersion] = useState(0);
  const [miniMap, setMiniMap] = useRecordedState('graph.miniMap', () => readFlag(MINI_MAP_KEY));
  useEffect(() => writeFlag(MINI_MAP_KEY, miniMap), [miniMap]);
  const toggleMiniMap = () => setMiniMap(shown => !shown);
  const [routeMetrics, setRouteMetrics] = useState<SmartEdgeMetrics | null>(null);
  // Value types (including built-ins) can be hidden with their edges; the choice is remembered per
  // model in this browser.
  const valueIds = useMemo(
    () => new Set(props.entities.filter(e => VALUE_KINDS.has(e.kind)).map(e => e.id)),
    [props.entities],
  );
  const [hideValues, setHideValues] = useRecordedState('graph.hideValues', () =>
    readHideValues(props.name),
  );
  useEffect(() => writeHideValues(props.name, hideValues), [props.name, hideValues]);
  const toggleValues = () => setHideValues(hidden => !hidden);
  // Metric nodes (governed metrics) can be hidden the same way.
  const kpiIds = useMemo(
    () => new Set(props.entities.filter(e => e.kind === 'Metric').map(e => e.id)),
    [props.entities],
  );
  const [hideKpis, setHideKpis] = useRecordedState('graph.hideKpis', () =>
    readFlag(kpisKey(props.name)),
  );
  useEffect(() => writeFlag(kpisKey(props.name), hideKpis), [props.name, hideKpis]);
  const toggleKpis = () => setHideKpis(hidden => !hidden);
  const hidden = useMemo(
    () => new Set([...(hideValues ? valueIds : []), ...(hideKpis ? kpiIds : [])]),
    [hideValues, hideKpis, valueIds, kpiIds],
  );
  const graphEntities = useMemo(
    () => (hidden.size ? props.entities.filter(e => !hidden.has(e.id)) : props.entities),
    [hidden, props.entities],
  );
  const graphEdges = useMemo(
    () =>
      hidden.size
        ? props.edges.filter(e => !hidden.has(e.source) && !hidden.has(e.target))
        : props.edges,
    [hidden, props.edges],
  );
  const overview = useMemo(
    () => modelOverview(graphEntities, graphEdges, props.name, false, props.grouping),
    [graphEntities, graphEdges, props.name, props.grouping],
  );
  // Until a person collapses or expands areas, only a very large model starts as one card per area.
  const [collapseChoice, setCollapseChoice] = useRecordedState<Set<string> | null>(
    'graph.collapsedAreas',
    null,
  );
  const autoCollapsed = useMemo(
    () =>
      startsCollapsed(overview.entities.length)
        ? new Set(overview.groups.map(g => g.id))
        : new Set<string>(),
    [overview],
  );
  const collapsed = collapseChoice ?? autoCollapsed;
  const setCollapsed = (next: Set<string>) => setCollapseChoice(next);
  const display = useMemo(() => collapseAreas(overview, collapsed), [overview, collapsed]);
  const layoutGrouping = useMemo<GroupingOptions>(
    () => ({
      mode: 'types',
      assignments: Object.fromEntries(
        display.entities.map(e => [
          e.id,
          e.definition?.collapsedArea ?? overview.groupOf.get(e.id)!,
        ]),
      ),
      names: Object.fromEntries(overview.groups.map(g => [g.id, g.name])),
    }),
    [display, overview],
  );
  const expandArea = (areaId: string) => {
    const next = new Set(collapsed);
    next.delete(areaId);
    setCollapsed(next);
  };
  const relayout = () => setVersion(current => current + 1);
  const zoomToGroup = (groupId: string) => {
    if (!groupId) {
      fit();
      return;
    }
    void flow.current?.fitView({
      nodes: [{ id: 'area:' + groupId }],
      padding: 0.2,
      maxZoom: 1.1,
      duration: 350,
    });
  };
  const connections = useMemo(() => groupRelationships(display.edges), [display]);
  const entityById = useMemo(() => new Map(display.entities.map(e => [e.id, e])), [display]);
  const groupById = useMemo(() => new Map(overview.groups.map(g => [g.id, g])), [overview]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let resizeFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const pane = { width: entry.contentRect.width, height: entry.contentRect.height };
      cancelAnimationFrame(resizeFrame);
      // Pane state changes can reflow the toolbar and invalidate the current resize delivery.
      resizeFrame = requestAnimationFrame(() => {
        // Commit before the next layout pass instead of leaving a batched update for an observer.
        flushSync(() => {
          setSize(previous =>
            previous.width === pane.width && previous.height === pane.height ? previous : pane,
          );
        });
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, []);
  // An animated move reads the canvas size one frame later. If the workspace is hidden by then
  // (Admin opening), the size is zero and the viewport becomes NaN. So resize refits move at once,
  // and a NaN viewport is replaced without animating from it.
  const fitWithin = useCallback((duration: number) => {
    const instance = flow.current;
    const canvas = container.current?.querySelector('.react-flow');
    if (!instance || !canvas) return;
    const current = instance.getNodes();
    const byId = new Map(current.map(n => [n.id, n]));
    if (!current.length) return;
    const boxes = current.map(n => {
      let x = n.position.x;
      let y = n.position.y;
      let parent = n.parentId;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const p = byId.get(parent);
        if (!p) break;
        x += p.position.x;
        y += p.position.y;
        parent = p.parentId;
      }
      return {
        x,
        y,
        width: Number(n.style?.width ?? n.measured?.width ?? 184),
        height: Number(n.style?.height ?? n.measured?.height ?? 60),
      };
    });
    const x = Math.min(...boxes.map(n => n.x));
    const y = Math.min(...boxes.map(n => n.y));
    const width = Math.max(...boxes.map(n => n.x + n.width)) - x;
    const height = Math.max(...boxes.map(n => n.y + n.height)) - y;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const startsValid = Number.isFinite(instance.getViewport().zoom);
    void instance.setViewport(
      getViewportForBounds({ x, y, width, height }, rect.width, rect.height, 0.001, 1, 0.12),
      { duration: startsValid ? duration : 0 },
    );
  }, []);
  const fit = useCallback(() => fitWithin(250), [fitWithin]);
  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    let elk: { layout: (g: any) => Promise<any>; terminateWorker: () => void } | undefined;
    const key = JSON.stringify([
      algorithm,
      layoutGrouping,
      props.name,
      display.entities.map(e => [e.id, e.name, e.kind]),
      display.edges.map(e => [e.source, e.target]),
    ]);
    setBusy(true);
    setError('');
    setRouteMetrics(null);
    function apply(result: LayoutResult) {
      if (cancelled) return;
      setLayoutRoutes(result.routes ?? {});
      cache.set(key, result);
      if (cache.size > 6) cache.delete(cache.keys().next().value!);
      setNodes(previous => {
        const previousById = new Map(previous.map(node => [node.id, node]));
        return result.nodes.map(n => {
          const group = n.group
            ? groupById.get(n.group)
            : groupById.get(overview.groupOf.get(n.id)!);
          const type = n.group ? 'businessArea' : 'entity';
          const prior = previousById.get(n.id);
          const sameSize =
            prior?.type === type &&
            prior.style?.width === n.width &&
            prior.style?.height === n.height;
          return {
            id: n.id,
            type,
            measured: sameSize ? prior.measured : undefined,
            position: { x: n.x, y: n.y },
            parentId: n.parentId,
            extent: n.parentId ? 'parent' : undefined,
            draggable: true,
            selectable: !n.group,
            style: {
              width: n.width,
              height: n.height,
              ...(n.group
                ? {
                    background: group!.color + '06',
                    border: '1px solid ' + group!.color + '45',
                    borderRadius: 16,
                    zIndex: -1,
                  }
                : { zIndex: 2 }),
            },
            data: n.group
              ? { name: group!.name, color: group!.color, count: group!.entities.length }
              : {
                  name: entityById.get(n.id)?.name,
                  collapsedArea: entityById.get(n.id)?.definition?.collapsedArea,
                  internalCount:
                    display.internal.get(entityById.get(n.id)?.definition?.collapsedArea)?.length ??
                    0,
                  color: group?.color ?? FALLBACK_GROUP_COLOR,
                },
          };
        });
      });
      setBusy(false);
      setTimeout(fit, 150);
    }
    if (cache.has(key) && !version) {
      apply(cache.get(key)!);
    } else if (algorithm === 'network') {
      worker = new Worker(new URL('./network-layout.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        if (data.error) {
          if (!cancelled) {
            setError(data.error);
            setBusy(false);
          }
        } else {
          elk = new ELK({
            algorithms: ['layered', 'sporeOverlap', 'box'],
            workerFactory: () => new Worker(elkWorkerUrl),
          });
          packNetwork(data.result, elk)
            .then(apply)
            .catch(e => {
              if (!cancelled) {
                setError(e.message);
                setBusy(false);
              }
            })
            .finally(() => elk?.terminateWorker());
        }
        worker?.terminate();
      };
      worker.onerror = () => {
        if (!cancelled) {
          setError('Network layout failed');
          setBusy(false);
        }
      };
      worker.postMessage({
        entities: display.entities,
        edges: display.edges,
        name: props.name,
        grouping: layoutGrouping,
      });
    } else {
      elk = new ELK({
        algorithms: ['layered', 'sporeOverlap', 'box'],
        workerFactory: () => new Worker(elkWorkerUrl),
      });
      timeOperation(
        'graph-layout',
        layoutFullGraph(display.entities, display.edges, props.name, elk, layoutGrouping),
      )
        .then(apply)
        .catch(e => {
          if (!cancelled) {
            setError(e.message);
            setBusy(false);
          }
        })
        .finally(() => elk?.terminateWorker());
    }
    return () => {
      cancelled = true;
      worker?.terminate();
      elk?.terminateWorker();
    };
  }, [overview, display, algorithm, version, layoutGrouping]);
  // Full screen keeps the view it started from and puts it back on exit.
  const held = useViewRestore(
    !!props.fullscreen?.active,
    () => flow.current?.getViewport(),
    v => {
      void flow.current?.setViewport(v);
      setViewport(v);
    },
  );
  // Refit after the remaining canvas changes size (panels, monitor, wrapped controls).
  useEffect(() => {
    const el = container.current?.querySelector('.react-flow');
    if (busy || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!held()) fitWithin(0);
      }, 100);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [busy, fitWithin]);
  useEffect(() => {
    // A person who opened every area keeps them open under another grouping; any other choice
    // belonged to the old groups.
    setCollapseChoice(choice => (choice?.size === 0 ? choice : null));
  }, [props.grouping]);
  const selectedGroup = overview.groupOf.get(props.selected);
  const focus =
    hover ||
    (selectedGroup && collapsed.has(selectedGroup) ? 'collapsed:' + selectedGroup : props.selected);
  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (focus) {
      ids.add(focus);
      for (const e of display.edges)
        if (e.source === focus || e.target === focus) {
          ids.add(e.source);
          ids.add(e.target);
        }
    }
    return ids;
  }, [display, focus]);
  const renderedNodes = useMemo(
    () =>
      nodes.map(n =>
        n.type === 'entity'
          ? {
              ...n,
              selected: n.id === props.selected,
              data: {
                ...n.data,
                kind: entityById.get(n.id)?.kind,
                kpis: props.kpiBadges?.get(String(n.data.name)),
                focused: connected.has(n.id),
                tooltip: n.id === hover || n.id === props.selected,
              },
              style: { ...n.style, opacity: focus && !connected.has(n.id) ? 0.32 : 1 },
            }
          : n,
      ),
    [nodes, connected, focus, props.selected, hover, entityById, props.kpiBadges],
  );
  const positions = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    return new Map(
      nodes
        .filter(n => n.type === 'entity')
        .map(n => {
          const p = byId.get(n.parentId);
          return [
            n.id,
            {
              x: n.position.x + (p?.position.x ?? 0),
              y: n.position.y + (p?.position.y ?? 0),
              width: 184,
              height: 60,
            },
          ];
        }),
    );
  }, [nodes]);
  const dragging = nodes.some(n => n.dragging);
  const edges = useMemo(
    () =>
      connections.map(e => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        let source = 'e';
        let target = 'w';
        if (a && b) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            source = dx >= 0 ? 'e' : 'w';
            target = dx >= 0 ? 'w' : 'e';
          } else {
            source = dy >= 0 ? 's' : 'n';
            target = dy >= 0 ? 'n' : 's';
          }
        }
        if (e.source === e.target) {
          source = 'e';
          target = 's';
        }
        if (algorithm === 'layered') {
          source = 'e';
          target = 'w';
        }
        const active = e.data.relationships.some(r => r.id === props.selectedEdge);
        const adjacent = e.source === focus || e.target === focus;
        const visible = (p: any) =>
          p &&
          p.x * viewport.zoom + viewport.x > -220 * viewport.zoom &&
          p.x * viewport.zoom + viewport.x < size.width + 30 &&
          p.y * viewport.zoom + viewport.y > -90 * viewport.zoom &&
          p.y * viewport.zoom + viewport.y < size.height + 30;
        const routeDetailed =
          !dragging &&
          e.source !== e.target &&
          (active || adjacent || (viewport.zoom >= 0.35 && visible(a) && visible(b)));
        return {
          ...e,
          data: {
            ...e.data,
            algorithm,
            routeDetailed,
            layoutRoute: algorithm === 'layered' ? layoutRoutes[e.id]?.flat() : undefined,
          },
          type: 'routed',
          sourceHandle: 'source-' + source,
          targetHandle: 'target-' + target,
          selected: active,
          label:
            labels || active || hoverEdge === e.id
              ? e.data.relationships.length > 1
                ? `${e.data.relationships.length} relationships`
                : e.label
              : undefined,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
            width: 13,
            height: 13,
          },
          zIndex: -2,
          interactionWidth: 24,
          style: {
            stroke: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
            strokeWidth: active ? 2 : 1.2,
            strokeOpacity: relationshipOpacity(active || adjacent, Boolean(focus), viewport.zoom),
          },
        };
      }),
    [
      connections,
      positions,
      props.selectedEdge,
      focus,
      labels,
      hoverEdge,
      algorithm,
      layoutRoutes,
      viewport,
      size,
      dragging,
    ],
  );
  useEffect(() => {
    if (!props.search || busy) return;
    const match = overview.entities.find(
      e =>
        e.name.toLowerCase().includes(props.search.toLowerCase()) ||
        e.id.toLowerCase().includes(props.search.toLowerCase()),
    );
    if (!match) return;
    const timer = setTimeout(() => {
      void flow.current?.fitView({
        nodes: [{ id: match.id }],
        padding: 0.8,
        maxZoom: 1,
        duration: 300,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [props.search, busy, overview]);
  const selectedConnection = collapsed.size
    ? connections.find(e => e.data.relationships.some(r => r.id === props.selectedEdge))
    : undefined;
  const originalById = useMemo(() => new Map(props.edges.map(e => [e.id, e])), [props.edges]);
  const originalEntities = useMemo(
    () => new Map(props.entities.map(e => [e.id, e])),
    [props.entities],
  );
  const sizes = textSizesAt(zoomStep);
  const textStyle = {
    '--entity-name-size': `${sizes.entityName}px`,
    '--entity-name-lines': sizes.entityLines,
    '--entity-card-padding-block': `${sizes.entityPadding}px`,
    '--area-title-size': `${sizes.areaTitle}px`,
    '--entity-detail-display': sizes.showDetail ? 'block' : 'none',
  } as React.CSSProperties;
  const metrics = useCallback((m: SmartEdgeMetrics) => setRouteMetrics(m), []);
  return (
    <div className="full-graph" ref={container} style={textStyle} data-layout={algorithm}>
      <ScrollStrip className="full-graph-tools">
        {props.toolbarExtra}
        <button onClick={fit}>
          <Maximize size={13} />
          Fit model
        </button>
        <CompactControls>
          <ZoomButtons
            onZoomIn={() => void flow.current?.zoomIn({ duration: 150 })}
            onZoomOut={() => void flow.current?.zoomOut({ duration: 150 })}
          />
          <GraphOptions>
            <OptionGroup title="Layout">
              <Segmented
                label="Graph layout"
                value={algorithm}
                onChange={setAlgorithm}
                options={[
                  { value: 'layered', label: 'Layered', title: 'Layered layout (ELK)' },
                  { value: 'network', label: 'Network', title: 'Network layout (fCoSE)' },
                ]}
              />
              <button onClick={relayout} disabled={busy} title="Re-layout" aria-label="Re-layout">
                <RefreshCw size={13} />
              </button>
              <label className="zoom-to-group">
                <Crosshair size={13} aria-hidden="true" />
                <select
                  aria-label="Zoom to group"
                  title={overview.groupingLabel}
                  defaultValue=""
                  onChange={e => zoomToGroup(e.target.value)}
                >
                  <option value="">Whole model</option>
                  {overview.groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </OptionGroup>
            <OptionGroup title="Areas">
              <button
                onClick={() => setCollapsed(new Set(overview.groups.map(g => g.id)))}
                disabled={collapsed.size === overview.groups.length}
              >
                Collapse areas
              </button>
              <button onClick={() => setCollapsed(new Set())} disabled={!collapsed.size}>
                Expand all
              </button>
            </OptionGroup>
            <OptionGroup title="Show">
              <ShowToggle on={labels} onToggle={() => setLabels(shown => !shown)}>
                Labels
              </ShowToggle>
              {valueIds.size > 0 && (
                <ShowToggle
                  on={!hideValues}
                  onToggle={toggleValues}
                  title={`${valueIds.size} value types and their relationships`}
                >
                  Value types
                </ShowToggle>
              )}
              {kpiIds.size > 0 && (
                <ShowToggle
                  on={!hideKpis}
                  onToggle={toggleKpis}
                  title={`${kpiIds.size} metric nodes and their relationships`}
                >
                  Metrics
                </ShowToggle>
              )}
              <ShowToggle on={miniMap} onToggle={toggleMiniMap} title="Mini-map of the whole model">
                Mini-map
              </ShowToggle>
            </OptionGroup>
          </GraphOptions>
          {props.fullscreen && <FullscreenButton fullscreen={props.fullscreen} />}
        </CompactControls>
      </ScrollStrip>
      {error ? (
        <div role="alert" className="full-graph-loading">
          {error}
          <button onClick={() => setVersion(v => v + 1)}>Retry layout</button>
        </div>
      ) : (
        <SmartEdgeProvider nodes={renderedNodes} options={routingOptions} onMetrics={metrics}>
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onMove={(_, v) => followZoom(v.zoom)}
            onMoveEnd={(_, v) => setViewport(v)}
            onInit={instance => {
              flow.current = instance;
              if (nodes.length) setTimeout(fit, 80);
            }}
            onNodeClick={(_, n) => {
              if (n.data.collapsedArea) expandArea(String(n.data.collapsedArea));
              else if (n.type === 'entity') props.onSelectEntity(n.id);
            }}
            onNodeDoubleClick={(_, n) => {
              void flow.current?.fitView({
                nodes: [{ id: n.parentId ?? n.id }],
                padding: 0.2,
                maxZoom: 1,
                duration: 300,
              });
            }}
            onNodeMouseEnter={(_, n) => {
              if (n.type === 'entity') setHover(n.id);
            }}
            onNodeMouseLeave={() => setHover('')}
            onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
            onEdgeMouseLeave={() => setHoverEdge('')}
            onEdgeClick={(_, e) => props.onSelectEdge(e.id)}
            nodesConnectable={false}
            edgesReconnectable={false}
            minZoom={0.001}
            maxZoom={2}
            onlyRenderVisibleElements
          >
            <Background gap={24} color="var(--color-border)" />
            {miniMap && (
              <MiniMap
                pannable
                zoomable
                nodeColor={n => String(n.data.color ?? 'var(--color-neutral)')}
              />
            )}
          </ReactFlow>
        </SmartEdgeProvider>
      )}
      {selectedConnection && selectedConnection.data.relationships.length > 1 && (
        <label className="graph-bundle-choice">
          {selectedConnection.data.relationships.length} relationships in this bundle
          <select
            aria-label="Graph bundle relationship"
            value={props.selectedEdge}
            onChange={e => props.onSelectEdge(e.target.value)}
          >
            {selectedConnection.data.relationships.map(r => {
              const original = originalById.get(r.id)!;
              return (
                <option key={r.id} value={r.id}>
                  {originalEntities.get(original.source)?.name} · {r.label} →{' '}
                  {originalEntities.get(original.target)?.name}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {busy && (
        <div className="full-graph-loading" role="status">
          Arranging {display.entities.length} graph nodes…
        </div>
      )}
      <div
        className="full-graph-status"
        data-entity-count={overview.entities.length}
        data-relationship-count={overview.links.length}
        data-routing={routeMetrics?.executedOn ?? 'pending'}
      >
        {hideValues && <span>{valueIds.size} value types hidden</span>}
        {hideKpis && <span>{kpiIds.size} metrics hidden</span>}
        {collapsed.size > 0 && (
          <strong>{collapsed.size} area cards · Select an area to open it</strong>
        )}
        <span title="Double-click a group to zoom in">Color = area · Line = relationship</span>
      </div>
    </div>
  );
}
/** Toggles the graph's full-screen view. */
export const FullscreenButton = ({ fullscreen: f }: { fullscreen: Fullscreen }) => (
  <button
    className="fullscreen-toggle"
    onClick={f.toggle}
    aria-pressed={f.active}
    aria-label={f.active ? 'Exit full screen' : 'Enter full screen'}
    title={f.active ? 'Exit full screen (Esc)' : 'Full screen (F)'}
  >
    {f.active ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    {f.active && 'Exit full screen'}
  </button>
);
