import { entityCardData } from './full-node-data';
import type { ChangeState } from '../../shared/item-diff/item-change';
import { ChangeMark } from '../item-diff/ChangeMark';
/** Displays the complete model graph with grouping, filtering and a detail inspector. */
import { isStructuredEntity } from '../../shared/core/model';
import { formatAddress } from '../../shared/core/item-address';
import { flushSync } from 'react-dom';
import { ScrollStrip } from '../components/ScrollStrip';
import type { GroupingOptions } from './overview';
import { usePhoneScreen } from '../workspace/hooks/useNarrowScreen';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, MiniMap, type ReactFlowInstance } from '@xyflow/react';
import { SmartEdgeProvider, type SmartEdgeMetrics } from '@tisoap/react-flow-smart-edge';
import { Crosshair, Maximize, RefreshCw } from 'lucide-react';
import { useViewRestore, type Fullscreen } from './fullscreen';
import { ImportedGraphKey, ModelGraphOptions, OptionGroup, Segmented } from './GraphOptions';
import { ZoomButtons } from './ZoomButtons';
import { MODEL_CARD_WIDTH, minimumGraphZoom, textSizesAt } from './overview-capacity';
import { humanizeIdentifier } from './EntityName';
import { CompactControls } from './CompactControls';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import { collapseAreas } from './collapse';
import { VALUE_KINDS, kpisKey, readFlag, readHideValues, writeFlag, writeHideValues } from './hidden-kinds';
import type { Entity, Relationship } from '../../shared/core/model';
import { edgeTypes, nodeTypes } from './FullGraphNodes';
import { FullscreenButton } from './FullscreenButton';
import type { Box } from './routes';
import { useFullGraphEdges } from './useFullGraphEdges';
import { fitFullGraph, fitGraphArea, focusFullGraph } from './full-graph-viewport';
import { useFullGraphLayout } from './useFullGraphLayout';
import { useFullGraphOpening } from './useFullGraphOpening';
import { useTrafficShowItem } from '../usage/traffic-show-item';
import { useUnpublishedWorkShowItem } from '../item-diff/unpublished-work-show-item';
import { ShowMenu } from './ShowMenu';
import { TrafficLegend } from '../usage/TrafficLegend';

function entityAddress(entity: import('../../shared/core/model').Entity | undefined) {
  return entity && isStructuredEntity(entity) ? formatAddress(entity.address) : undefined;
}

