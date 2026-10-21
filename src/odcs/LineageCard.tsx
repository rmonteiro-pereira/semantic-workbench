import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, ExternalLink, Footprints, Minus, Plus } from 'lucide-react';
import { KindIcon, KIND_LABEL } from '../graph/LineageLegend';
import { PropertyBadges } from '../PropertyBadges';
import { moreRowId, type LineageCard as Card, type LineageColumn } from './lineage';
import { CARD_W, HEADER_H, ROW_H, MORE_H, PAGER_H } from './lineage-layout';
// One lineage card (research R3, ui-contracts "Lineage canvas"): a header with the asset's kind,
// name and detail, one row per visible column with a port on each side, the "N more columns" row
// that collects lines to columns on other pages, a numbered pager and the "+N more" stub that
// expands hidden neighbours. Rows on the highlighted path are marked; everything else dims.
export type CardData = {
  card: Card;
  rows: LineageColumn[];
  pinned: string[];
  page: number;
  pages: number;
  more: number;
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
  onPage: (card: string, page: number) => void;
  onWalk: (card: string) => void;
  onExpand: (card: string) => void;
  onCollapse?: (card: string) => void;
  onOpenAsset?: (card: Card) => void;
};
const KIND_NAME: Record<string, string> = {
  object: 'Contract object',
  dataset: 'Semantic dataset',
  metric: 'Metric',
  external: 'External reference',
  concept: 'Concept',
};
// Pages shown in the pager: all up to 7, otherwise first, last and the neighbours of the current one.
export function pagerItems(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter(p => p >= 0 && p < pages));
  const out: (number | '…')[] = [];
  [...keep]
    .sort((a, b) => a - b)
    .forEach((p, i, a) => {
      if (i && p - a[i - 1] > 1) out.push('…');
      out.push(p);
    });
  return out;
}
function Port({ id, top }: { id: string; top: number }) {
  return (
    <>
      <Handle
        type="target"
        id={id + ':in'}
        position={Position.Left}
        style={{ top }}
        isConnectable={false}
      />
      <Handle
        type="source"
        id={id + ':out'}
        position={Position.Right}
        style={{ top }}
        isConnectable={false}
      />
    </>
  );
}
export const LineageCardNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  const c = d.card;
  const dim = !!d.onPath && !d.onPath.has(c.id) && !c.columns.some(x => d.onPath!.has(x.id));
  const kindLabel = d.kindNames?.[c.kind] ?? KIND_NAME[c.kind] ?? c.kind;
  const legendKind = c.kind as any;
  return (
    <div
      role="group"
      data-id={c.id}
      aria-label={`${kindLabel} ${c.label}`}
      className={`lineage-card k-${c.kind}${d.center ? ' center' : ''}${d.group ? ' group' : ''}${dim ? ' dim' : ''}${d.onPath && (d.onPath.has(c.id) || c.columns.some(x => d.onPath!.has(x.id))) ? ' on-path' : ''}${d.selected === c.id ? ' selected' : ''}`}
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
          title={`${KIND_LABEL[legendKind as keyof typeof KIND_LABEL] ?? kindLabel}: ${c.label}${c.detail ? `\n${c.detail}` : ''}\n${c.file}`}
        >
          <span className="lineage-card-kind">
            <KindIcon kind={legendKind} />
            {kindLabel}
            {d.center && <em>center</em>}
          </span>
          <strong>{c.label}</strong>
          {c.detail && <small>{c.detail}</small>}
        </button>
        {c.badges?.length || c.findings?.length ? (
          <span className="lineage-card-marks nodrag">
            {c.badges?.length ? <PropertyBadges badges={c.badges} /> : null}
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
                    : `Show ${d.hiddenNeighbours} more connected ${d.hiddenNeighbours === 1 ? 'object' : 'objects'}`
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
      {(d.rows.length > 0 || d.more > 0) && (
        <ul className="lineage-rows">
          {d.rows.map((r, i) => {
            const on = !!d.onPath?.has(r.id);
            return (
              <li
                key={r.id}
                data-id={r.id}
                className={`${on ? 'on-path' : ''}${d.pinned.includes(r.id) ? ' pinned' : ''}`}
                style={{ height: ROW_H }}
              >
                <Port id={r.id} top={HEADER_H + i * ROW_H + ROW_H / 2} />
                <button
                  className="lineage-row nodrag"
                  aria-pressed={d.selected === r.id}
                  aria-label={`${c.label}.${r.path}`}
                  title={`${c.label}.${r.path}${r.type ? ` · ${r.type}` : ''}${r.fk ? `\nForeign key to ${r.fk.join(', ')}` : ''}`}
                  onClick={() => d.onSelect(r.id)}
                >
                  <span className="lineage-row-name">{r.path}</span>
                  {r.type && <small>{r.type}</small>}
                  <PropertyBadges badges={r.badges} />
                </button>
              </li>
            );
          })}
          {d.more > 0 && (
            <li className="lineage-more" style={{ height: MORE_H }}>
              <Port id={moreRowId(c.id)} top={HEADER_H + d.rows.length * ROW_H + MORE_H / 2} />
              <span>
                {d.more} more {d.more === 1 ? 'column' : 'columns'}
              </span>
            </li>
          )}
        </ul>
      )}
      {d.pages > 1 && (
        <nav
          className="lineage-pager nodrag"
          aria-label={`Columns of ${c.label}`}
          style={{ height: PAGER_H }}
        >
          {pagerItems(d.page, d.pages).map((p, i) =>
            p === '…' ? (
              <span key={'e' + i} aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                aria-label={`Page ${p + 1}`}
                aria-current={p === d.page ? 'page' : undefined}
                onClick={() => d.onPage(c.id, p)}
              >
                {p + 1}
              </button>
            ),
          )}
        </nav>
      )}
    </div>
  );
});
