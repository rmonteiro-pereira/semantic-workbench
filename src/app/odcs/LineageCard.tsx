/** Renders asset columns with row ports, path highlights and controls for hidden columns and
 * neighbors. */
import React, { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, ExternalLink, Footprints, Minus, Plus } from 'lucide-react';
import { KindIcon, KIND_LABEL } from '../graph/LineageLegend';
import { moreRowId, type LineageCard as Card, type LineageColumn } from './lineage';
import { CARD_W, HEADER_H, ROW_H, MORE_H } from './lineage-layout';
import { ColumnList, ColumnRow, Port } from './LineageColumnList';
import { PropertyBadges } from '../components/PropertyBadges';
// Hidden column edges attach to the shared more-columns row. Path rows stay on the card while they
// are selected, and the more-columns row opens the card's full list.
/** Supplies visible rows, selection state and actions for a lineage card. */
export type CardData = {
  card: Card;
  rows: LineageColumn[];
  more: number;
  columnsOpen: boolean;
  filterable: boolean;
  listRows: number;
  connected: ReadonlySet<string>;
  hiddenNeighbours: number;
  selected: string;
  onPath: Set<string> | null;
  center: boolean;
  group?: boolean;
  tint?: string;
  expanded?: boolean;
  kindNames?: Record<string, string>;
  onFinding?: (card: Card, message: string) => void;
  onSelect: (id: string) => void;
  onOpenColumns: (card: string) => void;
  onCloseColumns: (card: string) => void;
  onWalk: (card: string) => void;
  onExpand: (card: string) => void;
  onCollapse?: (card: string) => void;
  onOpenAsset?: (card: Card) => void;
};
const KIND_NAME: Record<string, string> = {
  object: 'Table',
  dataset: 'Semantic dataset',
  metric: 'Metric',
  external: 'External reference',
  concept: 'Concept',
};

/** Renders an asset card with row ports, a scrolling column list and neighbor expansion. */
export const LineageCardNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  const c = d.card;
  const dim = !!d.onPath && !d.onPath.has(c.id) && !c.columns.some(x => d.onPath!.has(x.id));
  const kindLabel = d.kindNames?.[c.kind] ?? KIND_NAME[c.kind] ?? c.kind;
  const legendKind = c.kind as any;
  const onPath = !!d.onPath && (d.onPath.has(c.id) || c.columns.some(x => d.onPath!.has(x.id)));
  const className = [
    `lineage-card k-${c.kind}`,
    d.center ? ' center' : '',
    d.group ? ' group' : '',
    dim ? ' dim' : '',
    onPath ? ' on-path' : '',
    d.selected === c.id ? ' selected' : '',
  ].join('');
  const legendLabel = KIND_LABEL[legendKind as keyof typeof KIND_LABEL] ?? kindLabel;
  const detailLine = c.detail ? `\n${c.detail}` : '';
  return (
    <div
      role="group"
      data-id={c.id}
      aria-label={`${kindLabel} ${c.label}`}
      className={className}
      style={{ width: CARD_W, ...(d.tint ? { '--card-tint': d.tint } : {}) } as React.CSSProperties}
      onDoubleClick={e => {
        if ((e.target as HTMLElement).closest('button')) return;
        d.onWalk(c.id);
      }}
    >
      <Port id={c.id} top={HEADER_H / 2} />
      <header className="lineage-card-head" style={{ height: HEADER_H }}>
        <button
          className="lineage-card-title nodrag"
          onClick={() => (d.group ? d.onExpand(c.id) : d.onSelect(c.id))}
          aria-pressed={d.group ? undefined : d.selected === c.id}
          title={`${legendLabel}: ${c.label}${detailLine}\n${c.file}`}
        >
          <span className="lineage-card-kind">
            <KindIcon kind={legendKind} />
            {kindLabel}
            {d.center && <em>center</em>}
            {c.badges?.length ? <PropertyBadges badges={c.badges} /> : null}
          </span>
          <strong>{c.label}</strong>
          {c.detail && <small>{c.detail}</small>}
        </button>
        {c.findings?.length ? (
          <span className="lineage-card-marks nodrag">
            {c.findings?.map((m, i) => (
              <button
                key={i}
                className="lineage-finding"
                aria-label={`Mapping finding: ${m}`}
                title={m}
                onClick={() => d.onFinding?.(c, m)}
              >
                <AlertTriangle size={13} />
              </button>
            ))}
          </span>
        ) : null}
        <span className="lineage-card-actions nodrag">
          {!d.center && !d.group && (
            <button
              aria-label="Walk here"
              title="Walk here (re-center)"
              onClick={() => d.onWalk(c.id)}
            >
              <Footprints size={13} />
            </button>
          )}
          {d.expanded && d.onCollapse ? (
            <button
              aria-label={`Collapse ${c.label}`}
              title="Collapse"
              onClick={() => d.onCollapse!(c.id)}
            >
              <Minus size={13} />
            </button>
          ) : (
            d.hiddenNeighbours > 0 && (
              <button
                aria-label={`Expand ${c.label}`}
                title={
                  d.group
                    ? `Show these cards`
                    : `Show ${d.hiddenNeighbours} more connected ${d.hiddenNeighbours === 1 ? 'table' : 'tables'}`
                }
                onClick={() => d.onExpand(c.id)}
              >
                <Plus size={13} />
              </button>
            )
          )}
          {c.kind === 'object' && d.onOpenAsset && (
            <button
              aria-label="Open asset page"
              title="Open asset page"
              onClick={() => d.onOpenAsset!(c)}
            >
              <ExternalLink size={13} />
            </button>
          )}
        </span>
      </header>
      {d.columnsOpen ? (
        <ColumnList
          card={c}
          columns={c.columns}
          connected={d.connected}
          filterable={d.filterable}
          visibleRows={d.listRows}
          selected={d.selected}
          onPath={d.onPath}
          onSelect={d.onSelect}
          onClose={() => d.onCloseColumns(c.id)}
        />
      ) : (
        <CollapsedRows data={d} />
      )}
    </div>
  );
});

// A card that is not opened lists the columns that matter, then one line that opens the rest.
function CollapsedRows({ data: d }: { data: CardData }) {
  const c = d.card;
  if (d.rows.length === 0 && d.more === 0) return null;
  return (
    <ul className="lineage-rows">
      {d.rows.map((r, i) => (
        <li
          key={r.id}
          data-id={r.id}
          className={d.onPath?.has(r.id) ? 'on-path' : ''}
          style={{ height: ROW_H }}
        >
          <Port id={r.id} top={HEADER_H + i * ROW_H + ROW_H / 2} />
          <ColumnRow
            card={c}
            column={r}
            selected={d.selected}
            onPath={d.onPath}
            onSelect={d.onSelect}
          />
        </li>
      ))}
      {d.more > 0 && (
        <li className="lineage-more" style={{ height: MORE_H }}>
          <Port id={moreRowId(c.id)} top={HEADER_H + d.rows.length * ROW_H + MORE_H / 2} />
          <button
            className="lineage-more-button nodrag"
            aria-label={`Show all ${c.columns.length} columns of ${c.label}`}
            onClick={() => d.onOpenColumns(c.id)}
          >
            + {d.more} more {d.more === 1 ? 'column' : 'columns'}
          </button>
        </li>
      )}
    </ul>
  );
}
