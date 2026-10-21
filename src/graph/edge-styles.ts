/** Shares edge colors and dash patterns across lineage, mappings, asset pages and legends. */
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
export type LegendLine =
  | 'foreign-key'
  | 'feeds'
  | 'object'
  | 'referent'
  | 'link'
  | 'measures'
  | 'of';
export const FOREIGN_KEY_STROKE = '#b07a2a';
export const FEEDS_STROKE = '#7d9c91';
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
  object: { label: 'Object mapping', legend: 'object', stroke: '#2a6c95' },
  referent: { label: 'Referent mapping', legend: 'referent', stroke: '#1e6a4f' },
  link: { label: 'Link mapping', legend: 'link', stroke: '#b07a2a', dash: '2 3' },
  measures: { label: 'Measures', legend: 'measures', stroke: '#8a5ad1' },
  of: { label: 'Of', legend: 'of', stroke: '#8a5ad1', dash: '5 4' },
};
export const LEGEND_LINES: Record<LegendLine, { label: string; stroke: string; dash?: string }> = {
  'foreign-key': { label: 'Foreign key', stroke: FOREIGN_KEY_STROKE, dash: '5 4' },
  feeds: { label: 'Feeds', stroke: FEEDS_STROKE },
  object: { label: 'Object mapping', stroke: '#2a6c95' },
  referent: { label: 'Referent mapping', stroke: '#1e6a4f' },
  link: { label: 'Link mapping', stroke: '#b07a2a', dash: '2 3' },
  measures: { label: 'Measures', stroke: '#8a5ad1' },
  of: { label: 'Of (metric binding)', stroke: '#8a5ad1', dash: '5 4' },
};
/** Returns the shared visual style for an edge kind. */
export const edgeStyle = (kind: EdgeKind) => EDGE_STYLES[kind];
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
