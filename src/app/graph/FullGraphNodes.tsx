/** The React Flow node and edge renderers of the full model graph: entity cards, area titles and relationship lines. */
import { memo, useLayoutEffect, useRef } from 'react';
import { BaseEdge, BezierEdge, Handle, NodeToolbar, Position, type EdgeProps, type NodeProps } from '@xyflow/react';
import { Gauge } from 'lucide-react';
import { pointAtHalf, roundedPath, type Point } from '../odcs/edge-route';
import type { Relationship } from '../../shared/core/model';
import { pathMatchesEndpoints } from './edge-path';
import { edgeAppearance } from './edge-styles';
import { RoutedEdge } from './RoutedEdge';
import { RelationshipLabel } from './RelationshipEdge';
import { entityCountLabel } from './overview-capacity';
import { EntityName, humanizeIdentifier } from './EntityName';
import { shownName } from './text-fit';
import { TrafficMark } from '../usage/TrafficMark';
import { useBundleTraffic } from '../usage/use-usage';
import { trafficStrokeWidth } from '../usage/usage-intensity';

const sides = [
  ['n', Position.Top],
  ['e', Position.Right],
  ['s', Position.Bottom],
  ['w', Position.Left],
] as const;
/** Renders an entity or counted-area card in the whole-model view. */
export const EntityNode = memo(({ data }: NodeProps) => (
  <div
    data-address={data.address as string | undefined}
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
    <TrafficMark address={data.address as string | undefined} />
    {data.kind === 'Metric' && (
      <small className="kpi-kind">
        <Gauge size={11} />
        Metric
      </small>
    )}
    <EntityName name={shownName(String(data.name))} style={{ '--entity-name-cap': data.nameCap } as React.CSSProperties} />
    {data.changeMark as React.ReactNode}
    {!!data.imported && typeof data.imported === 'object' && 'project' in data.imported && 'version' in data.imported && (
      <small className="mesh-imported-origin">
        Imported from {String(data.imported.project)} · {String(data.imported.version).slice(0, 12)}
      </small>
    )}
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
/** Renders the title and count of a whole-model area. */
export const AreaNode = memo(({ data }: NodeProps) => (
  <div className="full-area-title" title={String(data.name)} style={{ '--area-title-cap': data.titleCap } as React.CSSProperties}>
    <span style={{ background: String(data.color) }} />
    <EntityName name={humanizeIdentifier(String(data.name))} />
    {!data.collapsed && <small>{entityCountLabel(Number(data.count))}</small>}
    {Boolean(data.linksText) && <em className="area-links">{String(data.linksText)}</em>}
  </div>
));
/** Keeps a relationship attached while layout routes are pending or stale. */
export const GraphEdge = memo((plainProps: EdgeProps) => {
  // With Traffic off the line is drawn from the props it always had.
  const traffic = useBundleTraffic(plainProps.data?.relationships as Relationship[] | undefined);
  const props = traffic?.level ? { ...plainProps, style: { ...plainProps.style, strokeWidth: trafficStrokeWidth(Number(plainProps.style?.strokeWidth ?? 1.2), traffic.level) } } : plainProps;
  const pathGroup = useRef<SVGGElement>(null);
  const reportRoute = props.data?.reportLabelRoute as ((id: string, path: SVGPathElement) => void) | undefined;
  useLayoutEffect(() => {
    if (!reportRoute || !pathGroup.current) return;
    const group = pathGroup.current;
    const report = () => {
      const path = group.querySelector<SVGPathElement>('.react-flow__edge-path');
      if (path) reportRoute(props.id, path);
    };
    report();
    // Smart routes arrive asynchronously and replace the fallback path in place.
    const observer = new MutationObserver(report);
    observer.observe(group, { subtree: true, attributes: true, attributeFilter: ['d'], childList: true });
    return () => observer.disconnect();
  }, [props.id, reportRoute]);
  const points = props.data?.labelPoints as [number, number][] | undefined;
  const placed = reportRoute && points && props.data?.labelAt && props.label;
  return (
    <>
      <g ref={pathGroup}>
        <GraphPath {...props} label={reportRoute ? undefined : props.label} />
      </g>
      {placed && <RelationshipLabel edge={props} text={props.label} points={points} fallback={points[0]} />}
    </>
  );
});

function GraphPath(props: EdgeProps) {
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
}
export const nodeTypes = { entity: EntityNode, businessArea: AreaNode };
export const edgeTypes = { routed: GraphEdge };
