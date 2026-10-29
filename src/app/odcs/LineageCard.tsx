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
  const cardData = data as unknown as CardData;
  const lineageCard = cardData.card;
  const dim = !!cardData.onPath && !cardData.onPath.has(lineageCard.id) && !lineageCard.columns.some(x => cardData.onPath!.has(x.id));
  const kindLabel = cardData.kindNames?.[lineageCard.kind] ?? KIND_NAME[lineageCard.kind] ?? lineageCard.kind;
  const legendKind = lineageCard.kind as any;
  const onPath = !!cardData.onPath && (cardData.onPath.has(lineageCard.id) || lineageCard.columns.some(x => cardData.onPath!.has(x.id)));
  const className = [
    `lineage-card k-${lineageCard.kind}`,
    cardData.center ? ' center' : '',
    cardData.group ? ' group' : '',
    dim ? ' dim' : '',
    onPath ? ' on-path' : '',
    cardData.selected === lineageCard.id ? ' selected' : '',
  ].join('');
  const legendLabel = KIND_LABEL[legendKind as keyof typeof KIND_LABEL] ?? kindLabel;
  const openCard = () => (cardData.group ? cardData.onExpand(lineageCard.id) : cardData.onSelect(lineageCard.id));
  const detailLine = lineageCard.detail ? `\n${lineageCard.detail}` : '';
  return (
    <div
      role="group"
      data-id={lineageCard.id}
      aria-label={`${kindLabel} ${lineageCard.label}`}
      className={className}
      style={
        {
          width: CARD_W,
          ...(cardData.tint ? { '--card-tint': cardData.tint } : {}),
        } as React.CSSProperties
      }
      onDoubleClick={e => {
        if ((e.target as HTMLElement).closest('button')) return;
        cardData.onWalk(lineageCard.id);
      }}
    >
      <Port id={lineageCard.id} top={HEADER_H / 2} />
      <header className="lineage-card-head" style={{ height: HEADER_H }}>
        <button
          className="lineage-card-title nodrag"
          onClick={openCard}
          aria-pressed={cardData.group ? undefined : cardData.selected === lineageCard.id}
          title={`${legendLabel}: ${lineageCard.label}${detailLine}\n${lineageCard.file}`}
        >
          <span className="lineage-card-kind">
            <KindIcon kind={legendKind} />
            {kindLabel}
            {cardData.center && <em>center</em>}
            {lineageCard.badges?.length ? <PropertyBadges badges={lineageCard.badges} /> : null}
          </span>
          <strong>{lineageCard.label}</strong>
          {lineageCard.detail && <small>{lineageCard.detail}</small>}
        </button>
        {lineageCard.findings?.length ? (
          <span className="lineage-card-marks nodrag">
            {lineageCard.findings?.map((finding, i) => (
              <button key={i} className="lineage-finding" aria-label={`Mapping finding: ${finding}`} title={finding} onClick={() => cardData.onFinding?.(lineageCard, finding)}>
                <AlertTriangle size={13} />
              </button>
            ))}
          </span>
        ) : null}
        <span className="lineage-card-actions nodrag">
          {!cardData.center && !cardData.group && (
            <button aria-label="Walk here" title="Walk here (re-center)" onClick={() => cardData.onWalk(lineageCard.id)}>
              <Footprints size={13} />
            </button>
          )}
          {cardData.expanded && cardData.onCollapse ? (
            <button aria-label={`Collapse ${lineageCard.label}`} title="Collapse" onClick={() => cardData.onCollapse!(lineageCard.id)}>
              <Minus size={13} />
            </button>
          ) : (
            cardData.hiddenNeighbours > 0 && (
              <button
                aria-label={`Expand ${lineageCard.label}`}
                title={cardData.group ? `Show these cards` : `Show ${cardData.hiddenNeighbours} more connected ${cardData.hiddenNeighbours === 1 ? 'table' : 'tables'}`}
                onClick={() => cardData.onExpand(lineageCard.id)}
              >
                <Plus size={13} />
              </button>
            )
          )}
          {lineageCard.kind === 'object' && cardData.onOpenAsset && (
            <button aria-label="Open asset page" title="Open asset page" onClick={() => cardData.onOpenAsset!(lineageCard)}>
              <ExternalLink size={13} />
            </button>
          )}
        </span>
      </header>
      {cardData.columnsOpen ? (
        <ColumnList
          card={lineageCard}
          columns={lineageCard.columns}
          connected={cardData.connected}
          filterable={cardData.filterable}
          visibleRows={cardData.listRows}
          selected={cardData.selected}
          onPath={cardData.onPath}
          onSelect={cardData.onSelect}
          onClose={() => cardData.onCloseColumns(lineageCard.id)}
        />
      ) : (
        <CollapsedRows data={cardData} />
      )}
    </div>
  );
});

// A card that is not opened lists the columns that matter, then one line that opens the rest.
function CollapsedRows({ data: cardData }: { data: CardData }) {
  const lineageCard = cardData.card;
  if (cardData.rows.length === 0 && cardData.more === 0) return null;
  return (
    <ul className="lineage-rows">
      {cardData.rows.map((row, i) => (
        <li key={row.id} data-id={row.id} className={cardData.onPath?.has(row.id) ? 'on-path' : ''} style={{ height: ROW_H }}>
          <Port id={row.id} top={HEADER_H + i * ROW_H + ROW_H / 2} />
          <ColumnRow card={lineageCard} column={row} selected={cardData.selected} onPath={cardData.onPath} onSelect={cardData.onSelect} />
        </li>
      ))}
      {cardData.more > 0 && (
        <li className="lineage-more" style={{ height: MORE_H }}>
          <Port id={moreRowId(lineageCard.id)} top={HEADER_H + cardData.rows.length * ROW_H + MORE_H / 2} />
          <button className="lineage-more-button nodrag" aria-label={`Show all ${lineageCard.columns.length} columns of ${lineageCard.label}`} onClick={() => cardData.onOpenColumns(lineageCard.id)}>
            + {cardData.more} more {cardData.more === 1 ? 'column' : 'columns'}
          </button>
        </li>
      )}
    </ul>
  );
}
