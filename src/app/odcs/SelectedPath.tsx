/** The ordered list of assets on the selected lineage path, with its follow-up actions. */
import React from 'react';
import type { LineageCard } from './lineage';

/** One asset on the selected path, already put in lineage order. */
export type PathItem = { id: string; label: string; kind: string };

const KIND_SHORT: Record<string, string> = {
  object: 'Table',
  dataset: 'Field',
  metric: 'Metric',
  external: 'External',
  concept: 'Concept',
};

/** Lists the path items, marks the selected one and offers to continue in Neighborhood. */
export function SelectedPath({
  items,
  selected,
  onSelect,
  selectedCard,
  onNeighborhood,
  onWalk,
  extra,
}: {
  items: PathItem[];
  selected: string;
  onSelect: (id: string) => void;
  selectedCard?: LineageCard;
  onNeighborhood?: (card: LineageCard) => void;
  onWalk?: (card: string) => void;
  extra?: React.ReactNode;
}) {
  const canContinue = selectedCard && (selectedCard.kind === 'dataset' || selectedCard.kind === 'metric');
  return (
    <>
      <ol className="selected-path">
        {items.map(item => (
          <li key={item.id} className={`k-${item.kind}${item.id === selected ? ' current' : ''}`}>
            <button onClick={() => onSelect(item.id)}>
              <small>{KIND_SHORT[item.kind] ?? item.kind}</small>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
      {selectedCard && onWalk && (
        <button className="lineage-path-action" onClick={() => onWalk(selectedCard.id)}>
          Walk here
        </button>
      )}
      {canContinue && onNeighborhood && (
        <button className="lineage-path-action" onClick={() => onNeighborhood(selectedCard)}>
          Continue in Neighborhood
        </button>
      )}
      {extra}
    </>
  );
}
