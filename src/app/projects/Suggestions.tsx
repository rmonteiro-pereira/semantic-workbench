/** Shows evidence for project grouping suggestions before the user chooses to move files. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb } from 'lucide-react';
import { Modal } from './Modal';
import type { ProjectInfo, Suggestion } from './api';
// Suggestions show their evidence before anything moves to a project.
/** Displays grouping evidence before moving files into suggested projects. */
export function Suggestions({ items, projects, onAccept, onReject }: { items: Suggestion[]; projects: ProjectInfo[]; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  const access = useCapabilities();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const name = (slug: string) => projects.find(p => p.slug === slug)?.name ?? slug;
  const count = `${items.length} grouping suggestion${items.length === 1 ? '' : 's'}`;
  return (
    <>
      <button className="suggestions-count" onClick={() => setOpen(true)}>
        <Lightbulb size={14} />
        {count}
      </button>
      {open &&
        createPortal(
          <Modal
            title="Grouping suggestions"
            size="wide"
            onCancel={() => setOpen(false)}
            className="suggestions-dialog"
            footer={
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            }
          >
            <p className="dialog-lead">Files that may belong in another project, with the evidence. Nothing moves until you choose Add to project.</p>
            {items.map(suggestion => (
              <div key={suggestion.id} className="suggestion">
                <p>
                  <strong>{suggestion.file.path}</strong> ({name(suggestion.file.project)}) may belong in <strong>{name(suggestion.targetProject)}</strong>.
                </p>
                <ul>
                  {suggestion.evidence.slice(0, 3).map((entry, i) => (
                    <li key={i} title={entry.detail}>
                      {entry.detail}
                    </li>
                  ))}
                  {suggestion.evidence.length > 3 && <li>and {suggestion.evidence.length - 3} more</li>}
                </ul>
                <span>
                  <button
                    hidden={!access.can('move', suggestion.file.project) || !access.can('move', suggestion.targetProject)}
                    onClick={() => {
                      onAccept(suggestion.id);
                      if (items.length === 1) setOpen(false);
                    }}
                  >
                    Add to project
                  </button>
                  <button
                    hidden={!access.can('edit', suggestion.file.project)}
                    onClick={() => {
                      onReject(suggestion.id);
                      if (items.length === 1) setOpen(false);
                    }}
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            ))}
          </Modal>,
          document.body,
        )}
    </>
  );
}