const routingOptions = { nodePadding: 10, gridRatio: 10 };
// How long the pane must keep its size before the first layout is planned for it.
const PANE_SETTLE_MS = 250;
type Props = {
  toolbarExtra?: React.ReactNode;
  /** The Group menu; on a phone it folds into the Controls panel with the other options. */
  groupMenu?: React.ReactNode;
  grouping?: GroupingOptions;
  name: string;
  entities: Entity[];
  edges: Relationship[];
  /** Saved item marks affect rendering without invalidating a layout of the same items. */
  annotations?: { entities: Entity[]; edges: Relationship[] };
  selected: string;
  selectedEdge: string;
  search: string;
  onSelectEntity: (id: string) => void;
  onSelectEdge: (id: string) => void;
  kpiBadges?: Map<string, string[]>;
  fullscreen?: Fullscreen;
};
// The mini-map is off until a person asks for it; the choice is remembered in this browser.
const MINI_MAP_KEY = 'workbench:graph-mini-map';
const MINI_MAP_RESERVED_WIDTH = 216;
/** Displays the model graph with grouping, filtering and entity details. */
export function FullGraph(props: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const pendingViewport = useRef(viewport);
  const viewportFrame = useRef<number | undefined>(undefined);
  const followViewport = useCallback((_: unknown, next: typeof viewport) => {
    pendingViewport.current = next;
    if (viewportFrame.current !== undefined) return;
    viewportFrame.current = requestAnimationFrame(() => {
      viewportFrame.current = undefined;
      flushSync(() => {
        setViewport(pendingViewport.current);
        setZoomStep(Math.floor(pendingViewport.current.zoom * 20) / 20);
      });
    });
  }, []);
  useEffect(
    () => () => {
      if (viewportFrame.current !== undefined) cancelAnimationFrame(viewportFrame.current);
    },
    [],
  );
  // The zoom rounded down in steps of 0.05. Text sizes follow it while the canvas moves, never
  // read smaller than planned, and do not redraw every edge on each frame.
  const [fittedZoom, setFittedZoom] = useState(0.05);
  const [zoomStep, setZoomStep] = useState(1);
  const [zoomedGroupId, setZoomedGroupId] = useState('');

  const [size, setSize] = useState({ width: 1200, height: 650 });
  const [labelViewportSize, setLabelViewportSize] = useState({ width: 0, height: 0 });
  const [miniMapBounds, setMiniMapBounds] = useState<Box | undefined>();
  // The first layout waits for a real measurement, so it is planned for the pane the person sees.
  const [paneMeasured, setPaneMeasured] = useState(false);
  const flow = useRef<ReactFlowInstance<any, any> | null>(null);
  const [algorithm, setAlgorithm] = useRecordedState<'network' | 'layered'>('graph.algorithm', 'network');
  const [hover, setHover] = useState('');
  const [hoverEdge, setHoverEdge] = useState('');
  const [labels, setLabels] = useRecordedState('graph.labels', false);
  const [version, setVersion] = useState(0);
  const [miniMap, setMiniMap] = useRecordedState('graph.miniMap', () => readFlag(MINI_MAP_KEY));
  const phone = usePhoneScreen();
  const miniMapReservedWidth = miniMap && !phone ? MINI_MAP_RESERVED_WIDTH : 0;
  useEffect(() => writeFlag(MINI_MAP_KEY, miniMap), [miniMap]);
  const toggleMiniMap = () => setMiniMap(shown => !shown);
  const trafficItem = useTrafficShowItem();
  const unpublishedWorkItem = useUnpublishedWorkShowItem();
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
  // Explicit area choices survive automatic first-view decisions.
  const [collapseChoice, setCollapseChoice] = useRecordedState<Set<string> | null>('graph.collapsedAreas', null);
  const opening = useFullGraphOpening({ overview, algorithm, collapseChoice, flow, container, reservedWidth: miniMapReservedWidth, onFitZoom: setFittedZoom, onArea: setZoomedGroupId });
  const autoCollapsed = useMemo(() => (opening.automaticCollapse ? new Set(overview.groups.map(group => group.id)) : new Set<string>()), [overview, opening.automaticCollapse]);
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
    setZoomedGroupId(groupId);
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
  const entityMarks = useMemo(() => {
    const changes = new Map<string, ChangeState>();
    for (const entity of props.annotations?.entities ?? []) {
      if ('change' in entity) changes.set(entity.id, entity.change as ChangeState);
    }
    return changes;
  }, [props.annotations]);
  const connections = useMemo(() => {
    if (!props.annotations) return groupRelationships(display.edges);
    const marks = new Map<string, ChangeState>();
    for (const edge of props.annotations.edges) {
      if ('change' in edge.data) marks.set(edge.id, edge.data.change as ChangeState);
    }
    return groupRelationships(
      display.edges.map(edge => {
        const change = marks.get(edge.id);
        return change ? { ...edge, data: { ...edge.data, change } } : edge;
      }),
    );
  }, [display, props.annotations]);
  const entityById = useMemo(() => new Map(display.entities.map(e => [e.id, e])), [display]);
  const groupById = useMemo(() => new Map(overview.groups.map(g => [g.id, g])), [overview]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let resizeFrame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const pane = { width: entry.contentRect.width, height: entry.contentRect.height };
      cancelAnimationFrame(resizeFrame);
      // Pane state changes can reflow the toolbar and invalidate the current resize delivery.
      resizeFrame = requestAnimationFrame(() => {
        // Commit before the next layout pass instead of leaving a batched update for an observer.
        flushSync(() => {
          setSize(previous => (previous.width === pane.width && previous.height === pane.height ? previous : pane));
        });
        // The pane settles while the workspace opens, so the first layout waits for a quiet moment.
        clearTimeout(settleTimer);
        if (pane.width > 0 && pane.height > 0) settleTimer = setTimeout(() => setPaneMeasured(true), PANE_SETTLE_MS);
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      clearTimeout(settleTimer);
    };
  }, []);
  // An animated move reads the canvas size one frame later. If the workspace is hidden by then
  // (Admin opening), the size is zero and the viewport becomes NaN. So resize refits move at once,
  // and a NaN viewport is replaced without animating from it.
  const fitWithin = useCallback(
    (duration: number) => {
      const zoom = fitFullGraph(flow.current, container.current?.querySelector('.react-flow'), duration, miniMapReservedWidth);
      if (zoom !== undefined) setFittedZoom(zoom);
    },
    [miniMapReservedWidth],
  );
  const fit = useCallback(() => {
    setZoomedGroupId('');
    fitWithin(250);
  }, [fitWithin]);
  const focusSelection = useCallback(() => {
    const canvas = container.current?.querySelector('.react-flow');
    const instance = flow.current;
    if (!canvas || !props.selected || !instance?.getNode(props.selected)) return false;
    const neighbors = new Set([props.selected]);
    for (const edge of display.edges) {
      if (edge.source === props.selected || edge.target === props.selected) {
        neighbors.add(edge.source);
        neighbors.add(edge.target);
      }
    }
    focusFullGraph(instance, canvas, props.selected, neighbors);
    return true;
  }, [props.selected, display]);
  const { nodes, onNodesChange, layoutRoutes, busy, error, layoutMs, layoutPasses } = useFullGraphLayout({
    name: props.name,
    algorithm,
    version,
    paneMeasured,
    networkPaneSize: () => {
      const pane = container.current?.querySelector('.react-flow')?.getBoundingClientRect();
      return pane ? { width: Math.max(1, pane.width - miniMapReservedWidth), height: pane.height } : undefined;
    },
    overview,
    display,
    layoutGrouping,
    entityById,
    groupById,
    fit: () => opening.openLayout(focusSelection),
    setRouteMetrics,
  });
  // Full screen keeps the view it started from and puts it back on exit.
  const held = useViewRestore(
    !!props.fullscreen?.active,
    () => flow.current?.getViewport(),
    v => {
      void flow.current?.setViewport(v);
      setViewport(v);
    },
  );
  useEffect(() => {
    if (!busy && !opening.checking && !held()) focusSelection();
  }, [busy, opening.checking, focusSelection, size.width]);
  // Refit after the remaining canvas changes size (panels, monitor, wrapped controls).
  useEffect(() => {
    const el = container.current?.querySelector('.react-flow');
    if (busy || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      const frame = el.getBoundingClientRect();
      setLabelViewportSize(previous => (previous.width === frame.width && previous.height === frame.height ? previous : { width: frame.width, height: frame.height }));
      const map = miniMap && !phone ? el.querySelector('.react-flow__minimap')?.getBoundingClientRect() : undefined;
      setMiniMapBounds(map && map.width > 0 ? { x: map.x - frame.x, y: map.y - frame.y, width: map.width, height: map.height } : undefined);
    };
    const observer = new ResizeObserver(() => {
      measure();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!held()) {
          if (opening.checking || (opening.automaticCollapse && collapseChoice === null)) void opening.openLayout();
          else if (!focusSelection()) {
            if (algorithm === 'layered' && zoomedGroupId) fitGraphArea(flow.current!, el, zoomedGroupId, miniMapReservedWidth);
            else fitWithin(0);
          }
        }
      }, 100);
    });
    observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [busy, opening.checking, opening.automaticCollapse, collapseChoice, fitWithin, focusSelection, algorithm, zoomedGroupId, miniMapReservedWidth, miniMap, phone]);
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
      nodes.map(node => {
        if (node.type !== 'entity') return node;
        const entity = entityById.get(node.id);
        const change = entityMarks.get(node.id);
        const geometry = change && entity ? entityCardData({ ...entity, change }, { width: node.style.width, height: node.style.height }) : undefined;
        return {
          ...node,
          selected: node.id === props.selected,
          data: {
            ...node.data,
            ...geometry,
            ...(change ? { changeMark: <ChangeMark change={change} /> } : {}),
            kind: entity?.kind,
            address: entityAddress(entity),
            kpis: props.kpiBadges?.get(String(node.data.name)),
            focused: connected.has(node.id),
            tooltip: node.id === hover || node.id === props.selected,
          },
          style: { ...node.style, opacity: focus && !connected.has(node.id) ? 0.35 : 1 },
        };
      }),
    [nodes, connected, focus, props.selected, hover, entityById, entityMarks, props.kpiBadges],
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
              width: Number(node.style?.width ?? MODEL_CARD_WIDTH),
              height: Number(node.style?.height ?? 60),
            },
          ];
        }),
    );
  }, [nodes]);
  const labelObstacles = useCallback(() => {
    const firstChildY = new Map<string, number>();
    const areas = [];
    for (const node of nodes) {
      if (node.parentId) firstChildY.set(node.parentId, Math.min(firstChildY.get(node.parentId) ?? Infinity, node.position.y));
      if (node.type === 'businessArea') areas.push(node);
    }
    return [
      ...positions.values(),
      ...areas.map(node => ({
        x: node.position.x,
        y: node.position.y,
        width: Number(node.style.width),
        // The header ends where the first child card begins.
        height: Math.min(Number(node.style.height), firstChildY.get(node.id) ?? Infinity),
      })),
    ];
  }, [nodes, positions]);
  const dragging = nodes.some(n => n.dragging);
  const edges = useFullGraphEdges({
    connections,
    positions,
    labelObstacles,
    labelViewportSize,
    miniMapBounds,
    selectedEdge: props.selectedEdge,
    focus,
    labels,
    hoverEdge,
    algorithm,
    layoutRoutes,
    viewport,
    size,
    dragging,
  });
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
  const compensateNetwork = collapsed.size === overview.groups.length || nodes.some(node => node.data.compensateName);
  const sizes = textSizesAt(zoomStep, algorithm, compensateNetwork);
  const textStyle = {
    '--entity-name-size': `${sizes.entityName}px`,
    '--entity-name-lines': sizes.entityLines,
    '--entity-card-padding-block': `${sizes.entityPadding}px`,
    '--area-title-size': `${sizes.areaTitle}px`,
    '--area-links-size': `${sizes.areaLinks}px`,
    '--entity-detail-display': sizes.showDetail ? 'block' : 'none',
    '--entity-badge-display': sizes.showDetail ? 'inline-flex' : 'none',
  } as React.CSSProperties;
  const zoomedGroupName = overview.groups.find(group => group.id === zoomedGroupId)?.name;
  const metrics = useCallback((m: SmartEdgeMetrics) => setRouteMetrics(m), []);
  return (
    <div
      className="full-graph"
      ref={container}
      style={textStyle}
      data-layout={algorithm}
      data-compensated-network={algorithm === 'network' && compensateNetwork ? 'true' : undefined}
      data-opening-name-px={opening.minimumName}
      data-opening-ms={opening.decisionMs}
      data-layout-ms={layoutMs}
      data-layout-passes={layoutPasses}
    >
      <ScrollStrip className="full-graph-tools">
        {props.toolbarExtra}
        <button onClick={fit} disabled={busy || opening.checking}>
          <Maximize size={13} />
          Fit model
        </button>
        <CompactControls folded={size.width < 1400}>
          <fieldset className="graph-layout-controls" disabled={busy || opening.checking}>
            {props.groupMenu}
            <ZoomButtons onZoomIn={() => void flow.current?.zoomIn({ duration: 150 })} onZoomOut={() => void flow.current?.zoomOut({ duration: 150 })} />
            <ModelGraphOptions>
              {props.entities.some(entity => !!entity.imported) && <ImportedGraphKey />}
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
                <button onClick={relayout} disabled={busy || opening.checking} title="Re-layout" aria-label="Re-layout">
                  <RefreshCw size={13} />
                </button>
                <label className="zoom-to-group">
                  <Crosshair size={13} aria-hidden="true" />
                  <select aria-label="Zoom to group" title={humanizeIdentifier(zoomedGroupName ?? overview.groupingLabel)} value={zoomedGroupId} onChange={e => zoomToGroup(e.target.value)}>
                    <option value="">Whole model</option>
                    {overview.groups.map(group => (
                      <option key={group.id} value={group.id}>
                        {humanizeIdentifier(group.name)}
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
                <ShowMenu
                  items={[
                    { name: 'Labels', summary: 'Relationship names on the lines', on: labels, onToggle: () => setLabels(shown => !shown) },
                    valueIds.size > 0 ? { name: 'Value types', summary: `${valueIds.size} value types and their relationships`, on: !hideValues, onToggle: toggleValues } : null,
                    kpiIds.size > 0 ? { name: 'Metrics', summary: `${kpiIds.size} metric nodes and their relationships`, on: !hideKpis, onToggle: toggleKpis } : null,
                    { name: 'Mini-map', summary: 'A small map of the whole model in the corner', on: miniMap, onToggle: toggleMiniMap },
                    unpublishedWorkItem,
                    trafficItem,
                  ]}
                />
              </OptionGroup>
            </ModelGraphOptions>
          </fieldset>
        </CompactControls>
        {props.fullscreen && <FullscreenButton fullscreen={props.fullscreen} />}
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
            onMove={followViewport}
            onMoveEnd={followViewport}
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
            minZoom={minimumGraphZoom(fittedZoom)}
            maxZoom={2}
            onlyRenderVisibleElements
          >
            <Background gap={24} color="var(--color-border)" />
            {miniMap && <MiniMap pannable zoomable maskStrokeColor="var(--color-text-secondary)" maskStrokeWidth={1.5} nodeColor={n => String(n.data.color ?? 'var(--color-neutral)')} />}
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
      {!error && (busy || opening.checking) && (
        <div className="full-graph-loading" role="status">
          Arranging {display.entities.length} graph nodes…
        </div>
      )}
      <TrafficLegend />
      <div className="full-graph-status" data-entity-count={overview.entities.length} data-relationship-count={overview.links.length} data-routing={routeMetrics?.executedOn ?? 'pending'}>
        {hideValues && <span>{valueIds.size} value types hidden</span>}
        {hideKpis && <span>{kpiIds.size} metrics hidden</span>}
        {collapsed.size > 0 && <strong>{collapsed.size} area cards · Select an area to open it</strong>}
        <span title="Double-click a group to zoom in">Color = area · Line = relationship</span>
      </div>
    </div>
  );
}
