import React, { useState } from 'react';
import { FolderInput, Upload } from 'lucide-react';
import { Modal } from './Modal';
import type { ProjectInfo } from './api';
// Import (FR-060, spec Appendix B): one dialog for both destinations, a new project (one project per
// batch, named after its ontology) or an existing project. Choosing files opens the browser's file
// picker; name conflicts and repairs follow in their own dialogs.
export function ImportDialog({
  projects,
  initialProject,
  onPick,
  onClose,
}: {
  projects: ProjectInfo[];
  initialProject?: string;
  onPick: (project: string | null) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<'new' | 'existing'>(initialProject ? 'existing' : 'new');
  const [project, setProject] = useState(initialProject ?? projects[0]?.slug ?? '');
  const into = target === 'existing' && project ? project : null;
  return (
    <Modal
      title="Import"
      size="small"
      onCancel={onClose}
      className="import-dialog"
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={target === 'existing' && !project}
            onClick={() => onPick(into)}
          >
            <Upload size={14} />
            Choose files…
          </button>
        </>
      }
    >
      <p>
        YAML, JSON, Turtle, N-Triples, RDF/XML and N3 definitions. Files are checked before anything
        is written; invalid ones open for repair.
      </p>
      <fieldset className="import-target">
        <legend>Import into</legend>
        <label className="radio">
          <input
            type="radio"
            name="import-target"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
          />
          <span>
            <strong>A new project</strong>
            <small>Named after the ontology in the batch.</small>
          </span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="import-target"
            checked={target === 'existing'}
            disabled={!projects.length}
            onChange={() => setTarget('existing')}
          />
          <span>
            <strong>An existing project</strong>
            <small>
              {projects.length
                ? 'A file with the same name asks to replace it or keep both.'
                : 'No project yet.'}
            </small>
          </span>
        </label>
        {target === 'existing' && (
          <label className="import-project">
            <FolderInput size={14} />
            <select aria-label="Project" value={project} onChange={e => setProject(e.target.value)}>
              {projects.map(p => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
    </Modal>
  );
}
