/** Shares asset icons and line-style labels between lineage and mapping canvases. */
import React from 'react';
import { Boxes, Columns3, Database, Gauge, Table2, Link2 } from 'lucide-react';
import { Badge, badge } from '../components/PropertyBadges';
import { LEGEND_LINES, type LegendLine } from './edge-styles';
import './legend.css';
// Asset icons and edge-style labels are shared so all canvases use the same legend.
/** Names an asset category shown in the shared legend. */
export type LegendKind = 'object' | 'dataset' | 'field' | 'metric' | 'concept' | 'external';
export const KIND_LABEL: Record<LegendKind, string> = {
  object: 'Table',
  dataset: 'Semantic dataset',
  field: 'Field',
  metric: 'Metric',
  concept: 'Concept',
  external: 'External reference',
};
/** Renders the shared icon for an asset kind. */
export const KindIcon = ({ kind, size = 12 }: { kind: LegendKind; size?: number }) => {
  if (kind === 'object') {
    return <Table2 size={size} />;
  }
  if (kind === 'dataset') {
    return <Database size={size} />;
  }
  if (kind === 'field') {
    return <Columns3 size={size} />;
  }
  if (kind === 'metric') {
    return <Gauge size={size} />;
  }
  if (kind === 'concept') {
    return <Boxes size={size} />;
  }
  return <Link2 size={size} />;
};
/** Explains the asset icons and edge styles visible on a canvas. */
export function LineageLegend({
  kinds = ['object', 'dataset', 'field', 'metric'],
  lines = ['foreign-key', 'feeds'],
  keys = false,
  bundles = false,
  className = '',
}: {
  kinds?: LegendKind[];
  lines?: LegendLine[];
  /** Adds the primary key and foreign key badges, as they appear on card rows. */
  keys?: boolean;
  /** Explains the number on a line that stands for several lines. */
  bundles?: boolean;
  className?: string;
}) {
  return (
    <ul className={`lineage-legend ${className}`.trim()} aria-label="Legend">
      {kinds.map(kind => (
        <li key={kind} className={`k-${kind}`}>
          <KindIcon kind={kind} />
          {KIND_LABEL[kind]}
        </li>
      ))}
      {keys && (
        <>
          <li className="key">
            <Badge kind="pk" title={badge('pk').title} />
            Primary key
          </li>
          <li className="key">
            <Badge kind="fk" title="Foreign key to another table" />
            Points to another table
          </li>
        </>
      )}
      {bundles && (
        <li className="key">
          <span className="legend-count">5</span>
          Several links in one line
        </li>
      )}
      {lines.map(legendLine => {
        const lineStyle = LEGEND_LINES[legendLine];
        return (
          <li key={legendLine} className={`line l-${legendLine}`}>
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={lineStyle.stroke} strokeWidth="2" strokeDasharray={lineStyle.dash} />
            </svg>
            {lineStyle.label}
          </li>
        );
      })}
    </ul>
  );
}
