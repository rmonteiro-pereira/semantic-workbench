/** Draws one lineage line between two card rows, with its label pill and path emphasis. */
import React, { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { edgeSvgStyle, type EdgeKind } from '../graph/edge-styles';
import { labelSize, type LineLabel } from './edge-labels';
import { pointAtHalf, roundedPath, type Point } from './edge-route';

export const LineageEdge = memo((edgeProps: EdgeProps) => {
  const data = edgeProps.data as {
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
  const shift = (data.lane ?? 0) * 7;
  const curve = getBezierPath({
    ...edgeProps,
    sourceY: edgeProps.sourceY + shift,
    targetY: edgeProps.targetY + shift,
  });
  // A line the layout routed around cards follows that route; any other line is a single curve.
  const routed = data.route && data.route.length > 0;
  const points = routed ? [{ x: edgeProps.sourceX, y: edgeProps.sourceY + shift }, ...data.route!, { x: edgeProps.targetX, y: edgeProps.targetY + shift }] : [];
  const path = routed ? roundedPath(points) : curve[0];
  const middle = routed ? pointAtHalf(points) : { x: curve[1], y: curve[2] };
  const lx = middle.x;
  const ly = middle.y;
  let labelElement: React.ReactNode;
  if (data.lineLabel) {
    labelElement = <LineLabelPill label={data.lineLabel} bundle={(data.count ?? 1) > 1} at={{ x: lx, y: ly }} />;
  } else if (data.label) {
    labelElement = (
      <text x={lx} y={ly - 4} className="lineage-bundle" textAnchor="middle">
        {data.label}
      </text>
    );
  } else {
    labelElement = null;
  }
  return (
    <g
      className={`lineage-edge${data.onPath ? ' on-path' : ''}${data.dim ? ' dim' : ''}`}
      data-edge-kind={data.kind}
      data-on-path={data.onPath ? 'true' : 'false'}
      data-from={data.from}
      data-to={data.to}
      data-count={data.count ?? 1}
    >
      <BaseEdge
        id={edgeProps.id}
        path={path}
        style={{
          ...edgeSvgStyle(data.kind, data.onPath),
          opacity: data.dim ? 0.14 : 1,
          ...(data.onPath ? { stroke: undefined } : {}),
        }}
        interactionWidth={12}
      />
      {labelElement}
    </g>
  );
});
export const edgeTypes = { lineage: LineageEdge };
// A label placed on its line is always drawn; one without room shows when the line is hovered.
function LineLabelPill({ label, bundle, at }: { label: LineLabel; bundle: boolean; at: { x: number; y: number } }) {
  const size = labelSize(label.lines);
  const place = label.place ?? { x: at.x - size.w / 2, y: at.y - size.h / 2, ...size };
  const centre = place.x + place.w / 2;
  const meaning = bundle ? `${label.lines[0]} lines` : label.lines.join(' ');
  return (
    <g className={`lineage-edge-label ${label.place ? 'shown' : 'hover'}`} data-shown={label.place ? 'true' : 'false'}>
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
