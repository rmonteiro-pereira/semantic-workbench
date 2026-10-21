// One line style per lineage and mapping edge kind (FR-025, FR-026), shared by the lineage canvas,
// the mapping canvas, the asset page and the legend. Foreign keys and `of` metric bindings are
// dashed; every "feeds" kind is solid. Path emphasis adds weight and accent colour in CSS without
// changing the dash pattern.
export type LineageEdgeKind = 'foreign-key' | 'reads' | 'aggregates' | 'uses' | 'transform';
export type MappingEdgeKind = 'object' | 'referent' | 'link' | 'measures' | 'of';
export type EdgeKind = LineageEdgeKind | MappingEdgeKind;
export type EdgeStyle = { label: string; legend: LegendLine; stroke: string; dash?: string };
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
export const edgeStyle = (kind: EdgeKind) => EDGE_STYLES[kind];
// React Flow / SVG style for an edge of this kind.
export const edgeSvgStyle = (kind: EdgeKind, emphasis = false) => {
  const s = EDGE_STYLES[kind];
  return {
    stroke: s.stroke,
    strokeWidth: emphasis ? 2.6 : 1.4,
    ...(s.dash ? { strokeDasharray: s.dash } : {}),
  };
};
