/** Displays the complete model graph with grouping, filtering and a detail inspector. */
import { flushSync } from 'react-dom';
import { ScrollStrip } from '../components/ScrollStrip';
import type { GroupingOptions } from './overview';
import { RoutedEdge } from './RoutedEdge';
import { roundedPath, pointAtHalf, type Point } from '../odcs/edge-route';
import { pathMatchesEndpoints } from './edge-path';
import { edgeAppearance } from './edge-styles';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
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
import { layoutFullGraph } from './full-layout';
import { layoutNetwork } from './network-layout';
import { crossesAreas, linkedAreaCounts } from './area-links';
import { areaTileData, entityCardData } from './full-node-data';
import { shownName } from './text-fit';
import type { Entity, Relationship } from '../../shared/core/model';
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
  <div className={`full-entity ${data.focused ? 'focused' : ''} ${data.collapsedArea ? 'collapsed' : ''} ${data.kind === 'Metric' ? 'kpi-node' : ''}`} style={{ '--entity-color': data.color } as any}>
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
    <strong style={{ '--entity-name-cap': data.nameCap } as React.CSSProperties}>{shownName(String(data.name))}</strong>
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
  <div className="full-area-title" title={String(data.name)} style={{ '--area-title-cap': data.titleCap } as React.CSSProperties}>
    <span style={{ background: String(data.color) }} />
    <strong>{String(data.name)}</strong>
    <small>{String(data.count)} entities</small>
    {Boolean(data.linksText) && <em className="area-links">{String(data.linksText)}</em>}
  </div>
));
const GraphEdge = memo((props: EdgeProps) => {
  const appearance = edgeAppearance(props);
  const points = props.data?.layoutRoute as Point[] | undefined;
  const path = points && roundedPath(points, 8);
  if (path && pathMatchesEndpoints(path, props.sourceX, props.sourceY, props.targetX, props.targetY, 1.1)) {
    const anchored = [...points!];
    anchored[0] = { x: props.sourceX, y: props.sourceY };
    anchored[anchored.length - 1] = { x: props.targetX, y: props.targetY };
    const label = pointAtHalf(anchored);
    return <BaseEdge {...appearance} path={roundedPath(anchored, 8)} labelX={label.x} labelY={label.y} interactionWidth={24} />;
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
  /** The Group menu; on a phone it folds into the Controls panel with the other options. */
  groupMenu?: React.ReactNode;
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
  const laidOutKey = useRef('');
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [algorithm, setAlgorithm] = useRecordedState<'network' | 'layered'>('graph.algorithm', 'network');
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
  const valueIds = useMemo(() => new Set(props.entities.filter(e => VALUE_KINDS.has(e.kind)).map(e => e.id)), [props.entities]);
  const [hideValues, setHideValues] = useRecordedState('graph.hideValues', () => readHideValues(props.name));
  useEffect(() => writeHideValues(props.name, hideValues), [props.name, hideValues]);
  const toggleValues = () => setHideValues(hidden => !hidden);
  // Metric nodes (governed metrics) can be hidden the same way.
  const kpiIds = useMemo(() => new Set(props.entities.filter(e => e.kind === 'Metric').map(e => e.id)), [props.entities]);
  const [hideKpis, setHideKpis] = useRecordedState('graph.hideKpis', () => readFlag(kpisKey(props.name)));
  useEffect(() => writeFlag(kpisKey(props.name), hideKpis), [props.name, hideKpis]);
  const toggleKpis = () => setHideKpis(hidden => !hidden);
  const hidden = useMemo(() => new Set([...(hideValues ? valueIds : []), ...(hideKpis ? kpiIds : [])]), [hideValues, hideKpis, valueIds, kpiIds]);
  const graphEntities = useMemo(() => (hidden.size ? props.entities.filter(e => !hidden.has(e.id)) : props.entities), [hidden, props.entities]);
  const graphEdges = useMemo(() => (hidden.size ? props.edges.filter(e => !hidden.has(e.source) && !hidden.has(e.target)) : props.edges), [hidden, props.edges]);
  const overview = useMemo(() => modelOverview(graphEntities, graphEdges, props.name, false, props.grouping), [graphEntities, graphEdges, props.name, props.grouping]);
  // Until a person collapses or expands areas, only a very large model starts as one card per area.
  const [collapseChoice, setCollapseChoice] = useRecordedState<Set<string> | null>('graph.collapsedAreas', null);
  const autoCollapsed = useMemo(() => (startsCollapsed(overview.entities.length) ? new Set(overview.groups.map(g => g.id)) : new Set<string>()), [overview]);
  const collapsed = collapseChoice ?? autoCollapsed;
  const setCollapsed = (next: Set<string>) => setCollapseChoice(next);
  const display = useMemo(() => collapseAreas(overview, collapsed), [overview, collapsed]);
  const layoutGrouping = useMemo<GroupingOptions>(
    () => ({
      mode: 'types',
      assignments: Object.fromEntries(display.entities.map(e => [e.id, e.definition?.collapsedArea ?? overview.groupOf.get(e.id)!])),
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
  const areaOf = useCallback((entityId: string) => entityById.get(entityId)?.definition?.collapsedArea ?? overview.groupOf.get(entityId), [entityById, overview]);
  const areaLinkCounts = useMemo(() => linkedAreaCounts(connections, areaOf), [connections, areaOf]);
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
          setSize(previous => (previous.width === pane.width && previous.height === pane.height ? previous : pane));
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
    const boxes = current.map(node => {
      let x = node.position.x;
      let y = node.position.y;
      let parent = node.parentId;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        const parentNode = byId.get(parent);
        if (!parentNode) break;
        x += parentNode.position.x;
        y += parentNode.position.y;
        parent = parentNode.parentId;
      }
      return {
        x,
        y,
        width: Number(node.style?.width ?? node.measured?.width ?? 184),
        height: Number(node.style?.height ?? node.measured?.height ?? 60),
      };
    });
    const x = Math.min(...boxes.map(n => n.x));
    const y = Math.min(...boxes.map(n => n.y));
    const width = Math.max(...boxes.map(n => n.x + n.width)) - x;
    const height = Math.max(...boxes.map(n => n.y + n.height)) - y;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const startsValid = Number.isFinite(instance.getViewport().zoom);
    void instance.setViewport(getViewportForBounds({ x, y, width, height }, rect.width, rect.height, 0.001, 1, 0.12), { duration: startsValid ? duration : 0 });
  }, []);
  const fit = useCallback(() => fitWithin(250), [fitWithin]);
  useEffect(() => {
    let cancelled = false;
    let elk: { layout: (elkGraph: any) => Promise<any>; terminateWorker: () => void } | undefined;
    const key = JSON.stringify([algorithm, layoutGrouping, props.name, display.entities.map(e => [e.id, e.name, e.kind]), display.edges.map(e => [e.source, e.target])]);
    setBusy(true);
    setError('');
    // A re-layout that lands on the same arrangement re-routes nothing, so its old metrics still hold.
    if (laidOutKey.current !== key) setRouteMetrics(null);
    function apply(result: LayoutResult) {
      if (cancelled) return;
      laidOutKey.current = key;
      setLayoutRoutes(result.routes ?? {});
      cache.set(key, result);
      if (cache.size > 6) cache.delete(cache.keys().next().value!);
      setNodes(previous => {
        const previousById = new Map(previous.map(node => [node.id, node]));
        return result.nodes.map(node => {
          const group = node.group ? groupById.get(node.group) : groupById.get(overview.groupOf.get(node.id)!);
          const type = node.group ? 'businessArea' : 'entity';
          const prior = previousById.get(node.id);
          const sameSize = prior?.type === type && prior.style?.width === node.width && prior.style?.height === node.height;
          return {
            id: node.id,
            type,
            measured: sameSize ? prior.measured : undefined,
            position: { x: node.x, y: node.y },
            parentId: node.parentId,
            extent: node.parentId ? 'parent' : undefined,
            draggable: true,
            selectable: !node.group,
            style: {
              width: node.width,
              height: node.height,
              ...(node.group
                ? {
                    background: group!.color + '06',
                    border: '1px solid ' + group!.color + '45',
                    borderRadius: 16,
                    zIndex: -1,
                  }
                : { zIndex: 2 }),
            },
            data: node.group
              ? areaTileData({ name: group!.name, color: group!.color, entityCount: group!.entities.length }, node.width, algorithm === 'network' ? (areaLinkCounts.get(node.group) ?? 0) : undefined)
              : {
                  name: entityById.get(node.id)?.name,
                  collapsedArea: entityById.get(node.id)?.definition?.collapsedArea,
                  internalCount: display.internal.get(entityById.get(node.id)?.definition?.collapsedArea)?.length ?? 0,
                  color: group?.color ?? FALLBACK_GROUP_COLOR,
                  ...entityCardData(entityById.get(node.id)!, node, props.kpiBadges),
                },
          };
        });
      });
      setBusy(false);
      setTimeout(fit, 150);
    }
    if (cache.has(key) && !version) {
      apply(cache.get(key)!);
    } else {
      let arranged: Promise<LayoutResult>;
      if (algorithm === 'network') {
        arranged = Promise.resolve(layoutNetwork(display.entities, display.edges, props.name, layoutGrouping));
      } else {
        elk = new ELK({
          algorithms: ['layered', 'box'],
          workerFactory: () => new Worker(elkWorkerUrl),
        });
        arranged = layoutFullGraph(display.entities, display.edges, { name: props.name, elk, grouping: layoutGrouping });
      }
      timeOperation('graph-layout', arranged)
        .then(apply)
        .catch(failure => {
          if (!cancelled) {
            setError(failure.message);
            setBusy(false);
          }
        })
        .finally(() => elk?.terminateWorker());
    }
    return () => {
      cancelled = true;
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
  const focus = hover || (selectedGroup && collapsed.has(selectedGroup) ? 'collapsed:' + selectedGroup : props.selected);
  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (focus) {
      ids.add(focus);
      for (const edge of display.edges)
        if (edge.source === focus || edge.target === focus) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
    }
    return ids;
  }, [display, focus]);
  const renderedNodes = useMemo(
    () =>
      nodes.map(node =>
        node.type === 'entity'
          ? {
              ...node,
              selected: node.id === props.selected,
              data: {
                ...node.data,
                kind: entityById.get(node.id)?.kind,
                kpis: props.kpiBadges?.get(String(node.data.name)),
                focused: connected.has(node.id),
                tooltip: node.id === hover || node.id === props.selected,
              },
              style: { ...node.style, opacity: focus && !connected.has(node.id) ? 0.32 : 1 },
            }
          : node,
      ),
    [nodes, connected, focus, props.selected, hover, entityById, props.kpiBadges],
  );
  const positions = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    return new Map(
      nodes
        .filter(n => n.type === 'entity')
        .map(node => {
          const parentNode = byId.get(node.parentId);
          return [
            node.id,
            {
              x: node.position.x + (parentNode?.position.x ?? 0),
              y: node.position.y + (parentNode?.position.y ?? 0),
              width: 184,
              height: 60,
            },
          ];
        }),
    );
  }, [nodes]);
  const dragging = nodes.some(n => n.dragging);
  // Links between areas are summarised on the tiles; one is drawn only for the entity in focus, the
  // chosen link, or a collapsed area card, so the canvas never turns into a tangle.
  const drawnConnections = useMemo(() => {
    if (algorithm !== 'network') return connections;
    const isCollapsedCard = (entityId: string) => Boolean(entityById.get(entityId)?.definition?.collapsedArea);
    return connections.filter(connection => {
      if (!crossesAreas(connection, areaOf)) return true;
      if (isCollapsedCard(connection.source) || isCollapsedCard(connection.target)) return true;
      if (connection.source === focus || connection.target === focus) return true;
      return connection.data.relationships.some(relationship => relationship.id === props.selectedEdge);
    });
  }, [connections, algorithm, areaOf, entityById, focus, props.selectedEdge]);
  const edges = useMemo(
    () =>
      drawnConnections.map(connection => {
        const fromPosition = positions.get(connection.source);
        const toPosition = positions.get(connection.target);
        let source = 'e';
        let target = 'w';
        if (fromPosition && toPosition) {
          const dx = toPosition.x - fromPosition.x;
          const dy = toPosition.y - fromPosition.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            source = dx >= 0 ? 'e' : 'w';
            target = dx >= 0 ? 'w' : 'e';
          } else {
            source = dy >= 0 ? 's' : 'n';
            target = dy >= 0 ? 'n' : 's';
          }
        }
        if (connection.source === connection.target) {
          source = 'e';
          target = 's';
        }
        if (algorithm === 'layered') {
          source = 'e';
          target = 'w';
        }
        const active = connection.data.relationships.some(r => r.id === props.selectedEdge);
        const adjacent = connection.source === focus || connection.target === focus;
        const visible = (position: any) =>
          position &&
          position.x * viewport.zoom + viewport.x > -220 * viewport.zoom &&
          position.x * viewport.zoom + viewport.x < size.width + 30 &&
          position.y * viewport.zoom + viewport.y > -90 * viewport.zoom &&
          position.y * viewport.zoom + viewport.y < size.height + 30;
        const routeDetailed = !dragging && connection.source !== connection.target && (active || adjacent || (viewport.zoom >= 0.35 && visible(fromPosition) && visible(toPosition)));
        let label: string | undefined;
        if (labels || active || hoverEdge === connection.id) {
          if (connection.data.relationships.length > 1) {
            label = `${connection.data.relationships.length} relationships`;
          } else {
            label = connection.label;
          }
        } else {
          label = undefined;
        }
        return {
          ...connection,
          data: {
            ...connection.data,
            algorithm,
            routeDetailed,
            layoutRoute: algorithm === 'layered' ? layoutRoutes[connection.id]?.flat() : undefined,
          },
          type: 'routed',
          sourceHandle: 'source-' + source,
          targetHandle: 'target-' + target,
          selected: active,
          label,
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
    [drawnConnections, positions, props.selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging],
  );
  useEffect(() => {
    if (!props.search || busy) return;
    const match = overview.entities.find(e => e.name.toLowerCase().includes(props.search.toLowerCase()) || e.id.toLowerCase().includes(props.search.toLowerCase()));
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
  const selectedConnection = collapsed.size ? connections.find(e => e.data.relationships.some(r => r.id === props.selectedEdge)) : undefined;
  const originalById = useMemo(() => new Map(props.edges.map(e => [e.id, e])), [props.edges]);
  const originalEntities = useMemo(() => new Map(props.entities.map(e => [e.id, e])), [props.entities]);
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
          {props.groupMenu}
          <ZoomButtons onZoomIn={() => void flow.current?.zoomIn({ duration: 150 })} onZoomOut={() => void flow.current?.zoomOut({ duration: 150 })} />
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
                <select aria-label="Zoom to group" title={overview.groupingLabel} defaultValue="" onChange={e => zoomToGroup(e.target.value)}>
                  <option value="">Whole model</option>
                  {overview.groups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            </OptionGroup>
            <OptionGroup title="Areas">
              <button onClick={() => setCollapsed(new Set(overview.groups.map(g => g.id)))} disabled={collapsed.size === overview.groups.length}>
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
                <ShowToggle on={!hideValues} onToggle={toggleValues} title={`${valueIds.size} value types and their relationships`}>
                  Value types
                </ShowToggle>
              )}
              {kpiIds.size > 0 && (
                <ShowToggle on={!hideKpis} onToggle={toggleKpis} title={`${kpiIds.size} metric nodes and their relationships`}>
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
            onNodeDoubleClick={(_, node) => {
              void flow.current?.fitView({
                nodes: [{ id: node.parentId ?? node.id }],
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
            {miniMap && <MiniMap pannable zoomable nodeColor={n => String(n.data.color ?? 'var(--color-neutral)')} />}
          </ReactFlow>
        </SmartEdgeProvider>
      )}
      {selectedConnection && selectedConnection.data.relationships.length > 1 && (
        <label className="graph-bundle-choice">
          {selectedConnection.data.relationships.length} relationships in this bundle
          <select aria-label="Graph bundle relationship" value={props.selectedEdge} onChange={e => props.onSelectEdge(e.target.value)}>
            {selectedConnection.data.relationships.map(relationship => {
              const original = originalById.get(relationship.id)!;
              return (
                <option key={relationship.id} value={relationship.id}>
                  {originalEntities.get(original.source)?.name} · {relationship.label} → {originalEntities.get(original.target)?.name}
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
      <div className="full-graph-status" data-entity-count={overview.entities.length} data-relationship-count={overview.links.length} data-routing={routeMetrics?.executedOn ?? 'pending'}>
        {hideValues && <span>{valueIds.size} value types hidden</span>}
        {hideKpis && <span>{kpiIds.size} metrics hidden</span>}
        {collapsed.size > 0 && <strong>{collapsed.size} area cards · Select an area to open it</strong>}
        <span title="Double-click a group to zoom in">Color = area · Line = relationship</span>
      </div>
    </div>
  );
}
/** Toggles the graph's full-screen view. */
export const FullscreenButton = ({ fullscreen }: { fullscreen: Fullscreen }) => (
  <button
    className="fullscreen-toggle"
    onClick={fullscreen.toggle}
    aria-pressed={fullscreen.active}
    aria-label={fullscreen.active ? 'Exit full screen' : 'Enter full screen'}
    title={fullscreen.active ? 'Exit full screen (Esc)' : 'Full screen (F)'}
  >
    {fullscreen.active ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    {fullscreen.active && 'Exit full screen'}
  </button>
);
