/** Shares edge colors and dash patterns across lineage, mappings, asset pages and legends. */
import type { EdgeProps } from '@xyflow/react';
// Foreign keys and metric concept bindings use dashed lines; data-flow edges are solid. Path
// emphasis changes weight and color without changing the dash pattern.
/** Names a dependency or foreign-key relationship in column lineage. */
export type LineageEdgeKind = 'foreign-key' | 'reads' | 'aggregates' | 'uses' | 'transform';
/** Names a resolved concept-mapping binding kind. */
export type MappingEdgeKind = 'object' | 'referent' | 'link' | 'measures' | 'of';
/** Names any supported lineage or mapping edge kind. */
export type EdgeKind = LineageEdgeKind | MappingEdgeKind;
/** Defines an edge's label, legend category, color and optional dash pattern. */
export type EdgeStyle = { label: string; legend: LegendLine; stroke: string; dash?: string };
/** Groups edge kinds under the line styles displayed in the legend. */
export type LegendLine = 'foreign-key' | 'feeds' | 'object' | 'referent' | 'link' | 'measures' | 'of';
export const FOREIGN_KEY_STROKE = 'var(--color-edge-foreign-key)';
export const FEEDS_STROKE = 'var(--color-edge-feeds)';
export const EDGE_STYLES: Record<EdgeKind, EdgeStyle> = {
  'foreign-key': {
    label: 'Foreign key',
    legend: 'foreign-key',
    stroke: FOREIGN_KEY_STROKE,
    dash: '5 4',
  },
  reads: { label: 'Reads', legend: 'feeds', stroke: FEEDS_STROKE },
  aggregates: { label: 'Aggregates', legend: 'feeds', stroke: FEEDS_STROKE },
  uses: { label: 'Uses', legend: 'feeds', stroke: FEEDS_STROKE },
  transform: { label: 'Declared transform', legend: 'feeds', stroke: FEEDS_STROKE },
  object: { label: 'Object mapping', legend: 'object', stroke: 'var(--color-edge-object)' },
  referent: { label: 'Referent mapping', legend: 'referent', stroke: 'var(--color-edge-referent)' },
  link: { label: 'Link mapping', legend: 'link', stroke: 'var(--color-edge-link)', dash: '2 3' },
  measures: { label: 'Measures', legend: 'measures', stroke: 'var(--color-edge-measures)' },
  of: { label: 'Of', legend: 'of', stroke: 'var(--color-edge-of)', dash: '5 4' },
};
export const LEGEND_LINES: Record<LegendLine, { label: string; stroke: string; dash?: string }> = {
  'foreign-key': { label: 'Foreign key', stroke: FOREIGN_KEY_STROKE, dash: '5 4' },
  feeds: { label: 'Feeds', stroke: FEEDS_STROKE },
  object: { label: 'Object mapping', stroke: 'var(--color-edge-object)' },
  referent: { label: 'Referent mapping', stroke: 'var(--color-edge-referent)' },
  link: { label: 'Link mapping', stroke: 'var(--color-edge-link)', dash: '2 3' },
  measures: { label: 'Measures', stroke: 'var(--color-edge-measures)' },
  of: { label: 'Of (metric binding)', stroke: 'var(--color-edge-of)', dash: '5 4' },
};
/** Returns the shared visual style for an edge kind. */
export const edgeStyle = (kind: EdgeKind) => EDGE_STYLES[kind];

/** Selects SVG edge appearance without leaking graph metadata onto DOM elements. */
export function edgeAppearance(props: EdgeProps) {
  return {
    id: props.id,
    label: props.label,
    markerEnd: props.markerEnd,
    markerStart: props.markerStart,
    style: props.style,
    labelStyle: props.labelStyle,
    labelShowBg: props.labelShowBg,
    labelBgStyle: props.labelBgStyle,
    labelBgPadding: props.labelBgPadding,
    labelBgBorderRadius: props.labelBgBorderRadius,
  };
}
// React Flow / SVG style for an edge of this kind.
/** Returns SVG stroke properties, preserving dash patterns when emphasized. */
export const edgeSvgStyle = (kind: EdgeKind, emphasis = false) => {
  const s = EDGE_STYLES[kind];
  return {
    stroke: s.stroke,
    strokeWidth: emphasis ? 2.6 : 1.4,
    ...(s.dash ? { strokeDasharray: s.dash } : {}),
  };
};
