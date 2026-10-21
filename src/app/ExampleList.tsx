/** Presentation and event handling for example list. */
import { Layers, Network } from 'lucide-react';
import React from 'react';

type Props = {
  examplesOpen: boolean;
  setExamplesChoice: React.Dispatch<React.SetStateAction<boolean | null>>;
  loadExample: (id: string) => Promise<void>;
  busy: boolean;
};
/** Renders example list. */
export function ExampleList({ examplesOpen, setExamplesChoice, loadExample, busy }: Props) {
  function handleSummaryClick(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    e.preventDefault();
    setExamplesChoice(!examplesOpen);
  }

  return (
    <>
      <details className="examples" aria-label="Examples" open={examplesOpen}>
        <summary onClick={handleSummaryClick}>Examples</summary>
        <button className="scale-example" onClick={() => loadExample('ubl')} disabled={busy}>
          <Layers size={16} />
          <span>
            Load UBL business model<small>45 entities · 277 relationships</small>
          </span>
        </button>
        <button className="scale-example" onClick={() => loadExample('commerce')} disabled={busy}>
          <Layers size={16} />
          <span>
            Load commerce workspace<small>ODCS · Ossie · OWL · SHACL · RDF</small>
          </span>
        </button>
        <button
          className="scale-example"
          onClick={() => loadExample('commerce-scale')}
          disabled={busy}
        >
          <Network size={16} />
          <span>
            Load commerce scale data<small>1,000 entities · 5,000 relationships</small>
          </span>
        </button>
        <button
          className="scale-example"
          onClick={() => loadExample('mapped-commerce')}
          disabled={busy}
        >
          <Layers size={16} />
          <span>
            Load mapped commerce<small>Ontology → mappings → governed queries</small>
          </span>
        </button>
        <button className="scale-example" onClick={() => loadExample('flights')} disabled={busy}>
          <Network size={16} />
          <span>
            Load Ossie Flights<small>Official ontology · semantic model · mappings</small>
          </span>
        </button>
        <button className="scale-example" onClick={() => loadExample('billing')} disabled={busy}>
          <Layers size={16} />
          <span>
            Load subscription billing<small>36 business entities · 4 governed metrics</small>
          </span>
        </button>
        <button className="scale-example" onClick={() => loadExample('mall')} disabled={busy}>
          <Layers size={16} />
          <span>
            Load shopping center administration
            <small>145 entity types · 11 namespaces · 25 metrics</small>
          </span>
        </button>
      </details>
    </>
  );
}
