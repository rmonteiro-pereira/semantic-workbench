/** The left column of the Mappings tab: a search field and the concepts of the mapping. */
import { ShowMoreControl } from './ShowMoreControl';
import { CONCEPTS_SHOWN, limitCovering, visibleCount } from './list-window';
import type { ConceptRow } from './mapping-view';

type Props = {
  rows: ConceptRow[];
  /** Every binding of the mapping, shown beside All concepts. */
  totalBindings: number;
  /** The selected concept, or an empty string for All concepts. */
  selected: string;
  searchText: string;
  limit: number;
  onSearch: (text: string) => void;
  onSelect: (concept: string) => void;
  onLimit: (limit: number) => void;
};

function bindingsText(count: number) {
  return `${count} ${count === 1 ? 'binding' : 'bindings'}`;
}

/** Lists the first concepts, then the rest on request. The selected concept always stays listed. */
export function ConceptList({ rows, totalBindings, selected, searchText, limit, onSearch, onSelect, onLimit }: Props) {
  // A mapping with no binding lists no concept rows unless the person searches, as every row would read 0 bindings.
  const noneMapped = totalBindings === 0 && !searchText;
  const selectedIndex = rows.findIndex(row => row.concept === selected);
  const shown = visibleCount(limitCovering(limit, selectedIndex), rows.length);
  const hidden = noneMapped ? 0 : rows.length - shown;
  return (
    <div className="mapping-concepts">
      <input className="mapping-search" aria-label="Find a concept" placeholder="Find a concept" value={searchText} onChange={event => onSearch(event.target.value)} />
      <button className="mapping-concept" aria-pressed={selected === ''} onClick={() => onSelect('')}>
        <span className="mapping-concept-name">All concepts</span>
        <span>{totalBindings}</span>
      </button>
      {noneMapped && <p className="mapping-note">{rows.length} concepts, none mapped. Find a concept to inspect it.</p>}
      {!noneMapped &&
        rows.slice(0, shown).map(row => (
          <button className="mapping-concept" key={row.concept} aria-pressed={selected === row.concept} onClick={() => onSelect(row.concept)}>
            <span className="mapping-concept-name">{row.concept}</span>
            <span>{bindingsText(row.bindings)}</span>
          </button>
        ))}
      {rows.length === 0 && !noneMapped && <p className="mapping-note">No concept matches.</p>}
      <ShowMoreControl
        showMoreLabel={hidden > 0 ? `Show all ${rows.length} concepts` : ''}
        expanded={shown > CONCEPTS_SHOWN}
        onShowMore={() => onLimit(rows.length)}
        onShowFewer={() => onLimit(CONCEPTS_SHOWN)}
      />
    </div>
  );
}
