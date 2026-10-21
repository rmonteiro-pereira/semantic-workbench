import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Modal } from './Modal';
import type { ProjectInfo, Suggestion } from './api';
// FR-019, FR-060: grouping suggestions are a one-line count in the sidebar that opens the Grouping
// suggestions dialog; each shows its evidence, and nothing moves until "Add to project".
export function Suggestions({
  items,
  projects,
  onAccept,
  onReject,
}: {
  items: Suggestion[];
  projects: ProjectInfo[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
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
      {open && (
        <Modal
          title="Grouping suggestions"
          size="medium"
          onCancel={() => setOpen(false)}
          className="suggestions-dialog"
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          }
        >
          <p className="dialog-lead">
            Files that may belong in another project, with the evidence. Nothing moves until you
            choose Add to project.
          </p>
          {items.map(s => (
            <div key={s.id} className="suggestion">
              <p>
                <strong>{s.file.path}</strong> ({name(s.file.project)}) may belong in{' '}
                <strong>{name(s.targetProject)}</strong>.
              </p>
              <ul>
                {s.evidence.slice(0, 3).map((e, i) => (
                  <li key={i} title={e.detail}>
                    {e.detail}
                  </li>
                ))}
                {s.evidence.length > 3 && <li>and {s.evidence.length - 3} more</li>}
              </ul>
              <span>
                <button
                  onClick={() => {
                    onAccept(s.id);
                    if (items.length === 1) setOpen(false);
                  }}
                >
                  Add to project
                </button>
                <button
                  onClick={() => {
                    onReject(s.id);
                    if (items.length === 1) setOpen(false);
                  }}
                >
                  Dismiss
                </button>
              </span>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
