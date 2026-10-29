/** Rows of a lineage card: one column row, the ports that lines attach to, and the scrolling list
 * of an opened card. */
import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PropertyBadges } from '../components/PropertyBadges';
import type { LineageCard, LineageColumn } from './lineage';
import { FILTER_H, FOOT_H, ROW_H, listBox } from './lineage-layout';

/** Marks a place on a card where lines attach: one handle for lines in, one for lines out. */
export function Port({ id, top, edge }: { id: string; top: number; edge?: boolean }) {
  const className = edge ? 'clamped' : undefined;
  return (
    <>
      <Handle type="target" id={id + ':in'} position={Position.Left} style={{ top }} className={className} isConnectable={false} />
      <Handle type="source" id={id + ':out'} position={Position.Right} style={{ top }} className={className} isConnectable={false} />
    </>
  );
}

type RowProps = {
  card: LineageCard;
  column: LineageColumn;
  selected: string;
  onPath: Set<string> | null;
  onSelect: (id: string) => void;
};
/** One column of a card with its type and badges. */
export const ColumnRow = memo(({ card, column, selected, onPath, onSelect }: RowProps) => {
  const fkNote = column.fk ? `\nForeign key to ${column.fk.join(', ')}` : '';
  const typeNote = column.type ? ` · ${column.type}` : '';
  return (
    <button
      className="lineage-row nodrag"
      aria-pressed={selected === column.id}
      aria-label={`${card.label}.${column.path}`}
      title={`${card.label}.${column.path}${typeNote}${fkNote}`}
      data-on-path={onPath?.has(column.id) ? 'true' : undefined}
      onClick={() => onSelect(column.id)}
    >
      <span className="lineage-row-name">{column.path}</span>
      {column.type && <small>{column.type}</small>}
      <PropertyBadges badges={column.badges} />
    </button>
  );
});

type ListProps = {
  card: LineageCard;
  columns: LineageColumn[];
  connected: ReadonlySet<string>;
  filterable: boolean;
  visibleRows: number;
  selected: string;
  onPath: Set<string> | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};
const OVERSCAN = 3;
// The ports of connected rows follow the list as it scrolls. A row scrolled out of view keeps its
// port on the list's edge, so its line still reaches the card, and a marker counts such rows.
function connectedPorts(columns: LineageColumn[], connected: ReadonlySet<string>, scroll: number) {
  const out: { id: string; y: number; above: boolean; below: boolean }[] = [];
  columns.forEach((column, index) => {
    if (connected.has(column.id))
      out.push({
        id: column.id,
        y: index * ROW_H + ROW_H / 2 - scroll,
        above: false,
        below: false,
      });
  });
  return out;
}
/** Lists every column of an opened card in a scrolling, windowed list with an optional filter. */
export function ColumnList(props: ListProps) {
  const { card, columns, connected, filterable, visibleRows } = props;
  const { selected, onPath, onSelect, onClose } = props;
  const [filter, setFilter] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const updateNodeInternals = useUpdateNodeInternals();
  const needle = filter.trim().toLowerCase();
  const shown = useMemo(() => (needle ? columns.filter(c => c.path.toLowerCase().includes(needle)) : columns), [columns, needle]);
  const box = listBox(columns.length, filterable, visibleRows);
  useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(card.id));
    return () => cancelAnimationFrame(frame);
  }, [scrollTop, needle, card.id, updateNodeInternals]);
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(shown.length, Math.ceil((scrollTop + box.height) / ROW_H) + OVERSCAN);
  const ports = connectedPorts(shown, connected, scrollTop);
  const hiddenByFilter = columns.filter(c => connected.has(c.id) && !shown.includes(c));
  const above = ports.filter(p => p.y < 0).length;
  const below = ports.filter(p => p.y > box.height).length;
  return (
    <>
      {filterable && (
        <div className="lineage-list-filter nodrag" style={{ height: FILTER_H }}>
          <input type="search" aria-label={`Filter columns of ${card.label}`} placeholder="Filter columns…" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
      )}
      <div
        className="lineage-list nodrag nowheel"
        style={{ height: box.height }}
        role="region"
        aria-label={`Columns of ${card.label}`}
        tabIndex={0}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <ul style={{ height: shown.length * ROW_H }}>
          {shown.slice(first, last).map((column, offset) => (
            <li key={column.id} data-id={column.id} className={onPath?.has(column.id) ? 'on-path' : ''} style={{ top: (first + offset) * ROW_H, height: ROW_H }}>
              <ColumnRow card={card} column={column} selected={selected} onPath={onPath} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>
      {above > 0 && <EdgeMarker where="above" count={above} top={box.top} />}
      {below > 0 && <EdgeMarker where="below" count={below} top={box.top + box.height} />}
      {ports.map(port => (
        <Port key={port.id} id={port.id} top={box.top + Math.min(Math.max(port.y, 0), box.height)} edge={port.y < 0 || port.y > box.height} />
      ))}
      {hiddenByFilter.map(c => (
        <Port key={c.id} id={c.id} top={box.top} edge />
      ))}
      <footer className="lineage-list-foot nodrag" style={{ height: FOOT_H }}>
        <span>{shown.length === columns.length ? `${columns.length} columns` : `${shown.length} of ${columns.length} columns`}</span>
        <button onClick={onClose}>Show fewer</button>
      </footer>
    </>
  );
}

function EdgeMarker({ where, count, top }: { where: 'above' | 'below'; count: number; top: number }) {
  const Icon = where === 'above' ? ChevronUp : ChevronDown;
  const noun = count === 1 ? 'connected column' : 'connected columns';
  return (
    <span
      className={`lineage-list-marker ${where}`}
      data-marker={where}
      aria-label={`${count} ${noun} ${where} in this list`}
      title={`${count} ${noun} ${where}`}
      style={{ top: where === 'above' ? top : top - 20 }}
    >
      <Icon size={12} />
      {count}
    </span>
  );
}
