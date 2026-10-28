/** Selects files for a new or existing project before conflict resolution and source repair. */
import React, { useState } from 'react';
import { FolderInput, Upload } from 'lucide-react';
import { Modal } from './Modal';
import type { ProjectInfo } from './api';
// A batch creates one project named after its definition, or joins an existing project. Filename
// conflicts and source repairs are handled in subsequent dialogs.
/** Chooses a destination and files for a project import. */
export function ImportDialog({
  projects,
  selectedProject,
  initialProject,
  onPick,
  onClose,
  onClone,
}: {
  projects: ProjectInfo[];
  /** The project the app works on; an import into an existing project starts there. */
  selectedProject: string;
  initialProject?: string;
  onPick: (project: string | null) => void;
  onClose: () => void;
  onClone?: () => void;
}) {
  const [target, setTarget] = useState<'new' | 'existing'>(initialProject ? 'existing' : 'new');
  const [project, setProject] = useState(initialProject ?? selectedProject);
  const into = target === 'existing' && project ? project : null;
  return (
    <Modal
      title="Import"
      size="narrow"
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
            <small>Uses the name of the definition you import.</small>
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
      {onClone && (
        <p className="import-clone">
          Files in a Git repository?{' '}
          <button type="button" className="link" onClick={onClone}>
            Clone a Git repository…
          </button>
        </p>
      )}
    </Modal>
  );
}
