/** Draws the name-only overview shared by contract and mapping cards. */
import type { CSSProperties } from 'react';
import { Port } from './LineageColumnList';
import { CARD_W, OVERVIEW_H } from './lineage-layout';
import { overviewNameSize } from './lineage-view';
import type { CardData } from './LineageCard';

/** Keeps a compact card selectable while its name compensates for canvas zoom. */
export function LineageOverviewCard({ data, zoom, className, kindLabel }: { data: CardData; zoom: number; className: string; kindLabel: string }) {
  const card = data.card;
  const select = () => (data.group ? data.onExpand(card.id) : data.onSelect(card.id));
  const ports = [card.id, ...(data.columnsOpen ? card.columns : data.rows).map(row => row.id), ...(data.more ? [card.id + '/#more'] : [])];
  return (
    <div
      role="group"
      aria-label={`${kindLabel} ${card.label}`}
      data-id={card.id}
      className={`${className} lineage-card-overview`}
      style={{ width: CARD_W, height: OVERVIEW_H, ...(data.tint ? { '--card-tint': data.tint } : {}) } as CSSProperties}
    >
      {ports.map(id => (
        <Port key={id} id={id} top={OVERVIEW_H / 2} />
      ))}
      <button className="lineage-card-title nodrag" onClick={select} aria-label={data.group ? `Expand ${card.label}` : undefined} title={card.label} style={{ fontSize: overviewNameSize(zoom) }}>
        <strong style={{ fontSize: 'inherit' }}>{card.label}</strong>
        {data.center && <em className="lineage-center-badge">center</em>}
      </button>
    </div>
  );
}
