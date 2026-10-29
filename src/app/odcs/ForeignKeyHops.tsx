/** Shows how far a lineage view follows foreign keys: a control for the number of hops, the path
 * of tables it reaches, and a dialog that lists every key as a sentence. */
import { useState } from 'react';
import { Modal } from '../projects/Modal';
import type { ForeignKeyPath } from './lineage';
import './hops.css';

/** The most hops a view can follow. */
export const MAX_HOPS = 5;
const HELP = 'A hop is one foreign key, followed from the centre table in either direction. Each key reads column → the column it references.';
const hopsWord = (n: number) => (n === 1 ? '1 hop' : `${n} hops`);

type Props = { path: ForeignKeyPath; hops: number; onHops: (hops: number) => void };

/** Renders the hop control, the path line and the button that opens the list of keys. */
export function ForeignKeyHops({ path, hops, onHops }: Props) {
  const [listOpen, setListOpen] = useState(false);
  const reached = Math.max(0, path.levels.length - 1);
  const route = path.levels
    .filter(names => names.length > 0)
    .map(names => names.join(', '))
    .join(' → ');
  return (
    <div className="lineage-hops" role="group" aria-label="Foreign-key hops">
      <span className="lineage-hops-title" title={HELP}>
        Hops
      </span>
      <div className="lineage-hops-steps" role="group" aria-label="How far to follow foreign keys">
        {Array.from({ length: MAX_HOPS }, (_, i) => i + 1).map(hopCount => (
          <button
            key={hopCount}
            aria-label={hopsWord(hopCount)}
            aria-pressed={hops === hopCount}
            title={`Follow foreign keys ${hopsWord(hopCount)} from the centre table`}
            onClick={() => onHops(hopCount)}
          >
            {hopCount}
          </button>
        ))}
      </div>
      <span className="lineage-hops-path" title={route}>
        {path.levels[0]?.join(', ')} · {path.levels.slice(1).flat().length} connected tables
      </span>
      <span className="lineage-hops-count" aria-label={`${hopsWord(reached)} reached`}>
        {hopsWord(reached)}
      </span>
      {path.steps.length > 0 && (
        <button className="lineage-hops-list" onClick={() => setListOpen(true)}>
          Foreign keys ({path.steps.length})
        </button>
      )}
      {listOpen && (
        <Modal
          title="Foreign keys in this view"
          size="narrow"
          onCancel={() => setListOpen(false)}
          footer={
            <button className="primary" onClick={() => setListOpen(false)}>
              Done
            </button>
          }
        >
          <p className="lineage-hops-help">{HELP}</p>
          <HopList path={path} />
        </Modal>
      )}
    </div>
  );
}

function HopList({ path }: { path: ForeignKeyPath }) {
  const hops = [...new Set(path.steps.map(step => step.hop))];
  return (
    <>
      {hops.map(hop => (
        <section key={hop} className="lineage-hop-group" aria-label={`Hop ${hop}`}>
          <h3>Hop {hop}</h3>
          <ul>
            {path.steps
              .filter(step => step.hop === hop)
              .map(step => (
                <li key={step.sentence}>
                  <code>{step.sentence}</code>
                  <span>
                    {step.child} references {step.parent}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
