/** The dataset blocks of the "Where a concept lives" card: each dataset with the lineage of its first bindings. */
import { Fragment } from 'react';
import { ShowMoreControl } from './ShowMoreControl';
import { BINDINGS_SHOWN, bindingCountText, showAllBindingsLabel, type BindingLineage, type DatasetLineage } from './binding-lineage';

type Props = {
  lineage: DatasetLineage;
  /** True when the person asked for every binding of this dataset. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Opens the mapping file at the binding's expression; absent when the page cannot open sources. */
  onOpenSourceAt?: (documentId: string, path: (string | number)[]) => void;
};

function BindingPanel({ binding, onOpenSourceAt }: { binding: BindingLineage; onOpenSourceAt: Props['onOpenSourceAt'] }) {
  return (
    <div className="mapping-binding">
      <div className="mapping-chain">
        {binding.steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <span className="mapping-chain-arrow" aria-hidden="true">
                →
              </span>
            )}
            <div className="mapping-chain-step">
              <small>{step.label}</small>
              <span>{step.value}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <span className="mapping-expression">{binding.expression}</span>
      <div className="mapping-provenance">
        <span>
          {binding.filename} · {binding.pointer}
          {onOpenSourceAt && ' ·'}
        </span>
        {onOpenSourceAt && (
          <button type="button" onClick={() => onOpenSourceAt(binding.documentId, binding.path)}>
            Open in Source
          </button>
        )}
      </div>
      {binding.conditional && <span className="mapping-conditional">Conditional: review its meaning before composing a query</span>}
    </div>
  );
}

/** One dataset: its name, binding count and physical source, then the first bindings with their lineage. */
export function DatasetBindings({ lineage, expanded, onExpandedChange, onOpenSourceAt }: Props) {
  const total = lineage.bindings.length;
  const shown = expanded ? total : Math.min(BINDINGS_SHOWN, total);
  return (
    <div className="mapping-dataset-row">
      <div className="mapping-dataset-name">
        <b>{lineage.dataset}</b>
        <span>
          {bindingCountText(total)} · {lineage.source}
        </span>
      </div>
      {lineage.bindings.slice(0, shown).map(binding => (
        <BindingPanel binding={binding} onOpenSourceAt={onOpenSourceAt} key={binding.id} />
      ))}
      <ShowMoreControl
        showMoreLabel={total > shown ? showAllBindingsLabel(total, lineage.dataset) : ''}
        expanded={expanded && total > BINDINGS_SHOWN}
        onShowMore={() => onExpandedChange(true)}
        onShowFewer={() => onExpandedChange(false)}
      />
    </div>
  );
}
