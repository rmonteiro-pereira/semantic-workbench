import React from 'react';
import { Boxes, Columns3, Database, Gauge, Table2, Link2 } from 'lucide-react';
import { LEGEND_LINES, type LegendLine } from './edge-styles';
import './legend.css';
// The legend of the v0.2.0 dataset Lineage tab as one shared component (FR-025): kind icons and the
// line styles of edge-styles.ts.
export type LegendKind = 'object' | 'dataset' | 'field' | 'metric' | 'concept' | 'external';
export const KIND_LABEL: Record<LegendKind, string> = {
  object: 'Contract object',
  dataset: 'Semantic dataset',
  field: 'Field',
  metric: 'Metric',
  concept: 'Concept',
  external: 'External reference',
};
export const KindIcon = ({ kind, size = 12 }: { kind: LegendKind; size?: number }) =>
  kind === 'object' ? (
    <Table2 size={size} />
  ) : kind === 'dataset' ? (
    <Database size={size} />
  ) : kind === 'field' ? (
    <Columns3 size={size} />
  ) : kind === 'metric' ? (
    <Gauge size={size} />
  ) : kind === 'concept' ? (
    <Boxes size={size} />
  ) : (
    <Link2 size={size} />
  );
export function LineageLegend({
  kinds = ['object', 'dataset', 'field', 'metric'],
  lines = ['foreign-key', 'feeds'],
  className = '',
}: {
  kinds?: LegendKind[];
  lines?: LegendLine[];
  className?: string;
}) {
  return (
    <ul className={`lineage-legend ${className}`.trim()} aria-label="Legend">
      {kinds.map(k => (
        <li key={k} className={`k-${k}`}>
          <KindIcon kind={k} />
          {KIND_LABEL[k]}
        </li>
      ))}
      {lines.map(l => {
        const s = LEGEND_LINES[l];
        return (
          <li key={l} className={`line l-${l}`}>
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke={s.stroke}
                strokeWidth="2"
                strokeDasharray={s.dash}
              />
            </svg>
            {s.label}
          </li>
        );
      })}
    </ul>
  );
}
