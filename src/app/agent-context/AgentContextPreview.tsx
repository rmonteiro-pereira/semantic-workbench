/** Shows the agent context as an agent receives it, and says which text an agent can see. */
import React from 'react';
import { contextOfFields, type ContextFields } from '../../shared/governance/agent-context-edit';
import './agent-context.css';

type Props = {
  fields: ContextFields;
  /** True when the text on screen is the working copy, which agents read only after it is published. */
  unpublished: boolean;
};

/** Renders the entry as JSON and the note about publishing. */
export function AgentContextPreview({ fields, unpublished }: Props) {
  const entry = contextOfFields(fields);
  return (
    <div className="agent-context-preview">
      <div className="section-label">WHAT AN AGENT RECEIVES</div>
      {entry === undefined ? (
        <p className="hint">Nothing yet. An agent receives no context for this item.</p>
      ) : (
        <pre aria-label="Agent context as an agent receives it">{JSON.stringify(entry, null, 2)}</pre>
      )}
      <p className="hint">{unpublished ? 'This preview shows your working copy. ' : ''}Agents read this text only from the published version, so changes reach them after you publish.</p>
    </div>
  );
}
