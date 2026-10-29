/** The canvas of a project that has no supported definitions yet, with the next step. */
import { FolderOpen } from 'lucide-react';
import type { ProjectInfo } from '../projects/api';

/** Says which project was opened and how to add its first definitions. */
export function EmptyProject({ project, onImportFiles }: { project: ProjectInfo; onImportFiles: () => void }) {
  return (
    <div className="empty" role="region" aria-label={`${project.name} has no definitions`}>
      <div className="empty-icon">
        <FolderOpen size={36} />
      </div>
      <h2>No supported definitions found in {project.name}.</h2>
      <p>
        The repository was cloned, but it holds no contract, semantic model, ontology or mapping yet.
        <br />
        Import files to create the first definition; each one is checked before it is saved.
      </p>
      <button className="primary" onClick={onImportFiles}>
        Import files
      </button>
    </div>
  );
}
