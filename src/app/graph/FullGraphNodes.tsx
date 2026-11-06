/** The React Flow node and edge renderers of the full model graph: entity cards, area titles and relationship lines. */
import { memo } from 'react';
import { BaseEdge, BezierEdge, Handle, NodeToolbar, Position, type EdgeProps, type NodeProps } from '@xyflow/react';
import { Gauge } from 'lucide-react';
import { pointAtHalf, roundedPath, type Point } from '../odcs/edge-route';
import { pathMatchesEndpoints } from './edge-path';
import { edgeAppearance } from './edge-styles';
import { RoutedEdge } from './RoutedEdge';
import { shownName } from './text-fit';

const sides = [
  ['n', Position.Top],
  ['e', Position.Right],
  ['s', Position.Bottom],
  ['w', Position.Left],
] as const;
export const EntityNode = memo(({ data }: NodeProps) => (
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
export const AreaNode = memo(({ data }: NodeProps) => (
  <div className="full-area-title" title={String(data.name)} style={{ '--area-title-cap': data.titleCap } as React.CSSProperties}>
    <span style={{ background: String(data.color) }} />
    <strong>{String(data.name)}</strong>
    <small>{String(data.count)} entities</small>
    {Boolean(data.linksText) && <em className="area-links">{String(data.linksText)}</em>}
  </div>
));
export const GraphEdge = memo((props: EdgeProps) => {
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
export const nodeTypes = { entity: EntityNode, businessArea: AreaNode };
export const edgeTypes = { routed: GraphEdge };
