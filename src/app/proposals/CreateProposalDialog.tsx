// Starts a proposal: a name and the projects it may change, limited to the projects of this
// repository that the person may edit and branch.
import React, { useState } from 'react';
import { Modal } from '../projects/Modal';
import { MAX_NAME_LENGTH } from '../../shared/proposals/proposal';
import { proposals } from './api';
import { problemText } from './proposal-wording';

/** A project of the repository the person may choose. */
export type ChoosableProject = { slug: string; name: string };

const refuseLineBreak = (event: React.KeyboardEvent) => {
  if (event.key === 'Enter') event.preventDefault();
};

// Says what is still missing, so the disabled button is never a mystery.
function whyNotReady(name: string, chosen: string[]) {
  if (chosen.length === 0) return 'Choose at least one project.';
  if (!name.trim()) return 'Give the proposal a name.';
  return undefined;
}

/** Asks for a name and the projects a new proposal may change. */
export function CreateProposalDialog({ project, choices, onCreated, onCancel }: { project: string; choices: ChoosableProject[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>(choices.length === 1 ? [choices[0].slug] : [project].filter(slug => choices.some(choice => choice.slug === slug)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0 && chosen.length > 0 && !busy;
  const toggle = (slug: string) => setChosen(current => (current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]));
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await proposals.create(project, name, chosen);
      onCreated(created.id);
    } catch (problem) {
      setError(problemText(problem));
      setBusy(false);
    }
  }
  const note = whyNotReady(name, chosen);
  return (
    <Modal
      title="New proposal"
      onCancel={onCancel}
      footerNote={ready ? undefined : note}
      footer={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!ready} onClick={() => void create()}>
            Create proposal
          </button>
        </>
      }
    >
      <label className="proposal-field">
        Name
        {/* A name wraps on two lines instead of scrolling inside a one-line box, and never takes a line break. */}
        <textarea value={name} rows={2} maxLength={MAX_NAME_LENGTH} onChange={event => setName(event.target.value.replace(/[\r\n]+/g, ' '))} onKeyDown={refuseLineBreak} autoFocus />
        <small>
          {name.length} of {MAX_NAME_LENGTH} characters.
        </small>
      </label>
      <fieldset className="proposal-projects">
        <legend>Projects this proposal may change</legend>
        {choices.length === 0 && <p className="scm-empty">You cannot start a proposal in any project of this repository.</p>}
        {choices.map(choice => (
          <label key={choice.slug} className="proposal-check">
            <input type="checkbox" checked={chosen.includes(choice.slug)} onChange={() => toggle(choice.slug)} />
            <span>{choice.name}</span>
          </label>
        ))}
        <small>The projects cannot change after the proposal starts.</small>
      </fieldset>
      {error && (
        <p role="alert" className="scm-note warning">
          {error}
        </p>
      )}
    </Modal>
  );
}
